// Auto-layout the graph model with dagre (the source has no coordinates). Fills
// each node's x/y (top-left, for React Flow) plus w/h. Pure aside from dagre.

import dagre from '@dagrejs/dagre';

export function autoLayout(model, dir = 'TB') {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of model.nodes) {
    g.setNode(n.id, { width: n.w || 140, height: n.h || 48 });
  }
  for (const e of model.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const nodes = model.nodes.map((n) => {
    const p = g.node(n.id);
    // dagre gives center coords; React Flow wants top-left.
    return p ? { ...n, x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2), w: p.width, h: p.height } : n;
  });
  return { ...model, nodes };
}
