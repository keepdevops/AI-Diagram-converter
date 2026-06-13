// Auto-layout the graph model with dagre (the source has no coordinates). Fills
// each node's x/y (top-left, for React Flow) plus w/h. Pure aside from dagre.

import dagre from '@dagrejs/dagre';
import { isContainer, GROUP_PAD, GROUP_HEADER } from './graphModel.js';

export function autoLayout(model, dir = 'TB') {
  const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  const containerIds = new Set(model.nodes.filter((n) => isContainer(model, n.id)).map((n) => n.id));

  // Lay out only the leaf nodes; containers are sized to bound their children.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of model.nodes) {
    if (containerIds.has(n.id)) continue;
    g.setNode(n.id, { width: n.w || 140, height: n.h || 48 });
  }
  for (const e of model.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const map = new Map(model.nodes.map((n) => {
    const p = g.node(n.id);
    // dagre gives center coords; React Flow wants top-left.
    return [n.id, p ? { ...n, x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2), w: p.width, h: p.height } : { ...n }];
  }));

  // Size containers bottom-up (deepest first) so nested groups bound correctly.
  const depth = (id) => { let d = 0, p = byId[id]?.parent; while (p) { d++; p = byId[p]?.parent; } return d; };
  for (const cid of [...containerIds].sort((a, b) => depth(b) - depth(a))) {
    const kids = model.nodes.filter((k) => k.parent === cid).map((k) => map.get(k.id));
    if (!kids.length) continue;
    const minX = Math.min(...kids.map((k) => k.x ?? 0));
    const minY = Math.min(...kids.map((k) => k.y ?? 0));
    const maxX = Math.max(...kids.map((k) => (k.x ?? 0) + (k.w || 140)));
    const maxY = Math.max(...kids.map((k) => (k.y ?? 0) + (k.h || 44)));
    map.set(cid, {
      ...map.get(cid),
      x: minX - GROUP_PAD, y: minY - GROUP_PAD - GROUP_HEADER,
      w: (maxX - minX) + 2 * GROUP_PAD, h: (maxY - minY) + 2 * GROUP_PAD + GROUP_HEADER,
    });
  }
  return { ...model, nodes: model.nodes.map((n) => map.get(n.id)) };
}
