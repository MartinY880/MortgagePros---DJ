import { clerkMiddleware as baseClerkMiddleware, getAuth } from '@clerk/express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyIframeToken } from '../lib/iframeToken';

type ClerkAuthState = {
  userId?: string | null;
  sessionId?: string | null;
  [key: string]: unknown;
};

declare global {
  namespace Express {
    // Augment Express Request with Clerk auth prop
    interface Request {
      auth?: ClerkAuthState;
      /** True when the request was authenticated via an iframe token instead of Clerk JWT */
      isIframeAuth?: boolean;
    }
  }
}

const internalClerkMiddleware = baseClerkMiddleware();

export const clerkMiddleware: RequestHandler = (req, res, next) => {
  // Skip Clerk JWT processing for iframe-token requests.
  // Clerk's middleware chokes on the non-Bearer Authorization header
  // and either swallows it or returns a 401 before our route-level
  // requireClerkAuth fallback can verify the HMAC token.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('IframeToken ')) {
    return next();
  }

  internalClerkMiddleware(req, res, () => {
    const authState = getAuth(req) as ClerkAuthState | null;
    if (authState) {
      req.auth = authState;
    }
    next();
  });
};

/**
 * Require authentication via either:
 * 1. Clerk JWT (normal flow) — checks `req.auth.userId`
 * 2. Iframe token (embedded flow) — verifies HMAC signature, sets `req.auth.userId`
 *
 * The iframe token is sent as `Authorization: IframeToken <token>`.
 */
export function requireClerkAuth(req: Request, res: Response, next: NextFunction) {
  // Check iframe token first — if the global clerkMiddleware was skipped,
  // we must NOT call getAuth() because Clerk's internal state is uninitialised.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('IframeToken ')) {
    const token = authHeader.slice('IframeToken '.length);
    const payload = verifyIframeToken(token);

    if (payload) {
      req.auth = { userId: payload.clerkUserId };
      req.isIframeAuth = true;
      return next();
    }

    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Normal Clerk auth path
  const authState = req.auth ?? (getAuth(req) as ClerkAuthState | null);

  if (authState && authState.userId) {
    req.auth = authState;
    return next();
  }

  return res.status(401).json({ error: 'Not authenticated' });
}
