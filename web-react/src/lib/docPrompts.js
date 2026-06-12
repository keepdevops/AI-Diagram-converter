// Find diagram-generation prompts in a Markdown document and expand them in
// place. A "prompt" is a natural-language description an author wants turned into
// a real diagram. Two forms are recognized:
//
//   Fenced:   ```diagram          or  ```diagram:sequence
//             <description...>          (text after ':' is an optional type hint)
//             ```
//   Comment:  <!-- diagram: ... -->   or  <!-- diagram(sequence): ... -->
//
// findPrompts returns char offsets so expandDocument can rewrite the source
// without disturbing surrounding prose.

const FENCE_RE = /```diagram(?::([A-Za-z0-9_-]+))?[ \t]*\n([\s\S]*?)```/gi;
const COMMENT_RE = /<!--\s*diagram(?:\(([A-Za-z0-9_-]+)\))?\s*:\s*([\s\S]*?)-->/gi;

// Returns [{ start, end, type, description }] sorted by position in `src`.
export function findPrompts(src) {
  const text = src || '';
  const prompts = [];
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const description = m[2].trim();
    if (description) {
      prompts.push({ start: m.index, end: m.index + m[0].length, type: m[1] || null, description });
    }
  }
  COMMENT_RE.lastIndex = 0;
  while ((m = COMMENT_RE.exec(text)) !== null) {
    const description = m[2].trim();
    if (description) {
      prompts.push({ start: m.index, end: m.index + m[0].length, type: m[1] || null, description });
    }
  }
  return prompts.sort((a, b) => a.start - b.start);
}

// A generated block: the original prompt kept as a comment, then the diagram.
// `lang` is the fence language (plantuml or mermaid).
function generatedBlock(description, diagram, lang = 'plantuml') {
  return `<!-- diagram: ${description.replace(/\s+/g, ' ').trim()} -->\n` +
    '```' + lang + '\n' + diagram.trim() + '\n```';
}

// Build the replacement text for one prompt result. On failure, keep the source
// span untouched and prepend a loud marker so nothing is silently dropped.
export function replacementFor(src, prompt, result) {
  if (result && result.ok && result.diagram) {
    return generatedBlock(prompt.description, result.diagram, result.lang || 'plantuml');
  }
  const reason = (result && (result.note || result.error)) || 'generation failed';
  const original = src.slice(prompt.start, prompt.end);
  return `<!-- diagram generation failed: ${reason.replace(/\s+/g, ' ').trim()} -->\n${original}`;
}

// Apply { start, end, text } edits to `src`. Edits are sorted and applied in
// reverse so earlier offsets remain valid as later spans are replaced.
export function expandDocument(src, replacements) {
  const text = src || '';
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of sorted) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }
  return out;
}
