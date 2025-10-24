# Production Deployment Guide - dj.pros.mortgage

## Critical Changes Needed for Production

### 1. Update Backend Environment Variables

Edit `backend/.env`:

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

**Key Changes:**
- `SPOTIFY_REDIRECT_URI` → Must use HTTPS
- `FRONTEND_URL` → Your production domain
- `NODE_ENV` → Set to `production`

---

### 2. Update Spotify Developer Dashboard

1. Go to https://developer.spotify.com/dashboard
2. Open your app
3. Click **"Edit Settings"**
4. Under **Redirect URIs**, add:
   ```
   https://dj.pros.mortgage/api/auth/callback
   ```
5. Click **"Save"**

**Important:** The redirect URI must EXACTLY match what's in your `.env` file!

---

### 3. Update Frontend API Configuration

The issue is that the frontend is trying to call `/api/auth/login` but doesn't know where your backend is hosted.

#### Option A: Frontend and Backend on Same Domain (Recommended)

If your backend is accessible at `https://dj.pros.mortgage/api`, the current setup should work.

#### Option B: Backend on Different Domain

If your backend is on a different domain (e.g., `https://api.pros.mortgage`), update:

**File: `frontend/src/services/api.ts`**

Change line 3-6 from:
```typescript
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});
```

To:
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://dj.pros.mortgage/api',
  withCredentials: true,
});
```

Then create `frontend/.env.production`:
```env
VITE_API_URL=https://your-backend-domain.com/api
```

---

### 4. Update Socket.io Connection

**File: `frontend/src/services/socket.ts`**

Change line 8 from:
```typescript
this.socket = io('http://localhost:5000', {
```

To:
```typescript
this.socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
```

---

### 5. Fix CORS Configuration

**File: `backend/src/server.ts`**

The CORS is currently set to `config.server.frontendUrl` which should work, but make sure it's reading from your updated `.env` file.

---

## Quick Fix for Your Current Issue

Since you're getting `undefined`, the most likely cause is that the backend API call is failing. 

### Debugging Steps:

1. **Check if backend is running:**
   ```powershell
   # Test the health endpoint
   curl https://dj.pros.mortgage/api/health
   ```

2. **Check browser console (F12):**
   - Look for network errors
   - Check if `/api/auth/login` returns 200 or an error

3. **Check backend logs:**
   - Look for any errors when the endpoint is hit

### Immediate Fix - Hardcode the Check:

**Update `frontend/src/pages/LandingPage.tsx`:**

```typescript
import { Music } from 'lucide-react';
import { authApi } from '../services/api';

export default function LandingPage() {
  const handleLogin = async () => {
    try {
      const response = await authApi.getAuthUrl();
      console.log('Auth response:', response.data); // Add this for debugging
      
      if (response.data && response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        console.error('No authUrl in response:', response);
        alert('Failed to get Spotify login URL. Check console for details.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to connect to backend. Check if the server is running.');
    }
  };

  return (
    // ... rest of component
```

---

## Production Checklist

- [ ] Backend `.env` updated with HTTPS URLs
- [ ] Spotify Developer Dashboard has HTTPS redirect URI
- [ ] Frontend API base URL configured
- [ ] Socket.io connection URL updated
- [ ] Backend server is running and accessible
- [ ] HTTPS/SSL certificate is properly configured
- [ ] CORS allows your frontend domain
- [ ] Database is initialized (run migrations)
- [ ] NODE_ENV set to 'production'

---

## Common Production Issues

### Issue 1: "Invalid redirect_uri"
**Solution:** Make sure the redirect URI in Spotify Dashboard EXACTLY matches your `.env`

### Issue 2: "CORS error"
**Solution:** Check that `FRONTEND_URL` in backend `.env` matches your actual frontend domain

### Issue 3: "Cannot connect to backend"
**Solution:** Verify backend is running and accessible at `/api` endpoint

### Issue 4: Cookie issues
**Solution:** Make sure cookies have `secure: true` and `sameSite: 'none'` for HTTPS

---

## Testing Production Setup

1. **Test backend health:**
   ```
   https://dj.pros.mortgage/api/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

2. **Test auth endpoint:**
   ```
   https://dj.pros.mortgage/api/auth/login
   ```
   Should return: `{"authUrl":"https://accounts.spotify.com/authorize?..."}`

3. **Test frontend loads:**
   ```
   https://dj.pros.mortgage
   ```
   Should show landing page

4. **Test login flow:**
   - Click "Connect with Spotify"
   - Should redirect to Spotify login
   - After login, should return to dashboard

---

Need help with a specific step? Let me know!
