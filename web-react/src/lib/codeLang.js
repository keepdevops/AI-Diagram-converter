// Detect the language of pasted source code and load the matching CodeMirror
// language extension (lazily). Covers Python, C++, Rust, Go, Bash.

export const LANGS = [
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'bash', label: 'Bash' },
];

// Per-language signature patterns; each match scores a point.
const SIGNS = {
  python: [/^\s*def\s+\w+\s*\(/m, /^\s*import\s+\w/m, /^\s*from\s+\w[\w.]*\s+import/m, /\bself\b/, /:\s*$/m, /\bprint\s*\(/, /^\s*class\s+\w+.*:/m],
  cpp: [/#include\s*[<"]/, /\bstd::/, /\bint\s+main\s*\(/, /\btemplate\s*</, /\b(public|private|protected)\s*:/, /;\s*$/m, /::\w/],
  rust: [/\bfn\s+\w+\s*\(/, /\blet\s+mut\b/, /\bimpl\b/, /\bpub\s+fn\b/, /\bmatch\b/, /->\s*\w/, /\buse\s+\w[\w:]*;/, /#\[derive/],
  go: [/^\s*package\s+\w/m, /\bfunc\s+\w*\s*\(/, /:=/, /\btype\s+\w+\s+struct\s*\{/, /\bimport\s*\(/, /\bgo\s+func\b/, /\binterface\s*\{/],
  bash: [/^#!.*\b(bash|sh)\b/m, /^\s*(if|for|while)\b.*;\s*then|do\b/m, /\bfi\b/, /\bdone\b/, /\$\{?\w+\}?/, /\becho\s+/, /^\s*function\s+\w+/m],
};

// Returns the highest-scoring language id (default 'python').
export function detectLanguage(code) {
  const text = code || '';
  let best = 'python';
  let bestScore = -1;
  for (const [lang, pats] of Object.entries(SIGNS)) {
    const score = pats.reduce((s, re) => s + (re.test(text) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return best;
}

// Lazily import the CodeMirror language extension for a language id.
export async function langExtension(lang) {
  switch (lang) {
    case 'cpp': return (await import('@codemirror/lang-cpp')).cpp();
    case 'rust': return (await import('@codemirror/lang-rust')).rust();
    case 'go': return (await import('@codemirror/lang-go')).go();
    case 'bash': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { shell } = await import('@codemirror/legacy-modes/mode/shell');
      return StreamLanguage.define(shell);
    }
    case 'python':
    default: return (await import('@codemirror/lang-python')).python();
  }
}
