# Multi-stage Dockerfile for Spotify Jukebox App

# Stage 0: Build Librespot binary
FROM rustlang/rust:nightly-alpine3.19 AS librespot-builder

ARG LIBRESPOT_REPO=https://github.com/librespot-org/librespot.git
ARG LIBRESPOT_REF=master

RUN apk add --no-cache \
  git \
  build-base \
  clang \
  openssl-dev \
  openssl \
  alsa-lib-dev \
  alsa-lib \
  pkgconfig

WORKDIR /opt/librespot

RUN git clone --depth 1 --branch ${LIBRESPOT_REF} ${LIBRESPOT_REPO} .
ENV RUSTFLAGS="-C target-feature=-crt-static"

RUN cargo +nightly build --release --locked --bin librespot

# Stage 1: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install dependencies
RUN npm install

# Install missing type definitions
RUN npm install --save-dev @types/spotify-web-api-node || true

# Set Prisma to use binary targets compatible with Alpine/musl
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

# Copy backend source
COPY backend/prisma ./prisma
COPY backend/src ./src

# Generate Prisma client
RUN npx prisma generate --generator client

# Build TypeScript
RUN npm run build

# Stage 2: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.js ./
COPY frontend/.env.production ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY frontend/src ./src
COPY frontend/index.html ./

# Build frontend
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling, OpenSSL for Prisma, and audio deps for librespot
RUN apk add --no-cache dumb-init openssl libssl3 alsa-lib

# Install static file server globally to avoid runtime downloads
RUN npm install --global serve

WORKDIR /app

# Copy backend built files and dependencies
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/prisma ./backend/prisma

# Copy frontend built files
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure database directory exists even before volume mounts
RUN mkdir -p /app/backend/data
RUN mkdir -p /app/librespot-cache

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy librespot binary
COPY --from=librespot-builder /opt/librespot/target/release/librespot /usr/local/bin/librespot

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001 && \
  chown -R nodejs:nodejs /app

USER nodejs
ENV NODE_ENV=production

# Expose ports
# 5000 - Backend API and WebSocket
# 5173 - Frontend (will be served by a simple static server)
EXPOSE 5000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run entrypoint script
CMD ["/usr/local/bin/docker-entrypoint.sh"]
