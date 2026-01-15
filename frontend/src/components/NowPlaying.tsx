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
      <div className="bg-spotify-gray p-6 rounded-lg text-center">
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  if (!playback?.item) {
    return (
      <div className="bg-spotify-gray p-6 rounded-lg text-center">
        <p className="text-gray-400">No track currently playing</p>
        <p className="text-gray-500 text-sm mt-2">
          Open Spotify on your device to start playback
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-spotify-gray to-spotify-black p-6 rounded-lg">
      <h2 className="text-sm text-gray-400 uppercase mb-4">Now Playing</h2>
      
      <div className="flex items-center gap-4">
        {playback.item.album?.images?.[0] && (
          <img
            src={playback.item.album.images[0].url}
            alt={playback.item.name}
            className="w-24 h-24 rounded-lg shadow-lg"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-2xl font-bold text-white truncate">{playback.item.name}</h3>
          <p className="text-lg text-gray-300 truncate">
            {playback.item.artists?.map((a: any) => a.name).join(', ')}
          </p>
          <p className="text-sm text-gray-400">{playback.item.album?.name}</p>
          {requester?.name && (
            <p className="text-xs text-gray-500 mt-1">
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
                className="bg-spotify-green hover:bg-spotify-hover text-white p-4 rounded-full transition transform hover:scale-105"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              
              <button
                onClick={handleNext}
                className="bg-spotify-gray hover:bg-gray-600 text-white p-4 rounded-full transition"
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
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-spotify-gray hover:bg-gray-600 text-white'
              }`}
            >
              {guestSkipPending ? 'Submitting…' : `Vote to Skip (-${skipCost} credits)`}
            </button>
          )}
        </div>
      </div>

      {(skipState || showGuestSkip) && (
        <div className="mt-4 bg-spotify-black/40 rounded-lg p-3 text-sm text-gray-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="text-white font-semibold">Skip votes:</span> {skipProgress}
              {skipTriggered ? ' · Skip triggered' : ''}
            </span>
            {showGuestSkip && !guestHasCredits && (
              <span className="text-red-400 text-xs">Need {skipCost} credits to vote</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
