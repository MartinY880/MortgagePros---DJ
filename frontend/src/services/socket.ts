import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      this.socket = io('http://localhost:5000', {
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

  onQueueUpdated(callback: (data: { queue: any[] }) => void) {
    this.socket?.on('queue_updated', callback);
  }

  onVoteUpdated(callback: (data: { queueItemId: string; voteScore: number }) => void) {
    this.socket?.on('vote_updated', callback);
  }

  onNowPlaying(callback: (data: { track: any }) => void) {
    this.socket?.on('now_playing', callback);
  }

  onUserJoined(callback: (data: { socketId: string; userCount: number }) => void) {
    this.socket?.on('user_joined', callback);
  }

  onUserLeft(callback: (data: { socketId: string; userCount: number }) => void) {
    this.socket?.on('user_left', callback);
  }

  off(event: string, callback?: any) {
    this.socket?.off(event, callback);
  }

  getSocket() {
    return this.socket;
  }
}

export const socketService = new SocketService();
