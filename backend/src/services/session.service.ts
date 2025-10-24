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
}

export const sessionService = new SessionService();
