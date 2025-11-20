import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import useSWRInfinite from 'swr/infinite';
import type { Fetcher } from 'swr';
import { AxiosError } from 'axios';
import { spotifyApi, queueApi } from '../services/api';
import type { CreditState, SpotifyTrack } from '../types';

interface SearchBarProps {
  sessionId: string;
  allowExplicit: boolean;
  onTrackAdded: (result?: { credits?: CreditState }) => void;
  canSearch: boolean;
  onRequireAccess: () => void;
}

const PAGE_SIZE = 50;

type SearchResponse = {
  tracks: SpotifyTrack[];
  bannedTrackIds?: string[];
  bannedArtistIds?: string[];
  meta?: {
    total: number;
    offset: number;
    limit: number;
    nextOffset: number | null;
    hasMore: boolean;
    filteredOutCount?: number;
  };
};

export default function SearchBar({ sessionId, allowExplicit, onTrackAdded, canSearch, onRequireAccess }: SearchBarProps) {
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
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastQueryRef = useRef<string>('');
  const lastSessionRef = useRef<string>(sessionId);

  const searchFetcher: Fetcher<SearchResponse, [string, string, string, string]> = async ([, id, term, rawOffset]) => {
    const offset = Number.parseInt(rawOffset ?? '0', 10) || 0;
    const response = await spotifyApi.search(id, term, { hideRestricted: true, limit: PAGE_SIZE, offset });
    const payload = response.data as any;
    const tracks: SpotifyTrack[] = payload?.tracks ?? payload ?? [];
    const rawMeta = payload?.meta ?? {};
    const trackList = Array.isArray(tracks) ? tracks : [];
    const derivedHasMore = typeof rawMeta.hasMore === 'boolean' ? rawMeta.hasMore : trackList.length === PAGE_SIZE;
    const meta = {
      total: typeof rawMeta.total === 'number' ? rawMeta.total : offset + trackList.length,
      offset: typeof rawMeta.offset === 'number' ? rawMeta.offset : offset,
      limit: typeof rawMeta.limit === 'number' ? rawMeta.limit : PAGE_SIZE,
      nextOffset:
        rawMeta.nextOffset !== undefined && rawMeta.nextOffset !== null
          ? Number(rawMeta.nextOffset)
          : derivedHasMore
          ? offset + PAGE_SIZE
          : null,
      hasMore: derivedHasMore,
      filteredOutCount: typeof rawMeta.filteredOutCount === 'number' ? rawMeta.filteredOutCount : 0,
    };

    return {
      tracks: trackList,
      bannedTrackIds: payload?.bannedTrackIds ?? [],
      bannedArtistIds: payload?.bannedArtistIds ?? [],
      meta,
    };
  };

  const getKey = (
    pageIndex: number,
    previousPageData: SearchResponse | null
  ): [string, string, string, string] | null => {
    if (!canExecuteSearch) {
      return null;
    }

    if (pageIndex === 0) {
      return ['spotify-search', sessionId, debouncedQuery, '0'];
    }

    const nextOffset = previousPageData?.meta?.nextOffset;
    if (nextOffset === null || nextOffset === undefined) {
      return null;
    }

    return ['spotify-search', sessionId, debouncedQuery, String(nextOffset)];
  };

  const {
    data: searchPages,
    error: searchError,
    isValidating,
    size,
    setSize,
  } = useSWRInfinite<SearchResponse, AxiosError>(getKey, searchFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const sessionChanged = lastSessionRef.current !== sessionId;
    if (sessionChanged) {
      lastSessionRef.current = sessionId;
      lastQueryRef.current = '';
    }

    if (!canExecuteSearch) {
      if (size !== 0) {
        void setSize(0);
      }
      lastQueryRef.current = '';
      return;
    }

    if (sessionChanged || lastQueryRef.current !== debouncedQuery) {
      lastQueryRef.current = debouncedQuery;
      void setSize(1);
    }
  }, [canExecuteSearch, debouncedQuery, sessionId, setSize, size]);

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

  const bannedTrackIds = useMemo(() => {
    const set = new Set<string>();
    (searchPages ?? []).forEach((page) => {
      (page?.bannedTrackIds ?? []).forEach((id) => set.add(id));
    });
    return set;
  }, [searchPages]);

  const bannedArtistIds = useMemo(() => {
    const set = new Set<string>();
    (searchPages ?? []).forEach((page) => {
      (page?.bannedArtistIds ?? []).forEach((id) => set.add(id));
    });
    return set;
  }, [searchPages]);

  const aggregatedTracks = useMemo(() => {
    const seen = new Set<string>();
    const merged: SpotifyTrack[] = [];

    (searchPages ?? []).forEach((page) => {
      (page?.tracks ?? []).forEach((track: SpotifyTrack) => {
        if (!track?.id || seen.has(track.id)) {
          return;
        }
        seen.add(track.id);
        merged.push(track);
      });
    });

    return merged;
  }, [searchPages]);

  const filteredResults = useMemo(() => {
    return aggregatedTracks.filter((track: SpotifyTrack) => {
      if (!allowExplicit && track.explicit) {
        return false;
      }

      if (bannedTrackIds.has(track.id)) {
        return false;
      }

      const trackArtistIds = track.artists?.map((artist) => artist.id).filter(Boolean) ?? [];
      return !trackArtistIds.some((artistId) => bannedArtistIds.has(artistId));
    });
  }, [aggregatedTracks, allowExplicit, bannedTrackIds, bannedArtistIds]);

  const initialLoading = isValidating && ((searchPages?.length ?? 0) === 0);
  const isLoadingMore = isValidating && size > (searchPages?.length ?? 0);
  const lastPage = searchPages && searchPages.length > 0 ? searchPages[searchPages.length - 1] : null;
  const hasMore = Boolean(lastPage?.meta?.hasMore);

  useEffect(() => {
    if (!showResults) {
      return;
    }

    const root = resultsContainerRef.current;
    const sentinel = loadMoreRef.current;

    if (!root || !sentinel) {
      return;
    }

    if (!hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingMore) {
          void setSize((previous) => previous + 1);
        }
      },
      { root, rootMargin: '120px 0px 120px 0px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [showResults, hasMore, isLoadingMore, setSize]);

  const handleAddTrack = async (trackId: string) => {
    if (!canSearch) {
      onRequireAccess();
      return;
    }

    try {
      const response = await queueApi.add(sessionId, trackId);
      const credits = response?.data?.credits as CreditState | undefined;
      onTrackAdded(credits ? { credits } : undefined);
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
        <div
          ref={resultsContainerRef}
          className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray rounded-lg shadow-xl max-h-96 overflow-y-auto z-20"
        >
          {initialLoading && (
            <div className="p-3 text-gray-400 text-sm flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Searching…</span>
            </div>
          )}

          {!initialLoading && filteredResults.length === 0 && (
            <div className="p-8 text-center text-gray-400">No results found</div>
          )}

          {filteredResults.length > 0 && (
            <div className="p-2">
              {filteredResults.map((track: SpotifyTrack) => {
                const isExplicit = Boolean(track.explicit);
                const isBanned = bannedTrackIds.has(track.id);
                const isArtistBanned = track.artists.some((artist) => bannedArtistIds.has(artist.id));
                const disabledReason = isBanned
                  ? 'This track has been banned by the host'
                  : isArtistBanned
                  ? 'An artist on this track has been banned by the host'
                  : (!allowExplicit && isExplicit)
                  ? 'Explicit tracks are disabled for this session'
                  : null;
                const disabled = Boolean(disabledReason);
                const coverImage = track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url;

                return (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition ${disabled ? 'opacity-50 cursor-not-allowed bg-transparent' : 'hover:bg-spotify-black cursor-pointer'}`}
                    onClick={() => {
                      if (disabled) {
                        return;
                      }
                      void handleAddTrack(track.id);
                    }}
                    role="button"
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(event) => {
                      if (disabled) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void handleAddTrack(track.id);
                      }
                    }}
                    title={disabled ? disabledReason ?? undefined : undefined}
                  >
                    {coverImage ? (
                      <img
                        src={coverImage}
                        alt={track.name}
                        className="w-12 h-12 rounded"
                      />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-semibold truncate">{track.name}</h4>
                        {isExplicit && (
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${disabled ? 'bg-gray-700 text-gray-300' : 'bg-spotify-green/20 text-spotify-green'}`}>
                            Explicit
                          </span>
                        )}
                        {isBanned && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300">
                            Banned
                          </span>
                        )}
                        {isArtistBanned && !isBanned && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300">
                            Artist banned
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm truncate">
                        {track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                    <span className="text-gray-400 text-sm">{formatDuration(track.duration_ms)}</span>
                    <button
                      type="button"
                      className={`p-2 transition ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-spotify-green hover:text-spotify-hover'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (disabled) {
                          return;
                        }
                        void handleAddTrack(track.id);
                      }}
                      disabled={disabled}
                      aria-label={disabled ? disabledReason ?? 'Track unavailable' : 'Add to queue'}
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {isLoadingMore && (
            <div className="p-3 text-gray-400 text-sm flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Loading more…</span>
            </div>
          )}

          <div ref={loadMoreRef} className="h-2" />
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
