import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Users } from 'lucide-react';
import { authApi, sessionApi } from '../services/api';
import { User, Session } from '../types';
import { useApiSWR } from '../hooks/useApiSWR';
import { useLogto } from '@logto/react';
import { useIframeAuth, isEmbedded } from '../context/IframeAuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated: isLogtoAuth, isLoading: isAuthLoading, signIn, signOut } = useLogto();
  const iframeAuth = useIframeAuth();
  const isAuthenticated = isLogtoAuth || iframeAuth.isAuthenticated;
  const [sessionName, setSessionName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [allowExplicit, setAllowExplicit] = useState(true);
  const [maxSongDuration, setMaxSongDuration] = useState<number | ''>('');
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const { data: userData, error: userError, isLoading: userLoading } = useApiSWR<{ user: User }>(
    isAuthenticated ? '/auth/me' : null,
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
      const response = await sessionApi.create({
        name: sessionName.trim(),
        allowExplicit,
        ...(maxSongDuration !== '' && maxSongDuration > 0 ? { maxSongDuration: Number(maxSongDuration) } : {}),
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
      void signOut(window.location.origin);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleResumeSession = async () => {
    if (!recentSession) return;

    setResuming(true);
    setResumeError(null);

    try {
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

  if (isAuthLoading || iframeAuth.isWaitingForParent) {
    return (
      <div className="min-h-screen bg-th-page flex items-center justify-center">
        <div className="text-primary text-xl">Loading account...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-th-page flex items-center justify-center p-6">
        <div className="bg-th-surface rounded-lg p-8 text-center space-y-4 max-w-md w-full">
          <h2 className="text-2xl font-bold text-primary">Sign in to manage sessions</h2>
          <p className="text-secondary text-sm">
            {isEmbedded
              ? 'Please sign in on the main site to access the dashboard.'
              : 'Sign in to create or join sessions.'}
          </p>
          {!isEmbedded && (
            <button
              onClick={() => {
                sessionStorage.setItem('logto_post_login_redirect', '/dashboard');
                void signIn(`${window.location.origin}/callback`);
              }}
              className="w-full bg-th-brand hover:bg-th-brand-hover text-primary font-bold py-3 rounded-lg transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-th-page flex items-center justify-center">
        <div className="text-primary text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-th-page">
      <header className="bg-th-elevated border-b border p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">MTGPros DJ</h1>
          <div className="flex items-center gap-4">
            <span className="text-secondary">Welcome, {user?.displayName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-th-surface hover:bg-th-hover text-primary px-4 py-2 rounded-full transition"
            >
              <LogOut size={20} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Session */}
          <div className="bg-th-surface p-8 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <Plus size={32} className="text-th-brand" />
              <h2 className="text-2xl font-bold text-primary">Create Session</h2>
            </div>
            
            <input
              type="text"
              placeholder="Enter session name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full bg-th-input text-primary px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 ring-th-brand"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
            />

            <label className="flex items-center justify-between bg-th-input px-4 py-3 rounded-lg mb-4">
              <div>
                <p className="text-primary font-semibold text-sm">Allow explicit songs</p>
                <p className="text-muted text-xs">Guests can queue explicit tracks when enabled.</p>
              </div>
              <input
                type="checkbox"
                checked={allowExplicit}
                onChange={(e) => setAllowExplicit(e.target.checked)}
                className="h-5 w-5 accent-th-brand"
              />
            </label>

            <label className="bg-th-input px-4 py-3 rounded-lg mb-4 block">
              <div className="mb-2">
                <p className="text-primary font-semibold text-sm">Max song length (minutes)</p>
                <p className="text-muted text-xs">Leave empty for no limit.</p>
              </div>
              <input
                type="number"
                min="1"
                placeholder="No limit"
                value={maxSongDuration}
                onChange={(e) => setMaxSongDuration(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-th-surface text-primary px-3 py-2 rounded-lg focus:outline-none focus:ring-2 ring-th-brand"
              />
            </label>
            
            <button
              onClick={handleCreateSession}
              disabled={!sessionName.trim()}
              className="w-full bg-th-brand hover:bg-th-brand-hover disabled:bg-th-hover disabled:cursor-not-allowed text-primary font-bold py-3 rounded-lg transition"
            >
              Create Jukebox
            </button>
            
            <p className="text-sm text-muted mt-4">
              Host a session and share the code with friends
            </p>
          </div>

          {/* Join Session */}
          <div className="bg-th-surface p-8 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <Users size={32} className="text-th-brand" />
              <h2 className="text-2xl font-bold text-primary">Join Session</h2>
            </div>
            
            <input
              type="text"
              placeholder="Enter session code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full bg-th-input text-primary px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 ring-th-brand uppercase tracking-widest text-center text-xl font-mono"
              maxLength={6}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinSession()}
            />
            
            <button
              onClick={handleJoinSession}
              disabled={joinCode.length !== 6}
              className="w-full bg-th-brand hover:bg-th-brand-hover disabled:bg-th-hover disabled:cursor-not-allowed text-primary font-bold py-3 rounded-lg transition"
            >
              Join Jukebox
            </button>
            
            <p className="text-sm text-muted mt-4">
              Enter a 6-character code to join an existing session
            </p>
          </div>

          {/* Resume Recent Session */}
          <div className="bg-th-surface p-8 rounded-lg md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <Users size={32} className="text-th-brand" />
              <h2 className="text-2xl font-bold text-primary">Resume Recent Session</h2>
            </div>

            {loadingRecent ? (
              <p className="text-secondary">Checking for recent sessions…</p>
            ) : recentSession ? (
              <div className="space-y-4">
                <div>
                  <p className="text-secondary text-sm">Last session:</p>
                  <p className="text-primary text-xl font-bold">{recentSession.name}</p>
                  <p className="text-muted text-sm">Code: <span className="font-mono text-lg">{recentSession.code}</span></p>
                  <p className="text-faint text-xs">Status: {recentSession.isActive ? 'Active' : 'Inactive'}</p>
                </div>

                {resumeError && (
                  <p className="text-th-error text-sm">{resumeError}</p>
                )}

                <button
                  onClick={handleResumeSession}
                  disabled={resuming}
                  className="bg-th-brand hover:bg-th-brand-hover disabled:bg-th-hover disabled:cursor-not-allowed text-primary font-bold py-3 px-6 rounded-lg transition"
                >
                  {resuming ? 'Reopening…' : 'Resume Session'}
                </button>

                <p className="text-sm text-muted">
                  Guests can continue to use the same link: {window.location.origin}/join/{recentSession.code}
                </p>
              </div>
            ) : (
              <p className="text-secondary">No previous sessions found. Create one to get started!</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
