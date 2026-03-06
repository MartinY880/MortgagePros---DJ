#!/bin/sh
set -e

echo "🚀 Starting Spotify Jukebox Application..."

# Navigate to backend directory
cd /app/backend

# Ensure SQLite data directory exists (persistent volume may be empty)
mkdir -p /app/backend/data

should_enable_librespot() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    "1"|"true"|"yes"|"on"|"y") return 0 ;;
    *) return 1 ;;
  esac
}

if should_enable_librespot "${LIBRESPOT_ENABLED:-}"; then
  echo "🎧 Starting librespot Spotify Connect receiver..."
  mkdir -p /app/librespot-cache

  LIBRESPOT_ARGS="--name \"${LIBRESPOT_DEVICE_NAME:-MortgagePros DJ}\" --cache /app/librespot-cache"

  if [ -n "${LIBRESPOT_BACKEND}" ]; then
    LIBRESPOT_ARGS="$LIBRESPOT_ARGS --backend ${LIBRESPOT_BACKEND}"
  fi

  if [ -n "${LIBRESPOT_BITRATE}" ]; then
    LIBRESPOT_ARGS="$LIBRESPOT_ARGS --bitrate ${LIBRESPOT_BITRATE}"
  fi

  if [ -n "${LIBRESPOT_USERNAME}" ] && [ -n "${LIBRESPOT_PASSWORD}" ]; then
    LIBRESPOT_ARGS="$LIBRESPOT_ARGS --username ${LIBRESPOT_USERNAME} --password ${LIBRESPOT_PASSWORD}"
    echo "   ↳ Using direct credentials for librespot login"
  else
    echo "   ↳ No credentials provided; waiting for Zeroconf pairing"
  fi

  if should_enable_librespot "${LIBRESPOT_DISABLE_DISCOVERY:-}"; then
    LIBRESPOT_ARGS="$LIBRESPOT_ARGS --disable-discovery"
  fi

  if [ -n "${LIBRESPOT_EXTRA_ARGS}" ]; then
    LIBRESPOT_ARGS="$LIBRESPOT_ARGS ${LIBRESPOT_EXTRA_ARGS}"
  fi

  if ! command -v librespot >/dev/null 2>&1; then
    echo "⚠️  librespot binary not found on PATH; skipping receiver startup."
  else
    # shellcheck disable=SC2086
    sh -c "librespot $LIBRESPOT_ARGS" > /app/librespot.log 2>&1 &
    LIBRESPOT_PID=$!
    echo "   ↳ librespot process started with PID ${LIBRESPOT_PID}"
  fi
else
  echo "ℹ️  Librespot disabled. Set LIBRESPOT_ENABLED=true to enable the managed Spotify Connect receiver."
fi

if [ -d "/app/frontend/dist" ]; then
  echo "🛠️ Generating frontend runtime configuration..."
  node -e "const fs = require('fs'); const path = require('path'); const { config } = require('/app/backend/dist/config/index.js'); const outputPath = '/app/frontend/dist/app-config.json'; const payload = { apiBaseUrl: config.frontend.apiBaseUrl, socketUrl: config.frontend.socketUrl, logtoEndpoint: config.frontend.logtoEndpoint, logtoAppId: config.frontend.logtoAppId, logtoApiResource: config.frontend.logtoApiResource }; fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));" && \
  echo "✅ Frontend config written to /app/frontend/dist/app-config.json" || \
  echo "⚠️ Failed to generate frontend runtime config";
fi

echo "📦 Running Prisma migrations..."
npx prisma migrate deploy || {
  echo "⚠️ Migration failed, attempting to push schema..."
  npx prisma db push --skip-generate || echo "⚠️ Schema push failed, continuing anyway..."
}

echo "✅ Database setup complete"

# Start the backend server in the background
echo "🎵 Starting backend server on port 5000..."
node dist/server.js &
BACKEND_PID=$!

# Function to handle shutdown
shutdown() {
  echo "🛑 Shutting down gracefully..."
  kill -TERM "$BACKEND_PID" 2>/dev/null || true
  if [ ! -z "$FRONTEND_PID" ]; then
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ ! -z "$LIBRESPOT_PID" ]; then
    kill -TERM "$LIBRESPOT_PID" 2>/dev/null || true
  fi
  wait
  exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Start a simple static file server for frontend on port 5173
if [ -d "/app/frontend/dist" ]; then
  echo "🌐 Starting frontend server on port 5173..."
  cd /app/frontend
  serve -s dist --listen tcp://0.0.0.0:5173 --no-port-switching &
  FRONTEND_PID=$!
  echo "✅ Frontend server started"
else
  echo "⚠️ Frontend build not found, skipping frontend server"
fi

echo "✨ Application is ready!"
echo "   Backend API: http://localhost:5000"
echo "   Frontend: http://localhost:5173"
echo "   Health check: http://localhost:5000/api/health"

# Wait for backend process
wait $BACKEND_PID
