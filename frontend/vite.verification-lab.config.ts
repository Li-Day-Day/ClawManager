import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate dev-only entry: no production API proxy or live feature flags.
export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.VERIFICATION_LAB_CACHE || 'node_modules/.verification-lab-cache',
  server: {
    host: '127.0.0.1', port: 19032, strictPort: true,
    proxy: { '^/verification-lab/': { target: 'http://127.0.0.1:19031', changeOrigin: true } },
  },
});
