import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, Plus, Users } from 'lucide-react';
import { authApi, sessionApi } from '../services/api';
import { User, Session } from '../types';
import { useApiSWR } from '../hooks/useApiSWR';
import { useClerk, useUser } from '@clerk/clerk-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { openSignIn, signOut } = useClerk();
  const [sessionName, setSessionName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [allowExplicit, setAllowExplicit] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const { data: userData, error: userError, isLoading: userLoading } = useApiSWR<{ user: User }>(
    isSignedIn ? '/auth/me' : null,
    {
      shouldRetryOnError: false,
    }
  );
  const user = userData?.user ?? null;

  const {
    data: recentData,
    isLoading: loadingRecent,
    mutate: mutateRecent,
  } = useApiSWR<{ session: Session | null }>(user ? '/sessions/recent' : null, {
    keepPreviousData: true,
  });

  const recentSession = recentData?.session ?? null;

  useEffect(() => {
    if (userError?.response?.status === 401) {
      navigate('/');
    }
  }, [userError, navigate]);

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    try {
      if (!user?.playbackDeviceId) {
        alert('Select a Spotify playback device before starting a session.');
        navigate('/device-setup');
        return;
      }

      const response = await sessionApi.create({
        name: sessionName.trim(),
        allowExplicit,
      });
      const session: Session = response.data.session;
      void mutateRecent();
      navigate(`/session/${session.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
    }
  };

  const handleJoinSession = async () => {
    if (!joinCode.trim()) return;
    
    try {
      const response = await sessionApi.getByCode(joinCode.toUpperCase());
      const session: Session = response.data.session;
      navigate(`/session/${session.id}`);
    } catch (error) {
      console.error('Failed to join session:', error);
      alert('Session not found');
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      await signOut({ redirectUrl: '/' });
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleResumeSession = async () => {
    if (!recentSession) return;

    setResuming(true);
    setResumeError(null);

    try {
      if (!user?.playbackDeviceId) {
        setResuming(false);
        navigate('/device-setup');
        return;
      }

      const response = await sessionApi.reopen(recentSession.id);
      const session: Session = response.data.session;
      void mutateRecent();
      navigate(`/session/${session.id}`);
    } catch (error: any) {
      console.error('Failed to reopen session:', error);
      const message = error?.response?.data?.error || 'Failed to reopen session';
      setResumeError(message);
      void mutateRecent();
    } finally {
      setResuming(false);
    }
  };

  if (!isUserLoaded) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-xl">Loading account...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center p-6">
        <div className="bg-spotify-gray rounded-lg p-8 text-center space-y-4 max-w-md w-full">
          <h2 className="text-2xl font-bold text-white">Sign in to manage sessions</h2>
          <p className="text-gray-300 text-sm">
            Connect with Clerk to create or join sessions.
          </p>
          <button
            onClick={() => {
              void openSignIn({
                forceRedirectUrl: window.location.href,
              });
            }}
            className="w-full bg-spotify-green hover:bg-spotify-hover text-white font-bold py-3 rounded-lg transition"
          >
            Sign in with Clerk
          </button>
        </div>
      </div>
    );
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const hasPlaybackDevice = Boolean(user.playbackDeviceId);

  return (
    <div className="min-h-screen bg-spotify-dark">
      <header className="bg-spotify-black border-b border-spotify-gray p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">MTGPros DJ</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">Welcome, {user?.displayName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-spotify-gray hover:bg-gray-600 text-white px-4 py-2 rounded-full transition"
            >
              <LogOut size={20} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        {!hasPlaybackDevice && (
          <div className="bg-yellow-500/10 border border-yellow-500/60 text-yellow-100 rounded-lg p-4 mb-8 flex items-start gap-3">
            <AlertTriangle className="mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-100">Choose a playback device to start hosting.</p>
              <p className="text-sm text-yellow-50/80 mt-1">
                MTGPros DJ needs to know which Spotify device should receive audio. Pick one now so queued songs start playing automatically.
              </p>
              <button
                onClick={() => navigate('/device-setup')}
                className="mt-3 inline-flex items-center bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-full transition"
              >
                Select playback device
              </button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Session */}
          <div className="bg-spotify-gray p-8 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <Plus size={32} className="text-spotify-green" />
              <h2 className="text-2xl font-bold text-white">Create Session</h2>
            </div>
            
            <input
              type="text"
              placeholder="Enter session name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full bg-spotify-black text-white px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-spotify-green"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
            />

            <label className="flex items-center justify-between bg-spotify-black px-4 py-3 rounded-lg mb-4">
              <div>
                <p className="text-white font-semibold text-sm">Allow explicit songs</p>
                <p className="text-gray-400 text-xs">Guests can queue explicit tracks when enabled.</p>
              </div>
              <input
                type="checkbox"
                checked={allowExplicit}
                onChange={(e) => setAllowExplicit(e.target.checked)}
                className="h-5 w-5 accent-spotify-green"
              />
            </label>
            
            <button
              onClick={handleCreateSession}
              disabled={!sessionName.trim()}
              className="w-full bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
            >
              Create Jukebox
            </button>
            
            <p className="text-sm text-gray-400 mt-4">
              Host a session and share the code with friends
            </p>
          </div>

          {/* Join Session */}
          <div className="bg-spotify-gray p-8 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <Users size={32} className="text-spotify-green" />
              <h2 className="text-2xl font-bold text-white">Join Session</h2>
            </div>
            
            <input
              type="text"
              placeholder="Enter session code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full bg-spotify-black text-white px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-spotify-green uppercase tracking-widest text-center text-xl font-mono"
              maxLength={6}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinSession()}
            />
            
            <button
              onClick={handleJoinSession}
              disabled={joinCode.length !== 6}
              className="w-full bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
            >
              Join Jukebox
            </button>
            
            <p className="text-sm text-gray-400 mt-4">
              Enter a 6-character code to join an existing session
            </p>
          </div>

          {/* Resume Recent Session */}
          <div className="bg-spotify-gray p-8 rounded-lg md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <Users size={32} className="text-spotify-green" />
              <h2 className="text-2xl font-bold text-white">Resume Recent Session</h2>
            </div>

            {loadingRecent ? (
              <p className="text-gray-300">Checking for recent sessions…</p>
            ) : recentSession ? (
              <div className="space-y-4">
                <div>
                  <p className="text-gray-300 text-sm">Last session:</p>
                  <p className="text-white text-xl font-bold">{recentSession.name}</p>
                  <p className="text-gray-400 text-sm">Code: <span className="font-mono text-lg">{recentSession.code}</span></p>
                  <p className="text-gray-500 text-xs">Status: {recentSession.isActive ? 'Active' : 'Inactive'}</p>
                </div>

                {resumeError && (
                  <p className="text-red-400 text-sm">{resumeError}</p>
                )}

                <button
                  onClick={handleResumeSession}
                  disabled={resuming}
                  className="bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition"
                >
                  {resuming ? 'Reopening…' : 'Resume Session'}
                </button>

                <p className="text-sm text-gray-400">
                  Guests can continue to use the same link: {window.location.origin}/join/{recentSession.code}
                </p>
              </div>
            ) : (
              <p className="text-gray-300">No previous sessions found. Create one to get started!</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
