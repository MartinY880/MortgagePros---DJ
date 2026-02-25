import crypto from 'crypto';
import { config } from '../config';

/**
 * HMAC-signed token for iframe authentication.
 *
 * When the DJ app is embedded in an iframe, Clerk's client-side SDK
 * cannot establish a session (third-party cookie restrictions).
 * Instead, the user authenticates in a popup (top-level window) where
 * Clerk works, then the backend mints this token. The popup sends the
 * token to the iframe via postMessage, and the iframe uses it as a
 * Bearer token for all API calls.
 *
 * The token contains the Clerk userId so backend middleware can populate
 * `req.auth.userId` identically to a normal Clerk JWT flow.
 */

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface IframeTokenPayload {
  clerkUserId: string;
  exp: number;
}

function getSecret(): string {
  return config.session.secret;
}

/**
 * Create an HMAC-signed iframe token for the given Clerk user.
 */
export function signIframeToken(clerkUserId: string): string {
  const payload: IframeTokenPayload = {
    clerkUserId,
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

    if (!payload.clerkUserId || typeof payload.clerkUserId !== 'string') {
      return null;
    }

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
