import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { spotifyApi } from '../services/api';

interface NowPlayingProps {
  sessionId: string;
}

export default function NowPlaying({ sessionId: _sessionId }: NowPlayingProps) {
  const [playback, setPlayback] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    fetchPlayback();
    const interval = setInterval(fetchPlayback, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchPlayback = async () => {
    try {
      const response = await spotifyApi.getPlayback();
      setPlayback(response.data.playback);
      setIsPlaying(response.data.playback?.is_playing || false);
    } catch (error) {
      // Silently handle - user might not have active playback
    }
  };

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await spotifyApi.pause();
      } else {
        await spotifyApi.play();
      }
      setIsPlaying(!isPlaying);
    } catch (error) {
      console.error('Playback control error:', error);
      alert('Failed to control playback. Make sure Spotify is open on a device.');
    }
  };

  const handleNext = async () => {
    try {
      await spotifyApi.next();
      setTimeout(fetchPlayback, 1000);
    } catch (error) {
      console.error('Skip error:', error);
    }
  };

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
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className="bg-spotify-green hover:bg-green-500 text-white p-4 rounded-full transition transform hover:scale-105"
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
      </div>
    </div>
  );
}
