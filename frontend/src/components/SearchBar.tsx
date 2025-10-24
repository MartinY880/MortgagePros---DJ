import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { spotifyApi, queueApi } from '../services/api';
import { SpotifyTrack } from '../types';

interface SearchBarProps {
  sessionId: string;
  onTrackAdded: () => void;
  canSearch: boolean;
  onRequireAccess: () => void;
}

export default function SearchBar({ sessionId, onTrackAdded, canSearch, onRequireAccess }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    if (!canSearch) {
      onRequireAccess();
      return;
    }

    setSearching(true);
    try {
      const response = await spotifyApi.search(sessionId, query);
      setResults(response.data.tracks || []);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      const status = (error as any)?.response?.status;
      if (status === 401 || status === 403) {
        onRequireAccess();
      }
    } finally {
      setSearching(false);
    }
  };

  const handleAddTrack = async (trackId: string) => {
    if (!canSearch) {
      onRequireAccess();
      return;
    }

    try {
      await queueApi.add(sessionId, trackId);
      onTrackAdded();
      setShowResults(false);
      setQuery('');
      setResults([]);
    } catch (error: any) {
      console.error('Add track error:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        onRequireAccess();
        return;
      }
      alert(error.response?.data?.error || 'Failed to add track');
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative">
      <div className="bg-spotify-gray p-4 rounded-lg">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search for songs..."
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-spotify-black text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching || !canSearch}
            className="bg-spotify-green hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 rounded-lg transition font-semibold"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray rounded-lg shadow-xl max-h-96 overflow-y-auto z-20">
          {results.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No results found
            </div>
          ) : (
            <div className="p-2">
              {results.map((track: SpotifyTrack) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-3 hover:bg-spotify-black rounded-lg transition cursor-pointer"
                  onClick={() => handleAddTrack(track.id)}
                >
                  {track.album.images[2] && (
                    <img
                      src={track.album.images[2].url}
                      alt={track.name}
                      className="w-12 h-12 rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold truncate">{track.name}</h4>
                    <p className="text-gray-400 text-sm truncate">
                      {track.artists.map((a) => a.name).join(', ')}
                    </p>
                  </div>
                  <span className="text-gray-400 text-sm">{formatDuration(track.duration_ms)}</span>
                  <button className="text-spotify-green hover:text-green-400 transition p-2">
                    <Plus size={24} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowResults(false)}
            className="w-full p-3 text-gray-400 hover:text-white transition border-t border-spotify-black"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
