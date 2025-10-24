import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class QueueService {
  async addToQueue(
    sessionId: string,
    spotifyTrackId: string,
    trackName: string,
    trackArtist: string,
    trackAlbum: string | null,
    trackImage: string | null,
    trackDuration: number,
    addedById: string
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

    const queueItem = await prisma.queueItem.create({
      data: {
        sessionId,
        spotifyTrackId,
        trackName,
        trackArtist,
        trackAlbum,
        trackImage,
        trackDuration,
        addedById,
      },
      include: {
        addedBy: {
          select: {
            displayName: true,
          },
        },
        votes: true,
      },
    });

    return queueItem;
  }

  async getQueue(sessionId: string) {
    const queue = await prisma.queueItem.findMany({
      where: {
        sessionId,
        played: false,
      },
      include: {
        addedBy: {
          select: {
            displayName: true,
          },
        },
        votes: true,
      },
      orderBy: [
        { voteScore: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return queue;
  }

  async removeFromQueue(queueItemId: string, userId: string) {
    const queueItem = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: {
        session: true,
      },
    });

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    // Only host or person who added it can remove
    if (queueItem.addedById !== userId && queueItem.session.hostId !== userId) {
      throw new Error('Not authorized to remove this track');
    }

    await prisma.queueItem.delete({
      where: { id: queueItemId },
    });
  }

  async vote(queueItemId: string, userId: string, voteType: number) {
    // Check if user already voted
    const existingVote = await prisma.vote.findUnique({
      where: {
        queueItemId_userId: {
          queueItemId,
          userId,
        },
      },
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // Remove vote (toggle off)
        await prisma.vote.delete({
          where: { id: existingVote.id },
        });
        await this.updateVoteScore(queueItemId);
        return { action: 'removed', voteType };
      } else {
        // Change vote
        await prisma.vote.update({
          where: { id: existingVote.id },
          data: { voteType },
        });
        await this.updateVoteScore(queueItemId);
        return { action: 'changed', voteType };
      }
    }

    // Create new vote
    await prisma.vote.create({
      data: {
        queueItemId,
        userId,
        voteType,
      },
    });

    await this.updateVoteScore(queueItemId);
    return { action: 'added', voteType };
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
}

export const queueService = new QueueService();
