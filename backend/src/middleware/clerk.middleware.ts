import { clerkMiddleware as baseClerkMiddleware, getAuth } from '@clerk/express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

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
    }
  }
}

const internalClerkMiddleware = baseClerkMiddleware();

export const clerkMiddleware: RequestHandler = (req, res, next) => {
  internalClerkMiddleware(req, res, () => {
    const authState = getAuth(req) as ClerkAuthState | null;
    if (authState) {
      req.auth = authState;
    }
    next();
  });
};

export function requireClerkAuth(req: Request, res: Response, next: NextFunction) {
  const authState = req.auth ?? (getAuth(req) as ClerkAuthState | null);

  if (!authState || !authState.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.auth = authState;
  next();
}
