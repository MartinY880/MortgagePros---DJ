import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
];

const envPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
const rawFrontendOrigins = process.env.FRONTEND_ORIGINS;

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, '').toLowerCase();
const normalizeUrl = (url: string) => url.replace(/\/+$/, '');

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (typeof value === 'undefined' || value === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) {
    return false;
  }

  return defaultValue;
};
const originCandidates: Array<string | undefined> = [
  rawFrontendUrl,
  ...(rawFrontendOrigins ? rawFrontendOrigins.split(',') : []),
  !rawFrontendUrl && !rawFrontendOrigins ? 'http://localhost:5173' : undefined,
];

const frontendOrigins = originCandidates
  .map((origin) => origin?.trim() ?? '')
  .filter((origin) => origin.length > 0);

const uniqueFrontendOrigins = Array.from(new Set(frontendOrigins.map(normalizeOrigin)));

if (uniqueFrontendOrigins.length === 0) {
  throw new Error('At least one FRONTEND_URL/FRONTEND_ORIGINS value must be provided');
}

const primaryFrontendUrl = rawFrontendUrl && rawFrontendUrl.length > 0
  ? normalizeOrigin(rawFrontendUrl)
  : uniqueFrontendOrigins[0];

const apiBaseUrlCandidate = process.env.FRONTEND_API_BASE_URL
  ? normalizeUrl(process.env.FRONTEND_API_BASE_URL)
  : undefined;

const socketUrlCandidate = process.env.FRONTEND_SOCKET_URL
  ? normalizeUrl(process.env.FRONTEND_SOCKET_URL)
  : undefined;

const apiBaseUrl = apiBaseUrlCandidate ?? '/api';

const deriveSocketUrl = () => {
  if (socketUrlCandidate) {
    return socketUrlCandidate;
  }

  if (apiBaseUrl.startsWith('http') && apiBaseUrl.endsWith('/api')) {
    return apiBaseUrl.slice(0, -4);
  }

  if (apiBaseUrl.startsWith('/')) {
    return '/';
  }

  return apiBaseUrl;
};

const socketUrl = deriveSocketUrl();

const frontendClerkPublishableKey = process.env.FRONTEND_CLERK_PUBLISHABLE_KEY
  || process.env.CLERK_PUBLISHABLE_KEY;

if (!frontendClerkPublishableKey) {
  throw new Error('Missing frontend Clerk publishable key. Set FRONTEND_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY.');
}

export const config = {
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID!,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI!,
  },
  librespot: {
    enabled: parseBoolean(process.env.LIBRESPOT_ENABLED, false),
    deviceName: process.env.LIBRESPOT_DEVICE_NAME?.trim() || 'MortgagePros DJ',
    transferOnQueue: parseBoolean(process.env.LIBRESPOT_TRANSFER_ON_QUEUE, true),
    discoveryTimeoutMs: Number.parseInt(process.env.LIBRESPOT_DISCOVERY_TIMEOUT_MS || '15000', 10),
  },
  server: {
    port: parseInt(process.env.PORT || '5000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: primaryFrontendUrl,
    frontendOrigins: uniqueFrontendOrigins,
  },
  session: {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  },
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
  },
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
    secretKey: process.env.CLERK_SECRET_KEY!,
  },
  frontend: {
    apiBaseUrl,
    socketUrl,
    clerkPublishableKey: frontendClerkPublishableKey!,
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REDIRECT_URI',
  'SESSION_SECRET',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
