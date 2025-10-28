#!/bin/sh
set -e

echo "🚀 Starting Spotify Jukebox Application..."

# Navigate to backend directory
cd /app/backend

# Ensure SQLite data directory exists (persistent volume may be empty)
mkdir -p /app/backend/data

if [ -d "/app/frontend/dist" ]; then
  echo "🛠️ Generating frontend runtime configuration..."
  node -e "const fs = require('fs'); const path = require('path'); const { config } = require('/app/backend/dist/config/index.js'); const outputPath = '/app/frontend/dist/app-config.json'; const payload = { apiBaseUrl: config.frontend.apiBaseUrl, socketUrl: config.frontend.socketUrl, clerkPublishableKey: config.frontend.clerkPublishableKey }; fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));" && \
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
