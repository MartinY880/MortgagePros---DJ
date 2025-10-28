import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const candidateEnvFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
];

const shouldUseProjectRootEnv = candidateEnvFiles.some((file) => fs.existsSync(path.join(projectRoot, file)));

const resolvedEnvDir = shouldUseProjectRootEnv ? projectRoot : __dirname;

export default defineConfig({
  envDir: resolvedEnvDir,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
