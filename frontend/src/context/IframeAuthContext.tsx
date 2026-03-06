import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { setExternalToken, clearExternalToken } from '../services/logtoTokenStore';

interface IframeAuthState {
  /** True when a valid token has been received from the parent frame */
  isAuthenticated: boolean;
  /** True while waiting for the parent to send an initial token */
  isWaitingForParent: boolean;
  /** Logto user ID provided by the parent */
  userId: string | null;
  /** Display name provided by the parent */
  displayName: string | null;
}

const defaultState: IframeAuthState = {
  isAuthenticated: false,
  isWaitingForParent: false,
  userId: null,
  displayName: null,
};

const IframeAuthContext = createContext<IframeAuthState>(defaultState);

export const useIframeAuth = () => useContext(IframeAuthContext);

/** True when the page is loaded inside an iframe */
export const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

/**
 * Bridges authentication from a parent site that shares the same Logto
 * instance.  The parent sends a Logto access token (for the DJ-app API
 * resource) via `postMessage` so the embedded app never needs to run its
 * own OIDC redirect flow.
 *
 * Protocol (parent ↔ iframe):
 *   iframe  → parent:  { type: 'dj-app:token-request' }
 *   parent  → iframe:  { type: 'dj-app:token', token, userId?, displayName? }
 *   parent  → iframe:  { type: 'dj-app:token-clear' }
 *
 * When not embedded this provider is a no-op pass-through.
 */
export function IframeAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IframeAuthState>(() => ({
    ...defaultState,
    isWaitingForParent: isEmbedded,
  }));
  const requestSent = useRef(false);

  useEffect(() => {
    if (!isEmbedded) return;

    // Ask parent for a token once on mount
    if (!requestSent.current) {
      requestSent.current = true;
      try {
        window.parent.postMessage({ type: 'dj-app:token-request' }, '*');
      } catch {
        // Cross-origin restriction — parent must push token proactively
      }
    }

    // After a timeout, stop waiting so the page can render a fallback
    const waitTimer = setTimeout(() => {
      setState((prev) =>
        prev.isWaitingForParent ? { ...prev, isWaitingForParent: false } : prev,
      );
    }, 4000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'dj-app:token' && typeof data.token === 'string' && data.token) {
        setExternalToken(data.token);
        setState({
          isAuthenticated: true,
          isWaitingForParent: false,
          userId: data.userId ?? null,
          displayName: data.displayName ?? null,
        });
      }

      if (data.type === 'dj-app:token-clear') {
        clearExternalToken();
        setState({ ...defaultState, isWaitingForParent: false });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(waitTimer);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <IframeAuthContext.Provider value={state}>
      {children}
    </IframeAuthContext.Provider>
  );
}
