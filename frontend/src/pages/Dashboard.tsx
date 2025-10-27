import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Users } from 'lucide-react';
import { authApi, sessionApi } from '../services/api';
import { User, Session } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [recentSession, setRecentSession] = useState<Session | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [allowExplicit, setAllowExplicit] = useState(true);

  useEffect(() => {
    fetchUser();
    fetchRecentSession();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await authApi.getMe();
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentSession = async () => {
    try {
      const response = await sessionApi.getRecent();
      setRecentSession(response.data.session || null);
    } catch (error) {
      console.error('Failed to fetch recent session:', error);
      setRecentSession(null);
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    try {
      const response = await sessionApi.create({
        name: sessionName.trim(),
        allowExplicit,
      });
      const session: Session = response.data.session;
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
      const response = await sessionApi.reopen(recentSession.id);
      const session: Session = response.data.session;
      navigate(`/session/${session.id}`);
    } catch (error: any) {
      console.error('Failed to reopen session:', error);
      const message = error?.response?.data?.error || 'Failed to reopen session';
      setResumeError(message);
      await fetchRecentSession();
    } finally {
      setResuming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

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
