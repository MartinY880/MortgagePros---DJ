/**
 * Logto access-token store.
 *
 * The Logto React SDK exposes `getAccessToken()` only via the `useLogto()` hook,
 * but the Axios request interceptor runs outside of React.  This module bridges
 * the two: a React component (LogtoTokenSync) writes the getter here, and the
 * interceptor reads it.
 */

let tokenGetter: ((resource?: string) => Promise<string | undefined>) | null = null;
let apiResource = '';

/** Token injected by the parent frame via postMessage (iframe mode). */
let externalToken: string | null = null;

export function setExternalToken(token: string): void {
  externalToken = token;
}

export function clearExternalToken(): void {
  externalToken = null;
}

/**
 * Called from within the LogtoProvider tree to register the SDK's
 * getAccessToken function and the API resource identifier.
 */
export function setLogtoTokenGetter(
  fn: (resource?: string, organizationId?: string) => Promise<string | undefined>,
  resource: string,
): void {
  tokenGetter = fn;
  apiResource = resource;
}

/**
 * Retrieve an access token for the configured API resource.
 * Returns null when the user is not authenticated or the SDK is not ready.
 */
export async function getLogtoAccessToken(timeoutMs = 3000): Promise<string | null> {
  // External token from parent iframe takes priority
  if (externalToken) return externalToken;

  if (!tokenGetter) return null;

  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const result = await Promise.race([tokenGetter(apiResource), timeout]);
    return result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer!);
  }
}
