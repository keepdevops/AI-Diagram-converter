// Graph editor view: imports the editor diagram into an interactive node/edge
// canvas (drag, connect, inline rename + edge labels, delete). Applies the edited
// structure back to the editor (PlantUML/Mermaid), exports the arranged canvas as
// PNG/SVG, and opens/saves the layout-capable .graph.json (structure + positions).

import { useCallback, useEffect, useRef, useState } from 'react';
import GraphCanvas from './GraphCanvas.jsx';
import { parseGraph } from '../lib/graphParse.js';
import { serializeGraph } from '../lib/graphSerialize.js';
import { autoLayout } from '../lib/graphLayout.js';
import { addNode, uid } from '../lib/graphModel.js';
import { openJsonFile, saveJsonFile } from '../lib/jsonFile.js';

const LS_KEY = 'plantuml-editor.graph';
const APPROX = new Set(['sequence', 'mindmap']);
const dirFor = (type) => (type === 'mindmap' || type === 'wbs' || type === 'sequence' ? 'LR' : 'TB');

export default function GraphView({ text, onApply, setStatus, forceImport, onConsumed }) {
  const [model, setModel] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [target, setTarget] = useState('plantuml');
  const textRef = useRef(text);
  const exportRef = useRef(null);
  const handleRef = useRef(null); // FS handle for re-saving .graph.json
  textRef.current = text;

  const reset = useCallback((m) => { setModel(m); setResetKey((k) => k + 1); }, []);

  const importFromEditor = useCallback(() => {
    const src = textRef.current || '';
    if (!src.trim()) { setStatus?.('Editor is empty — nothing to import', 'warn'); return; }
    try {
      const parsed = parseGraph(src);
      const m = autoLayout(parsed, dirFor(parsed.type));
      if (m.nodes.length === 0) { setStatus?.('No graph-style nodes found in the diagram', 'warn'); return; }
      reset(m);
      setStatus?.(`Imported ${m.nodes.length} nodes, ${m.edges.length} edges (${m.type})`, 'ok');
    } catch (err) {
      console.error('graph import failed:', err);
      setStatus?.(`Import failed: ${err.message}`, 'error');
    }
  }, [reset, setStatus]);

  useEffect(() => {
    // Opened via "Open in graph" from another tab → import the editor diagram fresh
    // (don't restore the previous arrangement). Otherwise restore the last graph.
    if (forceImport) { importFromEditor(); onConsumed?.(); return; }
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try { reset(JSON.parse(saved)); return; } catch (err) { console.error('graph restore failed:', err); }
    }
    importFromEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (model) localStorage.setItem(LS_KEY, JSON.stringify(model)); }, [model]);

  const relayout = () => { if (model) reset(autoLayout(model, dirFor(model.type))); };
  const onAddNode = () => { if (model) reset(addNode(model, 'New', { id: uid('n'), x: 60, y: 60 })); };
  const applyToEditor = () => {
    if (!model) return;
    onApply?.(serializeGraph(model, target));
    setStatus?.(`Applied ${model.type} → ${target} to editor`, 'ok');
  };
  const exportImage = (kind) => {
    const fn = exportRef.current?.[kind === 'png' ? 'toPng' : 'toSvg'];
    if (fn) { fn(); setStatus?.(`Exported ${kind.toUpperCase()}`, 'ok'); }
  };

  const downloadSource = (kind) => {
    if (!model) return;
    const blob = new Blob([serializeGraph(model, kind)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diagram.${kind === 'mermaid' ? 'mmd' : 'puml'}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const openGraph = async () => {
    try {
      const r = await openJsonFile();
      if (!r) return;
      handleRef.current = r.handle;
      reset(r.obj);
      setStatus?.(`Opened ${r.name} (${r.obj.nodes.length} nodes)`, 'ok');
    } catch (err) { console.error('open .graph.json failed:', err); setStatus?.(`Open failed: ${err.message}`, 'error'); }
  };
  const saveGraph = async () => {
    if (!model) return;
    try {
      const r = await saveJsonFile('diagram.graph.json', model, handleRef.current);
      if (!r) return;
      handleRef.current = r.handle;
      setStatus?.(`Saved ${r.name}`, 'ok');
    } catch (err) { console.error('save .graph.json failed:', err); setStatus?.(`Save failed: ${err.message}`, 'error'); }
  };

  return (
    <div className="graphview">
      <div className="convert-bar">
        <button type="button" onClick={importFromEditor}>↻ Import from editor</button>
        <button type="button" onClick={onAddNode} disabled={!model}>+ Node</button>
        <button type="button" onClick={relayout} disabled={!model}>Auto-layout</button>
        <span className="badge ok">{model ? `${model.nodes.length} nodes · ${model.edges.length} edges` : '—'}</span>
        {model && APPROX.has(model.type) && <span className="badge warn" title="Node-editing is best-effort for this type">approx</span>}
        <span className="spacer" />
        <span className="hint">drag · connect via handles · dbl-click to rename/label · ⌫ delete</span>
        <button type="button" onClick={() => exportImage('png')} disabled={!model}>Export PNG</button>
        <button type="button" onClick={() => exportImage('svg')} disabled={!model}>Export SVG</button>
        <button type="button" onClick={openGraph}>Open .json</button>
        <button type="button" onClick={saveGraph} disabled={!model}>Save .json</button>
        <label>
          as
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="plantuml">PlantUML</option>
            <option value="mermaid">Mermaid</option>
          </select>
        </label>
        <button type="button" onClick={() => downloadSource(target)} disabled={!model} title="Download diagram source">↓src</button>
        <button type="button" className="auto-btn" onClick={applyToEditor} disabled={!model}>Apply to editor →</button>
      </div>
      <div className="graph-host">
        {model
          ? <GraphCanvas model={model} resetKey={resetKey} onModel={setModel} exportRef={exportRef} />
          : <div className="preview-empty">Import a diagram to start editing</div>}
      </div>
    </div>
  );
}
