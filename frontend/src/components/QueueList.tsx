import { ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { queueApi } from '../services/api';
import { QueueItem } from '../types';

interface QueueListProps {
  queue: QueueItem[];
  sessionId: string;
  onQueueUpdate: () => void;
}

export default function QueueList({ queue, sessionId: _sessionId, onQueueUpdate }: QueueListProps) {
  const handleVote = async (queueItemId: string, voteType: number) => {
    try {
      await queueApi.vote(queueItemId, voteType);
      onQueueUpdate();
    } catch (error) {
      console.error('Vote error:', error);
    }
  };

  const handleRemove = async (queueItemId: string) => {
    if (!confirm('Remove this track from the queue?')) return;
    
    try {
      await queueApi.remove(queueItemId);
      onQueueUpdate();
    } catch (error) {
      console.error('Remove error:', error);
      alert('Failed to remove track');
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (queue.length === 0) {
    return (
      <div className="bg-spotify-gray p-8 rounded-lg text-center">
        <p className="text-gray-400 text-lg">No tracks in queue yet!</p>
        <p className="text-gray-500 text-sm mt-2">Search and add songs to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-white mb-4">Queue ({queue.length})</h2>
      {queue.map((item, index) => (
        <div
          key={item.id}
          className="bg-spotify-gray p-4 rounded-lg flex items-center gap-4 hover:bg-opacity-80 transition"
        >
          {/* Track Number */}
          <div className="text-gray-400 font-bold w-8 text-center">
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
            <h3 className="text-white font-semibold truncate">{item.trackName}</h3>
            <p className="text-gray-400 text-sm truncate">{item.trackArtist}</p>
            <p className="text-gray-500 text-xs">
              Added by {item.addedBy?.displayName} · {formatDuration(item.trackDuration)}
            </p>
          </div>

          {/* Vote Score */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote(item.id, 1)}
              className="text-gray-400 hover:text-spotify-green transition p-2 rounded hover:bg-spotify-black"
            >
              <ThumbsUp size={20} />
            </button>
            
            <span className={`text-xl font-bold min-w-[2rem] text-center ${
              item.voteScore > 0 ? 'text-spotify-green' : 
              item.voteScore < 0 ? 'text-red-500' : 
              'text-gray-400'
            }`}>
              {item.voteScore}
            </span>
            
            <button
              onClick={() => handleVote(item.id, -1)}
              className="text-gray-400 hover:text-red-500 transition p-2 rounded hover:bg-spotify-black"
            >
              <ThumbsDown size={20} />
            </button>
          </div>

          {/* Remove Button */}
          <button
            onClick={() => handleRemove(item.id)}
            className="text-gray-400 hover:text-red-500 transition p-2 rounded hover:bg-spotify-black"
          >
            <Trash2 size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}
