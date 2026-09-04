/**
 * MCP server definition: registers the read-only tools with zod-validated inputs.
 * A fresh McpServer is created per HTTP request (stateless transport), so this
 * must stay cheap to construct.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DbError } from './db.js';
import {
  ToolError,
  getBodyWeightLog,
  getExerciseHistory,
  getFavoriteExercises,
  getPrs,
  getRecentWorkouts,
  getWeeklyVolume,
  searchExercises,
  type ToolContext,
} from './tools.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

/** Turn any thrown error into a tool-level error the model can read; never crash the request. */
function fail(toolName: string, err: unknown): CallToolResult {
  let message: string;
  if (err instanceof ToolError) message = err.message;
  else if (err instanceof DbError) message = `Database query failed (${err.message}). Check the table exists and the service role key is valid.`;
  else if (err instanceof Error) message = `Unexpected error: ${err.message}`;
  else message = 'Unexpected error';
  console.error(`[tool:${toolName}]`, err instanceof Error ? err.message : err);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function guarded<I>(toolName: string, fn: (input: I) => Promise<unknown>) {
  return async (input: I): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const result = await fn(input);
      console.log(`[tool:${toolName}] ok ${Date.now() - started}ms`);
      return ok(result);
    } catch (err) {
      return fail(toolName, err);
    }
  };
}

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'workoutapp', version: '1.0.0' });

  server.registerTool(
    'get_recent_workouts',
    {
      title: 'Recent workouts',
      description:
        'Most recent workout sessions, newest first: start/end time, duration, gym, deload flag, and per-exercise set counts with the top set (lbs).',
      inputSchema: { limit: z.number().int().min(1).max(50).default(10).describe('How many sessions (1-50)') },
      annotations: READ_ONLY,
    },
    guarded('get_recent_workouts', input => getRecentWorkouts(ctx, input)),
  );

  server.registerTool(
    'get_exercise_history',
    {
      title: 'Exercise history',
      description:
        'Recent sets (date, weight in lbs, reps) for one exercise plus its all-time heaviest set and best estimated 1RM (Epley; the app\'s Brzycki figure is included for comparison). Exercise names are matched fuzzily; use search_exercises first when unsure.',
      inputSchema: {
        exercise_name: z.string().trim().min(1).max(120).describe('Exercise name, ideally as returned by search_exercises'),
        limit: z.number().int().min(1).max(200).default(30).describe('How many recent sets (1-200)'),
      },
      annotations: READ_ONLY,
    },
    guarded('get_exercise_history', input => getExerciseHistory(ctx, input)),
  );

  server.registerTool(
    'search_exercises',
    {
      title: 'Search exercises',
      description:
        'Fuzzy lookup of exercise names (they are inconsistent, e.g. "Machine Leg press machine pf"). Returns canonical names, muscle groups, favorite flag, and when each was last logged. Pass a result\'s `name` to the other tools.',
      inputSchema: {
        query: z.string().trim().min(1).max(120).describe('Free-text exercise name'),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: READ_ONLY,
    },
    guarded('search_exercises', input => searchExercises(ctx, input)),
  );

  server.registerTool(
    'get_weekly_volume',
    {
      title: 'Weekly volume by muscle group',
      description:
        'Sets per muscle group per week for the last N weeks (current week included), using the app\'s own counting rules: primary muscles only, unilateral sets count 0.5, deload workouts excluded. Includes the weekly targets from settings and the six-category roll-up (back, shoulders, chest, arms, legs, core).',
      inputSchema: { weeks_back: z.number().int().min(1).max(26).default(4).describe('Number of weeks (1-26)') },
      annotations: READ_ONLY,
    },
    guarded('get_weekly_volume', input => getWeeklyVolume(ctx, input)),
  );

  server.registerTool(
    'get_prs',
    {
      title: 'Personal records',
      description:
        'Best set per exercise across all history: heaviest weight and best estimated 1RM (Epley, with the app\'s Brzycki value alongside). Sorted by estimated 1RM, descending.',
      inputSchema: { limit: z.number().int().min(1).max(300).default(100).describe('Max exercises to return') },
      annotations: READ_ONLY,
    },
    guarded('get_prs', input => getPrs(ctx, input)),
  );

  server.registerTool(
    'get_body_weight_log',
    {
      title: 'Body weight log',
      description: 'Recent body weight entries (lbs) with body-fat % when recorded, newest first. Sources: healthkit or manual.',
      inputSchema: { limit: z.number().int().min(1).max(365).default(30) },
      annotations: READ_ONLY,
    },
    guarded('get_body_weight_log', input => getBodyWeightLog(ctx, input)),
  );

  server.registerTool(
    'get_favorite_exercises',
    {
      title: 'Favorite exercises',
      description: 'Exercises starred as favorites in the app (the "must-do" list), with their muscle groups.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    guarded('get_favorite_exercises', () => getFavoriteExercises(ctx)),
  );

  return server;
}
