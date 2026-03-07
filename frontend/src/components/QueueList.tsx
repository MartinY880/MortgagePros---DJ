import { ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { queueApi } from '../services/api';
import { CreditState, QueueItem, SessionParticipant } from '../types';

interface QueueListProps {
  nextUp?: QueueItem | null;
  queue: QueueItem[];
  sessionId: string;
  sessionHostId: string;
  onQueueUpdate: (result?: { credits?: CreditState }) => void | Promise<void>;
  participant: SessionParticipant | null;
  onRequireAccess: () => void;
  onSessionError?: (error: string) => void;
}

export default function QueueList({ nextUp: _nextUp, queue, sessionId: _sessionId, sessionHostId, onQueueUpdate, participant, onRequireAccess, onSessionError }: QueueListProps) {
  const canRemove = (item: QueueItem) => {
    if (!participant) return false;
    if (participant.type === 'host') return true;
    if (participant.type === 'guest' && participant.guestId) {
      return item.addedByGuest?.id === participant.guestId;
    }
    return false;
  };

  const ensureParticipant = () => {
    if (!participant || participant.type === 'none') {
      onRequireAccess();
      return false;
    }
    return true;
  };

  const handleVote = async (queueItemId: string, voteType: number) => {
    if (!ensureParticipant()) {
      return;
    }

    try {
      const response = await queueApi.vote(queueItemId, voteType);
      const credits = response?.data?.credits as CreditState | undefined;
      void onQueueUpdate(credits ? { credits } : undefined);
    } catch (error) {
      console.error('Vote error:', error);
      const status = (error as any)?.response?.status;
      const message = (error as any)?.response?.data?.error;
      
      if (status === 404 && message?.includes('no longer active')) {
        onSessionError?.(message);
        return;
      }
      
      if (status === 403 && typeof message === 'string' && message.toLowerCase().includes('credit')) {
        alert(message);
        return;
      }
      if (status === 401 || status === 403) {
        onRequireAccess();
      }
    }
  };

  const handleRemove = async (queueItemId: string) => {
    if (!ensureParticipant()) {
      return;
    }

    if (!confirm('Remove this track from the queue?')) return;
    
    try {
  const response = await queueApi.remove(queueItemId);
  const credits = response?.data?.credits as CreditState | undefined;
  void onQueueUpdate(credits ? { credits } : undefined);
    } catch (error) {
      console.error('Remove error:', error);
      const status = (error as any)?.response?.status;
      const message = (error as any)?.response?.data?.error;
      
      if (status === 404 && message?.includes('no longer active')) {
        onSessionError?.(message);
        return;
      }
      
      if (status === 401 || status === 403) {
        onRequireAccess();
        return;
      }
      alert('Failed to remove track');
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const resolveCurrentVote = (item: QueueItem) => {
    if (!participant) {
      return null;
    }

    if (participant.type === 'host') {
      return item.votes?.find((vote) => vote.userId === sessionHostId) ?? null;
    }

    if (participant.type === 'guest' && participant.guestId) {
      return item.votes?.find((vote) => vote.guestId === participant.guestId) ?? null;
    }

    return null;
  };

  if (queue.length === 0) {
    return (
      <div className="bg-th-surface p-8 rounded-lg text-center">
        <p className="text-muted text-lg">No additional tracks queued.</p>
        <p className="text-faint text-sm mt-2">Search and add songs to line up more music.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-primary mb-4">Queue ({queue.length})</h2>
      {queue.map((item, index) => {
        const currentVote = resolveCurrentVote(item);
        const upvoted = currentVote?.voteType === 1;
        const downvoted = currentVote?.voteType === -1;

        return (
          <div
            key={item.id}
            className="bg-th-surface p-4 rounded-lg flex items-center gap-4 hover:bg-opacity-80 transition"
          >
          {/* Track Number */}
          <div className="text-muted font-bold w-8 text-center">
            {index + 1}
          </div>

          {/* Album Art */}
          {item.trackImage && (
            <img
              src={item.trackImage}
              alt={item.trackName}
              className="w-16 h-16 rounded"
            />
          )}

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-primary font-semibold truncate">{item.trackName}</h3>
            <p className="text-muted text-sm truncate">{item.trackArtist}</p>
            <p className="text-faint text-xs">
              Added by {item.addedBy?.displayName || item.addedByGuest?.name || 'Guest'} · {formatDuration(item.trackDuration)}
            </p>
          </div>

          {/* Vote Score */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote(item.id, 1)}
              className={`transition p-2 rounded border border-transparent ${
                upvoted
                  ? 'bg-th-brand/20 text-th-brand border-th-brand'
                  : 'text-muted hover:text-th-brand hover:bg-th-elevated'
              }`}
              aria-pressed={upvoted}
              title={upvoted ? 'You liked this track' : 'Upvote'}
            >
              <ThumbsUp size={20} />
            </button>
            
            <span className={`text-xl font-bold min-w-[2rem] text-center ${
              item.voteScore > 0 ? 'text-th-brand' : 
              item.voteScore < 0 ? 'text-th-error' : 
              'text-muted'
            }`}>
              {item.voteScore}
            </span>
            
            <button
              onClick={() => handleVote(item.id, -1)}
              className={`transition p-2 rounded border border-transparent ${
                downvoted
                  ? 'bg-red-500/20 text-th-error border-th-error'
                  : 'text-muted hover:text-th-error hover:bg-th-elevated'
              }`}
              aria-pressed={downvoted}
              title={downvoted ? 'You disliked this track' : 'Downvote'}
            >
              <ThumbsDown size={20} />
            </button>
          </div>

          {/* Remove Button */}
          {canRemove(item) && (
            <button
              onClick={() => handleRemove(item.id)}
              className="text-muted hover:text-th-error transition p-2 rounded hover:bg-th-elevated"
            >
              <Trash2 size={20} />
            </button>
          )}
          </div>
        );
      })}
    </div>
  );
}
