import { useEffect } from 'react';
import { SignIn, useUser } from '@clerk/clerk-react';
import { authApi } from '../services/api';

/**
 * Popup page that handles sign-in via Clerk's normal UI (OAuth, etc.)
 * then sends a long-lived HMAC token back to the opener (iframe) via
 * postMessage.
 *
 * Rendered at /auth/popup — opened by EmbeddedSignIn in a popup window.
 * Uses Clerk's <SignIn /> component directly in a top-level window context
 * where Clerk's OAuth flow works normally.
 *
 * Flow:
 * 1. User completes "Sign in with Microsoft" OAuth via Clerk
 * 2. Popup calls POST /api/auth/iframe-token (Clerk JWT in header)
 * 3. Backend returns an HMAC-signed token containing the clerkUserId
 * 4. Popup sends the token to the iframe via postMessage
 * 5. Iframe stores the token and uses it for all API calls
 */
export default function AuthPopup() {
  const { isLoaded, isSignedIn } = useUser();

  // Once signed in, fetch an iframe token and send it to the opener (iframe)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const sendToken = async () => {
      try {
        const { data } = await authApi.getIframeToken();

        if (window.opener) {
          window.opener.postMessage(
            { type: 'iframe-auth-token', token: data.token },
            '*',
          );
        }

        // Give the message a moment to be received, then close
        setTimeout(() => window.close(), 500);
      } catch (err) {
        console.error('Failed to get iframe token:', err);
        // Still try to close — the user is signed in on the main domain at least
        setTimeout(() => window.close(), 2000);
      }
    };

    void sendToken();
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-spotify-green text-4xl mb-4">✓</div>
          <div className="text-white text-lg font-semibold">Signed in!</div>
          <div className="text-gray-400 text-sm mt-2">This window will close automatically...</div>
        </div>
      </div>
    );
  }

  // Render Clerk's <SignIn /> component directly in the popup.
  // This is a top-level window (not an iframe) so full-page redirects work.
  return (
    <div className="min-h-screen bg-spotify-dark flex items-center justify-center p-4">
      <SignIn
        routing="path"
        path="/auth/popup"
        forceRedirectUrl="/auth/popup"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
          },
        }}
      />
    </div>
  );
}
