import { Request, Response } from 'express';
import { signIframeToken } from '../lib/iframeToken';

/**
 * Creates a long-lived HMAC-signed token for iframe authentication.
 *
 * Used by the OAuth popup flow: after a user completes sign-in in a popup
 * window (where Logto works in a top-level context), the popup calls this
 * endpoint to get a token that it sends back to the iframe via postMessage.
 * The iframe stores the token and sends it as an Authorization header on
 * all API requests.
 */
export const signInTicketController = {
  async createIframeToken(req: Request, res: Response) {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
      const token = signIframeToken(userId);
      return res.json({ token });
    } catch (err: any) {
      console.error('iframe-token error:', err);
      return res.status(500).json({ error: 'Failed to create iframe token.' });
    }
  },
};
