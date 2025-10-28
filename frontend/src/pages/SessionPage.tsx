import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react';
import { guestApi } from '../services/api';
import { socketService } from '../services/socket';
import { Session, SessionParticipant, QueueState, PlaybackState, PlaybackRequester } from '../types';
import QueueList from '../components/QueueList';
import SearchBar from '../components/SearchBar';
import NowPlaying from '../components/NowPlaying';
import NextUp from '../components/NextUp';
import Leaderboard from '../components/Leaderboard';
import { useApiSWR } from '../hooks/useApiSWR';
import { useClerk, useUser } from '@clerk/clerk-react';

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [autoJoinStatus, setAutoJoinStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [autoJoinMessage, setAutoJoinMessage] = useState<string | null>(null);
  const [signInPrompted, setSignInPrompted] = useState(false);
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { openSignIn } = useClerk();

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
  } = useApiSWR<{ playback: PlaybackState | null; requester: PlaybackRequester | null }>(
    isSignedIn && sessionId ? `/spotify/playback?sessionId=${sessionId}` : null,
    { shouldRetryOnError: false }
  );
  const playback = playbackData?.playback ?? null;
  const playbackRequester = playbackData?.requester ?? null;

  const {
    data: participantData,
    error: participantError,
    mutate: mutateParticipant,
  } = useApiSWR<{ participant: SessionParticipant }>(
    isSignedIn && sessionId ? `/sessions/${sessionId}/participant` : null,
    { revalidateOnFocus: false }
  );
  const participant: SessionParticipant | null = participantData?.participant ?? (participantError ? { type: 'none' } : null);

  const executeJoin = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    setAutoJoinStatus('pending');
    setAutoJoinMessage(null);

    try {
      await guestApi.joinById(sessionId);
      await Promise.all([mutateParticipant(), mutateQueue(), mutatePlayback()]);
      setAutoJoinStatus('idle');
    } catch (error: any) {
      console.error('Guest join error:', error);
      const message = error?.response?.data?.error || 'Failed to join session. Please try again.';
      setAutoJoinMessage(message);
      setAutoJoinStatus('error');
      throw error;
    }
  }, [sessionId, mutateParticipant, mutateQueue, mutatePlayback]);

  const invitedSessionId =
    typeof location.state === 'object' && location.state?.fromInvite
      ? (location.state.sessionId as string | undefined ?? sessionId ?? undefined)
      : undefined;

  useEffect(() => {
    if (!isSignedIn || !sessionId) {
      return;
    }

    const isInvitedFlow = Boolean(invitedSessionId) && invitedSessionId === sessionId;

    if (!participant || participant.type !== 'none') {
      return;
    }

    if (!isInvitedFlow && autoJoinStatus !== 'idle') {
      return;
    }

    const attempt = async () => {
      try {
        await executeJoin();
      } catch (error) {
        console.warn('Automatic session join failed:', error);
      }
    };

    void attempt();
  }, [isSignedIn, sessionId, participant?.type, autoJoinStatus, executeJoin, invitedSessionId]);

  useEffect(() => {
    if (participant && participant.type !== 'none') {
      setAutoJoinStatus('idle');
      setAutoJoinMessage(null);
    }
  }, [participant?.type]);

  useEffect(() => {
    if (sessionError?.response?.status === 404) {
      navigate('/dashboard');
    }
  }, [sessionError, navigate]);

  useEffect(() => {
    if (!isUserLoaded || isSignedIn || signInPrompted) {
      return;
    }

    setSignInPrompted(true);

    void openSignIn({
      forceRedirectUrl: window.location.href,
    });
  }, [isUserLoaded, isSignedIn, openSignIn, signInPrompted]);

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
    if (!sessionId || !isSignedIn || participant?.type !== 'host') {
      return;
    }

    const KEEP_ALIVE_INTERVAL_MS = 60000;
    const intervalId = setInterval(() => {
      void mutatePlayback();
      socketService.getSocket()?.emit('host_keep_alive', { sessionId });
    }, KEEP_ALIVE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [sessionId, participant?.type, mutatePlayback, isSignedIn]);

  useEffect(() => {
    if (!sessionId || !isSignedIn) {
      return;
    }

    socketService.connect();
    const queueCleanup = socketService.onQueueUpdated((data) => {
      void mutateQueue(data, false);
    });

    const playbackCleanup = socketService.onNowPlaying((data) => {
      void mutatePlayback({
        playback: data.playback ?? null,
        requester: data.requester ?? null,
      }, false);
      setPlaybackError(null);
    });

    socketService.joinSession(sessionId);

    return () => {
      queueCleanup?.();
      playbackCleanup?.();
      socketService.leaveSession(sessionId);
      socketService.disconnect();
    };
  }, [sessionId, mutateQueue, mutatePlayback, isSignedIn]);

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

  const handleRequireAccess = async () => {
    if (!isUserLoaded) {
      return;
    }

    if (!isSignedIn) {
      try {
        await openSignIn({
          forceRedirectUrl: window.location.href,
        });
      } catch (error) {
        console.error('Clerk sign-in aborted:', error);
      }
      return;
    }

    try {
      await executeJoin();
    } catch {
      // Error message handled in executeJoin
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
          <h2 className="text-2xl font-bold text-white">Sign in to join this session</h2>
          <p className="text-gray-300 text-sm">
            Sign in with Clerk so everyone can see who is adding songs.
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
    void mutatePlayback((previous: { playback: PlaybackState | null; requester: PlaybackRequester | null } | undefined) => {
      const current = previous?.playback ?? null;
      return {
        playback: updater(current),
        requester: previous?.requester ?? null,
      };
    }, false);
  };

  const upcomingCount = queueState.queue.length + (queueState.nextUp ? 1 : 0);
  const totalVotes = (queueState.nextUp?.voteScore ?? 0) +
    queueState.queue.reduce((sum, item) => sum + item.voteScore, 0);

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
        {autoJoinStatus === 'pending' && participant?.type === 'none' && (
          <div className="mb-6 bg-spotify-gray/40 text-gray-200 px-4 py-3 rounded-lg text-sm">
            Joining session…
          </div>
        )}
        {autoJoinMessage && (
          <div className="mb-6 bg-red-900/40 border border-red-500/60 text-red-100 px-4 py-3 rounded-lg text-sm">
            {autoJoinMessage}
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Queue Section */}
          <div className="lg:col-span-2 space-y-6">
            <NowPlaying
              canControl={participant?.type === 'host'}
              sessionId={session.id}
              playback={playback}
              requester={playbackRequester}
              error={playbackError}
              setError={setPlaybackError}
              onRefresh={refreshPlayback}
              updatePlayback={updatePlayback}
            />
            <NextUp track={queueState.nextUp} />
            <SearchBar
              sessionId={session.id}
              allowExplicit={session.allowExplicit}
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
            <Leaderboard
              sessionId={session.id}
              title="Performance Leaderboard"
              description="Live production stats for everyone in this session. Values refresh automatically when the leaderboard endpoint is wired up."
            />

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
