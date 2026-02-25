import { Request, Response } from 'express';
import { signIframeToken } from '../lib/iframeToken';

/**
 * Creates a long-lived HMAC-signed token for iframe authentication.
 *
 * Used by the OAuth popup flow: after a user completes sign-in in a popup
 * window (where Clerk works normally in a first-party context), the popup
 * calls this endpoint to get a token that it sends back to the iframe via
 * postMessage. The iframe stores the token in memory and sends it as an
 * Authorization header on all API requests, completely bypassing Clerk's
 * client-side SDK (which doesn't work in third-party iframe contexts).
 */
export const signInTicketController = {
  async createIframeToken(req: Request, res: Response) {
    const clerkUserId = req.auth?.userId;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
      const token = signIframeToken(clerkUserId);
      return res.json({ token });
    } catch (err: any) {
      console.error('iframe-token error:', err);
      return res.status(500).json({ error: 'Failed to create iframe token.' });
    }
  },
};
