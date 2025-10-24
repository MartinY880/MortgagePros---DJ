# 🚀 Deployment Checklist for dj.pros.mortgage

## The Problem
When you click "Connect with Spotify" on https://dj.pros.mortgage, it redirects to `https:///dj.pros.mortgage/undefined`.

This means the backend API call is failing or returning undefined.

---

## Step-by-Step Fix

### 1️⃣ Update Backend Environment Variables

Edit `backend/.env` on your production server:

```env
SPOTIFY_CLIENT_ID=705a066169fa458f870b52cf36808537
SPOTIFY_CLIENT_SECRET=c8bf7494d1ec41a0b156db83ba303178
SPOTIFY_REDIRECT_URI=https://dj.pros.mortgage/api/auth/callback

PORT=5000
NODE_ENV=production
SESSION_SECRET=MySecretKey123ChangeThis
FRONTEND_URL=https://dj.pros.mortgage
DATABASE_URL="file:./dev.db"
```

**Critical Changes:**
- ✅ `SPOTIFY_REDIRECT_URI` must be **HTTPS**
- ✅ `FRONTEND_URL` must match your actual domain

---

### 2️⃣ Update Spotify Developer Dashboard

1. Go to https://developer.spotify.com/dashboard
2. Click on your app
3. Click **"Edit Settings"**
4. Under **"Redirect URIs"**, add:
   ```
   https://dj.pros.mortgage/api/auth/callback
   ```
5. Click **"Save"**

**⚠️ Must be EXACT match with backend .env!**

---

### 3️⃣ Check Where Your Backend Is Hosted

#### Scenario A: Backend at `https://dj.pros.mortgage/api`
If your Node.js backend is accessible at the same domain under `/api`:
- ✅ No additional frontend config needed
- ✅ The proxy setup should work

#### Scenario B: Backend at Different Domain (e.g., `api.pros.mortgage`)
If backend is on a separate domain, create `frontend/.env.production`:
```env
VITE_API_URL=https://api.pros.mortgage/api
VITE_SOCKET_URL=https://api.pros.mortgage
```

---

### 4️⃣ Rebuild Frontend

After making changes:

```powershell
cd frontend
npm run build
```

Then deploy the `frontend/dist` folder to your hosting.

---

### 5️⃣ Restart Backend Server

Make sure your backend server reads the updated `.env`:

```powershell
cd backend
npm run build
npm start
```

Or if using PM2:
```powershell
pm2 restart spotify-jukebox
```

---

### 6️⃣ Test the Endpoints

Open browser console (F12) and test:

**Test 1 - Health Check:**
```
https://dj.pros.mortgage/api/health
```
Should return: `{"status":"ok","timestamp":"..."}`

**Test 2 - Auth Endpoint:**
```
https://dj.pros.mortgage/api/auth/login
```
Should return: `{"authUrl":"https://accounts.spotify.com/authorize?..."}`

If these work, the login button should work!

---

### 7️⃣ Check Browser Console

1. Open https://dj.pros.mortgage
2. Press F12 (open developer tools)
3. Go to **Console** tab
4. Click "Connect with Spotify"
5. Look for errors or the debug log: `Auth response: {...}`

---

## Common Issues & Solutions

### Issue: "Mixed Content" error
**Cause:** Frontend is HTTPS but trying to call HTTP backend  
**Fix:** Make sure backend is HTTPS or use HTTPS proxy

### Issue: "CORS policy" error  
**Cause:** Backend CORS not allowing your frontend domain  
**Fix:** Check `FRONTEND_URL` in backend `.env` matches exactly

### Issue: "net::ERR_CONNECTION_REFUSED"
**Cause:** Backend server not running or not accessible  
**Fix:** Check if backend is running and accessible at `/api`

### Issue: Still shows `undefined`
**Cause:** Backend not returning data in expected format  
**Fix:** 
1. Check backend logs for errors
2. Test `/api/auth/login` directly in browser
3. Check if response has `authUrl` field

---

## Your Server Setup

Please verify:

### Backend:
- [ ] Running on port 5000 (or configured port)
- [ ] Accessible at `https://dj.pros.mortgage/api`
- [ ] OR accessible at different domain (update frontend env)
- [ ] `.env` file has HTTPS redirect URI
- [ ] CORS allows `https://dj.pros.mortgage`

### Frontend:
- [ ] Built with `npm run build`
- [ ] Deployed to web server
- [ ] Serves from `https://dj.pros.mortgage`
- [ ] If backend on different domain, `.env.production` is set

### Spotify Dashboard:
- [ ] Redirect URI added: `https://dj.pros.mortgage/api/auth/callback`
- [ ] EXACTLY matches backend `.env`

---

## Quick Debug Command

Run this in your browser console when on https://dj.pros.mortgage:

```javascript
fetch('/api/auth/login')
  .then(r => r.json())
  .then(data => console.log('Backend response:', data))
  .catch(err => console.error('Backend error:', err));
```

This will show you exactly what the backend is returning.

---

## Need More Help?

Reply with:
1. What do you see in browser console when clicking "Connect with Spotify"?
2. What does `https://dj.pros.mortgage/api/health` return?
3. Where is your backend server hosted?
4. Are frontend and backend on the same domain or different?
