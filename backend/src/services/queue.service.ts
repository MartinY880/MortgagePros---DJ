import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class QueueService {
  private includeRelations() {
    return {
      addedBy: {
        select: {
          displayName: true,
        },
      },
      addedByGuest: {
        select: {
          id: true,
          name: true,
          clerkUserId: true,
        },
      },
      votes: true,
    };
  }

  private async getOrderedQueue(sessionId: string) {
    return prisma.queueItem.findMany({
      where: {
        sessionId,
        played: false,
      },
      include: this.includeRelations(),
      orderBy: [
        { voteScore: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  private async getCurrentNextUp(sessionId: string) {
    return prisma.queueItem.findFirst({
      where: {
        sessionId,
        played: false,
        isNextUp: true,
      } as any,
      include: this.includeRelations(),
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getMostRecentQueueItemForTrack(sessionId: string, spotifyTrackId: string) {
    return prisma.queueItem.findFirst({
      where: {
        sessionId,
        spotifyTrackId,
      },
      include: this.includeRelations(),
      orderBy: [
        { createdAt: 'desc' },
      ],
    });
  }

  private async promoteNextTrack(sessionId: string) {
    const existing = await this.getCurrentNextUp(sessionId);

    if (existing) {
      await prisma.queueItem.updateMany({
        where: {
          sessionId,
          isNextUp: true,
          id: { not: existing.id },
        } as any,
        data: { isNextUp: false } as any,
      });
      return existing;
    }

    const next = await prisma.queueItem.findFirst({
      where: {
        sessionId,
        played: false,
      } as any,
      orderBy: [
        { voteScore: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (!next) {
      return null;
    }

    await prisma.queueItem.updateMany({
      where: {
        sessionId,
        isNextUp: true,
        id: { not: next.id },
      } as any,
      data: { isNextUp: false } as any,
    });

    return prisma.queueItem.update({
      where: { id: next.id },
      data: { isNextUp: true } as any,
      include: this.includeRelations(),
    });
  }

  async getQueueWithNext(sessionId: string) {
    let nextUp = await this.getCurrentNextUp(sessionId);

    if (!nextUp) {
      nextUp = await this.promoteNextTrack(sessionId);
    }

    const queue = await prisma.queueItem.findMany({
      where: {
        sessionId,
        played: false,
        ...(nextUp ? { id: { not: nextUp.id } } : {}),
      } as any,
      include: this.includeRelations(),
      orderBy: [
        { voteScore: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return {
      nextUp: nextUp || null,
      queue,
    };
  }

  async countActiveQueueItems(sessionId: string) {
    return prisma.queueItem.count({
      where: {
        sessionId,
        played: false,
      },
    });
  }

  async addToQueue(
    sessionId: string,
    spotifyTrackId: string,
    trackName: string,
    trackArtist: string,
    trackAlbum: string | null,
    trackImage: string | null,
    trackDuration: number,
    actor: { userId?: string; guestId?: string }
  ) {
    // Check for duplicates in unplayed queue
    const existing = await prisma.queueItem.findFirst({
      where: {
        sessionId,
        spotifyTrackId,
        played: false,
      },
    });

    if (existing) {
      throw new Error('Track already in queue');
    }

    const queueModel = (prisma as any).queueItem;

    const data: any = {
      sessionId,
      spotifyTrackId,
      trackName,
      trackArtist,
      trackAlbum,
      trackImage,
      trackDuration,
    };

    if (actor.userId) {
      data.addedById = actor.userId;
    }

    if (actor.guestId) {
      data.addedByGuestId = actor.guestId;
    }

    const queueItem = await queueModel.create({
      data,
      include: this.includeRelations(),
    });

    await this.promoteNextTrack(sessionId);

    const refreshed = await prisma.queueItem.findUnique({
      where: { id: queueItem.id },
      include: this.includeRelations(),
    });

    return refreshed ?? queueItem;
  }

  async getQueue(sessionId: string) {
    return this.getOrderedQueue(sessionId);
  }

  async removeFromQueue(
    queueItemId: string,
    actor: { userId?: string; guestId?: string }
  ) {
    const queueItem = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: {
        session: true,
      },
    }) as any;

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    // Only host or person who added it can remove
    const isHost = actor.userId && queueItem.session.hostId === actor.userId;
    const isOwner = (actor.userId && queueItem.addedById === actor.userId) ||
      (actor.guestId && queueItem.addedByGuestId === actor.guestId);

    if (!isHost && !isOwner) {
      throw new Error('Not authorized to remove this track');
    }

    await prisma.queueItem.delete({
      where: { id: queueItemId },
    });

    await this.promoteNextTrack(queueItem.sessionId);
  }

  async vote(
    queueItemId: string,
    actor: { userId?: string; guestId?: string },
    voteType: number,
    hooks?: {
      beforeChange?: (intent: {
        action: 'add' | 'remove' | 'change';
        voteType: number;
        previousVoteType: number | null;
        actorType: 'user' | 'guest';
      }) => Promise<void> | void;
      afterChange?: (result: {
        action: 'added' | 'removed' | 'changed';
        voteType: number;
        previousVoteType: number | null;
        actorType: 'user' | 'guest';
      }) => Promise<void> | void;
    }
  ) {
    if (!actor.userId && !actor.guestId) {
      throw new Error('Not authorized to vote');
    }

    const voteModel = (prisma as any).vote;

    const applyChange = async (
      actorType: 'user' | 'guest',
      identifier: { userId: string } | { guestId: string }
    ) => {
      const whereKey = actorType === 'user'
        ? {
            queueItemId_userId: {
              queueItemId,
              userId: (identifier as { userId: string }).userId,
            },
          }
        : {
            queueItemId_guestId: {
              queueItemId,
              guestId: (identifier as { guestId: string }).guestId,
            },
          };

      const existingVote = await voteModel.findUnique({
        where: whereKey,
      });

      let intent: 'add' | 'remove' | 'change' = 'add';
      if (existingVote) {
        intent = existingVote.voteType === voteType ? 'remove' : 'change';
      }

      const voteIntent = {
        action: intent,
        voteType,
        previousVoteType: existingVote?.voteType ?? null,
        actorType,
      } as const;

      await hooks?.beforeChange?.(voteIntent);

      let resultAction: 'added' | 'removed' | 'changed';

      if (intent === 'remove' && existingVote) {
        await voteModel.delete({
          where: { id: existingVote.id },
        });
        resultAction = 'removed';
      } else if (intent === 'change' && existingVote) {
        await voteModel.update({
          where: { id: existingVote.id },
          data: { voteType },
        });
        resultAction = 'changed';
      } else {
        await voteModel.create({
          data: {
            queueItemId,
            voteType,
            ...(actorType === 'user'
              ? { userId: (identifier as { userId: string }).userId }
              : { guestId: (identifier as { guestId: string }).guestId }),
          },
        });
        resultAction = 'added';
      }

      await this.updateVoteScore(queueItemId);
      const voteScore = await this.getVoteScore(queueItemId);

      await hooks?.afterChange?.({
        action: resultAction,
        voteType,
        previousVoteType: existingVote?.voteType ?? null,
        actorType,
      });

      return { action: resultAction, voteType, voteScore };
    };

    if (actor.userId) {
      return applyChange('user', { userId: actor.userId });
    }

    return applyChange('guest', { guestId: actor.guestId! });
  }

  private async updateVoteScore(queueItemId: string) {
    const votes = await prisma.vote.findMany({
      where: { queueItemId },
    });

    const score = votes.reduce((sum, vote) => sum + vote.voteType, 0);

    await prisma.queueItem.update({
      where: { id: queueItemId },
      data: { voteScore: score },
    });
  }

  private async getVoteScore(queueItemId: string) {
    const queueItem = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      select: { voteScore: true },
    });

    return queueItem?.voteScore ?? 0;
  }

  async markAsPlayed(queueItemId: string) {
    const queueItem = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
    });

    if (!queueItem) {
      return;
    }

    await prisma.queueItem.update({
      where: { id: queueItemId },
      data: {
        played: true,
        isNextUp: false,
        playedAt: new Date(),
      } as any,
    });

    await this.promoteNextTrack(queueItem.sessionId);
  }

  async markTrackAsPlayed(sessionId: string, spotifyTrackId: string) {
    const queueItem = await prisma.queueItem.findFirst({
      where: {
        sessionId,
        spotifyTrackId,
        played: false,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!queueItem) {
      return null;
    }

    await prisma.queueItem.update({
      where: { id: queueItem.id },
      data: {
        played: true,
        isNextUp: false,
        playedAt: new Date(),
      } as any,
    });

    await this.promoteNextTrack(sessionId);

    return queueItem;
  }

  async getNextTrack(sessionId: string) {
    const { nextUp } = await this.getQueueWithNext(sessionId);
    return nextUp;
  }

  async getQueueItemWithSession(queueItemId: string) {
    return prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: {
        session: true,
        addedByGuest: true,
      },
    });
  }
}

export const queueService = new QueueService();
