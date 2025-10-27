import { ChangeEvent, KeyboardEvent, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react';
import { guestApi } from '../services/api';
import { socketService } from '../services/socket';
import { Session, SessionParticipant, QueueState, PlaybackState } from '../types';
import QueueList from '../components/QueueList';
import SearchBar from '../components/SearchBar';
import NowPlaying from '../components/NowPlaying';
import NextUp from '../components/NextUp';
import { useApiSWR } from '../hooks/useApiSWR';

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joiningGuest, setJoiningGuest] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const {
    data: sessionData,
    error: sessionError,
    isLoading: sessionLoading,
  } = useApiSWR<{ session: Session }>(
    sessionId ? `/sessions/${sessionId}` : null,
    { shouldRetryOnError: false }
  );
  const session = sessionData?.session ?? null;

  const {
    data: queueData,
    mutate: mutateQueue,
  } = useApiSWR<QueueState>(
    sessionId ? `/queue/${sessionId}` : null,
    { keepPreviousData: true }
  );
  const queueState: QueueState = queueData ?? { nextUp: null, queue: [] };

  const {
    data: playbackData,
    error: playbackFetchError,
    mutate: mutatePlayback,
  } = useApiSWR<{ playback: PlaybackState | null }>(
    sessionId ? `/spotify/playback?sessionId=${sessionId}` : null,
    { shouldRetryOnError: false }
  );
  const playback = playbackData?.playback ?? null;

  const {
    data: participantData,
    error: participantError,
    mutate: mutateParticipant,
  } = useApiSWR<{ participant: SessionParticipant }>(
    sessionId ? `/sessions/${sessionId}/participant` : null,
    { revalidateOnFocus: false }
  );
  const participant: SessionParticipant | null = participantData?.participant ?? (participantError ? { type: 'none' } : null);

  useEffect(() => {
    if (sessionError?.response?.status === 404) {
      navigate('/dashboard');
    }
  }, [sessionError, navigate]);

  useEffect(() => {
    if (playbackFetchError) {
      const status = playbackFetchError.response?.status;
      const message = status === 401 || status === 403
        ? 'Join the session to view playback'
        : 'Playback data unavailable';
      setPlaybackError(message);
      return;
    }

    setPlaybackError(null);
  }, [playbackFetchError, playbackData]);

  useEffect(() => {
    if (!participant) {
      return;
    }

    if (participant.type === 'none') {
      setShowGuestModal(true);
    } else {
      setShowGuestModal(false);
    }
  }, [participant?.type]);

  useEffect(() => {
    if (!sessionId || participant?.type !== 'host') {
      return;
    }

    const KEEP_ALIVE_INTERVAL_MS = 60000;
    const intervalId = setInterval(() => {
      void mutatePlayback();
      socketService.getSocket()?.emit('host_keep_alive', { sessionId });
    }, KEEP_ALIVE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [sessionId, participant?.type, mutatePlayback]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    socketService.connect();
    const queueCleanup = socketService.onQueueUpdated((data) => {
      void mutateQueue(data, false);
    });

    const playbackCleanup = socketService.onNowPlaying((data) => {
      void mutatePlayback({ playback: data.playback ?? null }, false);
      setPlaybackError(null);
    });

    socketService.joinSession(sessionId);

    return () => {
      queueCleanup?.();
      playbackCleanup?.();
      socketService.leaveSession(sessionId);
      socketService.disconnect();
    };
  }, [sessionId, mutateQueue, mutatePlayback]);

  const handleGuestJoin = async () => {
    if (!guestName.trim() || !sessionId) return;

    setJoiningGuest(true);
    setJoinError(null);

    try {
      await guestApi.joinById(sessionId, guestName.trim());
      await Promise.all([mutateParticipant(), mutateQueue(), mutatePlayback()]);
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

  const handleCopyInviteLink = () => {
    if (!session) return;

    const inviteLink = `${window.location.origin}/join/${session.code}`;
    navigator.clipboard.writeText(inviteLink)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        setLinkCopied(false);
        alert('Failed to copy invite link. Please copy it manually.');
      });
  };

  if (sessionLoading && !session) {
    return (
      <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
        <div className="text-white text-xl">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const refreshQueue = async () => {
    await mutateQueue();
  };

  const refreshPlayback = async () => {
    await mutatePlayback();
  };

  const updatePlayback = (updater: (current: PlaybackState | null) => PlaybackState | null) => {
    void mutatePlayback((previous: { playback: PlaybackState | null } | undefined) => {
      const current = previous?.playback ?? null;
      return { playback: updater(current) };
    }, false);
  };

  const upcomingCount = queueState.queue.length + (queueState.nextUp ? 1 : 0);
  const totalVotes = (queueState.nextUp?.voteScore ?? 0) +
    queueState.queue.reduce((sum, item) => sum + item.voteScore, 0);

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
              className="w-full bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
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

            <button
              onClick={handleCopyInviteLink}
              className="flex items-center gap-2 bg-spotify-green hover:bg-spotify-hover text-white px-4 py-2 rounded-lg transition"
            >
              {linkCopied ? <Check size={18} /> : <Share2 size={18} />}
              <span>{linkCopied ? 'Link Copied!' : 'Copy Invite Link'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Queue Section */}
          <div className="lg:col-span-2 space-y-6">
            <NowPlaying
              canControl={participant?.type === 'host'}
              sessionId={session.id}
              playback={playback}
              error={playbackError}
              setError={setPlaybackError}
              onRefresh={refreshPlayback}
              updatePlayback={updatePlayback}
            />
            <NextUp track={queueState.nextUp} />
            <SearchBar
              sessionId={session.id}
              onTrackAdded={() => { void refreshQueue(); }}
              canSearch={participant?.type === 'host' || participant?.type === 'guest'}
              onRequireAccess={handleRequireAccess}
            />
            <QueueList
              nextUp={queueState.nextUp}
              queue={queueState.queue}
              sessionId={session.id}
              onQueueUpdate={() => { void refreshQueue(); }}
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
                <p>Upcoming tracks: <span className="text-spotify-green font-bold">{upcomingCount}</span></p>
                <p>Total votes: <span className="text-spotify-green font-bold">{totalVotes}</span></p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
