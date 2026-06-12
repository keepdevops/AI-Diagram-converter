// React Flow canvas for the Designer: typed shape nodes, palette drag-drop to add
// nodes, click to select (→ inspector), drag/connect/inline-rename/delete, and
// PNG/SVG export. Reports model changes via onModel; selection via onSelect.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge as rfAddEdge,
  getNodesBounds, getViewportForBounds,
} from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import '@xyflow/react/dist/style.css';
import { toReactFlow, uid } from '../lib/graphModel.js';
import ShapeNode from './ShapeNode.jsx';
import EditableEdge from './EditableEdge.jsx';
import { DRAG_TYPE } from './Palette.jsx';

const nodeTypes = { shape: ShapeNode };
const edgeTypes = { editable: EditableEdge };
const PAD = 40;

function rfToModel(base, nodes, edges) {
  return {
    ...base,
    nodes: nodes.map((n) => ({
      id: n.id, label: n.data.label, kind: n.data.kind || 'box', color: n.data.color || null,
      x: Math.round(n.position.x), y: Math.round(n.position.y),
      w: Math.round(n.measured?.width || n.width || 140),
      h: Math.round(n.measured?.height || n.height || 44),
    })),
    edges: edges.map((e) => {
      const dash = e.style?.strokeDasharray;
      const line = dash === '1 4' ? 'dotted' : dash === '5 4' ? 'dashed' : 'solid';
      return {
        id: e.id, source: e.source, target: e.target,
        label: typeof e.label === 'string' ? e.label : '',
        line, dashed: line !== 'solid', arrow: e.markerEnd != null,
      };
    }),
  };
}

const downloadDataUrl = (dataUrl, name) => {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
};

export default function DesignerCanvas({ model, resetKey, onModel, onSelect, onAddShape, exportRef }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const modelRef = useRef(model);
  const rfRef = useRef(null);
  modelRef.current = model;

  const setN = (n) => { nodesRef.current = n; setNodes(n); };
  const setE = (e) => { edgesRef.current = e; setEdges(e); };
  const push = useCallback(() => onModel?.(rfToModel(modelRef.current, nodesRef.current, edgesRef.current)), [onModel]);

  const onRename = useCallback((nid, label) => {
    setN(nodesRef.current.map((n) => (n.id === nid ? { ...n, data: { ...n.data, label } } : n)));
    push();
  }, [push]);
  const onLabel = useCallback((eid, label) => {
    setE(edgesRef.current.map((e) => (e.id === eid ? { ...e, label } : e)));
    push();
  }, [push]);

  const decorate = useCallback((rf) => ({
    nodes: rf.nodes.map((n) => ({ ...n, data: { ...n.data, onRename } })),
    edges: rf.edges.map((e) => ({ ...e, data: { ...e.data, onLabel } })),
  }), [onRename, onLabel]);

  useEffect(() => {
    const r = decorate(toReactFlow(model, 'shape'));
    setN(r.nodes); setE(r.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onNodesChange = useCallback((chs) => {
    setN(applyNodeChanges(chs, nodesRef.current));
    if (chs.some((c) => (c.type === 'position' && c.dragging === false) || c.type === 'remove')) push();
  }, [push]);
  const onEdgesChange = useCallback((chs) => {
    setE(applyEdgeChanges(chs, edgesRef.current));
    if (chs.some((c) => c.type === 'remove')) push();
  }, [push]);
  const onConnect = useCallback((conn) => {
    setE(rfAddEdge({ ...conn, id: uid('e'), type: 'editable', label: '', markerEnd: { type: 'arrowclosed' }, data: { onLabel } }, edgesRef.current));
    push();
  }, [push, onLabel]);

  const onNodeClick = useCallback((_e, node) => {
    const m = modelRef.current.nodes.find((n) => n.id === node.id);
    if (m) onSelect?.({ kind: 'node', node: m });
  }, [onSelect]);
  const onEdgeClick = useCallback((_e, edge) => {
    const m = modelRef.current.edges.find((x) => x.id === edge.id);
    if (m) onSelect?.({ kind: 'edge', edge: m });
  }, [onSelect]);
  const onPaneClick = useCallback(() => onSelect?.(null), [onSelect]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData(DRAG_TYPE);
    if (!kind || !rfRef.current) return;
    const pos = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onAddShape?.(kind, { x: Math.round(pos.x), y: Math.round(pos.y) });
  }, [onAddShape]);

  useEffect(() => {
    if (!exportRef) return;
    const render = (fn, ext) => async () => {
      const inst = rfRef.current;
      if (!inst) return;
      const bounds = getNodesBounds(inst.getNodes());
      const w = Math.max(bounds.width + PAD * 2, 200);
      const h = Math.max(bounds.height + PAD * 2, 150);
      const vp = getViewportForBounds(bounds, w, h, 0.5, 2, PAD);
      const el = document.querySelector('.designer-canvas .react-flow__viewport');
      const url = await fn(el, { backgroundColor: '#2f3147', width: w, height: h, style: { width: w, height: h, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } });
      downloadDataUrl(url, `diagram.${ext}`);
    };
    exportRef.current = { toPng: render(toPng, 'png'), toSvg: render(toSvg, 'svg') };
  }, [exportRef]);

  return (
    <div className="designer-canvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
