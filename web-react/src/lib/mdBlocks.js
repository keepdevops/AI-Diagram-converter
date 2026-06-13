// Extract diagram sources from a Markdown document (or raw text), and detect
// whether a given block is PlantUML or Mermaid. Used by the Convert panel to
// turn a *.md file into individually convertible diagram blocks.

const FENCE_LANGS = {
  mermaid: 'mermaid',
  plantuml: 'plantuml',
  puml: 'plantuml',
  uml: 'plantuml',
};

const MERMAID_HEADS = [
  'sequencediagram', 'flowchart', 'graph', 'classdiagram', 'statediagram',
  'erdiagram', 'journey', 'gantt', 'pie', 'mindmap', 'gitgraph', 'timeline',
  'quadrantchart', 'requirementdiagram', 'c4context',
];

// Best-effort format detection for a bare (unfenced) diagram body.
export function detectFormat(code) {
  const text = (code || '').trim();
  if (!text) return 'unknown';
  if (/@start\w+/i.test(text)) return 'plantuml';
  const firstLine = text.split('\n').find((l) => l.trim())?.trim().toLowerCase() || '';
  if (MERMAID_HEADS.some((h) => firstLine.startsWith(h))) return 'mermaid';
  // PlantUML activity/sequence hints.
  if (/(^|\n)\s*(participant|actor|@start|skinparam)\b/i.test(text)) return 'plantuml';
  return 'unknown';
}

// Detect a Markdown / prose document — even one wrapped in @startuml…@enduml —
// that should be CONVERTED into a diagram, vs. an actual diagram the Fix loop
// should repair. A real diagram body carries connectors/keywords; a document
// carries headings, bold, lists, links and prose. Used by the Editor's Fix to
// auto-route doc input to generation instead of erroring on invalid syntax.
const MD_MARK = /^#{1,6}\s|\*\*[^*]+\*\*|^[-*+]\s+\S|^\d+\.\s+\S|\[[^\]]+\]\([^)]+\)|`[^`]+`/;
const DIAGRAM_MARK = /(--?>|<--?|\.\.+>|->>|==+>|\|\||\bparticipant\b|\bactor\b|\bclass\b|\binterface\b|\bstate\b|\busecase\b|\bcomponent\b|\bnode\b|\brectangle\b|\bdatabase\b|\bentity\b|\bskinparam\b|^\s*\[[^\]]+\]\s*$|sequencediagram|flowchart|^graph\s+(td|lr|tb|rl)|classdiagram|statediagram)/i;

export function looksLikeProse(text) {
  const inner = (text || '')
    .replace(/@start\w+[^\n]*\n?/i, '')
    .replace(/@end\w+[^\n]*\n?/i, '')
    .trim();
  if (!inner) return false;
  const lines = inner.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  let md = 0;
  let dia = 0;
  for (const l of lines) {
    if (MD_MARK.test(l)) md++;
    if (DIAGRAM_MARK.test(l)) dia++;
  }
  return md > 0 && md >= dia;
}

// Strip Markdown syntax and any @start/@end wrapper so a pasted document reads as
// plain prose for diagram generation. Raw markdown (with @startuml / note / #)
// primes the model to echo a note instead of building a real diagram; clean prose
// yields actual participants + connectors.
export function docToDescription(text) {
  return (text || '')
    .replace(/@start\w+[^\n]*\n?/gi, '')
    .replace(/@end\w+[^\n]*\n?/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')                    // fenced code
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                 // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')                  // bold
    .replace(/`([^`]+)`/g, '$1')                        // inline code
    .replace(/^\s*[-*+]\s+/gm, '')                      // bullet lists
    .replace(/^\s*\d+\.\s+/gm, '')                      // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')            // links -> text
    .replace(/^\s*>\s?/gm, '')                          // blockquotes
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract fenced diagram blocks from Markdown. Returns [{ lang, code, fenced }].
// Falls back to treating the whole input as one block when no fences are present
// (so pasting raw diagram text "just works").
export function extractBlocks(input) {
  const src = input || '';
  // Tolerant info string ([^\n]*) so fences like ```diagram:sequence or
  // ```js {.attr} still pair correctly — a strict lang pattern would fail to
  // match such an opening fence and desync every fence after it. The lang is the
  // first whitespace-delimited token of the info string.
  const fenceRe = /```([^\n]*)\n([\s\S]*?)```/g;
  const blocks = [];
  let m;
  while ((m = fenceRe.exec(src)) !== null) {
    const lang = (m[1] || '').trim().toLowerCase().split(/\s+/)[0];
    const code = m[2].replace(/\n$/, '');
    if (!code.trim()) continue;
    const fmt = FENCE_LANGS[lang] || detectFormat(code);
    if (fmt === 'unknown') continue; // skip non-diagram code fences (incl. prompts)
    blocks.push({ lang: fmt, code, fenced: true });
  }
  if (blocks.length > 0) return blocks;

  // No diagram fences: also catch bare @startuml…@enduml runs.
  const umlRe = /@start\w+[\s\S]*?@end\w+/gi;
  const bare = src.match(umlRe);
  if (bare) return bare.map((code) => ({ lang: 'plantuml', code, fenced: false }));

  const fmt = detectFormat(src);
  if (fmt !== 'unknown') return [{ lang: fmt, code: src.trim(), fenced: false }];
  return [];
}
