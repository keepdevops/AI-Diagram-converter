// Serialize the interactive graph model back to PlantUML / Mermaid source
// (structure only — positions live in the .graph.json document, not in these).
// Phase 1: a generic box-and-arrow rendering plus mindmap/sequence specifics.

const aliasOf = (id) => String(id).replace(/[^\w]/g, '_') || 'n';
const q = (s) => `"${String(s).replace(/"/g, "'")}"`;

// PlantUML element keyword per visual shape kind.
const KEYWORD = {
  box: 'rectangle', rounded: 'card', actor: 'actor', database: 'database',
  decision: 'rectangle', package: 'package', note: 'note', component: 'component', node: 'node',
};
const edgeArrow = (e) => {
  const head = e.arrow === false ? '' : '>';
  const line = (e.line === 'dotted' || e.line === 'dashed' || e.dashed) ? '..' : '--';
  return `${line}${head}`;
};

// -- box-and-arrow -----------------------------------------------------------

const colorOf = (n) => (n.color ? ` ${n.color.startsWith('#') ? n.color : `#${n.color}`}` : '');

function boxToPlantuml(model) {
  const kindById = Object.fromEntries(model.nodes.map((n) => [n.id, n.kind || 'box']));
  const children = {};       // containerId -> [child nodes]
  const top = [];
  for (const n of model.nodes) {
    if (n.parent) (children[n.parent] ||= []).push(n);
    else top.push(n);
  }

  const out = ['@startuml'];
  const decl = (n, indent) => {
    if (n.kind === 'package') {
      // A package container nests its grouped children inside the braces.
      out.push(`${indent}package ${q(n.label)} as ${aliasOf(n.id)}${colorOf(n)} {`);
      for (const c of (children[n.id] || [])) decl(c, `${indent}  `);
      out.push(`${indent}}`);
    } else {
      const kw = KEYWORD[n.kind] || 'rectangle';
      const stereo = n.kind === 'decision' ? ' <<decision>>' : '';
      out.push(`${indent}${kw} ${q(n.label)} as ${aliasOf(n.id)}${stereo}${colorOf(n)}`);
    }
  };
  for (const n of top) decl(n, '');

  if (model.nodes.length && model.edges.length) out.push('');
  for (const e of model.edges) {
    // Notes attach with a dotted '..' link (no arrowhead), per PlantUML.
    const isNote = kindById[e.source] === 'note' || kindById[e.target] === 'note';
    const conn = isNote ? '..' : edgeArrow(e);
    out.push(`${aliasOf(e.source)} ${conn} ${aliasOf(e.target)}${e.label ? ` : ${e.label}` : ''}`);
  }
  out.push('@enduml');
  return out.join('\n');
}

function boxToMermaid(model) {
  const children = {};       // containerId -> [child nodes]
  const top = [];
  for (const n of model.nodes) {
    if (n.parent) (children[n.parent] ||= []).push(n);
    else top.push(n);
  }
  // A container is any node that actually has children (matches graphModel's
  // isContainer); a lone 'package' shape stays a normal node.
  const containerIds = new Set(Object.keys(children).filter((id) => children[id].length));

  const out = ['flowchart TD'];
  const decl = (n, indent) => {
    if (containerIds.has(n.id)) {
      // Mermaid has no package node — wrap children in a subgraph instead.
      out.push(`${indent}subgraph ${aliasOf(n.id)}["${n.label}"]`);
      for (const c of children[n.id]) decl(c, `${indent}  `);
      out.push(`${indent}end`);
    } else {
      out.push(`${indent}${aliasOf(n.id)}["${n.label}"]`);
    }
  };
  for (const n of top) decl(n, '  ');

  for (const e of model.edges) {
    if (containerIds.has(e.source) || containerIds.has(e.target)) continue;
    const arrow = e.dashed ? '-.->' : '-->';
    const conn = e.label ? `${arrow}|${e.label}|` : arrow;
    out.push(`  ${aliasOf(e.source)} ${conn} ${aliasOf(e.target)}`);
  }
  return out.join('\n');
}

// -- mindmap (rebuild tree from edges) ---------------------------------------

function childrenMap(model) {
  const kids = new Map();
  const hasParent = new Set();
  for (const e of model.edges) {
    if (!kids.has(e.source)) kids.set(e.source, []);
    kids.get(e.source).push(e.target);
    hasParent.add(e.target);
  }
  const roots = model.nodes.filter((n) => !hasParent.has(n.id));
  return { kids, roots };
}

function mindmapToPlantuml(model) {
  const out = ['@startmindmap'];
  const labelOf = Object.fromEntries(model.nodes.map((n) => [n.id, n.label]));
  const { kids, roots } = childrenMap(model);
  const walk = (id, depth) => {
    out.push(`${'*'.repeat(depth)} ${labelOf[id]}`);
    for (const c of kids.get(id) || []) walk(c, depth + 1);
  };
  (roots.length ? roots : model.nodes.slice(0, 1)).forEach((r) => walk(r.id, 1));
  out.push('@endmindmap');
  return out.join('\n');
}

// -- sequence ----------------------------------------------------------------

function sequenceToPlantuml(model) {
  const out = ['@startuml'];
  for (const n of model.nodes) out.push(`participant ${q(n.label)} as ${aliasOf(n.id)}`);
  out.push('');
  for (const e of model.edges) {
    const msg = e.label.replace(/^\d+\.\s*/, ''); // drop the "n. " sequence prefix
    out.push(`${aliasOf(e.source)} ${e.dashed ? '-->' : '->'} ${aliasOf(e.target)}${msg ? ` : ${msg}` : ''}`);
  }
  out.push('@enduml');
  return out.join('\n');
}

function sequenceToMermaid(model) {
  const out = ['sequenceDiagram'];
  for (const n of model.nodes) out.push(`  participant ${aliasOf(n.id)} as ${n.label}`);
  for (const e of model.edges) {
    const msg = e.label.replace(/^\d+\.\s*/, '');
    out.push(`  ${aliasOf(e.source)}${e.dashed ? '-->>' : '->>'}${aliasOf(e.target)}: ${msg}`);
  }
  return out.join('\n');
}

// -- dispatch ----------------------------------------------------------------

export function serializeGraph(model, target = 'plantuml') {
  const toMermaid = target === 'mermaid';
  if (model.type === 'mindmap') {
    return toMermaid
      ? ['mindmap', ...mindmapToPlantuml(model).split('\n').slice(1, -1).map((l) => l.replace(/^(\*+)\s/, (m, s) => '  '.repeat(s.length) + ''))].join('\n')
      : mindmapToPlantuml(model);
  }
  if (model.type === 'sequence') return toMermaid ? sequenceToMermaid(model) : sequenceToPlantuml(model);
  return toMermaid ? boxToMermaid(model) : boxToPlantuml(model);
}
