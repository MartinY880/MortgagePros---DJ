import { QueueItem } from '../types';

interface NextUpProps {
  track: QueueItem | null;
}

export default function NextUp({ track }: NextUpProps) {
  if (!track) {
    return (
      <div className="bg-th-surface p-6 rounded-lg text-center">
        <h2 className="text-sm text-muted uppercase mb-2">Next Up</h2>
        <p className="text-secondary">No track queued yet.</p>
        <p className="text-faint text-sm mt-1">Add songs to keep the party going.</p>
      </div>
    );
  }

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-r from-th-elevated to-th-surface p-6 rounded-lg">
      <h2 className="text-sm text-muted uppercase mb-4">Next Up</h2>
      <div className="flex items-center gap-4">
        {track.trackImage && (
          <img
            src={track.trackImage}
            alt={track.trackName}
            className="w-20 h-20 rounded-lg shadow-lg"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-primary truncate">{track.trackName}</h3>
          <p className="text-secondary truncate">{track.trackArtist}</p>
          {track.trackAlbum && (
            <p className="text-faint text-sm">{track.trackAlbum}</p>
          )}
          <p className="text-faint text-xs mt-1">
            Added by {track.addedBy?.displayName || track.addedByGuest?.name || 'Guest'} · {formatDuration(track.trackDuration)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-th-brand text-3xl font-bold">{track.voteScore}</p>
          <p className="text-muted text-xs uppercase tracking-wide">Votes</p>
        </div>
      </div>
    </div>
  );
}
