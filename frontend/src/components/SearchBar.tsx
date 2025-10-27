import { ChangeEvent, useEffect, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import useSWR, { Fetcher } from 'swr';
import { AxiosError } from 'axios';
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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const canExecuteSearch = canSearch && debouncedQuery.length > 0;

  useEffect(() => {
    const term = query.trim();

    if (!term) {
      setDebouncedQuery('');
      setShowResults(false);
      return;
    }

    if (!canSearch) {
      onRequireAccess();
      setShowResults(false);
      setDebouncedQuery('');
      return;
    }

    setShowResults(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(term);
    }, 500);

    return () => clearTimeout(timer);
  }, [query, canSearch, onRequireAccess]);

  const searchFetcher: Fetcher<SpotifyTrack[], [string, string, string]> = async ([, id, term]) => {
    const response = await spotifyApi.search(id, term);
    return response.data.tracks || [];
  };

  const {
    data: searchData,
    error: searchError,
    isValidating,
  } = useSWR<SpotifyTrack[], AxiosError>(
    canExecuteSearch ? ['spotify-search', sessionId, debouncedQuery] : null,
    searchFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  useEffect(() => {
    if (!searchError) {
      return;
    }

    console.error('Search error:', searchError);
    const status = searchError.response?.status;
    if (status === 401 || status === 403) {
      onRequireAccess();
    }
  }, [searchError, onRequireAccess]);

  const results = searchData ?? [];
  const searching = isValidating;

  const handleAddTrack = async (trackId: string) => {
    if (!canSearch) {
      onRequireAccess();
      return;
    }

    try {
      await queueApi.add(sessionId, trackId);
      void onTrackAdded();
      setShowResults(false);
      setQuery('');
      setDebouncedQuery('');
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
              className="w-full bg-spotify-black text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
            />
          </div>
        </div>
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray rounded-lg shadow-xl max-h-96 overflow-y-auto z-20">
          {searching && (
            <div className="p-3 text-gray-400 text-sm">Searching…</div>
          )}
          {!searching && results.length === 0 ? (
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
                  <button className="text-spotify-green hover:text-spotify-hover transition p-2">
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
