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

// -- container grouping ------------------------------------------------------

const GROUP_PAD = 24;
const GROUP_HEADER = 26;
export const isContainer = (model, id) => model.nodes.some((n) => n.parent === id);

// Wrap the given top-level nodes in a new package container that bounds them.
export function groupNodes(model, ids) {
  const sel = model.nodes.filter((n) => ids.includes(n.id) && !n.parent && !isContainer(model, n.id));
  if (sel.length < 1) return model;
  const minX = Math.min(...sel.map((n) => n.x || 0));
  const minY = Math.min(...sel.map((n) => n.y || 0));
  const maxX = Math.max(...sel.map((n) => (n.x || 0) + (n.w || 140)));
  const maxY = Math.max(...sel.map((n) => (n.y || 0) + (n.h || 44)));
  const cid = uid('g');
  const container = {
    id: cid, label: 'Group', kind: 'package', color: null,
    x: minX - GROUP_PAD, y: minY - GROUP_PAD - GROUP_HEADER,
    w: (maxX - minX) + 2 * GROUP_PAD, h: (maxY - minY) + 2 * GROUP_PAD + GROUP_HEADER,
  };
  const idset = new Set(sel.map((n) => n.id));
  const nodes = model.nodes.map((n) => (idset.has(n.id) ? { ...n, parent: cid } : n));
  return { ...model, nodes: [container, ...nodes] };
}

// Dissolve a container: detach its children (positions are already absolute in
// the model) and remove the container node + any edges touching it.
export function ungroupNode(model, cid) {
  return {
    ...model,
    nodes: model.nodes.filter((n) => n.id !== cid).map((n) => (n.parent === cid ? { ...n, parent: undefined } : n)),
    edges: model.edges.filter((e) => e.source !== cid && e.target !== cid),
  };
}

// -- React Flow adapters -----------------------------------------------------

// `nodeType` lets the Designer use the richer 'shape' node; Graph uses 'editable'.
// Container (package-with-children) nodes become React Flow group nodes; their
// children get parentId + relative positions so they move/stay together.
export function toReactFlow(model, nodeType = 'editable') {
  const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  const containerIds = new Set(model.nodes.filter((n) => isContainer(model, n.id)).map((n) => n.id));
  const ordered = [
    ...model.nodes.filter((n) => containerIds.has(n.id)), // parents first
    ...model.nodes.filter((n) => !containerIds.has(n.id)),
  ];
  const nodes = ordered.map((n) => {
    const isCont = containerIds.has(n.id);
    const parent = n.parent ? byId[n.parent] : null;
    const pos = parent
      ? { x: (n.x || 0) - (parent.x || 0), y: (n.y || 0) - (parent.y || 0) }
      : { x: n.x || 0, y: n.y || 0 };
    const node = {
      id: n.id, position: pos,
      data: { label: n.label, kind: n.kind || 'box', color: n.color || null },
      type: isCont ? 'group' : nodeType,
    };
    if (n.parent) { node.parentId = n.parent; node.extent = 'parent'; }
    if (isCont) node.style = { width: n.w || 220, height: n.h || 160 };
    return node;
  });
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
