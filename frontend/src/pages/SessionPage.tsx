import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { sessionApi, queueApi } from '../services/api';
import { socketService } from '../services/socket';
import { Session, QueueItem } from '../types';
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

  useEffect(() => {
    if (!sessionId) return;

    fetchSession();
    fetchQueue();

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
            <NowPlaying sessionId={sessionId!} />
            <SearchBar sessionId={sessionId!} onTrackAdded={fetchQueue} />
            <QueueList queue={queue} sessionId={sessionId!} onQueueUpdate={fetchQueue} />
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
