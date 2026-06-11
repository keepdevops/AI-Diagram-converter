// Render-only Mermaid preview. Used for diagram types the PlantUML server can't
// draw (pie, journey, gitgraph, and any other Mermaid source). Renders client-
// side via mermaid.js, debounced, with explicit error reporting and SVG export.

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import ZoomPane from './ZoomPane.jsx';

// Initialise once. Dark theme matches the app; 'loose' lets labels use richer
// text. startOnLoad off — we drive render() ourselves.
mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

const DEBOUNCE_MS = 400;

export default function MermaidView({ text, onStatus }) {
  const [svg, setSvg] = useState('');
  const idRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!text.trim()) {
      setSvg('');
      onStatus?.('Empty diagram', 'warn');
      return undefined;
    }
    const timer = setTimeout(async () => {
      onStatus?.('Rendering (mermaid)…', 'info');
      try {
        const id = `mmd-${++idRef.current}`;
        const { svg: out } = await mermaid.render(id, text);
        if (!cancelled) {
          setSvg(out);
          onStatus?.('Rendered (mermaid)', 'ok');
        }
      } catch (err) {
        console.error('mermaid render failed:', err);
        if (!cancelled) {
          setSvg('');
          onStatus?.(`Mermaid error: ${err?.message || err}`, 'error');
        }
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text]);

  const downloadSvg = () => {
    if (!svg) { onStatus?.('Nothing to download yet', 'warn'); return; }
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diagram.svg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('svg download failed:', err);
      onStatus?.(`Download failed: ${err.message}`, 'error');
    }
  };

  return (
    <section className="preview-pane mermaid-pane">
      {svg && (
        <button type="button" className="mermaid-dl" onClick={downloadSvg} title="Download SVG">
          ↓ SVG
        </button>
      )}
      {svg ? (
        <ZoomPane resetKey={svg}>
          <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        </ZoomPane>
      ) : (
        <div className="preview-empty">Mermaid preview appears here</div>
      )}
    </section>
  );
}
