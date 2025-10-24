import { Server as SocketIOServer, Socket } from 'socket.io';
import { queueService } from '../services/queue.service';

interface SessionRoom {
  [sessionId: string]: Set<string>;
}

const sessionRooms: SessionRoom = {};

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Join a session room
    socket.on('join_session', async (sessionId: string) => {
      socket.join(sessionId);
      
      if (!sessionRooms[sessionId]) {
        sessionRooms[sessionId] = new Set();
      }
      sessionRooms[sessionId].add(socket.id);

      console.log(`Socket ${socket.id} joined session ${sessionId}`);
      
      // Notify others in the room
      socket.to(sessionId).emit('user_joined', {
        socketId: socket.id,
        userCount: sessionRooms[sessionId].size,
      });

      // Send current queue to the new user
      try {
        const state = await queueService.getQueueWithNext(sessionId);
        socket.emit('queue_updated', state);
      } catch (error) {
        console.error('Error fetching queue:', error);
      }
    });

    // Leave a session room
    socket.on('leave_session', (sessionId: string) => {
      socket.leave(sessionId);
      
      if (sessionRooms[sessionId]) {
        sessionRooms[sessionId].delete(socket.id);
        
        // Notify others
        socket.to(sessionId).emit('user_left', {
          socketId: socket.id,
          userCount: sessionRooms[sessionId].size,
        });
      }

      console.log(`Socket ${socket.id} left session ${sessionId}`);
    });

    // Broadcast queue updates
    socket.on('queue_updated', (data: { sessionId: string; queue: any[]; nextUp?: any }) => {
      socket.to(data.sessionId).emit('queue_updated', {
        queue: data.queue,
        nextUp: data.nextUp ?? null,
      });
    });

    // Broadcast vote updates
    socket.on('vote_updated', (data: { sessionId: string; queueItemId: string; voteScore: number }) => {
      socket.to(data.sessionId).emit('vote_updated', data);
    });

    // Broadcast now playing
    socket.on('now_playing', (data: { sessionId: string; playback: any }) => {
      io.to(data.sessionId).emit('now_playing', { playback: data.playback ?? null });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      // Remove from all session rooms
      for (const sessionId in sessionRooms) {
        if (sessionRooms[sessionId].has(socket.id)) {
          sessionRooms[sessionId].delete(socket.id);
          
          socket.to(sessionId).emit('user_left', {
            socketId: socket.id,
            userCount: sessionRooms[sessionId].size,
          });
        }
      }
    });
  });
}

// Helper function to broadcast queue updates from the API
export function broadcastQueueUpdate(io: SocketIOServer, sessionId: string, state: { nextUp: any; queue: any[] }) {
  io.to(sessionId).emit('queue_updated', state);
}

// Helper function to broadcast vote updates from the API
export function broadcastVoteUpdate(io: SocketIOServer, sessionId: string, queueItemId: string, voteScore: number) {
  io.to(sessionId).emit('vote_updated', { queueItemId, voteScore });
}

// Helper to broadcast playback updates from the API or services
export function broadcastPlaybackUpdate(io: SocketIOServer, sessionId: string, playback: any) {
  io.to(sessionId).emit('now_playing', { playback: playback ?? null });
}
