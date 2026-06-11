// Mermaid detection + rendering. mermaid.js is loaded as a global UMD bundle
// (window.mermaid) by index.html; this module wraps it.

const HEADERS = [
  'flowchart', 'graph', 'sequencediagram', 'classdiagram', 'statediagram',
  'erdiagram', 'mindmap', 'gantt', 'journey', 'pie', 'gitgraph', 'timeline',
  'quadrantchart', 'requirementdiagram', 'c4context',
];

let initialized = false;

export function isMermaid(text) {
  const first = (text.trim().split('\n')[0] || '').trim().toLowerCase();
  return HEADERS.some((h) => first.startsWith(h));
}

export async function renderMermaid(text) {
  if (!window.mermaid) throw new Error('mermaid.js not loaded');
  if (!initialized) {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
    initialized = true;
  }
  const id = 'mmd-' + Math.random().toString(36).slice(2);
  const { svg } = await window.mermaid.render(id, text);
  return svg;
}
