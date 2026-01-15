# Spotify Jukebox App

A locally hosted collaborative Spotify jukebox application with queue management and voting features.

## Features

- 🎵 Connect to Spotify account
- 🎪 Create collaborative jukebox sessions
- ➕ Add songs to shared queue
- 👍👎 Upvote/downvote tracks
- 🔄 Real-time synchronization across clients
- 🎮 Host playback controls
- � Optional headless playback via an embedded Librespot Spotify Connect receiver
- �🔐 Clerk-powered authentication for hosts and guests

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
- Clerk account ([https://clerk.com](https://clerk.com))

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

Create a single `.env` file in the **repository root** (next to `package.json`) based on `.env.example`:

```bash
cp .env.example .env
```

Update the values for your Spotify credentials, Clerk keys, and any Vite `VITE_` variables. This file is shared by both the backend and frontend, making it easy to mount in Docker with `--env-file` or `env_file` in `docker-compose`.

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

## Optional: Managed Librespot Receiver

This project can spin up an integrated [librespot](https://github.com/librespot-org/librespot) Spotify Connect receiver so the jukebox can play music without relying on a host device being open.

1. **Enable the receiver** – set the following variables in `.env` (or Docker environment):
   ```env
   LIBRESPOT_ENABLED=true
   LIBRESPOT_DEVICE_NAME=MortgagePros DJ
   LIBRESPOT_TRANSFER_ON_QUEUE=true
   ```
   Optional extras include `LIBRESPOT_BACKEND`, `LIBRESPOT_BITRATE`, `LIBRESPOT_USERNAME`/`LIBRESPOT_PASSWORD`, and `LIBRESPOT_EXTRA_ARGS`.

2. **First-time pairing** – if you do not provide credentials, librespot starts in discovery mode. Open the Spotify app on any device logged into the same account, look for the `MortgagePros DJ` device, and connect once. The generated credentials are cached in `./librespot-cache` so future boots re-use them.

3. **Playback control** – once the receiver is active, the backend automatically transfers playback to the librespot device when songs are queued or when monitoring detects the wrong target device.

For Docker deployments (including the provided `docker-compose.yml`), the librespot binary is baked into the image and enabled by setting the environment variables above. The cache directory is created inside the container at `/app/librespot-cache`; mount it as a volume if you want to persist credentials between rebuilds.

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
5. **Control**: Host can play/pause/skip tracks; guests can now spend skip votes to trigger a skip once enough have been cast

## Troubleshooting

### "No active device found"
- If Librespot is enabled, ensure the `LIBRESPOT_DEVICE_NAME` appears in Spotify Connect and pair once from a mobile/desktop app.
- Otherwise, open Spotify on your computer/phone, start playing any song, then return to the jukebox.
- The jukebox will control the last active device for the authenticated Spotify account.

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
