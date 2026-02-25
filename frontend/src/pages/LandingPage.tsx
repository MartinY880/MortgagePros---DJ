import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, guestApi } from '../services/api';
import { Session } from '../types';
import { useClerk, useUser } from '@clerk/clerk-react';
import { isEmbedded, isIframeAuthenticated, onIframeAuthChange } from '../services/iframeAuth';
import EmbeddedSignIn from '../components/EmbeddedSignIn';

type LandingLocationState = {
  requireSignIn?: boolean;
  redirectTo?: string;
} | null;

const resolveAfterAuthUrl = (path?: string) => {
  if (!path) {
    return window.location.href;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
};

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LandingLocationState) ?? null;
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'host' | 'guest' | null>(null);
  const [handledAuthRedirect, setHandledAuthRedirect] = useState(false);
  const { isLoaded, isSignedIn } = useUser();
  const { openSignIn, signOut } = useClerk();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showEmbeddedSignIn, setShowEmbeddedSignIn] = useState(false);
  const [iframeAuthed, setIframeAuthed] = useState(isIframeAuthenticated());

  // Subscribe to iframe auth changes (token received from popup)
  useEffect(() => {
    return onIframeAuthChange(() => setIframeAuthed(isIframeAuthenticated()));
  }, []);

  // In iframe context, auth can come from the iframe token instead of Clerk
  const isAuthenticated = isSignedIn || (isEmbedded() && iframeAuthed);

  const startSpotifyConnect = useCallback(async () => {
    try {
      const response = await authApi.getAuthUrl();

      if (response.data && response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        console.error('No authUrl in response:', response);
        alert('Failed to get Spotify login URL. Please check if the backend server is running.');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Failed to connect: ${errorMsg}\n\nMake sure the backend server is running and accessible.`);
    }
  }, []);

  const attemptGuestJoin = useCallback(async () => {
    if (joinCode.trim().length !== 6) {
      return;
    }

    setJoining(true);
    setJoinError(null);

    try {
      const response = await guestApi.joinByCode(joinCode.toUpperCase());
      const session: Session = response.data.session;
      setJoinCode('');
      navigate(`/session/${session.id}`);
    } catch (error: any) {
      console.error('Guest join error:', error);
      const message = error?.response?.data?.error || 'Failed to join session. Check the code and try again.';
      setJoinError(message);
    } finally {
      setJoining(false);
    }
  }, [joinCode, navigate]);

  useEffect(() => {
    if (!pendingAction || !isAuthenticated) {
      return;
    }

    const run = async () => {
      try {
        if (pendingAction === 'host') {
          await startSpotifyConnect();
        } else {
          await attemptGuestJoin();
        }
      } finally {
        setPendingAction(null);
      }
    };

    void run();
  }, [pendingAction, isSignedIn, startSpotifyConnect, attemptGuestJoin]);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      try {
        await signOut({ redirectUrl: '/' });
      } catch (error) {
        console.error('Clerk sign-out failed:', error);
      }
      setLoggingOut(false);
    }
  };

  const promptClerkSignIn = async (action: 'host' | 'guest', redirectPath?: string) => {
    if (!isLoaded) {
      return;
    }

    // Clerk sign-in modals/redirects crash inside iframes — show inline form instead
    if (isEmbedded()) {
      setPendingAction(action);
      setShowEmbeddedSignIn(true);
      return;
    }

    setPendingAction(action);

    try {
      await openSignIn({
        forceRedirectUrl: resolveAfterAuthUrl(redirectPath),
      });
    } catch (error) {
      console.error('Clerk sign-in aborted:', error);
      setPendingAction(null);
    }
  };

  const handleLogin = async () => {
    if (!isLoaded) {
      return;
    }

    if (!isAuthenticated) {
      await promptClerkSignIn('host');
      return;
    }

    await startSpotifyConnect();
  };

  const handleGuestJoin = async () => {
    if (joinCode.trim().length !== 6) {
      return;
    }

    if (!isLoaded) {
      return;
    }

    if (!isAuthenticated) {
      await promptClerkSignIn('guest');
      return;
    }

    await attemptGuestJoin();
  };

  useEffect(() => {
    if (!isLoaded || handledAuthRedirect) {
      return;
    }

    const redirectRequest = locationState;

    if (!redirectRequest?.requireSignIn) {
      return;
    }

    // Don't trigger Clerk sign-in inside iframes
    if (isEmbedded()) {
      return;
    }

    const targetUrl = resolveAfterAuthUrl(redirectRequest.redirectTo);

    const run = async () => {
      setHandledAuthRedirect(true);

      try {
        await openSignIn({
          forceRedirectUrl: targetUrl,
        });
      } catch (error) {
        console.error('Clerk sign-in aborted:', error);
        setHandledAuthRedirect(false);
      } finally {
        navigate(location.pathname, { replace: true, state: null });
      }
    };

    void run();
  }, [handledAuthRedirect, isLoaded, location.pathname, locationState, navigate, openSignIn]);

  useEffect(() => {
    if (!locationState?.requireSignIn && handledAuthRedirect) {
      setHandledAuthRedirect(false);
    }
  }, [handledAuthRedirect, locationState]);

  if (showEmbeddedSignIn && isEmbedded() && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-spotify-black via-spotify-dark to-black flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <button
            onClick={() => {
              setShowEmbeddedSignIn(false);
              setPendingAction(null);
            }}
            className="text-gray-400 hover:text-white mb-4 text-sm transition"
          >
            ← Back
          </button>
          <EmbeddedSignIn onAuthenticated={() => setIframeAuthed(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-spotify-black via-spotify-dark to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {isLoaded && isAuthenticated && (
          <div className="flex justify-end mb-4">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="bg-spotify-gray hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-full transition"
            >
              {loggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        )}
        <div className="mb-8 flex justify-center">
          <img 
            src="https://mtgpros.com/wp-content/uploads/2023/04/MTGProsSiteLogo.webp" 
            alt="MortgagePros Logo" 
            className="h-24 w-auto"
          />
        </div>
        
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-spotify-green to-spotify-hover bg-clip-text text-transparent">
          MTGPros DJ
        </h1>
        
        <p className="text-xl text-gray-300 mb-8">
          Create collaborative playlists with your friends. Vote on songs, queue tracks, and let everyone be the DJ!
        </p>
        
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="bg-spotify-green hover:bg-spotify-hover text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
          >
            Connect with Spotify
          </button>
          
          <p className="text-sm text-gray-400">
            Spotify Premium required for playback control
          </p>
        </div>

        <div className="mt-10 bg-spotify-gray bg-opacity-60 border border-spotify-gray/60 rounded-2xl p-6 text-left">
          <h2 className="text-2xl font-bold text-white mb-2">Join a Session as a Guest</h2>
          <p className="text-gray-300 text-sm mb-4">
            Have a session code? Sign in with Clerk, and we&apos;ll use your full name to let everyone know who&apos;s adding tracks.
          </p>

          <div>
            <label className="block text-gray-400 text-sm mb-2" htmlFor="join-code">Session Code</label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError(null);
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleGuestJoin()}
              maxLength={6}
              placeholder="ABC123"
              className="w-full bg-spotify-black text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green uppercase tracking-widest text-center font-mono"
            />
          </div>

          {joinError && (
            <div className="text-red-400 text-sm mt-3">{joinError}</div>
          )}

          <button
            onClick={handleGuestJoin}
            disabled={joinCode.length !== 6 || joining}
            className="w-full mt-4 bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
          >
            {joining ? 'Joining...' : 'Join Session'}
          </button>
        </div>
        
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">🎪 Host Sessions</h3>
            <p className="text-gray-300">Create a jukebox session and share the code with friends</p>
          </div>

          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">🎵 Add Songs</h3>
            <p className="text-gray-300">Search and add tracks to the collaborative queue</p>
          </div>

          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">👍 Vote</h3>
            <p className="text-gray-300">Upvote your favorites - top songs play first!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
