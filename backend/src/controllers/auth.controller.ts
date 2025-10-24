import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { spotifyService } from '../services/spotify.service';

const prisma = new PrismaClient();

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const authUrl = spotifyService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  }

  async callback(req: Request, res: Response) {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Missing authorization code' });
      }

      // Exchange code for tokens
      const tokens = await spotifyService.handleCallback(code);

      // Get user info from Spotify
      const spotifyUser = await spotifyService.getCurrentUser(tokens.accessToken);

      // Calculate token expiry
      const tokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);

      // Upsert user in database
      const user = await prisma.user.upsert({
        where: { spotifyId: spotifyUser.id },
        update: {
          displayName: spotifyUser.display_name || 'Unknown User',
          email: spotifyUser.email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry,
        },
        create: {
          spotifyId: spotifyUser.id,
          displayName: spotifyUser.display_name || 'Unknown User',
          email: spotifyUser.email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry,
        },
      });

      // Store user ID in session
      req.session.userId = user.id;

      // Redirect to frontend
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/dashboard`);
    } catch (error) {
      console.error('Callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}?error=auth_failed`);
    }
  }

  async me(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.session.userId },
        select: {
          id: true,
          spotifyId: true,
          displayName: true,
          email: true,
          createdAt: true,
        },
      });

      if (!user) {
        req.session.userId = undefined;
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({ user });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to logout' });
        }
        res.json({ message: 'Logged out successfully' });
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  }
}

export const authController = new AuthController();
