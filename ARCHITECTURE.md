# Spotify Jukebox - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           React Frontend (Port 5173)                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │   │
│  │  │  Pages   │  │Components│  │  Services       │   │   │
│  │  │          │  │          │  │                 │   │   │
│  │  │ Landing  │  │ Queue    │  │ API (Axios)     │   │   │
│  │  │Dashboard │  │ Search   │  │ Socket.io       │   │   │
│  │  │ Session  │  │NowPlaying│  │                 │   │   │
│  │  └──────────┘  └──────────┘  └─────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────┬──────────────────────┬───────────────────┘
                    │ HTTP/REST            │ WebSocket
                    │                      │
┌───────────────────▼──────────────────────▼───────────────────┐
│              Node.js Backend (Port 5000)                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Express Server                      │    │
│  │                                                       │    │
│  │  ┌──────────┐  ┌────────────┐  ┌─────────────────┐ │    │
│  │  │  Routes  │  │Controllers │  │   Services      │ │    │
│  │  │          │  │            │  │                 │ │    │
│  │  │ /auth    │─▶│ Auth       │─▶│ Spotify API     │ │    │
│  │  │/sessions │─▶│ Session    │─▶│ Session Manager │ │    │
│  │  │ /queue   │─▶│ Queue      │─▶│ Queue Manager   │ │    │
│  │  │/spotify  │─▶│ Spotify    │  │                 │ │    │
│  │  └──────────┘  └────────────┘  └─────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │         Socket.io Server                    │    │    │
│  │  │  - Real-time queue updates                  │    │    │
│  │  │  - Vote synchronization                     │    │    │
│  │  │  - User presence tracking                   │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────┬──────────────────────┬─────────────────────────┘
             │                      │
             │                      │
┌────────────▼───────┐   ┌──────────▼──────────────────────────┐
│  SQLite Database   │   │     Spotify Web API                 │
│                    │   │                                     │
│  - Users           │   │  - Search tracks                    │
│  - Sessions        │   │  - Get track details                │
│  - Queue Items     │   │  - Control playback                 │
│  - Votes           │   │  - Get current playback             │
└────────────────────┘   └─────────────────────────────────────┘
```

## Data Flow

### 1. Authentication Flow
```
User → Frontend → Backend → Spotify OAuth → Backend → Frontend
                    ↓
                 Database (Store tokens)
```

### 2. Create Session Flow
```
Host → Create Session → Backend → Database → Return Session Code
                                      ↓
                                  WebSocket: Broadcast
```

### 3. Add Song Flow
```
User → Search → Spotify API → Results → User Selects
                                           ↓
                                       Add to Queue
                                           ↓
                                  Database + WebSocket
                                           ↓
                              All Clients: Queue Updated
```

### 4. Voting Flow
```
User → Vote (+1/-1) → Backend → Update Vote Score → Database
                                        ↓
                                   WebSocket
                                        ↓
                            All Clients: Queue Reordered
```

### 5. Playback Flow
```
Host → Play/Pause/Skip → Backend → Spotify API → User's Device
                                        ↓
                                   WebSocket
                                        ↓
                              All Clients: Now Playing
```

## API Endpoints

### Authentication
- `GET /api/auth/login` - Get Spotify OAuth URL
- `GET /api/auth/callback` - Handle OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session by ID
- `GET /api/sessions/code/:code` - Get session by code
- `DELETE /api/sessions/:id` - Delete session

### Queue
- `POST /api/queue/:sessionId/add` - Add track to queue
- `GET /api/queue/:sessionId` - Get session queue
- `DELETE /api/queue/:queueItemId` - Remove from queue
- `POST /api/queue/:queueItemId/vote` - Vote on track

### Spotify
- `GET /api/spotify/search?q=query` - Search tracks
- `GET /api/spotify/playback` - Get current playback
- `POST /api/spotify/play` - Play/resume
- `POST /api/spotify/pause` - Pause playback
- `POST /api/spotify/next` - Skip to next track

## WebSocket Events

### Client → Server
- `join_session` - Join a session room
- `leave_session` - Leave a session room

### Server → Client
- `queue_updated` - Queue has changed
- `vote_updated` - Vote count changed
- `now_playing` - Current track updated
- `user_joined` - User joined session
- `user_left` - User left session

## Database Schema

```sql
User
├── id (UUID)
├── spotifyId (String, unique)
├── displayName (String)
├── email (String?)
├── accessToken (String)
├── refreshToken (String)
├── tokenExpiry (DateTime)
└── timestamps

Session
├── id (UUID)
├── code (String, unique, 6 chars)
├── name (String)
├── hostId (UUID) → User
├── isActive (Boolean)
└── timestamps

QueueItem
├── id (UUID)
├── sessionId (UUID) → Session
├── spotifyTrackId (String)
├── trackName (String)
├── trackArtist (String)
├── trackAlbum (String?)
├── trackImage (String?)
├── trackDuration (Int)
├── addedById (UUID) → User
├── voteScore (Int, default 0)
├── played (Boolean, default false)
├── playedAt (DateTime?)
└── createdAt (DateTime)

Vote
├── id (UUID)
├── queueItemId (UUID) → QueueItem
├── userId (UUID) → User
├── voteType (Int: 1 or -1)
└── createdAt (DateTime)
└── UNIQUE(queueItemId, userId)
```

## Tech Stack Details

### Backend Dependencies
- **express** - Web framework
- **socket.io** - WebSocket library
- **@prisma/client** - Database ORM
- **spotify-web-api-node** - Spotify API wrapper
- **express-session** - Session management
- **cors** - CORS middleware
- **dotenv** - Environment variables

### Frontend Dependencies
- **react** - UI library
- **react-router-dom** - Routing
- **@tanstack/react-query** - Data fetching
- **socket.io-client** - WebSocket client
- **axios** - HTTP client
- **lucide-react** - Icons
- **tailwindcss** - Styling

## Security Considerations

1. **Session Management**
   - HTTP-only cookies
   - Secure flag in production
   - Session expiry

2. **Token Handling**
   - Access tokens stored server-side
   - Automatic token refresh
   - Never expose tokens to frontend

3. **Authorization**
   - Middleware checks for authenticated users
   - Host-only actions (delete session, control playback)
   - User can only remove their own tracks

4. **Rate Limiting**
   - Consider adding rate limiting middleware
   - Spotify API has its own rate limits

## Deployment Considerations

### For Production:
1. Use PostgreSQL instead of SQLite
2. Add Redis for session storage
3. Use environment-specific configs
4. **Add SSL/HTTPS (REQUIRED for Spotify OAuth)**
5. Update Spotify redirect URI to use HTTPS
6. Set secure cookie flags
7. Add rate limiting
8. Add error tracking (e.g., Sentry)
9. Use PM2 or similar for process management
10. Set up proper logging

### Important: Spotify OAuth Requirements
- **Development (localhost)**: HTTP is allowed
- **Production**: HTTPS is REQUIRED
- Redirect URI must exactly match between:
  - Spotify Developer Dashboard
  - Your `.env` file
  - Your backend server configuration
