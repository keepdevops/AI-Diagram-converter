import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api -> the local diagram-agent bridge
// (diagram_agent/server.py, :8770), so the browser talks same-origin and CORS
// stays out of the way. (matrix-safe itself runs on :8765; the bridge fronts it.)
const AGENT = process.env.AGENT_URL || 'http://127.0.0.1:8770';
// Air-gapped preview: when PLANTUML_PROXY is set (see scripts/airgap-dev.sh),
// proxy same-origin /plantuml -> a LOCAL PlantUML renderer so the browser never
// reaches the public plantuml.com. plantuml-server serves /svg at its root, so
// the /plantuml prefix is stripped (mirrors the air-gapped nginx config).
const PLANTUML_PROXY = process.env.PLANTUML_PROXY;

const proxy = {
  '/api': {
    target: AGENT,
    changeOrigin: true,
    configure: (p) => p.on('error', (err) => console.error('[agent proxy]', err.message)),
  },
};
if (PLANTUML_PROXY) {
  proxy['/plantuml'] = {
    target: PLANTUML_PROXY,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/plantuml/, ''),
    configure: (p) => p.on('error', (err) => console.error('[plantuml proxy]', err.message)),
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
});
