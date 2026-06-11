// Convert one PlantUML diagram type into another (e.g. component -> deployment,
// sequence -> activity). Ports and extends the original plantuml-editor.py
// `convert_to`. Deterministic and lossy by nature: structural mappings only, so
// anything ambiguous is left as a TODO comment rather than silently mangled.

export const PUML_TYPES = [
  'component', 'deployment', 'sequence', 'activity', 'class', 'state',
  'object', 'usecase', 'er', 'mindmap',
];

const body = (code) =>
  code.replace(/@start\w+.*\n?/i, '').replace(/@end\w+.*\n?/i, '').trim();

function wrap(inner, title) {
  return `@startuml\n${title ? `title ${title}\n` : ''}${inner}\n@enduml`;
}

// component <-> deployment: rectangles/components become nodes/clouds.
function componentToDeployment(code) {
  const out = [];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if (/^title/i.test(l)) { out.push(l); continue; }
    if ((m = l.match(/^package\s+"([^"]+)"\s*\{?/i))) { out.push(`cloud "${m[1]}" {`); continue; }
    if ((m = l.match(/^\[([^\]]+)\]\s*-+>\s*\[([^\]]+)\]/))) { out.push(`node "${m[1]}" --> node "${m[2]}"`); continue; }
    if ((m = l.match(/^\[([^\]]+)\]/))) { out.push(`node "${m[1]}"`); continue; }
    out.push(l);
  }
  return wrap(out.join('\n'));
}

function deploymentToComponent(code) {
  const out = [];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if (/^title/i.test(l)) { out.push(l); continue; }
    if ((m = l.match(/^cloud\s+"([^"]+)"\s*\{?/i))) { out.push(`package "${m[1]}" {`); continue; }
    if ((m = l.match(/^node\s+"([^"]+)"\s*-+>\s*node\s+"([^"]+)"/i))) { out.push(`[${m[1]}] --> [${m[2]}]`); continue; }
    if ((m = l.match(/^node\s+"([^"]+)"/i))) { out.push(`[${m[1]}]`); continue; }
    out.push(l);
  }
  return wrap(out.join('\n'));
}

// sequence -> activity: each participant interaction becomes an action step.
function sequenceToActivity(code) {
  const out = ['start'];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l || /^participant|^actor|^title|^skinparam|^autonumber/i.test(l)) continue;
    const m = l.match(/^(\w+)\s*-+>{1,2}\s*(\w+)\s*:\s*(.*)/);
    if (m) { out.push(`:${m[1]} → ${m[2]}: ${m[3]};`); continue; }
    out.push(`' TODO: review — ${l}`);
  }
  out.push('stop');
  return wrap(out.join('\n'));
}

// activity -> sequence: actions become messages on a single lane (best-effort).
function activityToSequence(code) {
  const out = ['participant Flow'];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l || /^start$|^stop$|^title/i.test(l)) continue;
    const m = l.match(/^:(.*);$/);
    if (m) { out.push(`Flow -> Flow : ${m[1]}`); continue; }
    out.push(`' TODO: review — ${l}`);
  }
  return wrap(out.join('\n'));
}

// class <-> object: a class definition becomes a representative instance, and
// vice-versa. Members map to attribute assignments (best-effort, lossy).
function classToObject(code) {
  const out = [];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if (/^title/i.test(l)) { out.push(l); continue; }
    if ((m = l.match(/^class\s+(\w+)\s*\{?/i))) { out.push(`object ${m[1].toLowerCase()}1 {`); continue; }
    if (l === '}') { out.push('}'); continue; }
    if ((m = l.match(/^[+\-#~]?\s*(?:\w+\s+)?(\w+)\s*(?:\(.*\))?\s*$/))) { out.push(`  ${m[1]} = ""`); continue; }
    out.push(l);
  }
  return wrap(out.join('\n'));
}

function objectToClass(code) {
  const out = [];
  for (const raw of body(code).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if (/^title/i.test(l)) { out.push(l); continue; }
    if ((m = l.match(/^object\s+(\w+)\s*\{?/i))) { out.push(`class ${m[1]} {`); continue; }
    if (l === '}') { out.push('}'); continue; }
    if ((m = l.match(/^(\w+)\s*=\s*.+$/))) { out.push(`  +${m[1]}`); continue; }
    out.push(l);
  }
  return wrap(out.join('\n'));
}

const ROUTES = {
  'component->deployment': componentToDeployment,
  'deployment->component': deploymentToComponent,
  'sequence->activity': sequenceToActivity,
  'activity->sequence': activityToSequence,
  'class->object': classToObject,
  'object->class': objectToClass,
};

// Returns { code, exact } — exact=false when no structural route exists and we
// fall back to a re-typed shell the user (or the AI route) should finish.
export function convertPlantumlType(code, fromType, toType) {
  if (fromType === toType) return { code, exact: true };
  const fn = ROUTES[`${fromType}->${toType}`];
  if (fn) return { code: fn(code), exact: true };
  const note = `' TODO: no direct ${fromType} → ${toType} mapping — use "Convert with AI ✦" or edit by hand`;
  return { code: `${note}\n${code}`, exact: false };
}
