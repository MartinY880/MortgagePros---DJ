import { ChangeEvent, useEffect, useState } from 'react';
import { Search, Plus, Clock, XCircle, Loader2, Calendar } from 'lucide-react';
import useSWR, { Fetcher } from 'swr';
import { AxiosError } from 'axios';
import { useApiSWR } from '../hooks/useApiSWR';
import { scheduledPlaybackApi, spotifyApi } from '../services/api';
import type { ScheduledPlayback, SpotifyTrack } from '../types';

const MAX_TRACKS = 10;

type ScheduledPlaybackResponse = {
  upcoming: ScheduledPlayback[];
  history: ScheduledPlayback[];
};

type ScheduledPlaybackManagerProps = {
  sessionId: string;
  canManage: boolean;
};

export default function ScheduledPlaybackManager({ sessionId, canManage }: ScheduledPlaybackManagerProps) {
  const { data, error, isLoading, mutate } = useApiSWR<ScheduledPlaybackResponse>(
    sessionId ? `/sessions/${sessionId}/scheduled-playback` : null,
    {
      refreshInterval: 30000,
    }
  );

  const [scheduledTime, setScheduledTime] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<SpotifyTrack[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const upcoming = data?.upcoming ?? [];

  const timezoneOffsetMinutes = new Date().getTimezoneOffset();

  const formatNextRun = (iso: string) => new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formatDailyTime = (schedule: ScheduledPlayback) => {
    const nextRunDate = new Date(schedule.scheduledFor);
    return nextRunDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const describeLastRun = (schedule: ScheduledPlayback) => {
    if (!schedule.lastRunAt) {
      return null;
    }

    const when = new Date(schedule.lastRunAt).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    if (!schedule.lastRunStatus) {
      return `Last run ${when}`;
    }

    const normalizedStatus = schedule.lastRunStatus
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^(\w)/, (letter) => letter.toUpperCase());

    return `Last run ${when} (${normalizedStatus})`;
  };

  useEffect(() => {
    const trimmed = searchTerm.trim();

    if (!canManage) {
      setDebouncedSearchTerm('');
      setShowSearchResults(false);
      return;
    }

    if (!trimmed) {
      setDebouncedSearchTerm('');
      setShowSearchResults(false);
      return;
    }

    setShowSearchResults(true);
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, canManage]);

  const searchFetcher: Fetcher<SpotifyTrack[], [string, string, string]> = async ([, id, term]) => {
    const response = await spotifyApi.search(id, term, { hideRestricted: true });
    const tracks: SpotifyTrack[] = response.data?.tracks ?? response.data ?? [];
    return tracks;
  };

  const {
    data: searchResults,
    error: searchError,
    isValidating: searching,
  } = useSWR<SpotifyTrack[], AxiosError>(
    canManage && debouncedSearchTerm ? ['scheduled-playback-search', sessionId, debouncedSearchTerm] : null,
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

    console.error('Failed to search tracks:', searchError);
    setFormError('Failed to search tracks. Please try again.');
  }, [searchError]);

  const addTrack = (track: SpotifyTrack) => {
    if (selectedTracks.find((existing) => existing.id === track.id)) {
      return;
    }

    if (selectedTracks.length >= MAX_TRACKS) {
      setFormError(`You can only schedule up to ${MAX_TRACKS} tracks at a time.`);
      return;
    }

    setFormError(null);
    setSelectedTracks((prev) => [...prev, track]);
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setShowSearchResults(false);
  };

  const removeTrack = (trackId: string) => {
    setSelectedTracks((prev) => prev.filter((track) => track.id !== trackId));
  };

  const handleSubmit = async () => {
    if (!canManage) {
      return;
    }

    if (!scheduledTime) {
      setFormError('Select a schedule time.');
      return;
    }

    if (selectedTracks.length === 0) {
      setFormError('Add at least one track to schedule.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await scheduledPlaybackApi.create(sessionId, {
        timeOfDay: scheduledTime,
        timezoneOffsetMinutes,
        tracks: selectedTracks.map((track) => ({
          spotifyTrackId: track.id,
          spotifyUri: track.uri,
          trackName: track.name,
          trackArtist: track.artists.map((artist) => artist.name).join(', '),
          trackAlbum: track.album?.name ?? null,
          trackImage: track.album?.images?.[0]?.url ?? null,
          trackDuration: track.duration_ms,
        })),
      });

      setSearchTerm('');
      setDebouncedSearchTerm('');
      setShowSearchResults(false);
      setSelectedTracks([]);
      setScheduledTime('');
      await mutate();
    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Failed to schedule playback. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (schedule: ScheduledPlayback) => {
    if (!canManage) {
      return;
    }

    try {
      await scheduledPlaybackApi.cancel(sessionId, schedule.id);
      await mutate();
    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Failed to cancel scheduled playback.';
      setFormError(message);
    }
  };

  const renderTrackSummary = (schedule: ScheduledPlayback) => {
    if (!schedule.tracks.length) {
      return 'No tracks';
    }

    const [first, ...rest] = schedule.tracks;
    if (rest.length === 0) {
      return `${first.trackName} • ${first.trackArtist}`;
    }

    return `${first.trackName} • ${first.trackArtist} (+${rest.length} more)`;
  };

  const filteredSearchResults = (searchResults ?? []).filter((track) =>
    !selectedTracks.some((selected) => selected.id === track.id)
  );

  return (
    <div className="bg-gradient-to-br from-spotify-gray to-spotify-gray/80 rounded-xl shadow-lg border border-gray-800 overflow-hidden">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Calendar size={24} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Scheduled Sets</h3>
            <p className="text-xs text-gray-400">Queue a special block of tracks for a specific time</p>
          </div>
        </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500/60 text-red-100 px-4 py-3 rounded-lg text-sm">
          Failed to load scheduled playback.
        </div>
      )}

      {formError && (
        <div className="bg-red-900/40 border border-red-500/60 text-red-100 px-4 py-3 rounded-lg text-sm">
          {formError}
        </div>
      )}

      {canManage && (
        <div className="bg-spotify-black/50 border border-gray-800 rounded-lg p-5 space-y-4 hover:border-spotify-green/30 transition-colors">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
              <Clock size={16} className="text-spotify-green" />
              Daily start time
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(event) => setScheduledTime(event.target.value)}
              className="w-full bg-spotify-gray text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green border border-gray-700"
            />
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <span className="text-blue-400">ℹ️</span>
              Runs every day at the selected time in your timezone
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-white">
              <Search size={16} className="text-spotify-green" />
              Add tracks
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                placeholder="Search Spotify…"
                className="w-full bg-spotify-gray text-white pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green border border-gray-700 placeholder-gray-500"
                onFocus={() => {
                  if (searchTerm.trim()) {
                    setShowSearchResults(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchTerm('');
                    setDebouncedSearchTerm('');
                    setShowSearchResults(false);
                  }
                }}
              />

              {showSearchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray/95 backdrop-blur border border-spotify-black/40 rounded-lg shadow-xl max-h-96 overflow-y-auto z-30">
                  {searching && (
                    <div className="p-3 text-gray-400 text-sm flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      <span>Searching…</span>
                    </div>
                  )}
                  {!searching && filteredSearchResults.length === 0 ? (
                    <div className="p-4 text-sm text-gray-400">No results found.</div>
                  ) : (
                    filteredSearchResults.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => addTrack(track)}
                        className="w-full text-left px-4 py-3 hover:bg-spotify-black/60 transition flex items-center gap-3"
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
                        {track.explicit && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-spotify-green/20 text-spotify-green">
                            Explicit
                          </span>
                        )}
                        <Plus className="text-spotify-green shrink-0" size={18} />
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSearchResults(false)}
                    className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white border-t border-spotify-black/30"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>

          {selectedTracks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-300">Selected tracks</p>
              <ul className="space-y-2">
                {selectedTracks.map((track, index) => (
                  <li
                    key={track.id}
                    className="bg-spotify-black/40 rounded-lg px-4 py-3 flex justify-between items-center border border-spotify-black/30"
                  >
                    <div>
                      <p className="text-white text-sm font-semibold">
                        {index + 1}. {track.name}
                      </p>
                      <p className="text-xs text-gray-400">{track.artists.map((artist) => artist.name).join(', ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTrack(track.id)}
                      className="text-gray-400 hover:text-red-400 transition"
                    >
                      <XCircle size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || selectedTracks.length === 0 || !scheduledTime}
            className="w-full bg-gradient-to-r from-spotify-green to-green-500 hover:from-spotify-hover hover:to-green-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-spotify-green/20 disabled:shadow-none transform hover:scale-[1.02] active:scale-[0.98]">
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Clock size={20} />}
            <span>{isSubmitting ? 'Scheduling…' : '📅 Schedule Tracks'}</span>
          </button>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-lg font-semibold text-white">Upcoming</h4>
        {isLoading && upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm">No sets scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((schedule) => (
              <li
                key={schedule.id}
                className="bg-spotify-black/40 border border-spotify-black/30 rounded-lg px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-white font-semibold">
                    Daily at {formatDailyTime(schedule)}
                  </p>
                  <p className="text-xs text-gray-300">Next run: {formatNextRun(schedule.scheduledFor)}</p>
                  <p className="text-xs text-gray-400">{renderTrackSummary(schedule)}</p>
                  {schedule.failureReason && (
                    <p className="text-xs text-red-300">{schedule.failureReason}</p>
                  )}
                  {describeLastRun(schedule) && (
                    <p className="text-xs text-gray-500">{describeLastRun(schedule)}</p>
                  )}
                  {schedule.status === 'PROCESSING' && (
                    <p className="text-xs text-spotify-green">Currently running…</p>
                  )}
                </div>
                {canManage && schedule.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(schedule)}
                    className="inline-flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 px-3 py-2 rounded-lg"
                  >
                    <XCircle size={16} />
                    <span>Cancel</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      </div>
    </div>
  );
}
