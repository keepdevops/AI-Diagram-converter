// `server` renderer: encode the diagram client-side and hand back a URL that
// points at the configured PlantUML render service (proxied same-origin in the
// air-gapped build). Error detection stays with the <img> probe in Preview,
// since the server reports syntax errors as a non-200 on the image request.

import { encodePlantUml } from '../lib/encoder.js';

export const serverRenderer = {
  name: 'server',

  // Returns { url, encoded } for the <img> preview path. Throws on encode
  // failure (caller logs + surfaces it — never silently blank).
  async render(text, { server, format = 'svg' }) {
    const encoded = await encodePlantUml(text);
    const base = server.replace(/\/+$/, '');
    return { url: `${base}/${format}/${encoded}`, encoded };
  },
};
