import { useCallback, useEffect, useRef, useState } from 'react';
import { setIframeToken } from '../services/iframeAuth';

/**
 * Sign-in component for iframe context.
 *
 * Opens a popup window where the user completes Microsoft OAuth via
 * Clerk in a first-party (top-level) context. After sign-in, the popup
 * fetches a long-lived HMAC token from the backend and sends it here
 * via postMessage. We store the token in memory and notify the parent
 * that auth is complete — no Clerk client-side SDK required in the iframe.
 */
export default function EmbeddedSignIn({ onAuthenticated, autoOpen = false }: { onAuthenticated?: () => void; autoOpen?: boolean }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const autoOpenedRef = useRef(false);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type !== 'iframe-auth-token' || !event.data?.token) return;

      setLoading(false);
      setError('');
      setIframeToken(event.data.token);
      onAuthenticated?.();
    },
    [onAuthenticated],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Poll to detect if user closed the popup without completing sign-in
  useEffect(() => {
    if (!popupRef.current) return;

    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setLoading(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [loading]);

  const openPopup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) return;

    setError('');
    setLoading(true);

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `${window.location.origin}/auth/popup`,
      'clerk-signin-popup',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    );

    if (!popup) {
      setError('Popup was blocked. Please allow popups for this site.');
      setLoading(false);
      return;
    }

    popupRef.current = popup;
  }, []);

  // Auto-open the popup on mount when autoOpen is true
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openPopup();
    }
  }, [autoOpen, openPopup]);

  return (
    <div className="bg-spotify-gray rounded-lg p-8 max-w-sm w-full mx-auto">
      <h2 className="text-2xl font-bold text-white text-center mb-2">Sign In</h2>
      <p className="text-gray-400 text-sm text-center mb-6">
        Sign in to join this session
      </p>

      <button
        onClick={openPopup}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-[#2f2f2f] hover:bg-[#3a3a3a] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition border border-gray-600"
      >
        {/* Microsoft logo */}
        <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        {loading ? 'Signing in…' : 'Sign in with Microsoft'}
      </button>

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-lg text-center">
          {error}
        </div>
      )}
    </div>
  );
}
