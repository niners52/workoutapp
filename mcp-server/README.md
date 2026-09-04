# workoutapp MCP server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
workout data this app stores in Supabase, so it can be added to claude.ai as a custom
connector. Node 20+, TypeScript, `@modelcontextprotocol/sdk` streamable HTTP transport,
Express, plain `supabase-js`. Every query is a SELECT; there are no mutation tools.

## How access works

- The MCP endpoint is served at `https://<host>/<MCP_SECRET_PATH>`. Every other path
  (except `/health`) returns 404, so the long random path is the credential.
- Requests are rate limited per client IP (default 60/min, `RATE_LIMIT_PER_MINUTE`).
- The server uses the Supabase **service role key**, which bypasses row-level security.
  Set `SUPABASE_USER_ID` so only your rows are served if anyone else (an accountability
  partner) has an account in the same project.
- This is the pragmatic single-user setup. `src/auth.ts` isolates the auth strategy: to
  move to OAuth, swap the no-op middleware for the SDK's `requireBearerAuth` plus an
  OAuth provider router. `index.ts` and the tools don't change.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL, e.g. `https://xxxx.supabase.co` (Dashboard → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (Settings → API). Server-side only. |
| `MCP_SECRET_PATH` | yes | ≥32 URL-safe chars. The endpoint lives at `/<this>`. |
| `SUPABASE_USER_ID` | recommended | Your `auth.users` id; scopes every query to you. |
| `TIMEZONE` | optional | IANA zone for week boundaries (default `UTC`). Match your phone, e.g. `America/Denver`. |
| `RATE_LIMIT_PER_MINUTE` | optional | Default 60. |
| `PORT` | optional | Railway sets this. Default 3000. |

Generate the secret path:

```sh
openssl rand -hex 32
```

Find your user id: Supabase Dashboard → Authentication → Users, or run
`select id, email from auth.users;` in the SQL editor.

## Run locally

```sh
cd mcp-server
npm install
cp .env.example .env        # fill in the values
npm run build
node --env-file=.env dist/index.js
```

Then:

```sh
curl -s localhost:3000/health
# {"status":"ok","uptime_s":3}
```

### Test with the MCP Inspector

```sh
npx @modelcontextprotocol/inspector
```

In the Inspector UI choose transport **Streamable HTTP**, set the URL to
`http://localhost:3000/<MCP_SECRET_PATH>`, click **Connect**, then **List Tools** and
run any tool from the form.

### Unit tests

```sh
npm test
```

Runs the tool logic and the MCP wiring against an in-memory fake of the supabase-js
query builder (`src/fakeSupabase.ts`). No network or credentials needed.

## Deploy to Railway

1. In Railway, **New Project → Deploy from GitHub repo** and pick this repository.
2. Open the new service → **Settings → Source** and set **Root Directory** to `/mcp-server`.
   The `railway.json` in this folder supplies the build command (`npm ci && npm run build`),
   start command (`npm start`), and the `/health` health check.
3. **Settings → Networking → Generate Domain** to get a public `https://…up.railway.app` URL.
4. **Variables**: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MCP_SECRET_PATH`,
   `SUPABASE_USER_ID`, and `TIMEZONE`. Railway provides `PORT`.
5. Deploy. Confirm `https://<your-domain>/health` returns `{"status":"ok"}` and that
   `https://<your-domain>/` returns 404.

## Add to claude.ai

Settings → Connectors → **Add custom connector**:

- **Name**: anything, e.g. `Workouts`
- **Remote MCP server URL**: `https://<your-domain>/<MCP_SECRET_PATH>`
  (the full path, no trailing slash; for example
  `https://workoutapp-mcp.up.railway.app/9f2c…e41a`)
- Leave OAuth client ID / secret blank.

Then enable the connector in a chat. Treat the URL like a password: anyone holding it can
read your training data. Rotate it by changing `MCP_SECRET_PATH` in Railway and updating
the connector.

## Tools

All tools are annotated read-only and return compact JSON with ISO-8601 timestamps.
Weights are in pounds, as stored by the app.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_recent_workouts` | `limit` 1-50 (10) | Sessions newest first: start/end, `duration_min`, gym, deload flag, per-exercise set count and top set |
| `get_exercise_history` | `exercise_name`, `limit` 1-200 (30) | Fuzzy-resolved exercise, recent sets, all-time heaviest set, best Epley e1RM (with the app's Brzycki value), other candidate names |
| `search_exercises` | `query`, `limit` 1-25 (10) | Ranked canonical names with muscle groups, favorite flag, `last_logged_at`. Pass a result's `name` to other tools. |
| `get_weekly_volume` | `weeks_back` 1-26 (4) | Sets per muscle group per week plus the six-category roll-up and weekly targets |
| `get_prs` | `limit` 1-300 (100) | Per exercise: heaviest set and best Epley e1RM, sorted by e1RM |
| `get_body_weight_log` | `limit` 1-365 (30) | Body weight entries (lbs) with body-fat % and source, newest first |
| `get_favorite_exercises` | none | Exercises starred in the app |

Example calls (as the model would issue them):

```json
{ "name": "search_exercises", "arguments": { "query": "leg press pf" } }
{ "name": "get_exercise_history", "arguments": { "exercise_name": "Machine Leg press machine pf", "limit": 20 } }
{ "name": "get_weekly_volume", "arguments": { "weeks_back": 6 } }
{ "name": "get_recent_workouts", "arguments": { "limit": 5 } }
{ "name": "get_prs", "arguments": {} }
{ "name": "get_body_weight_log", "arguments": { "limit": 60 } }
```

### Weekly volume rules

`get_weekly_volume` reproduces the app's Weekly Volume panel
(`src/services/analytics.ts` → `calculateVolumeForDateRange`):

- Only **primary** muscle groups earn credit; each primary group on an exercise gets a full
  set. Secondary groups are returned on the exercise but never counted.
- Unilateral exercises count 0.5 per set.
- Sets from deload workouts are excluded (reported as `skipped_deload_sets`).
- Sets are bucketed by `logged_at` in `TIMEZONE`, using `week_start_day` from your settings
  (Sunday if unset). The current week is always included.
- `total_sets` / `target_sets` sum only muscle groups with a target, as the app does.

### Estimated 1RM

`best_e1rm_epley` uses Epley, `weight × (1 + reps/30)`. The app's own PR screen uses
Brzycki (`weight × 36 / (37 − reps)`), so that value is included as
`e1rm_brzycki_app_lbs` for cross-checking.

## Schema this server reads

Discovered from `src/services/syncService.ts` and `supabase/migrations/`:

| Table | Columns used |
| --- | --- |
| `exercises` | `id, user_id, name, base_name, primary_muscle_groups[], secondary_muscle_groups[], equipment, is_favorite, is_unilateral?` |
| `workouts` | `id, user_id, started_at, completed_at, location_id, is_deload` |
| `workout_sets` | `id, user_id, workout_id, exercise_id, weight, reps, logged_at` |
| `body_measurements` | `id, user_id, date, weight, body_fat_percentage, source` (rows with `weight` null are girth measurements and are skipped) |
| `user_settings` | `user_id, week_start_day, units, muscle_group_targets` |
| `workout_locations` | `id, user_id, name` |

`is_unilateral` is optional in the schema; it is read when present.
