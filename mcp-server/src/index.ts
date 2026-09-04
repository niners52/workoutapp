import express, { type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Db, asMinimal } from './db.js';
import { createMcpServer } from './server.js';
import { secretPathAuth } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { isValidTimeZone } from './dates.js';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable ${name}. See README.md.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const auth = secretPathAuth(requireEnv('MCP_SECRET_PATH'));
const USER_ID = process.env.SUPABASE_USER_ID?.trim() || undefined;
const TIMEZONE = process.env.TIMEZONE?.trim() || 'UTC';
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60) || 60;
const PORT = Number(process.env.PORT ?? 3000) || 3000;

if (!isValidTimeZone(TIMEZONE)) {
  console.error(`TIMEZONE "${TIMEZONE}" is not a valid IANA time zone (e.g. America/Denver).`);
  process.exit(1);
}
if (!USER_ID) {
  console.warn(
    'SUPABASE_USER_ID is not set: tools will read every user\'s rows. Set it if anyone else has an account in this Supabase project.',
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ctx = { db: new Db(asMinimal(supabase), USER_ID), timeZone: TIMEZONE };
const limiter = createRateLimiter(RATE_LIMIT);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway terminates TLS one hop away
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_s: Math.round(process.uptime()) });
});

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

const rateLimit = (req: Request, res: Response, next: () => void): void => {
  if (limiter.allow(req.ip ?? 'unknown')) return next();
  res.setHeader('Retry-After', '60');
  jsonRpcError(res, 429, -32000, 'Rate limit exceeded');
};

// Stateless streamable HTTP: one server + transport per POST, nothing held between requests.
app.post(auth.mountPath, rateLimit, auth.middleware, async (req, res) => {
  const server = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request failed:', err instanceof Error ? err.message : err);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
  }
});

// Stateless mode has no server-initiated stream and no session to delete.
app.get(auth.mountPath, rateLimit, (_req, res) => jsonRpcError(res, 405, -32000, 'Method not allowed'));
app.delete(auth.mountPath, rateLimit, (_req, res) => jsonRpcError(res, 405, -32000, 'Method not allowed'));

// Everything else, including the bare root, is indistinguishable from a missing route.
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`workoutapp MCP server listening on :${PORT} (health: /health, mcp: /<secret>)`);
  console.log(`time zone ${TIMEZONE}; user scope ${USER_ID ? 'on' : 'off'}; ${RATE_LIMIT} req/min`);
});
