import { io, Socket } from 'socket.io-client';
import { QueueState, PlaybackState, PlaybackRequester } from '../types';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 
                        (import.meta.env.VITE_API_URL?.replace('/api', '')) || 
                        window.location.origin;
      
      this.socket = io(socketUrl, {
        withCredentials: true,
      });

      this.socket.on('connect', () => {
        console.log('Connected to socket server');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from socket server');
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinSession(sessionId: string) {
    this.socket?.emit('join_session', sessionId);
  }

  leaveSession(sessionId: string) {
    this.socket?.emit('leave_session', sessionId);
  }

  onQueueUpdated(callback: (data: QueueState) => void) {
    if (!this.socket) return () => undefined;

    this.socket.on('queue_updated', callback);
    return () => this.socket?.off('queue_updated', callback);
  }

  onVoteUpdated(callback: (data: { queueItemId: string; voteScore: number }) => void) {
    if (!this.socket) return () => undefined;

    this.socket.on('vote_updated', callback);
    return () => this.socket?.off('vote_updated', callback);
  }

  onNowPlaying(callback: (data: { playback: PlaybackState | null; requester?: PlaybackRequester | null }) => void) {
    if (!this.socket) return () => undefined;

    this.socket.on('now_playing', callback);
    return () => this.socket?.off('now_playing', callback);
  }

  onUserJoined(callback: (data: { socketId: string; userCount: number }) => void) {
    if (!this.socket) return () => undefined;

    this.socket.on('user_joined', callback);
    return () => this.socket?.off('user_joined', callback);
  }

  onUserLeft(callback: (data: { socketId: string; userCount: number }) => void) {
    if (!this.socket) return () => undefined;

    this.socket.on('user_left', callback);
    return () => this.socket?.off('user_left', callback);
  }

  off(event: string, callback?: any) {
    this.socket?.off(event, callback);
  }

  getSocket() {
    return this.socket;
  }
}

export const socketService = new SocketService();
