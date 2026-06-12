// One-shot "auto-convert a Markdown document to diagrams + code". Picks the right
// strategy automatically and emits all diagrams in the requested target format:
//   1. The doc has ```diagram / <!-- diagram --> prompts  -> generate + expand in place.
//   2. The doc has existing ```mermaid/```plantuml blocks -> convert them to target.
//   3. Plain prose (no markers/blocks)                    -> generate one diagram.

import { findPrompts } from './docPrompts.js';
import { extractBlocks } from './mdBlocks.js';
import { runDocGeneration } from './docGenerate.js';
import { convertBlock, plantumlToMermaid } from './convert.js';

// autoConvertDoc(src, { generate, target, onProgress, signal })
//   target  -> 'plantuml' | 'mermaid'
// Returns { kind, output, results } where output is the code/markdown to show.
export async function autoConvertDoc(src, { generate, target = 'plantuml', onProgress, signal } = {}) {
  const text = src || '';
  const toMermaid = target === 'mermaid';
  const prompts = findPrompts(text);

  // 1. Generate from prompts and expand the document in place.
  if (prompts.length > 0) {
    const { expanded, results } = await runDocGeneration(text, { generate, toMermaid, onProgress, signal });
    return { kind: 'generated', output: expanded || '', results };
  }

  // 2. Convert existing diagram blocks to the target format.
  const blocks = extractBlocks(text);
  if (blocks.length > 0) {
    const out = [];
    blocks.forEach((b, i) => {
      const code = convertBlock(b.code, b.lang, target);
      out.push(`\`\`\`${target}\n${code.trim()}\n\`\`\``);
      onProgress?.(i + 1, blocks.length, { description: `block ${i + 1} (${b.lang})`, ok: true });
    });
    return { kind: 'converted', output: out.join('\n\n'), results: blocks.map(() => ({ ok: true })) };
  }

  // 3. Plain prose -> generate a single diagram.
  if (text.trim()) {
    const t = await generate(text.trim(), null, signal);
    let code = t.diagram || '';
    if (toMermaid && code) code = plantumlToMermaid(code);
    onProgress?.(1, 1, { description: 'whole document', ok: !!t.ok });
    return { kind: 'whole-text', output: code, results: [{ ok: !!t.ok, note: t.note }] };
  }

  return { kind: 'empty', output: '', results: [] };
}
