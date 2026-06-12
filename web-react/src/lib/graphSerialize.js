// Serialize the interactive graph model back to PlantUML / Mermaid source
// (structure only — positions live in the .graph.json document, not in these).
// Phase 1: a generic box-and-arrow rendering plus mindmap/sequence specifics.

const aliasOf = (id) => String(id).replace(/[^\w]/g, '_') || 'n';
const q = (s) => `"${String(s).replace(/"/g, "'")}"`;

// PlantUML element keyword per visual shape kind.
const KEYWORD = {
  box: 'rectangle', rounded: 'card', actor: 'actor', database: 'database',
  decision: 'rectangle', package: 'package', note: 'card', component: 'component', node: 'node',
};
const edgeArrow = (e) => {
  const head = e.arrow === false ? '-' : '>';
  const line = (e.line === 'dotted' || e.line === 'dashed' || e.dashed) ? '..' : '--';
  return `${line}${head === '-' ? '' : head}` || '-->';
};

// -- box-and-arrow -----------------------------------------------------------

function boxToPlantuml(model) {
  const out = ['@startuml'];
  for (const n of model.nodes) {
    const kw = KEYWORD[n.kind] || 'rectangle';
    const color = n.color ? ` ${n.color.startsWith('#') ? n.color : `#${n.color}`}` : '';
    const stereo = n.kind === 'decision' ? ' <<decision>>' : '';
    out.push(`${kw} ${q(n.label)} as ${aliasOf(n.id)}${stereo}${color}`);
  }
  if (model.nodes.length && model.edges.length) out.push('');
  for (const e of model.edges) {
    out.push(`${aliasOf(e.source)} ${edgeArrow(e)} ${aliasOf(e.target)}${e.label ? ` : ${e.label}` : ''}`);
  }
  out.push('@enduml');
  return out.join('\n');
}

function boxToMermaid(model) {
  const out = ['flowchart TD'];
  for (const n of model.nodes) out.push(`  ${aliasOf(n.id)}["${n.label}"]`);
  for (const e of model.edges) {
    const arrow = e.dashed ? '-.->' : '-->';
    const lbl = e.label ? `${e.dashed ? '' : ''}${arrow}|${e.label}|` : arrow;
    out.push(`  ${aliasOf(e.source)} ${e.label ? arrow + '|' + e.label + '|' : arrow} ${aliasOf(e.target)}`);
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
