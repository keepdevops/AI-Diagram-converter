// Visual diagram designer: a shape palette (left), an interactive canvas (center),
// and a styling inspector (right). Drag shapes on, drag to move (edges reflow),
// connect by handles, select to style (color/shape/arrow), undo/redo, then Apply
// to the editor as PlantUML/Mermaid or save the layout as .graph.json.

import { useCallback, useEffect, useRef, useState } from 'react';
import DesignerCanvas from './DesignerCanvas.jsx';
import Palette from './Palette.jsx';
import Inspector from './Inspector.jsx';
import { parseGraph } from '../lib/graphParse.js';
import { serializeGraph } from '../lib/graphSerialize.js';
import { autoLayout } from '../lib/graphLayout.js';
import { addNode, removeNode, removeEdge, groupNodes, ungroupNode, isContainer, uid } from '../lib/graphModel.js';
import { openJsonFile, saveJsonFile } from '../lib/jsonFile.js';

const LS_KEY = 'plantuml-editor.designer';
const HIST_MAX = 60;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function DesignerView({ text, onApply, setStatus }) {
  const [model, setModel] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [target, setTarget] = useState('plantuml');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const exportRef = useRef(null);
  const handleRef = useRef(null);
  const modelRef = useRef(null);
  const hist = useRef({ stack: [], idx: -1 });
  const textRef = useRef(text);
  modelRef.current = model;
  textRef.current = text;

  const syncHist = () => { const h = hist.current; setCanUndo(h.idx > 0); setCanRedo(h.idx < h.stack.length - 1); };

  // Fresh document → reset history to this single baseline.
  const setBaseline = useCallback((m) => {
    hist.current = { stack: [m], idx: 0 };
    setModel(m); setResetKey((k) => k + 1); setSelected(null); syncHist();
  }, []);

  // Record an edit. `reset` re-renders the canvas (false for canvas-originated
  // changes, which already reflect the edit).
  const commit = useCallback((m, { reset = true } = {}) => {
    const h = hist.current;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(m);
    if (h.stack.length > HIST_MAX) h.stack.shift();
    h.idx = h.stack.length - 1;
    setModel(m);
    if (reset) setResetKey((k) => k + 1);
    syncHist();
  }, []);

  const stepTo = useCallback((idx) => {
    const h = hist.current;
    h.idx = idx;
    setModel(h.stack[idx]); setResetKey((k) => k + 1); setSelected(null); syncHist();
  }, []);
  const undo = useCallback(() => { const h = hist.current; if (h.idx > 0) stepTo(h.idx - 1); }, [stepTo]);
  const redo = useCallback(() => { const h = hist.current; if (h.idx < h.stack.length - 1) stepTo(h.idx + 1); }, [stepTo]);

  const importFromEditor = useCallback(() => {
    const src = textRef.current || '';
    if (!src.trim()) { setStatus?.('Editor is empty — nothing to import', 'warn'); return; }
    try {
      const m = autoLayout(parseGraph(src));
      setBaseline(m);
      setStatus?.(`Imported ${m.nodes.length} nodes, ${m.edges.length} edges`, 'ok');
    } catch (err) {
      console.error('designer import failed:', err);
      setStatus?.(`Import failed: ${err.message}`, 'error');
    }
  }, [setBaseline, setStatus]);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { try { setBaseline(JSON.parse(saved)); return; } catch (err) { console.error(err); } }
    importFromEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (model) localStorage.setItem(LS_KEY, JSON.stringify(model)); }, [model]);

  // Undo/redo keyboard shortcuts (DesignerView is mounted only on its tab).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Canvas drag/connect/delete — record but don't reset the canvas.
  const onModel = useCallback((m) => commit(m, { reset: false }), [commit]);

  const onAddShape = useCallback((kind, pos) => {
    const id = uid('n');
    const m = addNode(modelRef.current, cap(kind), { id, kind, color: null, x: pos.x, y: pos.y });
    commit(m);
    setSelected({ kind: 'node', node: m.nodes[m.nodes.length - 1] });
  }, [commit]);

  const patchNode = useCallback((id, patch) => {
    const m = { ...modelRef.current, nodes: modelRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
    commit(m);
    setSelected((s) => (s?.kind === 'node' && s.node.id === id ? { kind: 'node', node: m.nodes.find((n) => n.id === id) } : s));
  }, [commit]);

  const patchEdge = useCallback((id, patch) => {
    const m = { ...modelRef.current, edges: modelRef.current.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    commit(m);
    setSelected((s) => (s?.kind === 'edge' && s.edge.id === id ? { kind: 'edge', edge: m.edges.find((e) => e.id === id) } : s));
  }, [commit]);

  const onDelete = useCallback(() => {
    if (!selected) return;
    const m = selected.kind === 'node'
      ? removeNode(modelRef.current, selected.node.id)
      : removeEdge(modelRef.current, selected.edge.id);
    commit(m); setSelected(null);
  }, [selected, commit]);

  // Group: wrap 2+ selected free nodes in a container. Ungroup: dissolve the
  // selected container (its children become free again).
  const groupable = selectedIds.filter((id) => {
    const n = modelRef.current?.nodes.find((x) => x.id === id);
    return n && !n.parent && !(model && isContainer(model, id));
  });
  const selContainer = selected?.kind === 'node' && model && isContainer(model, selected.node.id);
  const onGroup = useCallback(() => {
    if (groupable.length < 2) return;
    const m = groupNodes(modelRef.current, groupable);
    commit(m);
    setSelected({ kind: 'node', node: m.nodes[0] }); // select the new container
    setSelectedIds([]);
  }, [groupable, commit]);
  const onUngroup = useCallback(() => {
    if (!selContainer) return;
    commit(ungroupNode(modelRef.current, selected.node.id));
    setSelected(null); setSelectedIds([]);
  }, [selContainer, selected, commit]);

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
      handleRef.current = r.handle; setBaseline(r.obj);
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
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">↷</button>
        <button type="button" onClick={() => model && commit(autoLayout(modelRef.current))} disabled={!model}>Auto-layout</button>
        <button type="button" onClick={onGroup} disabled={groupable.length < 2} title="Group selected into a container">⊞ Group</button>
        <button type="button" onClick={onUngroup} disabled={!selContainer} title="Dissolve the selected container">⊟ Ungroup</button>
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
            ? <DesignerCanvas model={model} resetKey={resetKey} onModel={onModel} onSelect={setSelected} onSelectIds={setSelectedIds} onAddShape={onAddShape} exportRef={exportRef} />
            : <div className="preview-empty">Import a diagram or drag a shape to start</div>}
        </div>
        <Inspector selected={selected} onNode={patchNode} onEdge={patchEdge} onDelete={onDelete} />
      </div>
    </div>
  );
}
