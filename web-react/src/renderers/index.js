// Renderer registry. The active PlantUML renderer module is chosen at build time
// via VITE_RENDERER (default 'server'). Both shipped PlantUML topologies — an
// external render service ('server') and the in-bridge jar/picoweb ('bridge') —
// speak the same /svg/{encoded} HTTP contract, so both use this `server` renderer
// (the difference is deployment, not frontend code). An in-browser PlantUML
// renderer was evaluated and descoped (plantuml.js is PNG-only/heavy); the seam
// below stays open for it. The contract every renderer honors is:
//
//   render(text, { server, format }) -> Promise<{ url?, svg?, error? }>
//     url   — preview via <img src> (server module)
//     svg   — inline SVG string (bridge/client modules, later)
//     error — { message, line? } when the renderer itself rejects the input

import { serverRenderer } from './serverRenderer.js';

const REGISTRY = {
  server: serverRenderer,
};

const REQUESTED = import.meta.env.VITE_RENDERER || 'server';

export function getRenderer() {
  const renderer = REGISTRY[REQUESTED];
  if (!renderer) {
    // Fail loudly but keep the editor usable with the default.
    console.error(
      `Unknown VITE_RENDERER="${REQUESTED}"; falling back to "server". ` +
        `Known: ${Object.keys(REGISTRY).join(', ')}`
    );
    return serverRenderer;
  }
  return renderer;
}

export function activeRendererName() {
  return REGISTRY[REQUESTED] ? REQUESTED : 'server';
}
