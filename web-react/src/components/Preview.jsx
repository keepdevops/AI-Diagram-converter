// Live PlantUML preview. Debounces the diagram text, encodes it client-side, and
// loads the image from the configured PlantUML server. Probes the image first so
// a render failure surfaces as a status instead of a broken <img>.

import { useEffect, useRef, useState } from 'react';
import { encodePlantUml } from '../lib/encoder.js';
import ZoomPane from './ZoomPane.jsx';

const DEBOUNCE_MS = 500;

export function imageUrl(server, format, encoded) {
  return `${server.replace(/\/+$/, '')}/${format}/${encoded}`;
}

export default function Preview({ text, server, format, onStatus, onEncoded }) {
  const [src, setSrc] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!text.trim()) {
      onStatus?.('Empty diagram', 'warn');
      return undefined;
    }
    timerRef.current = setTimeout(async () => {
      onStatus?.('Rendering…', 'info');
      let encoded;
      try {
        encoded = await encodePlantUml(text);
      } catch (err) {
        console.error('encode failed:', err);
        onStatus?.(`Encode error: ${err.message}`, 'error');
        return;
      }
      onEncoded?.(encoded);
      const url = imageUrl(server, 'svg', encoded);
      const probe = new Image();
      probe.onload = () => {
        setSrc(url);
        onStatus?.('Rendered', 'ok');
      };
      probe.onerror = () => {
        console.error('preview image failed:', url);
        onStatus?.('Render failed — check syntax or server URL', 'error');
      };
      probe.src = url;
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
    // format is intentionally excluded: it only affects download/open, not preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, server]);

  return (
    <section className="preview-pane">
      {src ? (
        <ZoomPane resetKey={src}>
          <img className="preview-img" src={src} alt="Diagram preview" draggable={false} />
        </ZoomPane>
      ) : (
        <div className="preview-empty">Preview appears here</div>
      )}
    </section>
  );
}
