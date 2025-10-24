import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const prisma = new PrismaClient();
const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export class SessionService {
  async createSession(hostId: string, name: string) {
    const code = generateCode();

    const session = await prisma.session.create({
      data: {
        code,
        name,
        hostId,
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

  async deleteSession(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.hostId !== userId) {
      throw new Error('Only the host can delete the session');
    }

    await prisma.session.delete({
      where: { id: sessionId },
    });
  }

  async deactivateSession(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
  }

  async createOrUpdateGuest(sessionId: string, guestId: string | undefined, name: string) {
    const guestModel = (prisma as any).guest;

    if (guestId) {
      const existingGuest = await guestModel.findUnique({
        where: { id: guestId },
      });

      if (existingGuest && existingGuest.sessionId === sessionId) {
        if (existingGuest.name === name) {
          return existingGuest;
        }

        return guestModel.update({
          where: { id: guestId },
          data: { name },
        });
      }
    }

    return guestModel.create({
      data: {
        sessionId,
        name,
      },
    });
  }

  async getGuestById(guestId: string) {
    const guestModel = (prisma as any).guest;

    return guestModel.findUnique({
      where: { id: guestId },
    });
  }
}

export const sessionService = new SessionService();
