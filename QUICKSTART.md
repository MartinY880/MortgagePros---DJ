# Quick Start Commands

## First Time Setup

```powershell
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies
cd ..\frontend
npm install

# 3. Setup environment variables (edit .env after copying)
cd ..\backend
Copy-Item .env.example .env

# 4. Initialize database
npx prisma migrate dev --name init
npx prisma generate
```

## Running the App

**You need TWO terminal windows:**

### Terminal 1 - Backend
```powershell
cd backend
npm run dev
```

### Terminal 2 - Frontend
```powershell
cd frontend
npm run dev
```

Then open: **http://localhost:5173**

## Useful Commands

### Backend
```powershell
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Run production build
npx prisma studio    # Open database GUI
npx prisma generate  # Regenerate Prisma client
npx prisma migrate dev --name <name>  # Create new migration
```

### Frontend
```powershell
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## Troubleshooting

### Reset Database
```powershell
cd backend
Remove-Item dev.db -Force
Remove-Item -Recurse prisma\migrations -Force
npx prisma migrate dev --name init
npx prisma generate
```

### Clean Install
```powershell
# Backend
cd backend
Remove-Item -Recurse node_modules -Force
npm install

# Frontend
cd ..\frontend
Remove-Item -Recurse node_modules -Force
npm install
```

### Check What's Running on Ports
```powershell
# Check port 5000 (backend)
netstat -ano | findstr :5000

# Check port 5173 (frontend)
netstat -ano | findstr :5173

# Kill process by PID (if needed)
taskkill /PID <pid_number> /F
```

## Development Workflow

1. **Start both servers** (backend and frontend)
2. **Open browser** to http://localhost:5173
3. **Make changes** to code
4. **Hot reload** will automatically refresh
5. **Check console logs** in both terminals for errors

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can click "Connect with Spotify"
- [ ] OAuth redirects successfully
- [ ] Dashboard loads after login
- [ ] Can create a session
- [ ] Session code is displayed
- [ ] Can join session with code
- [ ] Can search for songs
- [ ] Can add songs to queue
- [ ] Can vote on songs (up/down)
- [ ] Queue updates in real-time
- [ ] Can see "Now Playing" (if Spotify is active)
- [ ] Can control playback (play/pause/skip)

## Environment Variables (backend/.env)

```env
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
SPOTIFY_REDIRECT_URI=http://localhost:5000/api/auth/callback
PORT=5000
NODE_ENV=development
SESSION_SECRET=<any random string>
FRONTEND_URL=http://localhost:5173
DATABASE_URL="file:./dev.db"
# Optional Librespot receiver settings
# LIBRESPOT_ENABLED=true
# LIBRESPOT_DEVICE_NAME=MortgagePros DJ
# LIBRESPOT_TRANSFER_ON_QUEUE=true
# LIBRESPOT_DISCOVERY_TIMEOUT_MS=15000
# LIBRESPOT_BACKEND=rodio
# LIBRESPOT_BITRATE=160
```

## Git Commands (if you want to version control)

```powershell
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Spotify Jukebox"

# Create .gitignore (already created for you!)
# Make sure .env is NOT committed!
```

## Pro Tips

1. **Keep Spotify open** on your device before testing playback
2. **Check browser console** (F12) for frontend errors
3. **Check terminal output** for backend errors
4. **Use Prisma Studio** to view/edit database: `npx prisma studio`
5. **Premium required** - Spotify Premium is needed for playback control
6. **Active device** - Start playing a song in Spotify to activate device
7. **Headless playback** - Enable `LIBRESPOT_ENABLED=true` to run the bundled Librespot Spotify Connect receiver and avoid keeping a Spotify app open.

## Next Steps

After getting it running:
- Customize the styling in frontend components
- Add more features (see ARCHITECTURE.md)
- Deploy to a server for public access
- Add analytics or error tracking
- Implement additional Spotify features
