import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, guestApi } from '../services/api';
import { Session } from '../types';
import { useLogto } from '@logto/react';
import { useIframeAuth, isEmbedded } from '../context/IframeAuthContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'host' | 'guest' | null>(null);
  const { isAuthenticated: isLogtoAuth, isLoading, signIn, signOut, getIdTokenClaims } = useLogto();
  const iframeAuth = useIframeAuth();
  const isAuthenticated = isLogtoAuth || iframeAuth.isAuthenticated;
  const [loggingOut, setLoggingOut] = useState(false);

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
      const claims = await getIdTokenClaims();
      const displayName = claims?.name || iframeAuth.displayName || undefined;
      const response = await guestApi.joinByCode(joinCode.toUpperCase(), displayName);
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
  }, [joinCode, navigate, getIdTokenClaims]);

  // After auth completes, execute pending action
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
  }, [pendingAction, isAuthenticated, startSpotifyConnect, attemptGuestJoin]);

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
        void signOut(window.location.origin);
      } catch (error) {
        console.error('Logto sign-out failed:', error);
      }
      setLoggingOut(false);
    }
  };

  const promptSignIn = (action: 'host' | 'guest', redirectPath?: string) => {
    if (isLoading) {
      return;
    }

    // In iframe mode, the parent provides auth — no redirect needed.
    // If we somehow get here without auth, just set the pending action
    // and wait for the parent's token.
    setPendingAction(action);

    if (isEmbedded) {
      return;
    }

    sessionStorage.setItem('logto_post_login_redirect', redirectPath || '/');
    void signIn(`${window.location.origin}/callback`);
  };

  const handleLogin = async () => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      promptSignIn('host');
      return;
    }

    await startSpotifyConnect();
  };

  const handleGuestJoin = async () => {
    if (joinCode.trim().length !== 6) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      promptSignIn('guest');
      return;
    }

    await attemptGuestJoin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-spotify-black via-spotify-dark to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {!isLoading && isAuthenticated && (
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
            Have a session code? Sign in and we&apos;ll use your name to let everyone know who&apos;s adding tracks.
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
