// Visual diagram designer: a shape palette (left), an interactive canvas (center),
// and a styling inspector (right). Drag shapes on, drag to move (edges reflow),
// connect by handles, select to style (color/shape/arrow), then Apply to the
// editor as PlantUML/Mermaid or save the layout as .graph.json.

import { useCallback, useEffect, useRef, useState } from 'react';
import DesignerCanvas from './DesignerCanvas.jsx';
import Palette from './Palette.jsx';
import Inspector from './Inspector.jsx';
import { parseGraph } from '../lib/graphParse.js';
import { serializeGraph } from '../lib/graphSerialize.js';
import { autoLayout } from '../lib/graphLayout.js';
import { addNode, removeNode, removeEdge, uid } from '../lib/graphModel.js';
import { openJsonFile, saveJsonFile } from '../lib/jsonFile.js';

const LS_KEY = 'plantuml-editor.designer';
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function DesignerView({ text, onApply, setStatus }) {
  const [model, setModel] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [target, setTarget] = useState('plantuml');
  const exportRef = useRef(null);
  const handleRef = useRef(null);
  const modelRef = useRef(null);
  const textRef = useRef(text);
  modelRef.current = model;
  textRef.current = text;

  const reset = useCallback((m) => { setModel(m); setResetKey((k) => k + 1); }, []);

  const importFromEditor = useCallback(() => {
    const src = textRef.current || '';
    if (!src.trim()) { setStatus?.('Editor is empty — nothing to import', 'warn'); return; }
    try {
      const m = autoLayout(parseGraph(src));
      reset(m); setSelected(null);
      setStatus?.(`Imported ${m.nodes.length} nodes, ${m.edges.length} edges`, 'ok');
    } catch (err) {
      console.error('designer import failed:', err);
      setStatus?.(`Import failed: ${err.message}`, 'error');
    }
  }, [reset, setStatus]);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { try { reset(JSON.parse(saved)); return; } catch (err) { console.error(err); } }
    importFromEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (model) localStorage.setItem(LS_KEY, JSON.stringify(model)); }, [model]);

  // Canvas drag/connect/delete edits — update model without resetting the canvas.
  const onModel = useCallback((m) => setModel(m), []);

  const onAddShape = useCallback((kind, pos) => {
    const id = uid('n');
    const m = addNode(modelRef.current, cap(kind), { id, kind, color: null, x: pos.x, y: pos.y });
    reset(m);
    setSelected({ kind: 'node', node: m.nodes[m.nodes.length - 1] });
  }, [reset]);

  const patchNode = useCallback((id, patch) => {
    const m = { ...modelRef.current, nodes: modelRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
    reset(m);
    setSelected((s) => (s?.kind === 'node' && s.node.id === id ? { kind: 'node', node: m.nodes.find((n) => n.id === id) } : s));
  }, [reset]);

  const patchEdge = useCallback((id, patch) => {
    const m = { ...modelRef.current, edges: modelRef.current.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    reset(m);
    setSelected((s) => (s?.kind === 'edge' && s.edge.id === id ? { kind: 'edge', edge: m.edges.find((e) => e.id === id) } : s));
  }, [reset]);

  const onDelete = useCallback(() => {
    if (!selected) return;
    const m = selected.kind === 'node'
      ? removeNode(modelRef.current, selected.node.id)
      : removeEdge(modelRef.current, selected.edge.id);
    reset(m); setSelected(null);
  }, [selected, reset]);

  const applyToEditor = () => {
    if (!model) return;
    onApply?.(serializeGraph(model, target));
    setStatus?.(`Applied → ${target} to editor`, 'ok');
  };
  const exportImage = (k) => exportRef.current?.[k === 'png' ? 'toPng' : 'toSvg']?.();

  const openGraph = async () => {
    try {
      const r = await openJsonFile();
      if (!r) return;
      handleRef.current = r.handle; reset(r.obj); setSelected(null);
      setStatus?.(`Opened ${r.name}`, 'ok');
    } catch (err) { console.error(err); setStatus?.(`Open failed: ${err.message}`, 'error'); }
  };
  const saveGraph = async () => {
    if (!model) return;
    try {
      const r = await saveJsonFile('diagram.graph.json', model, handleRef.current);
      if (r) { handleRef.current = r.handle; setStatus?.(`Saved ${r.name}`, 'ok'); }
    } catch (err) { console.error(err); setStatus?.(`Save failed: ${err.message}`, 'error'); }
  };

  return (
    <div className="designer">
      <div className="convert-bar">
        <button type="button" onClick={importFromEditor}>↻ Import</button>
        <button type="button" onClick={() => model && reset(autoLayout(modelRef.current))} disabled={!model}>Auto-layout</button>
        <span className="badge ok">{model ? `${model.nodes.length} nodes · ${model.edges.length} edges` : '—'}</span>
        <span className="spacer" />
        <button type="button" onClick={() => exportImage('png')} disabled={!model}>Export PNG</button>
        <button type="button" onClick={() => exportImage('svg')} disabled={!model}>Export SVG</button>
        <button type="button" onClick={openGraph}>Open .json</button>
        <button type="button" onClick={saveGraph} disabled={!model}>Save .json</button>
        <label>as
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="plantuml">PlantUML</option>
            <option value="mermaid">Mermaid</option>
          </select>
        </label>
        <button type="button" className="auto-btn" onClick={applyToEditor} disabled={!model}>Apply to editor →</button>
      </div>
      <div className="designer-body">
        <Palette />
        <div className="designer-stage">
          {model
            ? <DesignerCanvas model={model} resetKey={resetKey} onModel={onModel} onSelect={setSelected} onAddShape={onAddShape} exportRef={exportRef} />
            : <div className="preview-empty">Import a diagram or drag a shape to start</div>}
        </div>
        <Inspector selected={selected} onNode={patchNode} onEdge={patchEdge} onDelete={onDelete} />
      </div>
    </div>
  );
}
