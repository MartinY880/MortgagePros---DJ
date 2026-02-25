import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    guestSessions?: Record<string, {
      guestId: string;
      name: string;
    }>;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Iframe-authenticated requests don't have an express-session with userId.
  // The iframe token already verified the user's identity (via clerkUserId in
  // req.auth.userId). Allow these requests through without a DB user lookup —
  // downstream code should use req.auth.userId (Clerk ID) for identity.
  if ((req as any).isIframeAuth) {
    return next();
  }

  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
  });

  if (!user) {
    req.session.userId = undefined;
    return res.status(401).json({ error: 'User not found' });
  }

  // Attach user to request
  (req as any).user = user;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    prisma.user.findUnique({
      where: { id: req.session.userId },
    }).then(user => {
      if (user) {
        (req as any).user = user;
      }
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

/**
 * Global middleware for iframe-authenticated requests.
 *
 * Express-session cookies cannot persist in cross-origin iframes, so
 * `req.session.guestSessions` is always empty on iframe requests.
 * This middleware re-hydrates the guest data from the database so that
 * downstream controllers (which check `req.session.guestSessions`) work
 * identically to cookie-based sessions.
 *
 * Runs globally (before route-level requireClerkAuth), so it checks the
 * Authorization header directly rather than relying on req.isIframeAuth.
 */
export async function hydrateIframeSession(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('IframeToken ')) {
    return next();
  }

  const token = authHeader.slice('IframeToken '.length);
  const { verifyIframeToken } = await import('../lib/iframeToken');
  const payload = verifyIframeToken(token);

  if (!payload) {
    return next();
  }

  const clerkUserId = payload.clerkUserId;

  try {
    const guests = await prisma.guest.findMany({
      where: { clerkUserId },
      include: { session: true },
    });

    if (!req.session.guestSessions) {
      req.session.guestSessions = {};
    }

    for (const guest of guests) {
      if (guest.session.isActive) {
        req.session.guestSessions[guest.sessionId] = {
          guestId: guest.id,
          name: guest.name,
        };
      }
    }
  } catch (error) {
    console.error('Hydrate iframe session error:', error);
  }

  next();
}
