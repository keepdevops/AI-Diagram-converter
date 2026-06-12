// Interactive React Flow canvas: drag nodes (edges reflow), drag a handle to
// connect, inline-rename (custom node), inline edge labels (custom edge),
// Delete/Backspace to remove. Reports the updated model up via onModel. Exposes
// PNG/SVG export of the current arrangement through `exportRef`. RF state resets
// from `model` only when `resetKey` changes (import / auto-layout / add node).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge as rfAddEdge,
  getNodesBounds, getViewportForBounds,
} from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import '@xyflow/react/dist/style.css';
import { toReactFlow, uid } from '../lib/graphModel.js';
import EditableNode from './EditableNode.jsx';
import EditableEdge from './EditableEdge.jsx';

const nodeTypes = { editable: EditableNode };
const edgeTypes = { editable: EditableEdge };
const PAD = 40;

function rfToModel(base, nodes, edges) {
  return {
    ...base,
    nodes: nodes.map((n) => ({
      id: n.id, label: n.data.label, kind: n.data.kind || 'box',
      x: Math.round(n.position.x), y: Math.round(n.position.y),
      w: Math.round(n.measured?.width || n.width || 140),
      h: Math.round(n.measured?.height || n.height || 44),
    })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
      dashed: !!(e.style && e.style.strokeDasharray),
    })),
  };
}

function downloadDataUrl(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

export default function GraphCanvas({ model, resetKey, onModel, exportRef }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const modelRef = useRef(model);
  const rfRef = useRef(null);
  modelRef.current = model;

  const setN = (n) => { nodesRef.current = n; setNodes(n); };
  const setE = (e) => { edgesRef.current = e; setEdges(e); };
  const push = useCallback(
    () => onModel?.(rfToModel(modelRef.current, nodesRef.current, edgesRef.current)),
    [onModel],
  );

  const onRename = useCallback((nid, label) => {
    setN(nodesRef.current.map((n) => (n.id === nid ? { ...n, data: { ...n.data, label } } : n)));
    push();
  }, [push]);
  const onLabel = useCallback((eid, label) => {
    setE(edgesRef.current.map((e) => (e.id === eid ? { ...e, label } : e)));
    push();
  }, [push]);

  // Inject the inline-edit callbacks into RF node/edge data.
  const decorate = useCallback((rf) => ({
    nodes: rf.nodes.map((n) => ({ ...n, data: { ...n.data, onRename } })),
    edges: rf.edges.map((e) => ({ ...e, data: { ...e.data, onLabel } })),
  }), [onRename, onLabel]);

  // Reset from the model only on explicit resets (import / auto-layout / add).
  useEffect(() => {
    const r = decorate(toReactFlow(model));
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
    setE(rfAddEdge({ ...conn, id: uid('e'), type: 'editable', label: '', data: { onLabel } }, edgesRef.current));
    push();
  }, [push, onLabel]);

  // Export the arranged canvas to an image (fit all nodes).
  useEffect(() => {
    if (!exportRef) return;
    const render = (fn, ext, mime) => async () => {
      const inst = rfRef.current;
      if (!inst) return;
      const bounds = getNodesBounds(inst.getNodes());
      const w = Math.max(bounds.width + PAD * 2, 200);
      const h = Math.max(bounds.height + PAD * 2, 150);
      const vp = getViewportForBounds(bounds, w, h, 0.5, 2, PAD);
      const el = document.querySelector('.graph-canvas .react-flow__viewport');
      const dataUrl = await fn(el, {
        backgroundColor: '#2f3147', width: w, height: h,
        style: { width: w, height: h, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      });
      downloadDataUrl(dataUrl, `diagram.${ext}`);
    };
    exportRef.current = {
      toPng: render(toPng, 'png', 'image/png'),
      toSvg: render(toSvg, 'svg', 'image/svg+xml'),
    };
  }, [exportRef]);

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
