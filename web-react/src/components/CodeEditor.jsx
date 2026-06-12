// CodeMirror editor for pasted source code, with a language extension that swaps
// (via a Compartment) when the `lang` prop changes. Dark highlight style reuses
// the app's --cm-* tokens.

import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { langExtension } from '../lib/codeLang.js';

const theme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--color-panel)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
    '.cm-content': { caretColor: 'var(--color-accent)' },
    '.cm-gutters': { backgroundColor: 'var(--color-panel)', color: 'var(--color-muted)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--color-panel-2)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--color-panel-2)' },
  },
  { dark: true },
);

const darkHl = HighlightStyle.define([
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-atom)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-type)' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: 'var(--cm-type)' },
  { tag: t.operator, color: 'var(--cm-operator)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--cm-text)' },
  { tag: [t.meta, t.macroName, t.processingInstruction], color: 'var(--cm-meta)' },
]);

export default function CodeEditor({ value, onChange, lang }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const langComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(),
        history(), bracketMatching(), closeBrackets(), indentOnInput(),
        syntaxHighlighting(darkHl, { fallback: true }),
        langComp.current.of([]),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme, EditorView.lineWrapping, updateListener,
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value !== cur) view.dispatch({ changes: { from: 0, to: cur.length, insert: value ?? '' } });
  }, [value]);

  useEffect(() => {
    let alive = true;
    langExtension(lang).then((ext) => {
      if (alive && viewRef.current) viewRef.current.dispatch({ effects: langComp.current.reconfigure(ext) });
    }).catch((err) => console.error('lang load failed:', err));
    return () => { alive = false; };
  }, [lang]);

  return <div className="cm-host" ref={hostRef} />;
}
