// Horizontal split with a draggable gutter between two panes. The left pane's
// width (as a %) is persisted to localStorage; double-clicking the gutter resets
// to 50/50. During a drag, pane pointer events are disabled so the cursor doesn't
// get captured by the CodeMirror editor or the preview underneath.

import { useEffect, useRef, useState } from 'react';

export default function Split({ storageKey = 'split', min = 15, children }) {
  const ref = useRef(null);
  const [left, setLeft] = useState(() => {
    const v = parseFloat(localStorage.getItem(storageKey));
    return Number.isFinite(v) ? v : 50;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => { localStorage.setItem(storageKey, String(left)); }, [left, storageKey]);

  const onPointerDown = (e) => {
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const rect = ref.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeft(Math.min(100 - min, Math.max(min, pct)));
  };
  const onPointerUp = (e) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const [a, b] = children;
  return (
    <div className={`split${dragging ? ' dragging' : ''}`} ref={ref}>
      <div className="split-pane" style={{ width: `${left}%` }}>{a}</div>
      <div
        className="split-gutter"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setLeft(50)}
      />
      <div className="split-pane split-grow">{b}</div>
    </div>
  );
}
