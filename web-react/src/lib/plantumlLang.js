// A lightweight PlantUML mode for CodeMirror6 built on StreamLanguage, plus a
// dark highlight style and keyword autocompletion. StreamLanguage keeps this
// compact — a full Lezer grammar would be far more boilerplate for marginal gain.

import { StreamLanguage, HighlightStyle, syntaxHighlighting, LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion } from '@codemirror/autocomplete';

// Block markers and the most common diagram keywords.
const KEYWORDS = new Set([
  'startuml', 'enduml', 'startmindmap', 'endmindmap', 'startgantt', 'endgantt',
  'participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections',
  'queue', 'component', 'interface', 'package', 'namespace', 'node', 'cloud',
  'artifact', 'folder', 'frame', 'rectangle', 'card', 'class', 'abstract',
  'enum', 'state', 'object', 'usecase', 'activate', 'deactivate', 'destroy',
  'note', 'left', 'right', 'over', 'of', 'as', 'title', 'header', 'footer',
  'legend', 'end', 'alt', 'else', 'opt', 'loop', 'par', 'break', 'critical',
  'group', 'ref', 'box', 'if', 'then', 'elseif', 'endif', 'while', 'endwhile',
  'fork', 'again', 'start', 'stop', 'repeat', 'backward', 'partition', 'skinparam',
  'autonumber', 'hide', 'show', 'skin', 'scale', 'newpage', 'return',
  // Mermaid render-only types (highlighting shared with the PlantUML mode).
  'pie', 'journey', 'section', 'gitgraph', 'commit', 'branch', 'checkout', 'merge',
  'sequencediagram', 'flowchart', 'classdiagram', 'statediagram', 'erdiagram',
]);

const COMPLETIONS = [...KEYWORDS]
  .sort()
  .map((label) => ({ label, type: 'keyword' }));

// Stream tokenizer: comments, @directives, strings, arrows, stereotypes, keywords.
const plantumlMode = StreamLanguage.define({
  name: 'plantuml',
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;

    // Line comments: ' ...   and  /' ... '/ block comments.
    if (stream.match("'")) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/')) {
      if (stream.skipTo("'/")) {
        stream.match("'/");
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    // @startuml / @enduml directives.
    if (stream.match(/@\w+/)) return 'meta';

    // Double-quoted strings (labels, aliases).
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string';

    // Preprocessor / variables.
    if (stream.match(/!\w+/)) return 'macroName';
    if (stream.match(/\$\w+/)) return 'variableName';

    // Stereotypes <<...>> and colors #RRGGBB / #name.
    if (stream.match(/<<[^>]*>>/)) return 'typeName';
    if (stream.match(/#[0-9A-Fa-f]{3,8}\b/) || stream.match(/#\w+/)) return 'atom';

    // ER crow's-foot relations: ||--o{, }o--||, |o--o{, etc.
    if (stream.match(/[|}{o][|}{o]*--?[|}{o<>]+/)) return 'operator';
    // Arrows / connectors: -->, ->>, ..>, -[#red]->, ==>, etc.
    if (stream.match(/[-.=]+(\[[^\]]*\])?[-.=]*[<>ox*|]*/)) return 'operator';
    if (stream.match(/[<>ox*]+[-.=]+/)) return 'operator';

    // Bare words: keyword vs. identifier.
    if (stream.match(/[A-Za-z_][\w]*/)) {
      const word = stream.current().toLowerCase();
      if (KEYWORDS.has(word)) return 'keyword';
      return 'variableName';
    }

    // Activity action terminators / misc punctuation.
    if (stream.match(/[:;|()\[\]{}*+]/)) return 'punctuation';

    stream.next();
    return null;
  },
});

const highlight = HighlightStyle.define([
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--cm-meta)', fontWeight: 'bold' },
  { tag: t.string, color: 'var(--cm-string)' },
  { tag: t.keyword, color: 'var(--cm-keyword)', fontWeight: 'bold' },
  { tag: t.operator, color: 'var(--cm-operator)' },
  { tag: t.typeName, color: 'var(--cm-type)' },
  { tag: t.atom, color: 'var(--cm-atom)' },
  { tag: t.variableName, color: 'var(--cm-text)' },
  { tag: t.macroName, color: 'var(--cm-macro)' },
  { tag: t.punctuation, color: 'var(--cm-punct)' },
]);

function plantumlCompletions(context) {
  const word = context.matchBefore(/\w+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: COMPLETIONS };
}

export function plantuml() {
  return new LanguageSupport(plantumlMode, [
    syntaxHighlighting(highlight),
    autocompletion({ override: [plantumlCompletions] }),
  ]);
}
