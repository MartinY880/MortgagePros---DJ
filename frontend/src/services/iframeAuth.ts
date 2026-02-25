/**
 * Iframe authentication service.
 *
 * Manages a long-lived HMAC-signed token for API auth when the DJ app
 * runs inside a cross-origin iframe. Clerk's client-side SDK cannot
 * establish a session in this context due to third-party cookie
 * restrictions, so we bypass it entirely:
 *
 * 1. A popup window authenticates with Clerk (works — top-level context)
 * 2. The popup calls POST /api/auth/iframe-token to get an HMAC token
 * 3. The popup sends the token to the iframe via postMessage
 * 4. The iframe stores the token in localStorage so the user stays
 *    signed in across page reloads / re-embeds, and attaches it to
 *    every API request as `Authorization: IframeToken <token>`
 */

const STORAGE_KEY = 'dj_iframe_token';

/** True when the app is rendered inside an iframe. */
export const isEmbedded = (): boolean =>
  typeof window !== 'undefined' && window.self !== window.top;

// ---- Token storage (localStorage-backed) ----

let iframeToken: string | null = null;
let onAuthChangeCallbacks: Array<() => void> = [];

// Hydrate from localStorage on module load
try {
  iframeToken = localStorage.getItem(STORAGE_KEY);
} catch {
  // localStorage may be blocked in some iframe contexts — fall back to memory-only
}

/** Store a new iframe token received from the popup. */
export function setIframeToken(token: string): void {
  iframeToken = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Silently fall back to memory-only
  }
  onAuthChangeCallbacks.forEach((cb) => cb());
}

/** Retrieve the current iframe token (null if not authenticated). */
export function getIframeToken(): string | null {
  return iframeToken;
}

/** Check whether the iframe has a valid auth token. */
export function isIframeAuthenticated(): boolean {
  return iframeToken !== null;
}

/** Clear the iframe token (e.g. on logout). */
export function clearIframeToken(): void {
  iframeToken = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
  onAuthChangeCallbacks.forEach((cb) => cb());
}

/**
 * Register a callback that fires when the iframe auth state changes.
 * Returns an unsubscribe function.
 */
export function onIframeAuthChange(callback: () => void): () => void {
  onAuthChangeCallbacks.push(callback);
  return () => {
    onAuthChangeCallbacks = onAuthChangeCallbacks.filter((cb) => cb !== callback);
  };
}
