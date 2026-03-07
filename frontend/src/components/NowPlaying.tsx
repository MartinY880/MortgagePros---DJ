import { Dispatch, SetStateAction, useState } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { spotifyApi } from '../services/api';
import { PlaybackRequester, PlaybackState, SkipState, CreditState } from '../types';

const DEFAULT_SKIP_THRESHOLD = 3;

interface NowPlayingProps {
  canControl?: boolean;
  sessionId?: string;
  playback: PlaybackState | null;
  requester?: PlaybackRequester | null;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  onRefresh: () => Promise<void>;
  updatePlayback: (updater: (current: PlaybackState | null) => PlaybackState | null) => void;
  participantType: 'host' | 'guest' | 'none';
  skipState: SkipState | null;
  guestCredits?: CreditState | null;
  skipCost: number;
  onGuestSkip?: () => Promise<void>;
}

export default function NowPlaying({
  canControl = false,
  sessionId,
  playback,
  requester = null,
  error,
  setError,
  onRefresh,
  updatePlayback,
  participantType,
  skipState,
  guestCredits,
  skipCost,
  onGuestSkip,
}: NowPlayingProps) {
  const [guestSkipPending, setGuestSkipPending] = useState(false);
  const isPlaying = playback?.is_playing ?? false;
  const showGuestSkip = participantType === 'guest' && typeof onGuestSkip === 'function';
  const hasTrack = Boolean(playback?.item);
  const skipCount = skipState?.skipCount ?? 0;
  const skipThreshold = skipState?.threshold ?? DEFAULT_SKIP_THRESHOLD;
  const skipTriggered = Boolean(skipState?.triggered);
  const guestBalance = guestCredits?.currentCredits ?? null;
  const guestHasCredits = guestBalance === null || guestBalance >= skipCost;
  const canGuestSkip = showGuestSkip && hasTrack && skipThreshold > 0;
  const guestSkipDisabled = !canGuestSkip || !guestHasCredits || guestSkipPending;
  const skipProgress = skipThreshold > 0 ? `${Math.min(skipCount, skipThreshold)} / ${skipThreshold}` : `${skipCount}`;

  const handlePlayPause = async () => {
    if (!canControl) return;

    try {
      if (isPlaying) {
        await spotifyApi.pause();
        updatePlayback((current) => (current ? { ...current, is_playing: false } : current));
      } else {
        await spotifyApi.play();
        updatePlayback((current) => (current ? { ...current, is_playing: true } : current));
      }
      setError(null);
      setTimeout(() => {
        void onRefresh();
      }, 1000);
    } catch (error) {
      console.error('Playback control error:', error);
      setError('Failed to control playback. Make sure Spotify is open on a device.');
    }
  };

  const handleNext = async () => {
    if (!canControl || !sessionId) return;

    try {
      await spotifyApi.next(sessionId);
      setTimeout(() => {
        void onRefresh();
      }, 1000);
    } catch (error) {
      console.error('Skip error:', error);
      setError('Failed to skip track. Ensure Spotify is active on a device.');
    }
  };

  const handleGuestSkipClick = async () => {
    if (!onGuestSkip || guestSkipDisabled) {
      return;
    }

    setGuestSkipPending(true);

    try {
      await onGuestSkip();
      setError(null);
    } catch (skipError) {
      console.error('Guest skip handler error:', skipError);
      setError('Unable to submit skip vote right now.');
    } finally {
      setGuestSkipPending(false);
    }
  };

  if (error) {
    return (
      <div className="bg-th-surface p-6 rounded-lg text-center">
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  if (!playback?.item) {
    return (
      <div className="bg-th-surface p-6 rounded-lg text-center">
        <p className="text-muted">No track currently playing</p>
        <p className="text-faint text-sm mt-2">
          Open Spotify on your device to start playback
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-th-surface to-th-elevated p-6 rounded-lg">
      <h2 className="text-sm text-muted uppercase mb-4">Now Playing</h2>
      
      <div className="flex items-center gap-4">
        {playback.item.album?.images?.[0] && (
          <img
            src={playback.item.album.images[0].url}
            alt={playback.item.name}
            className="w-24 h-24 rounded-lg shadow-lg"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-2xl font-bold text-primary truncate">{playback.item.name}</h3>
          <p className="text-lg text-secondary truncate">
            {playback.item.artists?.map((a: any) => a.name).join(', ')}
          </p>
          <p className="text-sm text-muted">{playback.item.album?.name}</p>
          {requester?.name && (
            <p className="text-xs text-faint mt-1">
              Requested by {requester.name}
              {requester.type === 'guest' ? ' (guest)' : requester.type === 'host' ? ' (host)' : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          {canControl && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPause}
                className="bg-th-brand hover:bg-th-brand-hover text-primary p-4 rounded-full transition transform hover:scale-105"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              
              <button
                onClick={handleNext}
                className="bg-th-surface hover:bg-th-hover text-primary p-4 rounded-full transition"
              >
                <SkipForward size={24} />
              </button>
            </div>
          )}

          {showGuestSkip && (
            <button
              onClick={handleGuestSkipClick}
              disabled={guestSkipDisabled}
              className={`p-3 rounded-lg text-sm font-semibold transition w-full sm:w-auto text-center ${
                guestSkipDisabled
                  ? 'bg-th-toggle text-muted cursor-not-allowed'
                  : 'bg-th-surface hover:bg-th-hover text-primary'
              }`}
            >
              {guestSkipPending ? 'Submitting…' : `Vote to Skip (-${skipCost} credits)`}
            </button>
          )}
        </div>
      </div>

      {(skipState || showGuestSkip) && (
        <div className="mt-4 bg-th-elevated/40 rounded-lg p-3 text-sm text-secondary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="text-primary font-semibold">Skip votes:</span> {skipProgress}
              {skipTriggered ? ' · Skip triggered' : ''}
            </span>
            {showGuestSkip && !guestHasCredits && (
              <span className="text-th-error text-xs">Need {skipCost} credits to vote</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
