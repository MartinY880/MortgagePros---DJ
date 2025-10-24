import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { setupSocketHandlers } from './sockets/handlers';

// Import routes
import authRoutes from './routes/auth.routes';
import sessionRoutes from './routes/session.routes';
import queueRoutes from './routes/queue.routes';
import spotifyRoutes from './routes/spotify.routes';

// Create Express app
const app = express();
const httpServer = createServer(app);

// Trust Traefik proxy to preserve secure cookies and client IP
app.set('trust proxy', 1);

// Setup Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.server.frontendUrl,
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: config.server.frontendUrl,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Start server
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Frontend URL: ${config.server.frontendUrl}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export { io };
