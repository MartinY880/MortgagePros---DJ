import { ChangeEvent, KeyboardEvent, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { sessionApi, queueApi, guestApi } from '../services/api';
import { socketService } from '../services/socket';
import { Session, QueueItem, SessionParticipant } from '../types';
import QueueList from '../components/QueueList';
import SearchBar from '../components/SearchBar';
import NowPlaying from '../components/NowPlaying';

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [participant, setParticipant] = useState<SessionParticipant | null>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joiningGuest, setJoiningGuest] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetchSession();
    fetchQueue();
    fetchParticipant();

    // Connect to socket
    socketService.connect();
    socketService.joinSession(sessionId);

    // Listen for queue updates
    socketService.onQueueUpdated((data) => {
      setQueue(data.queue);
    });

    return () => {
      socketService.leaveSession(sessionId);
      socketService.disconnect();
    };
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await sessionApi.getById(sessionId!);
      setSession(response.data.session);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    try {
      const response = await queueApi.get(sessionId!);
      setQueue(response.data.queue);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    }
  };

  const fetchParticipant = async () => {
    if (!sessionId) return;

    try {
      const response = await sessionApi.getParticipant(sessionId);
      const participantInfo: SessionParticipant = response.data.participant;
      setParticipant(participantInfo);
      setShowGuestModal(participantInfo.type === 'none');
    } catch (error) {
      console.error('Failed to fetch participant info:', error);
      setParticipant({ type: 'none' });
      setShowGuestModal(true);
    }
  };

  const handleGuestJoin = async () => {
    if (!guestName.trim() || !sessionId) return;

    setJoiningGuest(true);
    setJoinError(null);

    try {
      await guestApi.joinById(sessionId, guestName.trim());
      await Promise.all([fetchParticipant(), fetchQueue()]);
      setGuestName('');
      setShowGuestModal(false);
    } catch (error: any) {
      console.error('Guest join error:', error);
      const message = error?.response?.data?.error || 'Failed to join session. Please try again.';
      setJoinError(message);
    } finally {
      setJoiningGuest(false);
    }
  };

  const handleRequireAccess = () => {
    setJoinError(null);
    setShowGuestModal(true);
  };

  const handleCopyCode = () => {
    if (session) {
      navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-xl">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-spotify-dark">
      {showGuestModal && participant?.type !== 'host' && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-spotify-gray rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-white mb-4">Join {session.name}</h2>
            <p className="text-gray-300 text-sm mb-4">
              Enter your name to join the party and start adding songs.
            </p>
            <input
              type="text"
              placeholder="Your name"
              value={guestName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setGuestName(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleGuestJoin()}
              className="w-full bg-spotify-black text-white px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-spotify-green"
            />
            {joinError && (
              <div className="text-red-400 text-sm mb-2">{joinError}</div>
            )}
            <button
              onClick={handleGuestJoin}
              disabled={!guestName.trim() || joiningGuest}
              className="w-full bg-spotify-green hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
            >
              {joiningGuest ? 'Joining...' : 'Join Party'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-spotify-black border-b border-spotify-gray p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-400 hover:text-white transition"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{session.name}</h1>
              <p className="text-sm text-gray-400">Host: {session.host.displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-spotify-gray px-4 py-2 rounded-lg flex items-center gap-2">
              <span className="text-gray-400 text-sm">Session Code:</span>
              <span className="font-mono text-xl font-bold text-spotify-green">
                {session.code}
              </span>
              <button
                onClick={handleCopyCode}
                className="ml-2 text-gray-400 hover:text-white transition"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Queue Section */}
          <div className="lg:col-span-2 space-y-6">
            <NowPlaying sessionId={sessionId!} canControl={participant?.type === 'host'} />
            <SearchBar
              sessionId={sessionId!}
              onTrackAdded={fetchQueue}
              canSearch={participant?.type === 'host' || participant?.type === 'guest'}
              onRequireAccess={handleRequireAccess}
            />
            <QueueList
              queue={queue}
              sessionId={sessionId!}
              onQueueUpdate={fetchQueue}
              participant={participant}
              onRequireAccess={handleRequireAccess}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-spotify-gray p-6 rounded-lg">
              <h3 className="text-xl font-bold text-white mb-4">How it works</h3>
              <ul className="space-y-3 text-gray-300 text-sm">
                <li>🔍 Search for songs to add to the queue</li>
                <li>👍 Vote on tracks you want to hear</li>
                <li>🎵 Top voted songs play first</li>
                <li>🎪 Share the session code with friends</li>
              </ul>
            </div>

            <div className="bg-spotify-gray p-6 rounded-lg">
              <h3 className="text-xl font-bold text-white mb-2">Queue Stats</h3>
              <div className="space-y-2 text-gray-300">
                <p>Tracks in queue: <span className="text-spotify-green font-bold">{queue.length}</span></p>
                <p>Total votes: <span className="text-spotify-green font-bold">
                  {queue.reduce((sum, item) => sum + item.voteScore, 0)}
                </span></p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
