import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api -> the local diagram-agent bridge
// (diagram_agent/server.py, :8770), so the browser talks same-origin and CORS
// stays out of the way. (matrix-safe itself runs on :8765; the bridge fronts it.)
const AGENT = process.env.AGENT_URL || 'http://127.0.0.1:8770';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: AGENT,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => console.error('[agent proxy]', err.message));
        },
      },
    },
  },
});
