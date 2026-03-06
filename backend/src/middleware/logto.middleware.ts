import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyLogtoToken } from '../lib/logto';

declare global {
  namespace Express {
    interface Request {
      /** Populated by logtoMiddleware or requireLogtoAuth */
      auth?: {
        userId: string;
        roles: string[];
        [key: string]: unknown;
      };
    }
  }
}

/**
 * Global middleware: attempts to verify a Logto JWT Bearer token on every
 * request and populates `req.auth.userId` when valid.
 *
 * Roles are read directly from the JWT `roles` claim — injected by a
 * Custom JWT script configured in the Logto Console.
 *
 * Does NOT reject unauthenticated requests — that's `requireLogtoAuth`'s job.
 */
export const logtoMiddleware: RequestHandler = async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = await verifyLogtoToken(token);

      if (payload?.sub) {
        // Roles come from the custom JWT claims script in Logto Console
        const roles = Array.isArray(payload.roles)
          ? payload.roles.map((r: unknown) => String(r))
          : [];

        req.auth = {
          userId: payload.sub,
          roles,
        };
      }
    } catch {
      // Don't reject — route-level middleware decides
    }
  }

  next();
};

/**
 * Route-level middleware that requires authentication via Logto JWT.
 * The token must already be verified by the global `logtoMiddleware`.
 *
 * Falls back to express-session auth: the host authenticates via Spotify
 * OAuth and has a valid `req.session.userId` even when the Logto JWT has
 * expired.  Without this fallback the host gets locked out of their own
 * playback controls the moment the short-lived access token expires.
 */
export function requireLogtoAuth(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.userId) {
    return next();
  }

  // Host session fallback — Spotify OAuth sets req.session.userId
  if (req.session.userId) {
    return next();
  }

  return res.status(401).json({ error: 'Not authenticated' });
}
