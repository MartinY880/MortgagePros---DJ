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
