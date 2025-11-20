import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { ListPlus, Loader2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import useSWR, { Fetcher } from 'swr';
import { AxiosError } from 'axios';
import { useApiSWR } from '../hooks/useApiSWR';
import { bannedTracksApi, spotifyApi } from '../services/api';
import type { BannedTrackList, SpotifyArtist, SpotifyTrack } from '../types';

type BannedTracksResponse = {
  lists: BannedTrackList[];
  bannedTrackIds: string[];
  bannedArtistIds: string[];
};

type TrackSearchResponse = {
  tracks: SpotifyTrack[];
  bannedTrackIds?: string[];
  bannedArtistIds?: string[];
};

type ArtistSearchResponse = {
  artists: SpotifyArtist[];
  bannedArtistIds?: string[];
};

type BannedTracksManagerProps = {
  sessionId: string;
};

export default function BannedTracksManager({ sessionId }: BannedTracksManagerProps) {
  const { data, error, mutate } = useApiSWR<BannedTracksResponse>(
    sessionId ? `/sessions/${sessionId}/banned-track-lists` : null,
    { refreshInterval: 60000 }
  );

  const lists = data?.lists ?? [];
  const bannedTrackIds = useMemo(() => new Set(data?.bannedTrackIds ?? []), [data?.bannedTrackIds]);
  const bannedArtistIds = useMemo(() => new Set(data?.bannedArtistIds ?? []), [data?.bannedArtistIds]);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [createListName, setCreateListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [artistSearchTerm, setArtistSearchTerm] = useState('');
  const [debouncedArtistSearchTerm, setDebouncedArtistSearchTerm] = useState('');
  const [showArtistResults, setShowArtistResults] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedListId && lists.length > 0) {
      setSelectedListId(lists[0].id);
    }
  }, [selectedListId, lists]);

  useEffect(() => {
    const trimmed = searchTerm.trim();

    if (!trimmed) {
      setDebouncedSearchTerm('');
      setShowResults(false);
      return;
    }

    setShowResults(true);
    const timer = setTimeout(() => setDebouncedSearchTerm(trimmed), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const trimmed = artistSearchTerm.trim();

    if (!trimmed) {
      setDebouncedArtistSearchTerm('');
      setShowArtistResults(false);
      return;
    }

    setShowArtistResults(true);
    const timer = setTimeout(() => setDebouncedArtistSearchTerm(trimmed), 400);
    return () => clearTimeout(timer);
  }, [artistSearchTerm]);

  const searchFetcher: Fetcher<TrackSearchResponse, [string, string, string]> = async ([, id, term]) => {
    const response = await spotifyApi.search(id, term);
    return {
      tracks: response.data?.tracks ?? response.data ?? [],
      bannedTrackIds: response.data?.bannedTrackIds ?? [],
      bannedArtistIds: response.data?.bannedArtistIds ?? [],
    };
  };

  const artistSearchFetcher: Fetcher<ArtistSearchResponse, [string, string, string]> = async ([, id, term]) => {
    const response = await spotifyApi.searchArtists(id, term);
    return {
      artists: response.data?.artists ?? response.data ?? [],
      bannedArtistIds: response.data?.bannedArtistIds ?? [],
    };
  };

  const {
    data: searchData,
    isValidating: searching,
    error: searchError,
  } = useSWR<TrackSearchResponse, AxiosError>(
    debouncedSearchTerm ? ['banned-track-search', sessionId, debouncedSearchTerm] : null,
    searchFetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const {
    data: artistSearchData,
    isValidating: artistSearching,
    error: artistSearchError,
  } = useSWR<ArtistSearchResponse, AxiosError>(
    debouncedArtistSearchTerm ? ['banned-artist-search', sessionId, debouncedArtistSearchTerm] : null,
    artistSearchFetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  useEffect(() => {
    if (searchError) {
      console.error('Banned tracks search error:', searchError);
      setActionError('Failed to search Spotify. Try again.');
    }
  }, [searchError]);

  useEffect(() => {
    if (artistSearchError) {
      console.error('Banned artists search error:', artistSearchError);
      setActionError('Failed to search artists. Try again.');
    }
  }, [artistSearchError]);

  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  const searchResults = useMemo(() => {
    const tracks = searchData?.tracks ?? [];
    const sessionTrackBans = new Set(searchData?.bannedTrackIds ?? []);
    const sessionArtistBans = new Set(searchData?.bannedArtistIds ?? []);

    return tracks.map((track) => {
      const trackBanned = sessionTrackBans.has(track.id) || bannedTrackIds.has(track.id);
      const artistBanned = track.artists.some((artist) => sessionArtistBans.has(artist.id) || bannedArtistIds.has(artist.id));
      const isBanned = trackBanned || artistBanned;
      const reason = trackBanned ? 'Track banned' : artistBanned ? 'Artist banned' : null;
      return { track, isBanned, reason } as const;
    });
  }, [searchData, bannedTrackIds, bannedArtistIds]);

  const artistSearchResults = useMemo(() => {
    const artists = artistSearchData?.artists ?? [];
    const sessionArtistBans = new Set(artistSearchData?.bannedArtistIds ?? []);

    return artists.map((artist) => ({
      artist,
      isBanned: sessionArtistBans.has(artist.id) || bannedArtistIds.has(artist.id),
    }));
  }, [artistSearchData, bannedArtistIds]);

  const handleCreateList = async (event: FormEvent) => {
    event.preventDefault();

    if (!createListName.trim()) {
      setCreateError('Enter a list name.');
      return;
    }

    try {
      setCreatingList(true);
      setCreateError(null);
      await bannedTracksApi.createList(sessionId, { name: createListName.trim() });
      setCreateListName('');
      await mutate();
    } catch (err: any) {
      console.error('Create banned list error:', err);
      setCreateError(err?.response?.data?.error ?? 'Failed to create list');
    } finally {
      setCreatingList(false);
    }
  };

  const handleAddTrack = async (track: SpotifyTrack) => {
    if (!selectedList) {
      setActionError('Create or select a list before adding tracks.');
      return;
    }

    try {
      setActionError(null);
      await bannedTracksApi.addTrack(sessionId, selectedList.id, {
        spotifyTrackId: track.id,
        trackName: track.name,
        trackArtist: track.artists.map((artist) => artist.name).join(', '),
        trackAlbum: track.album?.name ?? null,
        trackImage: track.album?.images?.[0]?.url ?? null,
      });
      setSearchTerm('');
      setDebouncedSearchTerm('');
      setShowResults(false);
      await mutate();
    } catch (err: any) {
      console.error('Add banned track error:', err);
      setActionError(err?.response?.data?.error ?? 'Failed to add track to ban list');
    }
  };

  const handleAddArtist = async (artist: SpotifyArtist) => {
    if (!selectedList) {
      setActionError('Create or select a list before adding artists.');
      return;
    }

    try {
      setActionError(null);
      const fallbackArtistImage = artist.images && artist.images.length > 0
        ? artist.images[artist.images.length - 1]?.url ?? null
        : null;
      const primaryImage = artist.images?.[0]?.url ?? fallbackArtistImage;
      await bannedTracksApi.addArtist(sessionId, selectedList.id, {
        spotifyArtistId: artist.id,
        artistName: artist.name,
        artistImage: primaryImage,
      });
      setArtistSearchTerm('');
      setDebouncedArtistSearchTerm('');
      setShowArtistResults(false);
      await mutate();
    } catch (err: any) {
      console.error('Add banned artist error:', err);
      setActionError(err?.response?.data?.error ?? 'Failed to add artist to ban list');
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!selectedList) {
      return;
    }

    try {
      await bannedTracksApi.removeTrack(sessionId, selectedList.id, trackId);
      await mutate();
    } catch (err: any) {
      console.error('Remove banned track error:', err);
      setActionError(err?.response?.data?.error ?? 'Failed to remove track from ban list');
    }
  };

  const handleRemoveArtist = async (artistId: string) => {
    if (!selectedList) {
      return;
    }

    try {
      await bannedTracksApi.removeArtist(sessionId, selectedList.id, artistId);
      await mutate();
    } catch (err: any) {
      console.error('Remove banned artist error:', err);
      setActionError(err?.response?.data?.error ?? 'Failed to remove artist from ban list');
    }
  };

  return (
    <div className="bg-spotify-gray p-6 rounded-lg space-y-5">
      <div className="flex items-center gap-3">
        <Lock className="text-spotify-green" />
        <div>
          <h3 className="text-xl font-bold text-white">Banned Tracks & Artists</h3>
          <p className="text-sm text-gray-400">Keep unwanted songs or artists out of any session you host by managing reusable ban lists.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500/60 text-red-100 px-4 py-3 rounded-lg text-sm">
          Failed to load banned track lists.
        </div>
      )}

      {actionError && (
        <div className="bg-yellow-900/40 border border-yellow-500/60 text-yellow-100 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      <form onSubmit={handleCreateList} className="bg-spotify-black/40 border border-spotify-black/20 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ListPlus className="text-gray-300" size={18} />
          <span className="text-sm font-semibold text-gray-200">Create new ban list</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="List name"
            value={createListName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCreateListName(event.target.value)}
            className="flex-1 bg-spotify-black text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
          />
          <button
            type="submit"
            disabled={creatingList}
            className="bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 text-white px-3 py-2 rounded-lg font-semibold flex items-center gap-2"
          >
            {creatingList ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
            <span>{creatingList ? 'Creating…' : 'Add List'}</span>
          </button>
        </div>
        {createError && <p className="text-sm text-red-300">{createError}</p>}
      </form>

      <div className="bg-spotify-black/40 border border-spotify-black/20 rounded-lg p-4 space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-300">Select list</label>
          <select
            value={selectedListId ?? ''}
            onChange={(event) => setSelectedListId(event.target.value || null)}
            className="bg-spotify-black text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
          >
            {lists.length === 0 && <option value="">No lists yet</option>}
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} ({list.tracks.length} tracks, {list.artists.length} artists)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-300">Add tracks to selected list</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
              placeholder="Search Spotify…"
              className="w-full bg-spotify-black text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
              onFocus={() => {
                if (searchTerm.trim()) {
                  setShowResults(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchTerm('');
                  setDebouncedSearchTerm('');
                  setShowResults(false);
                }
              }}
            />

            {showResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray/95 border border-spotify-black/30 rounded-lg shadow-xl max-h-80 overflow-y-auto z-30">
                {searching && (
                  <div className="p-3 text-gray-400 text-sm flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Searching…</span>
                  </div>
                )}
                {!searching && searchResults.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">No results found.</div>
                ) : (
                  searchResults.map(({ track, isBanned, reason }) => {
                    const alreadyBanned = isBanned;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => {
                          if (!alreadyBanned) {
                            void handleAddTrack(track);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${alreadyBanned ? 'opacity-50 cursor-not-allowed' : 'hover:bg-spotify-black/60 cursor-pointer'}`}
                      >
                        {track.album?.images?.[2]?.url && (
                          <img
                            src={track.album.images[2].url}
                            alt={track.name}
                            className="w-10 h-10 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{track.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {track.artists.map((artist) => artist.name).join(', ')}
                          </p>
                        </div>
                        {alreadyBanned ? (
                          <span className="text-xs text-gray-400">{reason ?? 'Already banned'}</span>
                        ) : (
                          <Plus className="text-spotify-green shrink-0" size={18} />
                        )}
                      </button>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={() => setShowResults(false)}
                  className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white border-t border-spotify-black/30"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-300">Add artists to selected list</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={artistSearchTerm}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setArtistSearchTerm(event.target.value)}
              placeholder="Search Spotify artists…"
              className="w-full bg-spotify-black text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
              onFocus={() => {
                if (artistSearchTerm.trim()) {
                  setShowArtistResults(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setArtistSearchTerm('');
                  setDebouncedArtistSearchTerm('');
                  setShowArtistResults(false);
                }
              }}
            />

            {showArtistResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray/95 border border-spotify-black/30 rounded-lg shadow-xl max-h-80 overflow-y-auto z-30">
                {artistSearching && (
                  <div className="p-3 text-gray-400 text-sm flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Searching…</span>
                  </div>
                )}
                {!artistSearching && artistSearchResults.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">No artists found.</div>
                ) : (
                  artistSearchResults.map(({ artist, isBanned }) => {
                    const fallbackArtistImage = artist.images && artist.images.length > 0
                      ? artist.images[artist.images.length - 1]?.url ?? null
                      : null;
                    const artistImage = artist.images?.[2]?.url ?? fallbackArtistImage;
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => {
                          if (!isBanned) {
                            void handleAddArtist(artist);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${isBanned ? 'opacity-50 cursor-not-allowed' : 'hover:bg-spotify-black/60 cursor-pointer'}`}
                      >
                        {artistImage && (
                          <img
                            src={artistImage}
                            alt={artist.name}
                            className="w-10 h-10 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{artist.name}</p>
                        </div>
                        {isBanned ? (
                          <span className="text-xs text-gray-400">Already banned</span>
                        ) : (
                          <Plus className="text-spotify-green shrink-0" size={18} />
                        )}
                      </button>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={() => setShowArtistResults(false)}
                  className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white border-t border-spotify-black/30"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-white">Banned tracks</h4>
          {selectedList && (
            <span className="text-xs text-gray-400">{selectedList.tracks.length} tracks</span>
          )}
        </div>
        {selectedList && selectedList.tracks.length === 0 && (
          <p className="text-sm text-gray-400">No tracks banned yet. Add songs using the search above.</p>
        )}
        {selectedList && selectedList.tracks.length > 0 && (
          <div className="max-h-64 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {selectedList.tracks.map((track) => (
                <li
                  key={track.id}
                  className="bg-spotify-black/40 border border-spotify-black/20 rounded-lg px-4 py-3 flex items-center gap-3"
                >
                  {track.trackImage && (
                    <img src={track.trackImage} alt={track.trackName} className="w-10 h-10 rounded hidden sm:block" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{track.trackName}</p>
                    <p className="text-xs text-gray-400 truncate">{track.trackArtist}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveTrack(track.id)}
                    className="text-red-400 hover:text-red-300 transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-white">Banned artists</h4>
          {selectedList && (
            <span className="text-xs text-gray-400">{selectedList.artists.length} artists</span>
          )}
        </div>
        {selectedList && selectedList.artists.length === 0 && (
          <p className="text-sm text-gray-400">No artists banned yet. Add artists using the search above.</p>
        )}
        {selectedList && selectedList.artists.length > 0 && (
          <div className="max-h-64 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {selectedList.artists.map((artist) => (
                <li
                  key={artist.id}
                  className="bg-spotify-black/40 border border-spotify-black/20 rounded-lg px-4 py-3 flex items-center gap-3"
                >
                  {artist.artistImage && (
                    <img src={artist.artistImage} alt={artist.artistName} className="w-10 h-10 rounded hidden sm:block" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{artist.artistName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveArtist(artist.id)}
                    className="text-red-400 hover:text-red-300 transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
