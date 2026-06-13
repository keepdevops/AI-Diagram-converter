// Drives the diagram-agent fix/generate calls (matrix-safe backed) and reduces
// the returned transcript into UI state: a running flag and a log of validation
// attempts plus the final note. Nothing fails silently — errors land in the log
// and the status bar. The bridge is request/response, so there is no token
// stream; the run resolves once when the model + validation loop finishes.

import { useCallback, useRef, useState } from 'react';
import { fix as apiFix, generate as apiGenerate, health } from '../lib/agentClient.js';

let _id = 0;
const nextId = () => ++_id;

export function useAgent({ applyDiagram, setStatus }) {
  const [running, setRunning] = useState(false);
  const [title, setTitle] = useState('Agent');
  const [log, setLog] = useState([]); // { id, text, kind }
  const abortRef = useRef(null);

  const append = useCallback((text, kind = '') => {
    setLog((prev) => [...prev, { id: nextId(), text, kind }]);
  }, []);

  // Turn a transcript ({ ok, diagram, note, attempts }) into log rows + status.
  const renderTranscript = useCallback(
    (t) => {
      for (const a of t.attempts || []) {
        if (a.ok) {
          append(`attempt ${a.iteration}: ✅ valid`, 'ok');
        } else {
          const where = a.error_line ? ` (line ${a.error_line})` : '';
          append(`attempt ${a.iteration}: ❌ ${a.error || 'invalid'}${where}`, 'warn');
        }
      }
      const note = t.note || (t.ok ? 'Done.' : 'Best effort.');
      append(note, t.ok ? 'ok' : 'warn');
      if (t.diagram) applyDiagram(t.diagram);
      setStatus(note, t.ok ? 'ok' : 'warn');
    },
    [append, applyDiagram, setStatus]
  );

  const run = useCallback(
    async (kind, payload) => {
      if (running) return;
      const heading = kind === 'fix' ? 'Fixing' : kind === 'convert' ? 'Converting' : 'Generating';
      setTitle(heading);
      setLog([]);
      setRunning(true);
      setStatus(`${heading} via matrix-safe… (local models can be slow)`, 'info');
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // 'convert' = the editor held a document, not a diagram: generate one
        // from it rather than trying to repair invalid syntax with the Fix loop.
        if (kind === 'convert') append('Editor content looks like a document — generating a diagram from it.', 'info');
        const t =
          kind === 'fix'
            ? await apiFix(payload.text, controller.signal)
            : await apiGenerate(payload.description, payload.type, controller.signal);
        renderTranscript(t);
      } catch (err) {
        if (err.name === 'AbortError') {
          append('cancelled', 'warn');
          setStatus('Cancelled', 'warn');
        } else {
          append(`error: ${err.message}`, 'err');
          setStatus(`Agent error: ${err.message}`, 'error');
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [running, append, renderTranscript, setStatus]
  );

  const fix = useCallback((text) => run('fix', { text }), [run]);
  const generate = useCallback(
    (description, type) => run('generate', { description, type }),
    [run]
  );
  // Convert a pasted document into a diagram (generation, with doc-aware framing).
  const convertDoc = useCallback((text) => run('convert', { description: text }), [run]);
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const checkHealth = useCallback(async () => {
    try {
      return await health();
    } catch (err) {
      console.error('health check failed:', err);
      return null;
    }
  }, []);

  return { running, title, log, fix, generate, convertDoc, cancel, checkHealth };
}
