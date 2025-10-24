# Spotify Jukebox App

A locally hosted collaborative Spotify jukebox application with queue management and voting features.

## Features

- 🎵 Connect to Spotify account
- 🎪 Create collaborative jukebox sessions
- ➕ Add songs to shared queue
- 👍👎 Upvote/downvote tracks
- 🔄 Real-time synchronization across clients
- 🎮 Host playback controls

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Socket.io-client for real-time updates
- React Query for data fetching

### Backend
- Node.js with Express
- TypeScript
- Socket.io for WebSockets
- Prisma ORM with SQLite
- Spotify Web API integration

## Prerequisites

- Node.js 18+ installed
- Spotify Premium account (required for playback control)
- Spotify Developer account

## Setup Instructions

### 1. Spotify Developer Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Note your **Client ID** and **Client Secret**
4. Add redirect URI: `http://localhost:5000/api/auth/callback`
5. Add these scopes in your app settings:
   - `user-read-playback-state`
   - `user-modify-playback-state`
   - `user-read-currently-playing`
   - `streaming`

### 2. Installation

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Environment Configuration

Create `.env` file in the `backend` folder:

```env
# Copy from backend/.env.example and fill in your values
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:5000/api/auth/callback
SESSION_SECRET=your_random_session_secret
PORT=5000
FRONTEND_URL=http://localhost:5173
```

### 4. Database Setup

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open your browser to `http://localhost:5173`

## Project Structure

```
├── backend/                 # Express server
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── sockets/        # Socket.io handlers
│   │   ├── types/          # TypeScript types
│   │   └── server.ts       # Entry point
│   ├── prisma/             # Database schema
│   └── package.json
│
├── frontend/               # React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API services
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Utility functions
│   │   └── App.tsx        # Root component
│   └── package.json
│
└── README.md
```

## API Endpoints

### Authentication
- `GET /api/auth/login` - Initiate Spotify OAuth
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session details
- `DELETE /api/sessions/:id` - Delete session (host only)

### Queue
- `POST /api/queue/:sessionId/add` - Add track to queue
- `GET /api/queue/:sessionId` - Get session queue
- `DELETE /api/queue/:queueItemId` - Remove from queue
- `POST /api/queue/:queueItemId/vote` - Vote on track

### Search
- `GET /api/search?q=query` - Search Spotify tracks

### Player
- `POST /api/player/play` - Play/resume
- `POST /api/player/pause` - Pause playback
- `POST /api/player/next` - Skip to next track
- `GET /api/player/current` - Get current playback

## Socket Events

### Client → Server
- `join_session` - Join a jukebox session
- `leave_session` - Leave a session

### Server → Client
- `queue_updated` - Queue has changed
- `vote_updated` - Vote count changed
- `now_playing` - Current track updated
- `user_joined` - User joined session
- `user_left` - User left session

## Usage

1. **Host**: Click "Create Session" and connect Spotify
2. **Guests**: Join using the session code
3. **Add Songs**: Search and add tracks to the queue
4. **Vote**: Upvote/downvote songs (higher votes play first)
5. **Control**: Host can play/pause/skip tracks

## Troubleshooting

### "No active device found"
- Open Spotify app on your computer/phone
- Start playing any song to activate the device
- The jukebox will then control that device

### Token expired errors
- The app automatically refreshes tokens
- If issues persist, log out and log back in

### Songs not playing
- Ensure you have Spotify Premium
- Check that an active device is available
- Verify API credentials are correct

## Future Enhancements

- [ ] Playlist import
- [ ] Song history
- [ ] User permissions/roles
- [ ] Vote weight decay
- [ ] Mobile app
- [ ] Multi-room support

## License

MIT License - Feel free to use and modify!
