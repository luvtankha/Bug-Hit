import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.BUG_HIT_BACKEND || 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': backend, '/v3/api-docs': backend, '/swagger-ui': backend, '/ws': { target: backend, ws: true, changeOrigin: true, rewriteWsOrigin: true } }
  }
});
