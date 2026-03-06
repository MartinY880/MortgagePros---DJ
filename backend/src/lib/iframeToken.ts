import crypto from 'crypto';
import { config } from '../config';

/**
 * HMAC-signed token for iframe authentication.
 *
 * When the DJ app is embedded in an iframe, the auth SDK cannot
 * establish a session (third-party cookie restrictions).
 * Instead, the user authenticates in a popup (top-level window) where
 * Logto works, then the backend mints this token. The popup sends the
 * token to the iframe via postMessage, and the iframe uses it as a
 * Bearer token for all API calls.
 *
 * The token contains the user ID so backend middleware can populate
 * `req.auth.userId` identically to a normal JWT flow.
 */

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface IframeTokenPayload {
  userId: string;
  exp: number;
}

function getSecret(): string {
  return config.session.secret;
}

/**
 * Create an HMAC-signed iframe token for the given user.
 */
export function signIframeToken(userId: string): string {
  const payload: IframeTokenPayload = {
    userId,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(encoded)
    .digest('base64url');

  return `${encoded}.${signature}`;
}

/**
 * Verify an iframe token and return its payload, or null if invalid/expired.
 */
export function verifyIframeToken(token: string): IframeTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(encoded)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload: IframeTokenPayload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString(),
    );

    // Support both new 'userId' and legacy 'clerkUserId' field names
    const uid = payload.userId || (payload as any).clerkUserId;
    if (!uid || typeof uid !== 'string') {
      return null;
    }
    payload.userId = uid;

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
