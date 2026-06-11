// CodeMirror6 wrapper for PlantUML. Imperatively owns an EditorView and keeps it
// in sync with the controlled `value` prop without tearing down on every keypress.

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { plantuml } from '../lib/plantumlLang.js';

// Minimal dark theme; colors come from CSS vars so they match the app tokens.
const theme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--color-panel)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
    '.cm-content': { caretColor: 'var(--color-accent)' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-panel)',
      color: 'var(--color-muted)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'var(--color-panel-2)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--color-panel-2)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--color-border)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--color-panel-2)',
      border: '1px solid var(--color-border)',
      color: 'var(--color-text)',
    },
  },
  { dark: true }
);

export default function Editor({ value, onChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Build the view once.
  useEffect(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        plantuml(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        theme,
        EditorView.lineWrapping,
        updateListener,
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external value changes (examples, swarm output) into the doc, but never
  // clobber what the user is typing — only when the prop genuinely diverges.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value ?? '' },
      });
    }
  }, [value]);

  return <div className="cm-host" ref={hostRef} />;
}
