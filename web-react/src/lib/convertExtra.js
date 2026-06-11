// ER and Mind-map converters, split out of convert.js to keep each module within
// the size budget. Crow's-foot relationship notation (||--o{ etc.) is identical
// in PlantUML and Mermaid, so ER conversion is mostly entity-block reshaping.

const stripFences = (code) =>
  code.replace(/@start\w+.*\n?/i, '').replace(/@end\w+.*\n?/i, '').trim();
const lines = (code) => stripFences(code).split('\n');
// A crow's-foot relation always contains '--'; require it so attribute lines
// like `token : text` (no connector) are never mistaken for relationships.
const REL_RE = /^(\w+)\s*([|}{o<>]*--+[|}{o<>]*)\s*(\w+)\s*:\s*"?([^"]*)"?\s*$/;

// ---- ER --------------------------------------------------------------------

export function pumlErToMermaid(code) {
  const out = ['erDiagram'];
  let inEntity = false;
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l || /^title/i.test(l)) continue;
    let m;
    if ((m = l.match(/^entity\s+"?([^"{]+)"?\s*\{/i))) { out.push(`  ${m[1].trim()} {`); inEntity = true; continue; }
    if (l === '}') { out.push('  }'); inEntity = false; continue; }
    if (l === '--') continue; // PlantUML PK/field separator — Mermaid has none
    if ((m = l.match(REL_RE))) { out.push(`  ${m[1]} ${m[2]} ${m[3]} : "${m[4].trim()}"`); continue; }
    if (inEntity && (m = l.match(/^(\*)?\s*([\w]+)\s*:\s*(.+)$/))) {
      const pk = m[1] ? ' PK' : '';
      out.push(`    ${m[3].trim()} ${m[2]}${pk}`); // Mermaid: type name [PK]
      continue;
    }
    out.push(`  %% TODO: review — ${l}`);
  }
  return out.join('\n');
}

export function mermaidErToPuml(code) {
  const out = ['@startuml'];
  let inEntity = false;
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l || /^erdiagram/i.test(l)) continue;
    let m;
    if ((m = l.match(/^"?([\w ]+)"?\s*\{$/))) { out.push(`entity ${m[1].trim()} {`); inEntity = true; continue; }
    if (l === '}') { out.push('}'); inEntity = false; continue; }
    if ((m = l.match(REL_RE))) { out.push(`${m[1]} ${m[2]} ${m[3]} : ${m[4].trim()}`); continue; }
    if (inEntity && (m = l.match(/^(\w+)\s+(\w+)\s*(PK|FK|UK)?$/))) {
      const pk = m[3] === 'PK' ? '* ' : '';
      out.push(`  ${pk}${m[2]} : ${m[1]}`); // PlantUML: [*] name : type
      continue;
    }
    out.push(`' TODO: review — ${l}`);
  }
  out.push('@enduml');
  return out.join('\n');
}

// ---- Mind map --------------------------------------------------------------

const mmText = (s) =>
  s.replace(/^root\s*\(\(\s*(.*?)\s*\)\)$/i, '$1') // root((X))
    .replace(/^[\w-]+[([{]+\s*(.*?)\s*[)\]}]+$/, '$1') // id(X) id[X] id{{X}}
    .trim();

export function pumlMindmapToMermaid(code) {
  const out = ['mindmap'];
  for (const raw of lines(code)) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^([*+-]+)\s*(.*)$/);
    if (!m) { out.push(`  %% TODO: review — ${l}`); continue; }
    const depth = m[1].length;
    const text = m[2].trim();
    if (depth === 1) { out.push(`  root((${text}))`); continue; }
    out.push(`${'  '.repeat(depth)}${text}`);
  }
  return out.join('\n');
}

export function mermaidMindmapToPuml(code) {
  const out = ['@startmindmap'];
  const body = stripFences(code).split('\n').filter((l) => l.trim() && !/^mindmap/i.test(l.trim()));
  // Mermaid nests the root one level under `mindmap`, so the shallowest line is
  // the root: use it as the depth-1 baseline, then derive the per-level step.
  const leads = body.map((l) => l.match(/^\s*/)[0].length);
  const base = leads.length ? Math.min(...leads) : 0;
  const steps = leads.map((n) => n - base).filter((n) => n > 0);
  const unit = steps.length ? Math.min(...steps) : 2;
  body.forEach((raw, i) => {
    const depth = Math.round((leads[i] - base) / unit) + 1;
    out.push(`${'*'.repeat(depth)} ${mmText(raw.trim())}`);
  });
  out.push('@endmindmap');
  return out.join('\n');
}
