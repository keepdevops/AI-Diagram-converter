// Canonical interactive graph model + mutations, decoupled from React Flow so it
// can be parsed/serialized and unit-tested headlessly.
//
//   model = {
//     format: 'plantuml' | 'mermaid',
//     type:   'component' | 'flow' | 'class' | 'state' | 'er' | 'sequence' | 'mindmap' | ...,
//     nodes:  [{ id, label, kind, x, y, w, h }],
//     edges:  [{ id, source, target, label, dashed }],
//   }

let _seq = 0;
export const uid = (p = 'n') => `${p}${Date.now().toString(36)}${(_seq++).toString(36)}`;

export function emptyModel(format = 'plantuml', type = 'component') {
  return { format, type, nodes: [], edges: [] };
}

// Stable id from a label (so the same source parses to the same ids on re-import).
export function nodeId(label) {
  const slug = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return slug || uid('n');
}

export function addNode(model, label = 'Node', extra = {}) {
  const id = extra.id || uid('n');
  const node = { id, label, kind: 'box', x: 0, y: 0, w: 120, h: 44, ...extra };
  return { ...model, nodes: [...model.nodes, node] };
}

export function renameNode(model, id, label) {
  return { ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, label } : n)) };
}

// Remove a node and cascade-delete any edges touching it.
export function removeNode(model, id) {
  return {
    ...model,
    nodes: model.nodes.filter((n) => n.id !== id),
    edges: model.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export function addEdge(model, source, target, extra = {}) {
  if (!source || !target || source === target) return model;
  const id = extra.id || uid('e');
  if (model.edges.some((e) => e.source === source && e.target === target && (e.label || '') === (extra.label || ''))) {
    return model; // avoid duplicates
  }
  return { ...model, edges: [...model.edges, { id, source, target, label: '', dashed: false, ...extra }] };
}

export function removeEdge(model, id) {
  return { ...model, edges: model.edges.filter((e) => e.id !== id) };
}

export function setPositions(model, posById) {
  return {
    ...model,
    nodes: model.nodes.map((n) => (posById[n.id] ? { ...n, ...posById[n.id] } : n)),
  };
}

// -- React Flow adapters -----------------------------------------------------

// `nodeType` lets the Designer use the richer 'shape' node; Graph uses 'editable'.
export function toReactFlow(model, nodeType = 'editable') {
  const nodes = model.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x || 0, y: n.y || 0 },
    data: { label: n.label, kind: n.kind || 'box', color: n.color || null },
    type: nodeType,
  }));
  const edges = model.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'editable', // custom edge: inline label
    label: e.label || '',
    markerEnd: e.arrow === false ? undefined : { type: 'arrowclosed' },
    style: dashFor(e),
  }));
  return { nodes, edges };
}

function dashFor(e) {
  if (e.line === 'dotted') return { strokeDasharray: '1 4' };
  if (e.dashed || e.line === 'dashed') return { strokeDasharray: '5 4' };
  return undefined;
}

// Merge React Flow node positions back into the model (keeps labels/kinds).
export function applyRfPositions(model, rfNodes) {
  const pos = {};
  for (const n of rfNodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
  return setPositions(model, pos);
}
