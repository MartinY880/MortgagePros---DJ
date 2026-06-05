import { config } from '../config';

/**
 * Logto Management API client.
 *
 * Resolves a user's display name from their Logto ID (the `sub` claim,
 * stored as `Guest.clerkUserId`). This lets the backend be authoritative
 * about names instead of trusting a client-supplied `displayName`, which
 * is fragile in the iframe token-passthrough flow.
 *
 * Requires Machine-to-Machine credentials with the Logto Management API
 * permission (config.logto.m2mAppId / m2mAppSecret). When those are not
 * configured every function no-ops and returns null, so the caller simply
 * falls back to its existing behaviour.
 */

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

// userId -> resolved name (or null when the user has no usable name).
const userNameCache = new Map<string, { name: string | null; expiresAt: number }>();
const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** True when M2M credentials are configured. */
export function isLogtoManagementConfigured(): boolean {
  return Boolean(config.logto.m2mAppId && config.logto.m2mAppSecret);
}

/**
 * Obtain a Management API access token via the client_credentials grant.
 * Tokens are cached in memory until shortly before expiry.
 */
async function getManagementToken(): Promise<string | null> {
  if (!isLogtoManagementConfigured()) return null;

  const now = Date.now();
  // Reuse the cached token while it has >60s of life left.
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(
    `${config.logto.m2mAppId}:${config.logto.m2mAppSecret}`,
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: config.logto.managementResource,
    scope: 'all',
  });

  try {
    const res = await fetch(`${config.logto.endpoint}/oidc/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Logto M2M token request failed:', res.status, detail);
      return null;
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedToken = {
      token: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600) * 1000,
    };
    return cachedToken.token;
  } catch (error) {
    console.error('Logto M2M token request error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Resolve a display name for a Logto user ID.
 * Falls back through name → username → primaryEmail, then null.
 * Results (including misses) are cached for USER_CACHE_TTL_MS.
 */
export async function getLogtoUserDisplayName(userId: string): Promise<string | null> {
  if (!userId || !isLogtoManagementConfigured()) return null;

  const now = Date.now();
  const cached = userNameCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.name;
  }

  try {
    const token = await getManagementToken();
    if (!token) return null;

    const res = await fetch(
      `${config.logto.endpoint}/api/users/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      // 404 (unknown user) or other error — cache a miss to avoid hammering.
      if (res.status !== 404) {
        console.error('Logto user lookup failed:', res.status);
      }
      userNameCache.set(userId, { name: null, expiresAt: now + USER_CACHE_TTL_MS });
      return null;
    }

    const user = (await res.json()) as {
      name?: string | null;
      username?: string | null;
      primaryEmail?: string | null;
    };

    const name =
      user.name?.trim() ||
      user.username?.trim() ||
      user.primaryEmail?.trim() ||
      null;

    userNameCache.set(userId, { name, expiresAt: now + USER_CACHE_TTL_MS });
    return name;
  } catch (error) {
    console.error('Logto user lookup error:', error instanceof Error ? error.message : error);
    return null;
  }
}
