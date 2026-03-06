import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { config } from '../config';

/**
 * Logto JWT verification for API resource protection.
 *
 * The frontend obtains a JWT access token from Logto for the registered
 * API resource. This module verifies the token's signature (via Logto's
 * JWKS endpoint), issuer, audience, and expiration.
 *
 * The `sub` claim contains the Logto user ID — used everywhere that
 * identified by their Logto user ID (sub claim).
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${config.logto.endpoint}/oidc/jwks`),
    );
  }
  return jwks;
}

export interface LogtoTokenPayload extends JWTPayload {
  sub: string;
  scope?: string;
  roles?: string[];
}

/**
 * Verify a Logto JWT access token.
 * Returns the decoded payload on success, or null on failure.
 */
export async function verifyLogtoToken(token: string): Promise<LogtoTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${config.logto.endpoint}/oidc`,
      audience: config.logto.apiResource,
    });

    if (!payload.sub) {
      return null;
    }

    return payload as LogtoTokenPayload;
  } catch (error) {
    // Don't log expected errors (expired tokens, etc.) at error level
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes('expired') &&
      !message.includes('ERR_JWT_EXPIRED') &&
      !message.includes('"exp"') &&
      !message.includes('timestamp check failed')
    ) {
      console.error('JWT verification failed:', message);
    }
    return null;
  }
}
