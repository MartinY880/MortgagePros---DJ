import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import session from 'express-session';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { setupSocketHandlers } from './sockets/handlers';
import { playbackService } from './services/playback.service';
import { scheduledPlaybackProcessor } from './services/scheduledPlaybackProcessor';
import { clerkMiddleware } from './middleware/clerk.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import sessionRoutes from './routes/session.routes';
import queueRoutes from './routes/queue.routes';
import spotifyRoutes from './routes/spotify.routes';
import configRoutes from './routes/config.routes';

// Create Express app
const app = express();
const httpServer = createServer(app);

// Trust Traefik proxy to preserve secure cookies and client IP
app.set('trust proxy', 1);

// Setup Socket.IO
const normalizeOrigin = (origin: string) => origin.replace(/\/$/, '').toLowerCase();

const allowedOrigins = new Set(config.server.frontendOrigins.map(normalizeOrigin));

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: Array.from(allowedOrigins),
    credentials: true,
  },
});

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication middleware
app.use(clerkMiddleware);

// Session configuration
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.server.nodeEnv === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: config.server.nodeEnv === 'production' ? 'none' : 'lax',
    },
  })
);

// Make io available in routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/config', configRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Setup Socket.IO handlers
setupSocketHandlers(io);
playbackService.setSocketServer(io);
scheduledPlaybackProcessor.start();

// Start server
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Frontend URLs: ${config.server.frontendOrigins.join(', ')}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Public API Base URL: ${config.frontend.apiBaseUrl}`);
  console.log(`Public Socket URL: ${config.frontend.socketUrl}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  scheduledPlaybackProcessor.stop();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export { io };
