// Collapsible panel for an agent run: a scrolling log of validation attempts and
// the final note. Hidden until a run produces output.

import { useEffect, useRef } from 'react';

export default function SwarmLog({ open, title, log, running, onClose, onCancel }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  if (!open) return null;

  return (
    <section className="agent-log">
      <div className="agent-log-head">
        <span className="agent-log-title">
          {title}
          {running && <span className="spinner" aria-label="running" />}
        </span>
        <span className="spacer" />
        {running && (
          <button type="button" className="link" onClick={onCancel} title="Stop the run">
            Stop
          </button>
        )}
        <button type="button" className="icon" onClick={onClose} title="Hide">
          ×
        </button>
      </div>
      <div className="agent-log-body" ref={bodyRef}>
        {log.map((row) => (
          <div key={row.id} className={`agent-log-row ${row.kind}`.trim()}>
            {row.text}
          </div>
        ))}
      </div>
    </section>
  );
}
