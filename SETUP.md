# 🎵 Spotify Jukebox - Setup Guide

## Quick Start Guide

Follow these steps to get your Spotify Jukebox app running locally!

---

## Step 1: Spotify Developer Setup

1. Go to **https://developer.spotify.com/dashboard**
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the details:
   - **App Name**: Spotify Jukebox (or any name)
   - **App Description**: Collaborative jukebox app
   - **Redirect URI**: `http://localhost:5000/api/auth/callback`
     - ⚠️ **Note**: HTTP is allowed for localhost during development
     - ⚠️ For production, you MUST use HTTPS: `https://yourdomain.com/api/auth/callback`
   - **Web API**: Check this box
5. Click **"Save"**
6. On the app dashboard, note your:
   - **Client ID**
   - **Client Secret** (click "Show Client Secret")

---

## Step 2: Install Dependencies

Open PowerShell and navigate to your project folder:

```powershell
cd "c:\Users\Martin Yousif\VS Code Projects\MortgagePros - DJ"
```

### Backend Setup:
```powershell
cd backend
npm install
```

### Frontend Setup:
```powershell
cd ..\frontend
npm install
```

---

## Step 3: Configure Environment Variables

1. In the `backend` folder, create a `.env` file:

```powershell
cd ..\backend
Copy-Item .env.example .env
```

2. Open `backend\.env` and fill in your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:5000/api/auth/callback

PORT=5000
NODE_ENV=development
SESSION_SECRET=MySecretKey123ChangeThis
FRONTEND_URL=http://localhost:5173
DATABASE_URL="file:./dev.db"
```

⚠️ **Important**: Replace `your_client_id_here` and `your_client_secret_here` with your actual Spotify credentials!

---

## Step 4: Setup Database

```powershell
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

This creates the SQLite database and generates the Prisma client.

---

## Step 5: Run the Application

You'll need **TWO** PowerShell windows:

### Terminal 1 - Backend Server:
```powershell
cd backend
npm run dev
```

You should see: `Server running on http://localhost:5000`

### Terminal 2 - Frontend:
```powershell
cd frontend
npm run dev
```

You should see: `Local: http://localhost:5173`

---

## Step 6: Test the App

1. Open your browser to **http://localhost:5173**
2. Click **"Connect with Spotify"**
3. Log in with your Spotify account
4. Authorize the app
5. You'll be redirected to the Dashboard!

---

## Using the App

### As a Host:
1. Click **"Create Session"**
2. Enter a session name
3. Share the **6-character code** with friends
4. **Important**: Open Spotify on your computer/phone and start playing any song (this activates your device)
5. Control playback from the jukebox!

### As a Guest:
1. Get the session code from the host
2. Click **"Join Session"**
3. Enter the code
4. Search and add songs!
5. Vote on tracks!

---

## Troubleshooting

### "No active device found"
- Open the Spotify app on your computer or phone
- Play any song to activate the device
- The jukebox will now be able to control it

### "Cannot find module" errors
- Make sure you ran `npm install` in both `backend` and `frontend` folders
- Try deleting `node_modules` and running `npm install` again

### Database errors
- Delete `backend/dev.db` and `backend/prisma/migrations` folder
- Run `npx prisma migrate dev --name init` again

### Port already in use
- Close any other apps using port 5000 or 5173
- Or change the ports in `backend\.env` and `frontend\vite.config.ts`

### Authentication errors
- Double-check your Spotify Client ID and Secret in `backend\.env`
- Verify the redirect URI is exactly: `http://localhost:5000/api/auth/callback`
- Check that it's added in your Spotify app dashboard
- **Important**: The redirect URI in your `.env` must EXACTLY match what's in Spotify dashboard (including http/https, port, trailing slashes)
- For localhost development, HTTP is allowed by Spotify
- For production, you MUST use HTTPS

---

## Project Structure

```
MortgagePros - DJ/
├── backend/                    # Express server
│   ├── src/
│   │   ├── config/            # Configuration
│   │   ├── controllers/       # Route handlers
│   │   ├── middleware/        # Auth middleware
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── sockets/           # WebSocket handlers
│   │   ├── types/             # TypeScript types
│   │   └── server.ts          # Entry point
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── .env                   # Environment variables (YOU CREATE THIS)
│   └── package.json
│
├── frontend/                   # React app
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API & Socket services
│   │   ├── types/             # TypeScript types
│   │   ├── App.tsx            # Root component
│   │   └── main.tsx           # Entry point
│   └── package.json
│
└── README.md
```

---

## Features Implemented

✅ Spotify OAuth authentication  
✅ Create and join jukebox sessions  
✅ Search Spotify tracks  
✅ Add songs to queue  
✅ Upvote/downvote tracks  
✅ Real-time queue updates via WebSocket  
✅ Playback controls (play/pause/skip)  
✅ Session codes for easy sharing  
✅ Now playing display  
✅ Vote-based queue ordering  

---

## Next Steps / Future Enhancements

- Add playlist import
- Show vote history
- Add user roles (DJ, guest)
- Vote weight decay over time
- Mobile-responsive improvements
- Dark/light theme toggle
- Song history tracking
- Multi-room support

---

## Need Help?

If you encounter issues:
1. Check the console logs in both terminals
2. Check browser console (F12)
3. Verify all environment variables are set
4. Ensure Spotify app is running on a device
5. Make sure you have Spotify Premium (required for playback control)

---

## Commands Cheat Sheet

```powershell
# Backend
cd backend
npm install              # Install dependencies
npm run dev              # Start dev server
npx prisma studio        # View database GUI
npx prisma generate      # Regenerate Prisma client

# Frontend
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server
npm run build            # Build for production
```

---

## Important Notes

⚠️ **Spotify Premium Required**: You need Spotify Premium to control playback  
⚠️ **Active Device**: Spotify must be open on a device before playback works  
⚠️ **Local Only**: This is configured for local development (localhost)  
⚠️ **Security**: Don't commit your `.env` file with real credentials!

---

Enjoy your Spotify Jukebox! 🎉🎵
