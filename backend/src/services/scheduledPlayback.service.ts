import { PrismaClient, ScheduledPlaybackStatus } from '@prisma/client';

const prisma = new PrismaClient();
const scheduledPlaybackModel = (prisma as any).scheduledPlayback;

export type ScheduledTrackInput = {
  spotifyTrackId: string;
  spotifyUri?: string;
  trackName: string;
  trackArtist: string;
  trackAlbum?: string | null;
  trackImage?: string | null;
  trackDuration: number;
};

const ACTIVE_STATUSES: ScheduledPlaybackStatus[] = [
  ScheduledPlaybackStatus.PENDING,
  ScheduledPlaybackStatus.PROCESSING,
];

const MINUTES_PER_DAY = 24 * 60;

const clampMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes)) {
    throw new Error('Invalid time provided.');
  }

  if (minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new Error('Time of day must be between 00:00 and 23:59.');
  }

  return Math.floor(minutes);
};

const clampTimezoneOffset = (offsetMinutes: number) => {
  if (!Number.isFinite(offsetMinutes)) {
    throw new Error('Timezone offset is invalid.');
  }

  if (offsetMinutes < -840 || offsetMinutes > 840) {
    throw new Error('Timezone offset out of supported range.');
  }

  return Math.round(offsetMinutes);
};

export class ScheduledPlaybackService {
  private computeNextRun(timeOfDayMinutes: number, timezoneOffsetMinutes: number, reference: Date) {
    const minutes = clampMinutes(timeOfDayMinutes);
    const offset = clampTimezoneOffset(timezoneOffsetMinutes);

    const offsetMs = offset * 60 * 1000;
    const referenceUtcMs = reference.getTime();
    const localReferenceMs = referenceUtcMs - offsetMs;

    const localReference = new Date(localReferenceMs);
    const targetLocal = new Date(localReferenceMs);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    targetLocal.setHours(hours, mins, 0, 0);

    let scheduledLocalMs = targetLocal.getTime();
    if (scheduledLocalMs <= localReferenceMs) {
      scheduledLocalMs += MINUTES_PER_DAY * 60 * 1000;
    }

    const scheduledUtcMs = scheduledLocalMs + offsetMs;
    return new Date(scheduledUtcMs);
  }

  private computeNextRunFromSchedule(schedule: any, reference: Date) {
    if (schedule.timeOfDayMinutes != null && schedule.timezoneOffsetMinutes != null) {
      return this.computeNextRun(schedule.timeOfDayMinutes, schedule.timezoneOffsetMinutes, reference);
    }

    const next = new Date(reference.getTime() + MINUTES_PER_DAY * 60 * 1000);
    return next;
  }

  async listUpcoming(sessionId: string) {
    return scheduledPlaybackModel.findMany({
      where: {
        sessionId,
        status: {
          in: ACTIVE_STATUSES,
        },
      },
      include: {
        tracks: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });
  }

  async listSessionHistory(sessionId: string, limit = 20) {
    return scheduledPlaybackModel.findMany({
      where: {
        sessionId,
        status: {
          in: [
            ScheduledPlaybackStatus.COMPLETED,
            ScheduledPlaybackStatus.FAILED,
            ScheduledPlaybackStatus.CANCELLED,
          ],
        },
      },
      include: {
        tracks: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: {
        scheduledFor: 'desc',
      },
      take: limit,
    });
  }

  async scheduleDailyPlayback(
    sessionId: string,
    hostId: string,
    timeOfDayMinutes: number,
    timezoneOffsetMinutes: number,
    tracks: ScheduledTrackInput[],
  ) {
    if (tracks.length === 0) {
      throw new Error('At least one track is required to schedule playback.');
    }

    const normalizedMinutes = clampMinutes(timeOfDayMinutes);
    const normalizedOffset = clampTimezoneOffset(timezoneOffsetMinutes);

    const now = new Date();
    const nextRun = this.computeNextRun(normalizedMinutes, normalizedOffset, now);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        hostId: true,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.hostId !== hostId) {
      throw new Error('Only the host can schedule playback');
    }

    return prisma.$transaction(async (tx) => {
      const scheduledTx = (tx as any).scheduledPlayback;
      const scheduledPlayback = await scheduledTx.create({
        data: {
          sessionId,
          createdById: hostId,
          scheduledFor: nextRun,
          isRecurringDaily: true,
          timeOfDayMinutes: normalizedMinutes,
          timezoneOffsetMinutes: normalizedOffset,
          failureReason: null,
          tracks: {
            create: tracks.map((track, index) => ({
              order: index,
              spotifyTrackId: track.spotifyTrackId,
              spotifyUri: track.spotifyUri ?? `spotify:track:${track.spotifyTrackId}`,
              trackName: track.trackName,
              trackArtist: track.trackArtist,
              trackAlbum: track.trackAlbum ?? null,
              trackImage: track.trackImage ?? null,
              trackDuration: track.trackDuration,
            })),
          },
        },
        include: {
          tracks: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return scheduledPlayback;
    });
  }

  async cancelSchedule(scheduleId: string, hostId: string) {
    const schedule = await scheduledPlaybackModel.findUnique({
      where: { id: scheduleId },
      include: {
        session: {
          select: {
            hostId: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.session.hostId !== hostId) {
      throw new Error('Only the host can cancel a scheduled playback');
    }

    if (schedule.status !== ScheduledPlaybackStatus.PENDING) {
      throw new Error('Only pending schedules can be cancelled');
    }

    return scheduledPlaybackModel.update({
      where: { id: scheduleId },
      data: {
        status: ScheduledPlaybackStatus.CANCELLED,
        failureReason: 'Cancelled by host',
        lastRunStatus: ScheduledPlaybackStatus.CANCELLED,
      },
      include: {
        tracks: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async getScheduleWithDetails(id: string) {
    return scheduledPlaybackModel.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { order: 'asc' },
        },
        session: {
          select: {
            id: true,
            hostId: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
  }

  async claimDueSchedules(referenceTime: Date) {
    return prisma.$transaction(async (tx) => {
      const scheduledTx = (tx as any).scheduledPlayback;
      const due = await scheduledTx.findMany({
        where: {
          status: ScheduledPlaybackStatus.PENDING,
          scheduledFor: {
            lte: referenceTime,
          },
        },
        include: {
          tracks: {
            orderBy: { order: 'asc' },
          },
          session: {
            select: {
              id: true,
              hostId: true,
            },
          },
        },
        orderBy: {
          scheduledFor: 'asc',
        },
      });

      const claimed: typeof due = [];

      for (const schedule of due) {
        const updated = await scheduledTx.updateMany({
          where: {
            id: schedule.id,
            status: ScheduledPlaybackStatus.PENDING,
          },
          data: {
            status: ScheduledPlaybackStatus.PROCESSING,
          },
        });

        if (updated.count > 0) {
          claimed.push(schedule);
        }
      }

      return claimed;
    });
  }

  async recordSuccess(schedule: any) {
    const completedAt = new Date();

    if (schedule.isRecurringDaily) {
      const nextRun = this.computeNextRunFromSchedule(schedule, completedAt);

      return scheduledPlaybackModel.update({
        where: { id: schedule.id },
        data: {
          status: ScheduledPlaybackStatus.PENDING,
          scheduledFor: nextRun,
          completedAt,
          failureReason: null,
          lastRunAt: completedAt,
          lastRunStatus: ScheduledPlaybackStatus.COMPLETED,
        },
      });
    }

    return scheduledPlaybackModel.update({
      where: { id: schedule.id },
      data: {
        status: ScheduledPlaybackStatus.COMPLETED,
        completedAt,
        failureReason: null,
        lastRunAt: completedAt,
        lastRunStatus: ScheduledPlaybackStatus.COMPLETED,
      },
    });
  }

  async recordFailure(schedule: any, reason: string) {
    const completedAt = new Date();
    const failureMessage = reason.slice(0, 500);

    if (schedule.isRecurringDaily) {
      const nextRun = this.computeNextRunFromSchedule(schedule, completedAt);

      return scheduledPlaybackModel.update({
        where: { id: schedule.id },
        data: {
          status: ScheduledPlaybackStatus.PENDING,
          scheduledFor: nextRun,
          failureReason: failureMessage,
          completedAt: null,
          lastRunAt: completedAt,
          lastRunStatus: ScheduledPlaybackStatus.FAILED,
        },
      });
    }

    return scheduledPlaybackModel.update({
      where: { id: schedule.id },
      data: {
        status: ScheduledPlaybackStatus.FAILED,
        failureReason: failureMessage,
        completedAt: null,
        lastRunAt: completedAt,
        lastRunStatus: ScheduledPlaybackStatus.FAILED,
      },
    });
  }
}

export const scheduledPlaybackService = new ScheduledPlaybackService();
