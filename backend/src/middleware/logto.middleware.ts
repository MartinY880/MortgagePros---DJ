import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyLogtoToken } from '../lib/logto';

const prisma = new PrismaClient();

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

/**
 * Session-repair middleware.
 *
 * Express sessions are stored in-memory (MemoryStore) and are wiped on
 * every container restart.  This middleware transparently restores the
 * session from the Logto JWT so controllers that rely on
 * `req.session.userId` / `req.session.guestSessions` keep working.
 *
 * On the **first** request after migration (session still intact), it
 * lazily writes the Logto user ID onto the User record so future restarts
 * can recover.
 *
 * Must be registered AFTER both `logtoMiddleware` and `express-session`.
 */
export const repairSession: RequestHandler = async (req, _res, next) => {
  const logtoUserId = req.auth?.userId;
  if (!logtoUserId) return next();

  try {
    // ── Host session repair ──
    if (req.session.userId) {
      // Session is healthy — lazily link Logto ID → User (runs once per user)
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.session.userId },
          select: { logtoUserId: true },
        });
        if (user && !user.logtoUserId) {
          await prisma.user.update({
            where: { id: req.session.userId },
            data: { logtoUserId },
          });
        }
      } catch { /* best-effort */ }
    } else {
      // Session lost — try to recover via Logto ID
      try {
        const user = await prisma.user.findUnique({
          where: { logtoUserId },
          select: { id: true },
        });
        if (user) {
          req.session.userId = user.id;
        }
      } catch { /* ignore — column may not exist until migration runs */ }
    }

    // ── Guest session repair ──
    if (!req.session.guestSessions || Object.keys(req.session.guestSessions).length === 0) {
      try {
        const guests = await prisma.guest.findMany({
          where: { clerkUserId: logtoUserId },
          include: { session: { select: { isActive: true } } },
        });
        if (guests.length > 0) {
          req.session.guestSessions = {};
          for (const guest of guests) {
            if (guest.session.isActive) {
              req.session.guestSessions[guest.sessionId] = {
                guestId: guest.id,
                name: guest.name,
              };
            }
          }
        }
      } catch { /* ignore */ }
    }
  } catch { /* never block the request */ }

  next();
};
