import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';
import { clerkClient } from '../lib/clerk';
import { creditService, CreditError, CreditState } from '../services/credit.service';

export class SessionController {
  private async resolveClerkFullName(userId: string) {
    try {
      const user = await clerkClient.users.getUser(userId);

      const fullName = user.fullName
        || [user.firstName, user.lastName].filter(Boolean).join(' ')
        || user.username
        || user.primaryEmailAddress?.emailAddress
        || user.id;

      const normalized = fullName?.trim();

      return normalized && normalized.length > 0 ? normalized : 'Guest DJ';
    } catch (error) {
      console.error('Failed to resolve Clerk user name:', error);
      return 'Guest DJ';
    }
  }

  create = async (req: Request, res: Response) => {
    try {
      const { name, allowExplicit } = req.body;
      const userId = req.session.userId!;

      if (!name) {
        return res.status(400).json({ error: 'Session name is required' });
      }

      if (typeof allowExplicit !== 'undefined' && typeof allowExplicit !== 'boolean') {
        return res.status(400).json({ error: 'allowExplicit must be a boolean when provided' });
      }

      const session = await sessionService.createSession(userId, name, { allowExplicit });
      res.json({ session });
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  };

  getById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = await sessionService.getSession(id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ session });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  };

  joinByCode = async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await sessionService.getSessionByCode(code);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found' });
      }

      let credits: CreditState;
      try {
        credits = await creditService.ensureDailyCredits(clerkUserId);
      } catch (error) {
        if (error instanceof CreditError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }

      const guestName = await this.resolveClerkFullName(clerkUserId);
      const guest = await sessionService.createOrUpdateGuest(
        session.id,
        req.session.guestSessions?.[session.id]?.guestId,
        guestName,
        clerkUserId
      );

      if (!req.session.guestSessions) {
        req.session.guestSessions = {};
      }

      req.session.guestSessions[session.id] = {
        guestId: guest.id,
        name: guest.name,
      };

    res.json({ session, guest, credits });
    } catch (error) {
      console.error('Join session by code error:', error);
      res.status(500).json({ error: 'Failed to join session' });
    }
  };

  joinById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await sessionService.getSession(id);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found' });
      }

      let credits: CreditState;
      try {
        credits = await creditService.ensureDailyCredits(clerkUserId);
      } catch (error) {
        if (error instanceof CreditError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }

      const guestName = await this.resolveClerkFullName(clerkUserId);
      const guest = await sessionService.createOrUpdateGuest(
        session.id,
        req.session.guestSessions?.[session.id]?.guestId,
        guestName,
        clerkUserId
      );

      if (!req.session.guestSessions) {
        req.session.guestSessions = {};
      }

      req.session.guestSessions[session.id] = {
        guestId: guest.id,
        name: guest.name,
      };

    res.json({ session, guest, credits });
    } catch (error) {
      console.error('Join session by id error:', error);
      res.status(500).json({ error: 'Failed to join session' });
    }
  };

  getByCode = async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const session = await sessionService.getSessionByCode(code);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ session });
    } catch (error) {
      console.error('Get session by code error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  };

  getRecent = async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const session = await sessionService.getMostRecentSession(userId);

      res.json({ session: session ?? null });
    } catch (error) {
      console.error('Get recent session error:', error);
      res.status(500).json({ error: 'Failed to fetch recent session' });
    }
  };

  getParticipant = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = await sessionService.getSession(id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (req.session.userId && req.session.userId === session.hostId) {
        return res.json({
          participant: {
            type: 'host',
            name: session.host.displayName,
          },
        });
      }

      const guestData = req.session.guestSessions?.[session.id];

      if (guestData) {
        let guest = await sessionService.getGuestById(guestData.guestId);

        if (guest) {
          // Keep name in sync if it changed outside this session
          const clerkUserId = req.auth?.userId;
          if (clerkUserId) {
            const latestName = await this.resolveClerkFullName(clerkUserId);
            if (latestName && latestName !== guest.name) {
              guest = await sessionService.createOrUpdateGuest(session.id, guest.id, latestName, clerkUserId);
            }
          }

          let credits: CreditState | undefined;
          if (clerkUserId) {
            try {
              credits = await creditService.ensureDailyCredits(clerkUserId);
            } catch (error) {
              if (error instanceof CreditError) {
                return res.status(error.status).json({ error: error.message });
              }
              throw error;
            }
          }

          if (guest.name !== guestData.name) {
            req.session.guestSessions![session.id] = {
              guestId: guest.id,
              name: guest.name,
            };
          }

          return res.json({
            participant: {
              type: 'guest',
              name: guest.name,
              guestId: guest.id,
              credits,
            },
          });
        }

        // Guest not found anymore - clean stale session entry
        delete req.session.guestSessions![session.id];
      }

      res.json({ participant: { type: 'none' } });
    } catch (error) {
      console.error('Get participant error:', error);
      res.status(500).json({ error: 'Failed to get participant info' });
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      await sessionService.deleteSession(id, userId);
      res.json({ message: 'Session deleted successfully' });
    } catch (error: any) {
      console.error('Delete session error:', error);
      res.status(error.message === 'Only the host can delete the session' ? 403 : 500)
        .json({ error: error.message || 'Failed to delete session' });
    }
  };

  reopen = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const session = await sessionService.activateExistingSession(id, userId);

      res.json({ session });
    } catch (error: any) {
      console.error('Reopen session error:', error);
      const status = error.message === 'Session not found' ? 404
        : error.message === 'Only the host can reopen the session' ? 403
        : 500;
      res.status(status).json({ error: error.message || 'Failed to reopen session' });
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;
      const { allowExplicit } = req.body;

      if (typeof allowExplicit !== 'boolean') {
        return res.status(400).json({ error: 'allowExplicit must be provided as a boolean' });
      }

      const session = await sessionService.updateSessionSettings(id, userId, { allowExplicit });

      res.json({ session });
    } catch (error: any) {
      console.error('Update session settings error:', error);
      const message = error.message || 'Failed to update session settings';
      const status = message === 'Session not found' ? 404
        : message === 'Only the host can update session settings' ? 403
        : 500;
      res.status(status).json({ error: message });
    }
  };

  grantGuestCredits = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const hostId = req.session.userId!;
      const body = (req.body ?? {}) as {
        clerkUserId?: string;
        amount?: number;
        increaseTotal?: boolean;
        newTotal?: number;
        refill?: boolean;
      };

      const { clerkUserId, amount, increaseTotal, newTotal, refill } = body;

      if (!clerkUserId || typeof clerkUserId !== 'string') {
        return res.status(400).json({ error: 'clerkUserId is required' });
      }

      const session = await sessionService.getSession(id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.hostId !== hostId) {
        return res.status(403).json({ error: 'Only the host can adjust guest credits' });
      }

      if (typeof newTotal === 'number') {
        const normalizedTotal = Math.floor(newTotal);

        if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
          return res.status(400).json({ error: 'newTotal must be a positive number' });
        }

        const credits = await creditService.setTotalCredits(clerkUserId, normalizedTotal, { refill });
        return res.json({ credits });
      }

      if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }

      const credits = await creditService.addCredits(clerkUserId, Math.floor(amount), {
        increaseTotal: Boolean(increaseTotal),
      });

      res.json({ credits });
    } catch (error: any) {
      if (error instanceof CreditError) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error('Grant guest credits error:', error);
      res.status(500).json({ error: 'Failed to adjust credits' });
    }
  };
}

export const sessionController = new SessionController();
