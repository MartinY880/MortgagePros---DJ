import { useState, useEffect } from 'react';
import { spotifyApi } from '../services/api';
import { Music, Play } from 'lucide-react';

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: { url: string }[];
  tracks: { total: number };
  uri: string;
  owner: { display_name: string };
}

interface PlaylistSelectorProps {
  onPlaylistStarted?: () => void;
}

export default function PlaylistSelector({ onPlaylistStarted }: PlaylistSelectorProps) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await spotifyApi.getPlaylists();
      setPlaylists(response.data.playlists || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPlaylist = async (playlistUri: string, playlistId: string) => {
    setStarting(playlistId);
    setError(null);
    try {
      await spotifyApi.startPlaylist(playlistUri);
      if (onPlaylistStarted) {
        onPlaylistStarted();
      }
      // Auto-collapse after starting
      setTimeout(() => setExpanded(false), 1000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to start playlist');
    } finally {
      setStarting(null);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full bg-spotify-gray hover:bg-gray-700 text-white p-4 rounded-lg flex items-center justify-center gap-2 transition"
      >
        <Music size={20} />
        <span>Start Background Playlist</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="bg-spotify-gray rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Your Playlists</h3>
          <button
            onClick={() => setExpanded(false)}
            className="text-gray-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-spotify-green"></div>
          <span className="text-gray-300 text-sm">Loading playlists...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-spotify-gray rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Start Background Playlist</h3>
        <button
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-white text-sm"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="mb-3 bg-red-600/20 border border-red-500 rounded p-2 text-red-200 text-xs">
          {error}
        </div>
      )}

      {playlists.length === 0 ? (
        <div className="text-gray-400 text-sm">
          No playlists found. Create some playlists in Spotify first!
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => handleStartPlaylist(playlist.uri, playlist.id)}
              disabled={starting === playlist.id}
              className="w-full text-left p-3 rounded-lg bg-spotify-black hover:bg-gray-800 transition border border-transparent hover:border-spotify-green/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                {playlist.images[0] ? (
                  <img
                    src={playlist.images[0].url}
                    alt={playlist.name}
                    className="w-12 h-12 rounded"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center">
                    <Music size={24} className="text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
                  <p className="text-gray-400 text-xs">
                    {playlist.tracks.total} tracks · {playlist.owner.display_name}
                  </p>
                </div>
                {starting === playlist.id ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-spotify-green"></div>
                ) : (
                  <Play size={18} className="text-spotify-green" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="text-gray-500 text-xs mt-3">
        This will play in the background on your selected output device. Guests can still queue tracks.
      </p>
    </div>
  );
}
