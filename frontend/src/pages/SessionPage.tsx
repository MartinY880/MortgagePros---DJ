import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Share2, Settings } from 'lucide-react';
import { guestApi, sessionApi, spotifyApi } from '../services/api';
import { socketService } from '../services/socket';
import type { Session, SessionParticipant, QueueState, PlaybackState, PlaybackRequester, SkipState, CreditState } from '../types';
import QueueList from '../components/QueueList';
import SearchBar from '../components/SearchBar';
import NowPlaying from '../components/NowPlaying';
import NextUp from '../components/NextUp';
import Leaderboard from '../components/Leaderboard';
import PlaylistSelector from '../components/PlaylistSelector';
import ScheduledPlaybackManager from '../components/ScheduledPlaybackManager';
import BannedTracksManager from '../components/BannedTracksManager';
import { useApiSWR } from '../hooks/useApiSWR';
import { useClerk, useUser } from '@clerk/clerk-react';

const GUEST_TRACK_COST = 10;
const SKIP_VOTE_COST = 5;

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [sessionInactiveError, setSessionInactiveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [autoJoinStatus, setAutoJoinStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [autoJoinMessage, setAutoJoinMessage] = useState<string | null>(null);
  const [signInPrompted, setSignInPrompted] = useState(false);
  const [guestCredits, setGuestCredits] = useState<CreditState | null>(null);
  const [showScheduled, setShowScheduled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showBanned, setShowBanned] = useState(true);
  const [settingsAllowExplicit, setSettingsAllowExplicit] = useState(true);
  const [settingsMaxSongDuration, setSettingsMaxSongDuration] = useState<number | ''>('');
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
  } = useApiSWR<{ playback: PlaybackState | null; requester: PlaybackRequester | null; skip: SkipState | null }>(
    isSignedIn && sessionId ? `/spotify/playback?sessionId=${sessionId}` : null,
    { shouldRetryOnError: false }
  );
  const playback = playbackData?.playback ?? null;
  const playbackRequester = playbackData?.requester ?? null;
  const skipState = playbackData?.skip ?? null;

  const {
    data: participantData,
    error: participantError,
    mutate: mutateParticipant,
  } = useApiSWR<{ participant: SessionParticipant }>(
    isSignedIn && sessionId ? `/sessions/${sessionId}/participant` : null,
    { revalidateOnFocus: false }
  );
  const participant: SessionParticipant | null = participantData?.participant ?? (participantError ? { type: 'none' } : null);

  useEffect(() => {
    if (session) {
      setSettingsAllowExplicit(session.allowExplicit);
      setSettingsMaxSongDuration(session.maxSongDuration ?? '');
    }
  }, [session]);

  useEffect(() => {
    if (participant?.type === 'guest') {
      setGuestCredits(participant.credits ?? null);
    } else {
      setGuestCredits(null);
    }
  }, [participant]);

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
      
      if (message.includes('no longer active')) {
        setSessionInactiveError(message);
        setAutoJoinStatus('idle');
      } else {
        setAutoJoinMessage(message);
        setAutoJoinStatus('error');
      }
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
      const errorMessage = sessionError?.response?.data?.error;
      if (errorMessage && errorMessage.includes('no longer active')) {
        setSessionInactiveError(errorMessage);
      } else {
        navigate('/dashboard');
      }
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
        skip: data.skip ?? null,
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

  const handleUpdateSettings = async () => {
    if (!session) return;

    try {
      await sessionApi.updateSettings(session.id, {
        allowExplicit: settingsAllowExplicit,
        ...(settingsMaxSongDuration !== '' && settingsMaxSongDuration > 0 
          ? { maxSongDuration: Number(settingsMaxSongDuration) } 
          : {}),
      });
      
      // Refresh session data
      const response = await sessionApi.getById(session.id);
      if (response.data?.session) {
        // Update local state
        void mutateQueue();
        setShowSettings(false);
        alert('Settings updated successfully');
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      alert('Failed to update settings');
    }
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

  const handleGuestSkip = async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await spotifyApi.next(sessionId);
      const payload = response?.data ?? {};
      const updatedSkip = (payload.skip as SkipState | null | undefined) ?? null;
      const updatedCredits = payload.credits as CreditState | undefined;

      if (updatedCredits) {
        setGuestCredits(updatedCredits);
      }

      if (updatedSkip) {
        void mutatePlayback((previous: { playback: PlaybackState | null; requester: PlaybackRequester | null; skip: SkipState | null } | undefined) => {
          const baseline = previous ?? {
            playback: playback ?? null,
            requester: playbackRequester ?? null,
            skip: null,
          };

          return {
            playback: baseline.playback ?? playback ?? null,
            requester: baseline.requester ?? playbackRequester ?? null,
            skip: updatedSkip,
          };
        }, false);
      }

      setPlaybackError(null);

      setTimeout(() => {
        void mutatePlayback();
      }, 750);
    } catch (error: any) {
      console.error('Guest skip error:', error);
      const status = error?.response?.status;
      const payload = error?.response?.data ?? {};
      const message = payload?.error ?? 'Failed to submit skip vote';

      const payloadCredits = payload?.credits as CreditState | undefined;
      if (payloadCredits) {
        setGuestCredits(payloadCredits);
      }

      const payloadSkip = payload?.skip as SkipState | undefined;
      if (payloadSkip) {
        void mutatePlayback((previous: { playback: PlaybackState | null; requester: PlaybackRequester | null; skip: SkipState | null } | undefined) => {
          const baseline = previous ?? {
            playback: playback ?? null,
            requester: playbackRequester ?? null,
            skip: null,
          };

          return {
            playback: baseline.playback ?? playback ?? null,
            requester: baseline.requester ?? playbackRequester ?? null,
            skip: payloadSkip,
          };
        }, false);
      }

      if (status === 404 && typeof message === 'string' && message.includes('no longer active')) {
        setSessionInactiveError(message);
        return;
      }

      if (status === 403 && typeof message === 'string' && message.toLowerCase().includes('credit')) {
        alert(message);
        return;
      }

      if (status === 409) {
        alert(message);
        return;
      }

      if (status === 401 || status === 403) {
        await handleRequireAccess();
        return;
      }

      setPlaybackError(message);
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

  const syncQueueAndCredits = (result?: { credits?: CreditState }) => {
    if (result?.credits) {
      setGuestCredits(result.credits);
    }
    void refreshQueue();
    void mutateParticipant();
  };

  const handleTrackAdded = (result?: { credits?: CreditState }) => {
    syncQueueAndCredits(result);
  };

  const handleQueueUpdate = (result?: { credits?: CreditState }) => {
    syncQueueAndCredits(result);
  };

  const formatRefreshDate = (dateStr: string | undefined) => {
    if (!dateStr) {
      return 'Credits refresh daily';
    }

    const parts = dateStr.split('-');
    if (parts.length !== 3) {
      return 'Credits refresh daily';
    }

    const [year, month, day] = parts.map(Number);
    if (!year || !month || !day) {
      return 'Credits refresh daily';
    }

    const localDate = new Date(year, month - 1, day);
    return `Credits refreshed ${localDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  };

  const hasInsufficientCredits = guestCredits !== null && guestCredits.currentCredits < GUEST_TRACK_COST;

  const updatePlayback = (updater: (current: PlaybackState | null) => PlaybackState | null) => {
    void mutatePlayback((previous: { playback: PlaybackState | null; requester: PlaybackRequester | null; skip: SkipState | null } | undefined) => {
      const current = previous?.playback ?? null;
      return {
        playback: updater(current),
        requester: previous?.requester ?? null,
        skip: previous?.skip ?? null,
      };
    }, false);
  };

  const upcomingCount = queueState.queue.length + (queueState.nextUp ? 1 : 0);
  const totalVotes = (queueState.nextUp?.voteScore ?? 0) +
    queueState.queue.reduce((sum, item) => sum + item.voteScore, 0);
  const isHost = participant?.type === 'host';

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
        {sessionInactiveError && (
          <div className="mb-6 bg-yellow-900/40 border border-yellow-500/60 text-yellow-100 px-4 py-3 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Session No Longer Active</h3>
                <p className="text-sm">{sessionInactiveError}</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-3 bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Web Player - only for hosts */}
        {isHost && (
          <div className="mb-8">
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-spotify-gray to-spotify-gray/80 rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                  <button
                    onClick={() => setShowScheduled(!showScheduled)}
                    className="w-full flex items-center justify-between p-5 hover:bg-spotify-black/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-bold text-white">Scheduled Sets</h3>
                        <p className="text-xs text-gray-400">Queue tracks at specific times</p>
                      </div>
                    </div>
                    <div className={`transform transition-transform duration-200 ${showScheduled ? 'rotate-180' : ''}`}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-gray-400">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>
                  {showScheduled && (
                    <div className="px-5 pb-5">
                      <ScheduledPlaybackManager sessionId={session.id} canManage />
                    </div>
                  )}
                </div>
                
                {/* Session Settings */}
                <div className="bg-gradient-to-br from-spotify-gray to-spotify-gray/80 rounded-xl shadow-lg border border-gray-800 overflow-hidden mb-6">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-full flex items-center justify-between p-5 hover:bg-spotify-black/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-spotify-green/20 rounded-lg">
                        <Settings size={24} className="text-spotify-green" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-bold text-white">Session Settings</h3>
                        <p className="text-xs text-gray-400">Configure session preferences</p>
                      </div>
                    </div>
                    <div className={`transform transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-gray-400">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>

                  {showSettings && (
                    <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-200">
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-4" />
                      
                      <label className="flex items-center justify-between bg-spotify-black/50 px-5 py-4 rounded-lg border border-gray-800 hover:border-spotify-green/30 transition-colors cursor-pointer group">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">🔞</span>
                            <p className="text-white font-semibold">Allow explicit songs</p>
                          </div>
                          <p className="text-gray-400 text-xs">Guests can queue explicit tracks when enabled</p>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={settingsAllowExplicit}
                            onChange={(e) => setSettingsAllowExplicit(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-spotify-green rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-spotify-green"></div>
                        </div>
                      </label>

                      <label className="bg-spotify-black/50 px-5 py-4 rounded-lg border border-gray-800 hover:border-spotify-green/30 transition-colors block group">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">⏱️</span>
                          <div>
                            <p className="text-white font-semibold">Max song length</p>
                            <p className="text-gray-400 text-xs">
                              Current: {session.maxSongDuration ? (
                                <span className="text-spotify-green font-medium">{session.maxSongDuration} min</span>
                              ) : (
                                <span className="text-yellow-400 font-medium">No limit</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            placeholder="No limit"
                            value={settingsMaxSongDuration}
                            onChange={(e) => setSettingsMaxSongDuration(e.target.value === '' ? '' : Number(e.target.value))}
                            className="flex-1 bg-spotify-gray text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green border border-gray-700 placeholder-gray-500"
                          />
                          <span className="text-gray-400 text-sm font-medium">minutes</span>
                        </div>
                      </label>

                      <button
                        onClick={handleUpdateSettings}
                        className="w-full bg-gradient-to-r from-spotify-green to-green-500 hover:from-spotify-hover hover:to-green-600 text-white font-bold py-3.5 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-spotify-green/20"
                      >
                        💾 Save Settings
                      </button>
                    </div>
                  )}
                </div>

              <div className="bg-gradient-to-br from-spotify-gray to-spotify-gray/80 rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                <button
                  onClick={() => setShowBanned(!showBanned)}
                  className="w-full flex items-center justify-between p-5 hover:bg-spotify-black/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-lg">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                      </svg>
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-bold text-white">Banned Tracks & Artists</h3>
                      <p className="text-xs text-gray-400">Manage blocked content</p>
                    </div>
                  </div>
                  <div className={`transform transition-transform duration-200 ${showBanned ? 'rotate-180' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-gray-400">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>
                {showBanned && (
                  <div className="px-5 pb-5">
                    <BannedTracksManager sessionId={session.id} />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <PlaylistSelector 
                onPlaylistStarted={() => {
                  console.log('Playlist started');
                  // Refresh playback state
                  void mutatePlayback();
                }}
              />
            </div>
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
              participantType={participant?.type ?? 'none'}
              skipState={skipState}
              guestCredits={guestCredits}
              skipCost={SKIP_VOTE_COST}
              onGuestSkip={participant?.type === 'guest' ? handleGuestSkip : undefined}
            />
            <NextUp track={queueState.nextUp} />
            {participant?.type === 'guest' && (
              <div className="bg-spotify-gray p-4 rounded-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-white font-semibold">Your Credits</p>
                  <p className="text-gray-400 text-xs">Each track costs {GUEST_TRACK_COST} credits · Votes and skips cost {SKIP_VOTE_COST} credits</p>
                </div>
                <div className="text-right">
                  <p className={`${hasInsufficientCredits ? 'text-red-400' : 'text-spotify-green'} text-2xl font-bold`}>
                    {guestCredits ? guestCredits.currentCredits : '—'}
                    <span className="text-gray-400 text-base"> / {guestCredits ? guestCredits.totalCredits : '—'}</span>
                  </p>
                  <p className="text-gray-500 text-xs">{formatRefreshDate(guestCredits?.refreshDate)}</p>
                  {hasInsufficientCredits && (
                    <p className="text-red-400 text-xs mt-1">You&apos;re out of credits until the next refresh or a host tops you up.</p>
                  )}
                </div>
              </div>
            )}
            <SearchBar
              sessionId={session.id}
              allowExplicit={session.allowExplicit}
              onTrackAdded={handleTrackAdded}
              canSearch={participant?.type === 'host' || participant?.type === 'guest'}
              onRequireAccess={handleRequireAccess}
              onSessionError={setSessionInactiveError}
            />
            <QueueList
              nextUp={queueState.nextUp}
              queue={queueState.queue}
              sessionId={session.id}
              sessionHostId={session.host.id}
              onQueueUpdate={handleQueueUpdate}
              participant={participant}
              onRequireAccess={handleRequireAccess}
              onSessionError={setSessionInactiveError}
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
