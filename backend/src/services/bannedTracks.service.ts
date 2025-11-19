import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const bannedTrackListModel = (prisma as any).bannedTrackList;
const bannedTrackModel = (prisma as any).bannedTrack;
const sessionModel = (prisma as any).session;
const bannedArtistModel = (prisma as any).bannedArtist;

const DEFAULT_LIST_NAME = 'Host Ban List';

export type BannedTrackInput = {
  spotifyTrackId: string;
  trackName: string;
  trackArtist: string;
  trackAlbum?: string | null;
  trackImage?: string | null;
};

export type BannedArtistInput = {
  spotifyArtistId: string;
  artistName: string;
  artistImage?: string | null;
};

class BannedTracksService {
  private async getSessionHostId(sessionId: string): Promise<string> {
    const session = await sessionModel.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    }) as { hostId: string } | null;

    if (!session) {
      throw new Error('Session not found');
    }

    return session.hostId;
  }

  async getListsForSession(sessionId: string) {
    const hostId = await this.getSessionHostId(sessionId);
    await this.ensureDefaultListForHost(hostId);
    return bannedTrackListModel.findMany({
      where: { ownerId: hostId },
      include: {
        tracks: {
          orderBy: { createdAt: 'desc' },
        },
        artists: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async ensureDefaultListForHost(hostId: string) {
    const existing = await bannedTrackListModel.findFirst({
      where: { ownerId: hostId },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return existing;
    }

    return bannedTrackListModel.create({
      data: {
        ownerId: hostId,
        name: DEFAULT_LIST_NAME,
      },
    });
  }

  async createList(hostId: string, name: string) {
    const trimmed = name.trim();

    if (!trimmed) {
      throw new Error('List name is required');
    }

    return bannedTrackListModel.create({
      data: {
        ownerId: hostId,
        name: trimmed,
      },
    });
  }

  private async assertListOwnership(hostId: string, listId: string) {
    const list = await bannedTrackListModel.findUnique({
      where: { id: listId },
      select: { ownerId: true },
    }) as { ownerId: string } | null;

    if (!list || list.ownerId !== hostId) {
      throw new Error('Ban list not found');
    }
  }

  async addTrack(sessionId: string, listId: string, userId: string, track: BannedTrackInput) {
    const hostId = await this.getSessionHostId(sessionId);
    await this.assertListOwnership(hostId, listId);

    const existing = await bannedTrackModel.findFirst({
      where: {
        spotifyTrackId: track.spotifyTrackId,
        list: {
          ownerId: hostId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return bannedTrackModel.create({
      data: {
        listId,
        spotifyTrackId: track.spotifyTrackId,
        trackName: track.trackName,
        trackArtist: track.trackArtist,
        trackAlbum: track.trackAlbum ?? null,
        trackImage: track.trackImage ?? null,
        createdById: userId,
      },
    });
  }

  async removeTrack(sessionId: string, listId: string, trackId: string) {
    const hostId = await this.getSessionHostId(sessionId);
    await this.assertListOwnership(hostId, listId);

    const track = await bannedTrackModel.findUnique({
      where: { id: trackId },
      include: { list: { select: { id: true } } },
    });

    if (!track || track.listId !== listId) {
      throw new Error('Banned track not found');
    }

    await bannedTrackModel.delete({
      where: { id: trackId },
    });
  }

  async addArtist(sessionId: string, listId: string, userId: string, artist: BannedArtistInput) {
    const hostId = await this.getSessionHostId(sessionId);
    await this.assertListOwnership(hostId, listId);

    const existing = await bannedArtistModel.findFirst({
      where: {
        spotifyArtistId: artist.spotifyArtistId,
        list: {
          ownerId: hostId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return bannedArtistModel.create({
      data: {
        listId,
        spotifyArtistId: artist.spotifyArtistId,
        artistName: artist.artistName,
        artistImage: artist.artistImage ?? null,
        createdById: userId,
      },
    });
  }

  async removeArtist(sessionId: string, listId: string, bannedArtistId: string) {
    const hostId = await this.getSessionHostId(sessionId);
    await this.assertListOwnership(hostId, listId);

    const artist = await bannedArtistModel.findUnique({
      where: { id: bannedArtistId },
      include: { list: { select: { id: true } } },
    });

    if (!artist || artist.listId !== listId) {
      throw new Error('Banned artist not found');
    }

    await bannedArtistModel.delete({
      where: { id: bannedArtistId },
    });
  }

  private async getBannedTrackIdsForHost(hostId: string): Promise<string[]> {
    const tracks = await bannedTrackModel.findMany({
      where: {
        list: { ownerId: hostId },
      },
      select: { spotifyTrackId: true },
    }) as Array<{ spotifyTrackId: string }>;

    const unique = new Set<string>(tracks.map((item) => item.spotifyTrackId));
    return Array.from(unique.values());
  }

  private async getBannedArtistIdsForHost(hostId: string): Promise<string[]> {
    const artists = await bannedArtistModel.findMany({
      where: {
        list: { ownerId: hostId },
      },
      select: { spotifyArtistId: true },
    }) as Array<{ spotifyArtistId: string }>;

    const unique = new Set<string>(artists.map((item) => item.spotifyArtistId));
    return Array.from(unique.values());
  }

  async getBannedTrackIdsForSession(sessionId: string): Promise<string[]> {
    const hostId = await this.getSessionHostId(sessionId);
    return this.getBannedTrackIdsForHost(hostId);
  }

  async getBannedArtistIdsForSession(sessionId: string): Promise<string[]> {
    const hostId = await this.getSessionHostId(sessionId);
    return this.getBannedArtistIdsForHost(hostId);
  }

  async isTrackBanned(sessionId: string, spotifyTrackId: string): Promise<boolean> {
    const hostId = await this.getSessionHostId(sessionId);
    const found = await bannedTrackModel.findFirst({
      where: {
        spotifyTrackId,
        list: {
          ownerId: hostId,
        },
      },
      select: { id: true },
    });

    return Boolean(found);
  }

  async findBannedArtist(sessionId: string, spotifyArtistIds: string[]): Promise<{ spotifyArtistId: string; artistName: string } | null> {
    if (!spotifyArtistIds.length) {
      return null;
    }

    const hostId = await this.getSessionHostId(sessionId);
    const found = await bannedArtistModel.findFirst({
      where: {
        spotifyArtistId: { in: spotifyArtistIds },
        list: {
          ownerId: hostId,
        },
      },
      select: {
        spotifyArtistId: true,
        artistName: true,
      },
    });

    return found ?? null;
  }
}

export const bannedTracksService = new BannedTracksService();
