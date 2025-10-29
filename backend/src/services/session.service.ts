import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const prisma = new PrismaClient();
const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export class SessionService {
  async createSession(hostId: string, name: string, options?: { allowExplicit?: boolean }) {
    const code = generateCode();

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          code,
          name,
          hostId,
          ...(typeof options?.allowExplicit === 'boolean' ? { allowExplicit: options.allowExplicit } : {}),
        },
        include: {
          host: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      await tx.user.update({
        where: { id: hostId },
        data: { lastActiveSessionId: created.id },
      } as any);

      return created;
    });

    return session;
  }

  async getSession(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    return session;
  }

  async getSessionByCode(code: string) {
    const session = await prisma.session.findUnique({
      where: { code },
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    return session;
  }

  async getMostRecentSession(hostId: string) {
    const userWithLast = await prisma.user.findUnique({
      where: { id: hostId },
      select: { lastActiveSessionId: true },
    } as any) as ({ lastActiveSessionId: string | null } | null);

    if (userWithLast?.lastActiveSessionId) {
      const session = await prisma.session.findUnique({
        where: { id: userWithLast.lastActiveSessionId },
        include: {
          host: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      if (session) {
        return session;
      }
    }

    return prisma.session.findFirst({
      where: { hostId },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
  }

  async deleteSession(sessionId: string, userId: string) {
    await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.hostId !== userId) {
        throw new Error('Only the host can delete the session');
      }

      await tx.session.delete({
        where: { id: sessionId },
      });

      if (session.id === sessionId) {
        await tx.user.update({
          where: { id: userId },
          data: {
            lastActiveSessionId: null,
          },
        } as any);
      }
    });
  }

  async deactivateSession(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
  }
  
  async activateExistingSession(sessionId: string, hostId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.hostId !== hostId) {
      throw new Error('Only the host can reopen the session');
    }

    if (session.isActive) {
      return session;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { isActive: true },
        include: {
          host: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      await tx.user.update({
        where: { id: hostId },
        data: { lastActiveSessionId: updated.id },
      } as any);

      return updated;
    });
  }

  async createOrUpdateGuest(sessionId: string, guestId: string | undefined, name: string, clerkUserId?: string) {
    const guestModel = (prisma as any).guest;
    const sanitizedName = name.trim();

    if (!sanitizedName) {
      throw new Error('Guest name is required');
    }

    if (guestId) {
      const existingGuest = await guestModel.findUnique({
        where: { id: guestId },
      });

      if (existingGuest && existingGuest.sessionId === sessionId) {
        const updates: Record<string, unknown> = {};

        if (existingGuest.name !== sanitizedName) {
          updates.name = sanitizedName;
        }

        if (!existingGuest.clerkUserId && clerkUserId) {
          updates.clerkUserId = clerkUserId;
        }

        if (Object.keys(updates).length === 0) {
          return existingGuest;
        }

        return guestModel.update({
          where: { id: guestId },
          data: updates,
        });
      }
    }

    return guestModel.create({
      data: {
        sessionId,
        name: sanitizedName,
        ...(clerkUserId ? { clerkUserId } : {}),
      },
    });
  }

  async getGuestById(guestId: string) {
    const guestModel = (prisma as any).guest;

    return guestModel.findUnique({
      where: { id: guestId },
    });
  }

  async updateSessionSettings(sessionId: string, hostId: string, settings: { allowExplicit?: boolean }) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.hostId !== hostId) {
      throw new Error('Only the host can update session settings');
    }

    const data: any = {};

    if (typeof settings.allowExplicit === 'boolean') {
      data.allowExplicit = settings.allowExplicit;
    }

    if (Object.keys(data).length === 0) {
      return session;
    }

    return prisma.session.update({
      where: { id: sessionId },
      data,
      include: {
        host: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
  }
}

export const sessionService = new SessionService();
