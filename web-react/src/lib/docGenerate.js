// Batch orchestrator: turn every diagram prompt in a Markdown document into a
// generated PlantUML block, in one sequential pass (the local model is slow, so
// we go one at a time and report progress). Decoupled from React for testing.

import { findPrompts, replacementFor, expandDocument } from './docPrompts.js';
import { plantumlToMermaid } from './convert.js';

// runDocGeneration(src, { generate, type, toMermaid, onProgress, signal })
//   generate(description, type, signal) -> { ok, diagram, note, error }
//   type        -> default diagram-type hint (a prompt's own `:type` wins)
//   toMermaid   -> convert each generated PlantUML to Mermaid before expanding
//   onProgress(done, total, result)     -> UI hook, called after each prompt
//   signal                              -> optional AbortSignal to cancel
// Returns { prompts, results, expanded } (expanded === null when no prompts).
export async function runDocGeneration(src, { generate, type = null, toMermaid = false, onProgress, signal } = {}) {
  const prompts = findPrompts(src);
  const total = prompts.length;
  if (total === 0) return { prompts, results: [], expanded: null };

  const results = [];
  const replacements = [];
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      const err = new Error('cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const p = prompts[i];
    let result;
    try {
      const t = await generate(p.description, p.type || type || null, signal);
      const ok = !!t.ok;
      const diagram = ok && toMermaid && t.diagram ? plantumlToMermaid(t.diagram) : t.diagram;
      result = { index: i, description: p.description, ok, note: t.note,
                 diagram, lang: toMermaid ? 'mermaid' : 'plantuml' };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.error('doc prompt generation failed:', err);
      result = { index: i, description: p.description, ok: false, error: err.message };
    }
    results.push(result);
    replacements.push({ start: p.start, end: p.end, text: replacementFor(src, p, result) });
    onProgress?.(i + 1, total, result);
  }

  return { prompts, results, expanded: expandDocument(src, replacements) };
}
