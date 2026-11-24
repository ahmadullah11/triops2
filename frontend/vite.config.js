import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only used by `npm run dev` (running without Docker).
// It mimics what nginx does in the container: strip the /api/<service> prefix
// and forward to the backend. In Docker, nginx does this job instead.
//
// NOTE: the Order container is published on host port 8083 (8082 is taken by an
// unrelated Windows process), so the dev proxy must target 8083, not 8082.
const backend = (target, prefix) => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
});

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/catalog': backend('http://localhost:3000', '/api/catalog'),
      '/api/inventory': backend('http://localhost:8081', '/api/inventory'),
      '/api/orders': backend('http://localhost:8083', '/api/orders'),
    },
  },
});
