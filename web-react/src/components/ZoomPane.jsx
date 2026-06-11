// Reusable zoom + pan container for diagram previews. Wheel zooms toward the
// cursor, drag pans, and the overlay buttons (or double-click) reset. Shared by
// the PlantUML image preview and the Mermaid SVG so both behave identically.
//
// The wheel listener is attached natively with { passive: false } because React's
// synthetic onWheel is passive — e.preventDefault() there is a no-op.

import { useEffect, useRef, useState } from 'react';

const MIN = 0.1;
const MAX = 8;
const clamp = (s) => Math.min(MAX, Math.max(MIN, s));

export default function ZoomPane({ children, resetKey }) {
  const hostRef = useRef(null);
  const contentRef = useRef(null);
  const drag = useRef(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });

  // New diagram -> reset the view so it's framed from the top-left again.
  useEffect(() => { setT({ s: 1, x: 0, y: 0 }); }, [resetKey]);

  // Native, non-passive wheel handler so we can preventDefault and zoom-to-cursor.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setT((prev) => {
        const s = clamp(prev.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        const ratio = s / prev.s;
        return { s, x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setT((prev) => ({
      ...prev,
      x: drag.current.x + (e.clientX - drag.current.px),
      y: drag.current.y + (e.clientY - drag.current.py),
    }));
  };
  const onPointerUp = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const zoomBy = (factor) => setT((prev) => {
    const el = hostRef.current;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const s = clamp(prev.s * factor);
    const ratio = s / prev.s;
    return { s, x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y) };
  });
  const reset = () => setT({ s: 1, x: 0, y: 0 });

  // Scale so the diagram's natural width fills the pane, aligned to the top.
  // offsetWidth is the unscaled layout width (CSS transform doesn't affect it).
  const fitWidth = () => {
    const el = hostRef.current;
    const c = contentRef.current;
    if (!el || !c || !c.offsetWidth) return;
    const rect = el.getBoundingClientRect();
    const s = clamp(rect.width / c.offsetWidth);
    setT({ s, x: (rect.width - c.offsetWidth * s) / 2, y: 0 });
  };

  return (
    <div
      className="zoom-pane"
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={reset}
    >
      <div
        className="zoom-content"
        ref={contentRef}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
      >
        {children}
      </div>
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
        <button type="button" onClick={fitWidth} title="Fit to width">Fit</button>
        <button type="button" onClick={reset} title="Reset (or double-click)">⤢</button>
        <span className="zoom-pct">{Math.round(t.s * 100)}%</span>
      </div>
    </div>
  );
}
