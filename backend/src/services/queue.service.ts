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
        },
      },
      votes: true,
    };
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

    return queueItem;
  }

  async getQueue(sessionId: string) {
    const queue = await prisma.queueItem.findMany({
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

    return queue;
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
  }

  async vote(
    queueItemId: string,
    actor: { userId?: string; guestId?: string },
    voteType: number
  ) {
    if (!actor.userId && !actor.guestId) {
      throw new Error('Not authorized to vote');
    }

    const voteModel = (prisma as any).vote;

    if (actor.userId) {
      const existingVote = await voteModel.findUnique({
        where: {
          queueItemId_userId: {
            queueItemId,
            userId: actor.userId,
          },
        },
      });

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          await voteModel.delete({
            where: { id: existingVote.id },
          });
          await this.updateVoteScore(queueItemId);
          const voteScore = await this.getVoteScore(queueItemId);
          return { action: 'removed', voteType, voteScore };
        }

        await voteModel.update({
          where: { id: existingVote.id },
          data: { voteType },
        });
        await this.updateVoteScore(queueItemId);
        const voteScore = await this.getVoteScore(queueItemId);
        return { action: 'changed', voteType, voteScore };
      }

      await voteModel.create({
        data: {
          queueItemId,
          userId: actor.userId,
          voteType,
        },
      });

      await this.updateVoteScore(queueItemId);
      const voteScore = await this.getVoteScore(queueItemId);
      return { action: 'added', voteType, voteScore };
    }

    const existingGuestVote = await voteModel.findUnique({
      where: {
        queueItemId_guestId: {
          queueItemId,
          guestId: actor.guestId!,
        },
      },
    });

    if (existingGuestVote) {
      if (existingGuestVote.voteType === voteType) {
        await voteModel.delete({
          where: { id: existingGuestVote.id },
        });
        await this.updateVoteScore(queueItemId);
        const voteScore = await this.getVoteScore(queueItemId);
        return { action: 'removed', voteType, voteScore };
      }

      await voteModel.update({
        where: { id: existingGuestVote.id },
        data: { voteType },
      });
      await this.updateVoteScore(queueItemId);
      const voteScore = await this.getVoteScore(queueItemId);
      return { action: 'changed', voteType, voteScore };
    }

    await voteModel.create({
      data: {
        queueItemId,
        guestId: actor.guestId!,
        voteType,
      },
    });

    await this.updateVoteScore(queueItemId);
    const voteScore = await this.getVoteScore(queueItemId);
    return { action: 'added', voteType, voteScore };
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
    await prisma.queueItem.update({
      where: { id: queueItemId },
      data: {
        played: true,
        playedAt: new Date(),
      },
    });
  }

  async getNextTrack(sessionId: string) {
    const queue = await this.getQueue(sessionId);
    return queue[0] || null;
  }

  async getQueueItemWithSession(queueItemId: string) {
    return prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: {
        session: true,
      },
    });
  }
}

export const queueService = new QueueService();
