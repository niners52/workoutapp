/**
 * Request authentication for the MCP endpoint.
 *
 * Today: a single-user secret path. The endpoint is mounted at
 * `/<MCP_SECRET_PATH>`; nothing else is served, so possession of the URL is the
 * credential. To move to OAuth later, keep the mount point and replace the
 * middleware returned here with the SDK's `requireBearerAuth` from
 * `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js` together
 * with an OAuth provider and `mcpAuthRouter`. index.ts and server.ts don't
 * need to change.
 */
import type { RequestHandler } from 'express';

const SECRET_PATH_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

export function validateSecretPath(secret: string | undefined): string {
  if (!secret || !SECRET_PATH_PATTERN.test(secret)) {
    throw new Error(
      'MCP_SECRET_PATH must be at least 32 URL-safe characters (A-Z, a-z, 0-9, _ or -). Generate one with: openssl rand -hex 32',
    );
  }
  return secret;
}

export interface AuthStrategy {
  /** Path the MCP endpoint is mounted at. */
  mountPath: string;
  /** Express middleware that rejects unauthenticated requests. */
  middleware: RequestHandler;
}

export function secretPathAuth(secret: string): AuthStrategy {
  return {
    mountPath: `/${validateSecretPath(secret)}`,
    // Matching the mount path is the check; the middleware only exists so a
    // future strategy (bearer token / OAuth) drops in without touching index.ts.
    middleware: (_req, _res, next) => next(),
  };
}
