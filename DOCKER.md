# 🐳 Docker Setup Guide for Spotify Jukebox

This guide explains how to run the Spotify Jukebox application using Docker.

---

## Prerequisites

- Docker installed on your system
- Docker Compose (usually included with Docker Desktop)
- Spotify Developer credentials (Client ID and Secret)

---

## Quick Start

### 1. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example file
cp backend/.env.example .env
```

Edit the `.env` file with your Spotify credentials:

```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:5000/api/auth/callback

# Session Secret (generate a random string)
SESSION_SECRET=your_random_session_secret_here_change_this

# Optional: Override defaults
NODE_ENV=production
FRONTEND_URL=http://localhost:5173
```

⚠️ **Important**: For production deployments, use HTTPS for the redirect URI!

### 2. Build and Run with Docker Compose

```bash
# Build and start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health

---

## Building the Docker Image Manually

### Build the image:

```bash
docker build -t spotify-jukebox:latest .
```

### Run the container:

```bash
docker run -d \
  --name spotify-jukebox \
  -p 5000:5000 \
  -p 5173:5173 \
  -e SPOTIFY_CLIENT_ID=your_client_id \
  -e SPOTIFY_CLIENT_SECRET=your_client_secret \
  -e SPOTIFY_REDIRECT_URI=http://localhost:5000/api/auth/callback \
  -e SESSION_SECRET=your_random_secret \
  -v spotify-jukebox-data:/app/backend/data \
  spotify-jukebox:latest
```

---

## Docker Image Details

### Multi-Stage Build

The Dockerfile uses a multi-stage build to:
1. **Stage 1**: Build the TypeScript backend
2. **Stage 2**: Build the React frontend
3. **Stage 3**: Create a minimal production image with only necessary files

### Exposed Ports

- **5000**: Backend API server and WebSocket connections
- **5173**: Frontend static file server

### Volumes

- `/app/backend/data`: Database persistence (SQLite file)

### Health Check

The container includes a health check that polls the `/api/health` endpoint every 30 seconds.

---

## CI/CD with GitHub Actions

The project includes a GitHub Actions workflow (`.github/workflows/docker-release.yml`) that automatically:

1. ✅ Builds the Docker image on push to `main` or `develop`
2. 📦 Pushes to GitHub Container Registry (ghcr.io)
3. 🏷️ Tags images based on:
   - Branch names
   - Semantic version tags (v1.0.0)
   - Git commit SHA
   - `latest` for the default branch
4. 🔒 Runs security scans with Trivy
5. 🌍 Builds for multiple platforms (amd64, arm64)

### Pulling from GitHub Container Registry

```bash
# Pull the latest image
docker pull ghcr.io/martiny880/mortgagepros---dj:latest

# Run the pulled image
docker run -d \
  --name spotify-jukebox \
  -p 5000:5000 \
  -p 5173:5173 \
  --env-file .env \
  ghcr.io/martiny880/mortgagepros---dj:latest
```

---

## Production Deployment

### Using Docker Compose

For production, update your `.env` file:

```env
NODE_ENV=production
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback
FRONTEND_URL=https://yourdomain.com
SESSION_SECRET=<strong-random-secret>
```

Update `docker-compose.yml` to use a reverse proxy (nginx/traefik) for HTTPS.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | ✅ Yes | - | Spotify API Client ID |
| `SPOTIFY_CLIENT_SECRET` | ✅ Yes | - | Spotify API Client Secret |
| `SPOTIFY_REDIRECT_URI` | ✅ Yes | - | OAuth callback URL |
| `SESSION_SECRET` | ✅ Yes | - | Express session secret |
| `PORT` | No | 5000 | Backend server port |
| `NODE_ENV` | No | production | Environment mode |
| `FRONTEND_URL` | No | http://localhost:5173 | Frontend URL for CORS |
| `DATABASE_URL` | No | file:/app/backend/data/prod.db | Database connection |

---

## Troubleshooting

### View Container Logs

```bash
docker-compose logs -f
```

### Access Container Shell

```bash
docker exec -it spotify-jukebox sh
```

### Check Health Status

```bash
curl http://localhost:5000/api/health
```

### Rebuild After Code Changes

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Issues

If you need to reset the database:

```bash
# Stop the container
docker-compose down

# Remove the volume
docker volume rm mortgagepros---dj_spotify-jukebox-data

# Restart
docker-compose up -d
```

---

## Advanced Configuration

### Custom Nginx Reverse Proxy

Create `nginx.conf`:

```nginx
upstream backend {
    server spotify-jukebox:5000;
}

upstream frontend {
    server spotify-jukebox:5173;
}

server {
    listen 80;
    server_name yourdomain.com;

    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
    }
}
```

---

## Security Best Practices

1. 🔐 **Use strong secrets**: Generate random SESSION_SECRET
2. 🌐 **Enable HTTPS**: Use reverse proxy with SSL in production
3. 🔒 **Secure environment variables**: Use Docker secrets or secure vaults
4. 📦 **Regular updates**: Keep base images and dependencies updated
5. 🛡️ **Scan images**: Use the included security scanning in CI/CD

---

## Support

For issues or questions:
- Check the logs: `docker-compose logs -f`
- Review health status: `curl http://localhost:5000/api/health`
- Ensure all required environment variables are set
- Verify Spotify credentials and redirect URI match your app settings

---

Happy containerizing! 🎵🐳
