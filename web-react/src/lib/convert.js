// Deterministic PlantUML <-> Mermaid conversion for the common diagram types.
// Sequence, class, and state map almost 1:1; flowchart/activity and component
// are best-effort. Lines that have no safe mapping are emitted as TODO comments
// in the target's comment syntax — never silently dropped (fail loudly).

import {
  pumlErToMermaid, mermaidErToPuml, pumlMindmapToMermaid, mermaidMindmapToPuml,
} from './convertExtra.js';

// ---- type detection --------------------------------------------------------

export function detectPlantumlType(code) {
  const t = code.toLowerCase();
  if (/@startmindmap/.test(t)) return 'mindmap';
  if (/\bentity\s+\w/.test(t) || /\|\|--|\}o--|--o\{/.test(t)) return 'er';
  if (/\bobject\s+\w/.test(t)) return 'object';
  if (/\busecase\b|\(\w[^)]*\)\s*(as|<--|-->)/.test(t)) return 'usecase';
  if (/\bclass\s+\w/.test(t)) return 'class';
  if (/\[\*\]/.test(t) || /\bstate\s+\w/.test(t)) return 'state';
  if (/(^|\n)\s*(start\b|stop\b|:.*;|if\s*\()/.test(t)) return 'activity';
  if (/(^|\n)\s*(participant|actor|database|boundary)\b/.test(t) || /\w\s*--?>\s*\w.*:/.test(t)) return 'sequence';
  if (/\[[^\]]+\]/.test(t) || /\bcomponent\b|\bpackage\b/.test(t)) return 'component';
  return 'sequence';
}

export function detectMermaidType(code) {
  const head = code.split('\n').find((l) => l.trim())?.trim().toLowerCase() || '';
  if (head.startsWith('sequencediagram')) return 'sequence';
  if (head.startsWith('classdiagram')) return 'class';
  if (head.startsWith('statediagram')) return 'state';
  if (head.startsWith('erdiagram')) return 'er';
  if (head.startsWith('mindmap')) return 'mindmap';
  if (head.startsWith('flowchart') || head.startsWith('graph')) return 'flow';
  return 'flow';
}

const stripFences = (code) =>
  code.replace(/@start\w+.*\n?/i, '').replace(/@end\w+.*\n?/i, '').trim();

const lines = (code) => stripFences(code).split('\n');
const todoP = (l) => `' TODO: review — ${l.trim()}`;
const todoM = (l) => `%% TODO: review — ${l.trim()}`;

// ---- PlantUML -> Mermaid ---------------------------------------------------

function pumlSequenceToMermaid(code) {
  const out = ['sequenceDiagram'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if ((m = l.match(/^title\s+(.*)/i))) { out.push(`  %% ${m[1]}`); continue; }
    if (/^skinparam|^autonumber/i.test(l)) { out.push(`  %% ${l}`); continue; }
    if ((m = l.match(/^participant\s+"([^"]+)"\s+as\s+(\w+)/i))) { out.push(`  participant ${m[2]} as ${m[1]}`); continue; }
    if ((m = l.match(/^(participant|actor)\s+(.+)/i))) { out.push(`  ${m[1].toLowerCase()} ${m[2].replace(/"/g, '')}`); continue; }
    if ((m = l.match(/^note\s+(left|right)\s+of\s+(\w+)\s*:\s*(.*)/i))) { out.push(`  Note ${m[1]} of ${m[2]}: ${m[3]}`); continue; }
    if ((m = l.match(/^note\s+over\s+([\w, ]+)\s*:\s*(.*)/i))) { out.push(`  Note over ${m[1]}: ${m[2]}`); continue; }
    if ((m = l.match(/^(\w+)\s*(-+)>{1,2}\s*(\w+)\s*:\s*(.*)/))) {
      const arrow = m[2].includes('--') ? '-->>' : '->>';
      out.push(`  ${m[1]}${arrow}${m[3]}: ${m[4]}`);
      continue;
    }
    out.push(`  ${todoM(l)}`);
  }
  return out.join('\n');
}

function pumlClassToMermaid(code) {
  const out = ['classDiagram'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l || /^title/i.test(l)) { if (/^title/i.test(l)) out.push(`  %% ${l.replace(/^title\s*/i, '')}`); continue; }
    out.push(`  ${l}`); // class bodies + relations are largely shared syntax
  }
  return out.join('\n');
}

function pumlStateToMermaid(code) {
  const out = ['stateDiagram-v2'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l) continue;
    if (/^title/i.test(l)) { out.push(`  %% ${l.replace(/^title\s*/i, '')}`); continue; }
    out.push(`  ${l}`); // [*] --> S and S --> T : e are identical in both
  }
  return out.join('\n');
}

function pumlComponentToMermaid(code) {
  const out = ['flowchart TD'];
  const id = (s) => s.trim().replace(/[^\w]/g, '_');
  for (const raw of lines(code)) {
    const l = raw.trim();
    let m;
    if (!l || /^title/i.test(l)) continue;
    if ((m = l.match(/^(?:package|node|cloud|rectangle)\s+"?([^"{]+)"?\s*\{?/i))) { out.push(`  subgraph ${id(m[1])}["${m[1].trim()}"]`); continue; }
    if (l === '}') { out.push('  end'); continue; }
    if ((m = l.match(/^\[([^\]]+)\]\s*-+>\s*\[([^\]]+)\]/))) { out.push(`  ${id(m[1])}["${m[1]}"] --> ${id(m[2])}["${m[2]}"]`); continue; }
    if ((m = l.match(/^\[([^\]]+)\]/))) { out.push(`  ${id(m[1])}["${m[1]}"]`); continue; }
    out.push(`  ${todoM(l)}`);
  }
  return out.join('\n');
}

export function plantumlToMermaid(code, type = detectPlantumlType(code)) {
  switch (type) {
    case 'class':
    case 'object': return pumlClassToMermaid(code);
    case 'state': return pumlStateToMermaid(code);
    case 'er': return pumlErToMermaid(code);
    case 'mindmap': return pumlMindmapToMermaid(code);
    case 'component':
    case 'usecase':
    case 'activity': return pumlComponentToMermaid(code);
    default: return pumlSequenceToMermaid(code);
  }
}

// ---- Mermaid -> PlantUML ---------------------------------------------------

function mermaidSequenceToPuml(code) {
  const out = ['@startuml'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l || /^sequencediagram/i.test(l)) continue;
    let m;
    if ((m = l.match(/^%%\s*(.*)/))) { out.push(`title ${m[1]}`); continue; }
    if ((m = l.match(/^participant\s+(\w+)\s+as\s+(.+)/i))) { out.push(`participant "${m[2]}" as ${m[1]}`); continue; }
    if ((m = l.match(/^(participant|actor)\s+(.+)/i))) { out.push(`${m[1]} ${m[2]}`); continue; }
    if ((m = l.match(/^Note\s+(left|right)\s+of\s+(\w+):\s*(.*)/i))) { out.push(`note ${m[1]} of ${m[2]}: ${m[3]}`); continue; }
    if ((m = l.match(/^Note\s+over\s+([\w, ]+):\s*(.*)/i))) { out.push(`note over ${m[1]}: ${m[2]}`); continue; }
    if ((m = l.match(/^(\w+)\s*(-+)>>?\s*(\w+)\s*:\s*(.*)/))) {
      out.push(`${m[1]} ${m[2].includes('--') ? '-->' : '->'} ${m[3]} : ${m[4]}`);
      continue;
    }
    out.push(todoP(l));
  }
  out.push('@enduml');
  return out.join('\n');
}

function mermaidBodyToPuml(code, header) {
  const out = ['@startuml'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l) continue;
    if (new RegExp(`^${header}`, 'i').test(l)) continue;
    if (/^%%/.test(l)) { out.push(l.replace(/^%%\s?/, "title ")); continue; }
    out.push(l);
  }
  out.push('@enduml');
  return out.join('\n');
}

function mermaidFlowToPuml(code) {
  const out = ['@startuml'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    let m;
    if (!l || /^(flowchart|graph)\b/i.test(l)) continue;
    if ((m = l.match(/^subgraph\s+\w*\s*\["?([^"\]]+)"?\]?/i)) || (m = l.match(/^subgraph\s+(.+)/i))) { out.push(`package "${m[1].trim()}" {`); continue; }
    if (/^end$/i.test(l)) { out.push('}'); continue; }
    if ((m = l.match(/^(\w+)\[[^\]]*\]\s*-+>\s*(\w+)/))) { out.push(`[${m[1]}] --> [${m[2]}]`); continue; }
    if ((m = l.match(/^(\w+)\s*-+>\s*(\w+)/))) { out.push(`[${m[1]}] --> [${m[2]}]`); continue; }
    if ((m = l.match(/^(\w+)\["?([^"\]]+)"?\]/))) { out.push(`[${m[2]}]`); continue; }
    out.push(todoP(l));
  }
  out.push('@enduml');
  return out.join('\n');
}

export function mermaidToPlantuml(code, type = detectMermaidType(code)) {
  switch (type) {
    case 'sequence': return mermaidSequenceToPuml(code);
    case 'class': return mermaidBodyToPuml(code, 'classDiagram');
    case 'state': return mermaidBodyToPuml(code, 'stateDiagram(-v2)?');
    case 'er': return mermaidErToPuml(code);
    case 'mindmap': return mermaidMindmapToPuml(code);
    default: return mermaidFlowToPuml(code);
  }
}

// ---- top-level dispatch ----------------------------------------------------

// Convert one block to the requested target ('plantuml' | 'mermaid'). `source`
// is the detected input format. Same-format returns the input unchanged.
export function convertBlock(code, source, target) {
  if (source === target) return code;
  if (target === 'mermaid') return plantumlToMermaid(code);
  return mermaidToPlantuml(code);
}
