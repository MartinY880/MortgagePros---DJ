import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';

export class SessionController {
  async create(req: Request, res: Response) {
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
  }

  async getById(req: Request, res: Response) {
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
  }

  async getByCode(req: Request, res: Response) {
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
  }

  async delete(req: Request, res: Response) {
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
  }
}

export const sessionController = new SessionController();
