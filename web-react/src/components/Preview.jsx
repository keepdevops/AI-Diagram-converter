// Live diagram preview. Debounces the text, then delegates to the active renderer
// module (web-react/src/renderers). The `server` module returns a URL we probe via
// <img> (a render failure surfaces as a status, not a broken image); future
// `bridge`/`client` modules return an inline SVG string instead.

import { useEffect, useRef, useState } from 'react';
import { getRenderer } from '../renderers/index.js';
import ZoomPane from './ZoomPane.jsx';

const DEBOUNCE_MS = 500;

// Kept for App's "open render in a new tab" action (server-style URL).
export function imageUrl(server, format, encoded) {
  return `${server.replace(/\/+$/, '')}/${format}/${encoded}`;
}

export default function Preview({ text, server, format, onStatus, onEncoded }) {
  const [src, setSrc] = useState('');
  const [svg, setSvg] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!text.trim()) {
      onStatus?.('Empty diagram', 'warn');
      return undefined;
    }
    const renderer = getRenderer();
    timerRef.current = setTimeout(async () => {
      onStatus?.('Rendering…', 'info');
      let result;
      try {
        result = await renderer.render(text, { server, format: 'svg' });
      } catch (err) {
        console.error('render failed:', err);
        onStatus?.(`Render error: ${err.message}`, 'error');
        return;
      }
      if (result.error) {
        console.error('renderer reported error:', result.error);
        onStatus?.(result.error.message || 'Render failed', 'error');
        return;
      }
      if (result.encoded) onEncoded?.(result.encoded);

      // Inline-SVG renderers (bridge/client): inject directly.
      if (result.svg != null) {
        setSvg(result.svg);
        setSrc('');
        onStatus?.('Rendered', 'ok');
        return;
      }

      // URL renderers (server): probe the image so failures surface as status.
      const url = result.url;
      const probe = new Image();
      probe.onload = () => {
        setSvg('');
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

  const hasContent = svg || src;
  return (
    <section className="preview-pane">
      {hasContent ? (
        <ZoomPane resetKey={svg ? 'svg' : src}>
          {svg ? (
            <div className="preview-img" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <img className="preview-img" src={src} alt="Diagram preview" draggable={false} />
          )}
        </ZoomPane>
      ) : (
        <div className="preview-empty">Preview appears here</div>
      )}
    </section>
  );
}
