import { useState } from 'react';
import { PlusCircle, Clock, XCircle, Loader2, Calendar } from 'lucide-react';
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
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<SpotifyTrack[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const upcoming = data?.upcoming ?? [];
  const history = data?.history ?? [];

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

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setFormError(null);
    try {
      const response = await spotifyApi.search(sessionId, searchTerm.trim());
      const tracks: SpotifyTrack[] = response.data?.tracks ?? response.data ?? [];
      setSearchResults(tracks);
    } catch (err) {
      console.error('Failed to search tracks:', err);
      setFormError('Failed to search tracks. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const addTrack = (track: SpotifyTrack) => {
    if (selectedTracks.find((existing) => existing.id === track.id)) {
      return;
    }

    if (selectedTracks.length >= MAX_TRACKS) {
      setFormError(`You can only schedule up to ${MAX_TRACKS} tracks at a time.`);
      return;
    }

    setSelectedTracks((prev) => [...prev, track]);
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
      setSearchResults([]);
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

  const formattedSearchResults = searchResults.filter((track) =>
    !selectedTracks.some((selected) => selected.id === track.id)
  );

  return (
    <div className="bg-spotify-gray p-6 rounded-lg space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="text-spotify-green" />
        <div>
          <h3 className="text-xl font-bold text-white">Scheduled Sets</h3>
          <p className="text-sm text-gray-400">Queue a special block of tracks for a specific time.</p>
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
        <div className="bg-spotify-black/40 border border-spotify-black/20 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Daily start time</label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(event) => setScheduledTime(event.target.value)}
              className="w-full bg-spotify-black text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
            />
            <p className="text-xs text-gray-500 mt-1">Runs every day at the selected time in your timezone.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-300">Add tracks</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Spotify…"
                className="flex-1 bg-spotify-black text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-spotify-green"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                className="bg-spotify-green hover:bg-spotify-hover text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                {searching ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
                <span>Search</span>
              </button>
            </div>

            {formattedSearchResults.length > 0 && (
              <div className="bg-spotify-black/40 rounded-lg divide-y divide-spotify-gray/40 border border-spotify-black/30">
                {formattedSearchResults.slice(0, 5).map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => addTrack(track)}
                    className="w-full text-left px-4 py-3 hover:bg-spotify-gray/40 transition flex justify-between items-center"
                  >
                    <div>
                      <p className="text-white text-sm font-semibold">{track.name}</p>
                      <p className="text-xs text-gray-400">{track.artists.map((artist) => artist.name).join(', ')}</p>
                    </div>
                    <PlusCircle className="text-spotify-green" size={18} />
                  </button>
                ))}
              </div>
            )}
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
            className="w-full bg-spotify-green hover:bg-spotify-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Clock size={20} />}
            <span>{isSubmitting ? 'Scheduling…' : 'Schedule Tracks'}</span>
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

      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-lg font-semibold text-white">Recent activity</h4>
          <ul className="space-y-2">
            {history.map((schedule) => (
              <li
                key={schedule.id}
                className="bg-spotify-black/30 border border-spotify-black/20 rounded-lg px-4 py-3 flex flex-col gap-1"
              >
                <div className="flex justify-between items-center">
                  <p className="text-white text-sm font-semibold">
                    {new Date(schedule.scheduledFor).toLocaleString()}
                  </p>
                  <span className="text-xs text-gray-400">{schedule.status}</span>
                </div>
                <p className="text-xs text-gray-400">{renderTrackSummary(schedule)}</p>
                {schedule.failureReason && (
                  <p className="text-xs text-red-300">{schedule.failureReason}</p>
                )}
                {schedule.lastRunAt && (
                  <p className="text-xs text-gray-500">
                    Completed {new Date(schedule.lastRunAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
