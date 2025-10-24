import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';

export class SessionController {
  private sanitizeName = (name?: string) => (typeof name === 'string' ? name.trim() : '');

  create = async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const userId = req.session.userId!;

      if (!name) {
        return res.status(400).json({ error: 'Session name is required' });
      }

      const session = await sessionService.createSession(userId, name);
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
      const { name } = req.body;
      const trimmedName = this.sanitizeName(name);

      if (!trimmedName) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const session = await sessionService.getSessionByCode(code);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const guest = await sessionService.createOrUpdateGuest(
        session.id,
        req.session.guestSessions?.[session.id]?.guestId,
        trimmedName
      );

      if (!req.session.guestSessions) {
        req.session.guestSessions = {};
      }

      req.session.guestSessions[session.id] = {
        guestId: guest.id,
        name: guest.name,
      };

      res.json({ session, guest });
    } catch (error) {
      console.error('Join session by code error:', error);
      res.status(500).json({ error: 'Failed to join session' });
    }
  };

  joinById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const trimmedName = this.sanitizeName(name);

      if (!trimmedName) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const session = await sessionService.getSession(id);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const guest = await sessionService.createOrUpdateGuest(
        session.id,
        req.session.guestSessions?.[session.id]?.guestId,
        trimmedName
      );

      if (!req.session.guestSessions) {
        req.session.guestSessions = {};
      }

      req.session.guestSessions[session.id] = {
        guestId: guest.id,
        name: guest.name,
      };

      res.json({ session, guest });
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
        const guest = await sessionService.getGuestById(guestData.guestId);

        if (guest) {
          // Keep name in sync if it changed outside this session
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
}

export const sessionController = new SessionController();
