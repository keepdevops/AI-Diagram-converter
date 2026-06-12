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
