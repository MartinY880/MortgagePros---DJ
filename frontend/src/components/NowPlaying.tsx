import { Dispatch, SetStateAction } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { spotifyApi } from '../services/api';
import { PlaybackRequester, PlaybackState } from '../types';

interface NowPlayingProps {
  canControl?: boolean;
  sessionId?: string;
  playback: PlaybackState | null;
  requester?: PlaybackRequester | null;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  onRefresh: () => Promise<void>;
  updatePlayback: (updater: (current: PlaybackState | null) => PlaybackState | null) => void;
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
}: NowPlayingProps) {
  const isPlaying = playback?.is_playing ?? false;

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
      </div>
    </div>
  );
}
