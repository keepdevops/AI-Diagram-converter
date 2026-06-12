// Parse PlantUML / Mermaid source into the interactive graph model. Phase 1
// targets box-and-arrow diagrams (component, deployment, flow, class, state, ER,
// usecase, object); sequence/mindmap are handled best-effort. Reuses the type
// detectors from convert.js.

import { detectFormat } from './mdBlocks.js';
import { detectPlantumlType, detectMermaidType } from './convert.js';
import { emptyModel, nodeId } from './graphModel.js';

const strip = (code) =>
  (code || '')
    .replace(/@start\w+.*\n?/i, '')
    .replace(/@end\w+.*\n?/i, '')
    .split('\n')
    .map((l) => l.replace(/^\s*'.*$/, '').trimEnd()) // drop puml line comments
    .filter((l) => l.trim() && !/^%%/.test(l.trim()) && !/^(skinparam|title|hide|scale|@|note|end note|left to right|top to bottom)/i.test(l.trim()));

// A connector that joins two operands (longest, most-specific first).
const ARROW = '(?:<\\|--|--\\|>|\\|\\|--o\\{|\\}o--\\|\\||<\\.\\.|\\.\\.>|<--|-->|<-|->|\\*--|--\\*|o--|--o|--|\\.\\.+|==+>|<==+|==+)';
// One operand: [Label] | "Label" | (usecase) | id | id[Label] | id[(DB)] | id{Q} | id((X))
const OPND = '(\\[[^\\]]+\\]|"[^"]+"|\\w+(?:[\\[({]+[^\\]})]*[\\])}]+)?|\\([^)]+\\))';
const EDGE_RE = new RegExp(`^${OPND}\\s*${ARROW}(?:\\|([^|]*)\\|)?\\s*${OPND}\\s*(?::\\s*(.*))?$`);

const DECL_RE = /^(?:abstract\s+)?(component|node|rectangle|package|cloud|folder|frame|database|queue|artifact|card|class|state|object|usecase|participant|actor|entity|interface|boundary|control|collections)\s+("[^"]+"|\w+)(?:\s+as\s+(\w+))?/i;

// Extract { id, label } from one operand token, or null.
function operand(tok) {
  const t = (tok || '').trim();
  let m;
  if ((m = t.match(/^\[(.+)\]$/))) return { id: nodeId(m[1]), label: m[1].trim() };
  if ((m = t.match(/^\((.+)\)$/))) return { id: nodeId(m[1]), label: m[1].trim() };
  if ((m = t.match(/^"(.+)"$/))) return { id: nodeId(m[1]), label: m[1].trim() };
  if ((m = t.match(/^(\w+)\s*[[({]+\s*["']?(.+?)["']?\s*[\])}]+$/))) return { id: m[1], label: m[2].replace(/^[([{]+|[)\]}]+$/g, '').trim() };
  if ((m = t.match(/^(\w+)$/))) return { id: m[1], label: m[1] };
  return null;
}

const isDashed = (arrow) => /\.\./.test(arrow);

// PlantUML grouping keywords map to our visual container kinds (cloud/folder/
// frame have no shape of their own → render as a package container).
const CONTAINER_KIND = {
  package: 'package', node: 'node', component: 'component',
  cloud: 'package', folder: 'package', frame: 'package', rectangle: 'package',
};

// Generic box-and-arrow parser shared by most diagram types. A brace-depth stack
// tracks `package { … }` nesting so children get a `parent` (→ Designer groups).
function parseBoxArrow(code, format, type) {
  const model = emptyModel(format, type);
  const byId = new Map();
  const stack = []; // ids of the open container(s), innermost last
  const ensure = (op, isDecl = false, kind = 'box') => {
    if (!op) return null;
    const existing = byId.get(op.id);
    if (existing) {
      if (isDecl && op.label) existing.label = op.label;
      return existing;
    }
    const node = { id: op.id, label: op.label, kind, x: 0, y: 0, w: 120, h: 44 };
    if (stack.length) node.parent = stack[stack.length - 1];
    byId.set(op.id, node);
    model.nodes.push(node);
    return node;
  };

  for (const raw of strip(code)) {
    const line = raw.trim();
    if (line === '}') { stack.pop(); continue; }
    if (line === '{') continue;
    if (/\{$/.test(line)) {
      const decl = line.match(DECL_RE);          // e.g. package "X" as Y {
      if (decl) {
        const kind = CONTAINER_KIND[decl[1].toLowerCase()] || 'package';
        const id = decl[3] || nodeId(decl[2].replace(/"/g, ''));
        const node = ensure({ id, label: decl[2].replace(/"/g, '') }, true, kind);
        if (node) { node.kind = kind; stack.push(node.id); }
      }
      continue;
    }
    const em = line.match(EDGE_RE);
    const connectorish = em && /[-.=]/.test(line.slice(em[1].length).split(em[3])[0] || '');
    if (em && connectorish) {
      const a = operand(em[1]);
      const b = operand(em[3]);
      if (a && b) {
        ensure(a); ensure(b);
        const arrow = line.replace(em[1], '').replace(em[3], '');
        const label = (em[2] || em[4] || '').trim(); // mermaid |label| or : label
        model.edges.push({ id: `e_${a.id}_${b.id}_${model.edges.length}`, source: a.id, target: b.id, label, dashed: isDashed(arrow) });
        continue;
      }
    }
    const dm = line.match(DECL_RE);
    if (dm) { ensure({ id: dm[3] || nodeId(dm[2].replace(/"/g, '')), label: dm[2].replace(/"/g, '') }, true); continue; }
    const bm = line.match(/^\[([^\]]+)\]$/);      // standalone [Component]
    if (bm) { ensure({ id: nodeId(bm[1]), label: bm[1].trim() }, true); continue; }
    const cm = line.match(/^class\s+("[^"]+"|\w+)/i); // class without relations handled above
    if (cm) ensure({ id: nodeId(cm[1].replace(/"/g, '')), label: cm[1].replace(/"/g, '') }, true);
  }
  return model;
}

// Mindmap: '*'/'**' levels -> tree nodes + parent->child edges.
function parseMindmap(code, format) {
  const model = emptyModel(format, 'mindmap');
  const stack = [];
  for (const raw of strip(code)) {
    const m = raw.trim().match(/^([*+-]+)\s*(.*)$/);
    if (!m) continue;
    const depth = m[1].length;
    const label = m[2].replace(/^\(\(|\)\)$/g, '').trim();
    const node = { id: `mm_${model.nodes.length}`, label, kind: 'box', x: 0, y: 0, w: 120, h: 44 };
    model.nodes.push(node);
    stack.length = depth - 1;
    const parent = stack[depth - 2];
    if (parent) model.edges.push({ id: `e${model.edges.length}`, source: parent.id, target: node.id, label: '', dashed: false });
    stack[depth - 1] = node;
  }
  return model;
}

// Sequence: participants -> nodes; messages -> ordered edges (best-effort).
function parseSequence(code, format) {
  const model = emptyModel(format, 'sequence');
  const byId = new Map();
  const ensure = (id, label) => {
    if (!byId.has(id)) { const n = { id, label: label || id, kind: 'actor', x: 0, y: 0, w: 120, h: 44 }; byId.set(id, n); model.nodes.push(n); }
    return byId.get(id);
  };
  let seq = 0;
  for (const raw of strip(code)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^(?:participant|actor|boundary|database|control)\s+"?([^"]+?)"?\s+as\s+(\w+)/i))) { ensure(m[2], m[1]); continue; }
    if ((m = line.match(/^(?:participant|actor|boundary|database|control)\s+(\w+)/i))) { ensure(m[1], m[1]); continue; }
    if ((m = line.match(/^(\w+)\s*(--?>>?|->>?)\s*(\w+)\s*:?\s*(.*)$/))) {
      ensure(m[1]); ensure(m[3]);
      model.edges.push({ id: `e${seq}`, source: m[1], target: m[3], label: `${++seq}. ${m[4].trim()}`.trim(), dashed: /--/.test(m[2]) });
    }
  }
  return model;
}

// Top-level: detect format + type and dispatch.
export function parseGraph(source) {
  const text = source || '';
  const format = detectFormat(text) === 'mermaid' ? 'mermaid' : 'plantuml';
  let type = format === 'mermaid' ? detectMermaidType(text) : detectPlantumlType(text);
  // The `A --> B : label` heuristic over-claims sequence for box diagrams that
  // use bare aliases (e.g. our own serialized output). Only treat it as sequence
  // when there are real sequence signals.
  if (type === 'sequence' && !/\b(participant|actor|boundary|control)\b/i.test(text)
      && /(\brectangle\b|\bcomponent\b|\bnode\b|\bclass\b|\bstate\b|\[)/i.test(text)) {
    type = 'component';
  }
  if (type === 'mindmap') return parseMindmap(text, format);
  if (type === 'sequence') return parseSequence(text, format);
  return parseBoxArrow(text, format, type === 'flow' ? 'flow' : type);
}
