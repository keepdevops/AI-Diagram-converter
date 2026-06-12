// "Code → diagram": paste source code (Python/C++/Rust/Go/Bash), auto-detect or
// pick the language, choose a diagram type, and the matrix-safe model generates a
// validated PlantUML (or Mermaid) diagram. Switch the type and regenerate on the
// same code. Reuses agentClient.generate + the validate/guard loop.

import { useRef, useState } from 'react';
import Split from './Split.jsx';
import Editor from './Editor.jsx';
import CodeEditor from './CodeEditor.jsx';
import { LANGS, detectLanguage } from '../lib/codeLang.js';
import { CODE_DIAGRAMS, diagramFor, buildCodePrompt } from '../lib/codePrompt.js';
import { generate } from '../lib/agentClient.js';
import { plantumlToMermaid } from '../lib/convert.js';

const SAMPLE = `class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        raise NotImplementedError

class Dog(Animal):
    def speak(self):
        return "woof"

class Cat(Animal):
    def speak(self):
        return "meow"
`;

export default function CodeView({ onOpenInEditor, onOpenInGraph }) {
  const [code, setCode] = useState(SAMPLE);
  const [langSel, setLangSel] = useState('auto');
  const [dtype, setDtype] = useState('class');
  const [fmt, setFmt] = useState('plantuml');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ text: 'Paste code, pick a diagram type, Generate ✦', kind: 'info' });
  const abortRef = useRef(null);

  const lang = langSel === 'auto' ? detectLanguage(code) : langSel;
  const say = (text, kind = 'info') => setStatus({ text, kind });

  const runGenerate = async () => {
    if (!code.trim()) { say('Paste some code first', 'warn'); return; }
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const d = diagramFor(dtype);
    say(`Generating ${d.label} from ${lang} via matrix-safe… (local models can be slow)`, 'info');
    try {
      const t = await generate(buildCodePrompt(code, lang, dtype), d.plantumlType, controller.signal);
      let diagram = t.diagram || '';
      if (fmt === 'mermaid' && diagram) diagram = plantumlToMermaid(diagram);
      setOut(diagram);
      say(t.note || (t.ok ? `Generated ${d.label}.` : 'Best effort.'), t.ok ? 'ok' : 'warn');
    } catch (err) {
      if (err.name === 'AbortError') { say('Cancelled', 'warn'); }
      else { console.error('code generate failed:', err); say(`Error: ${err.message}`, 'error'); }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };
  const cancel = () => abortRef.current?.abort();

  return (
    <div className="convert">
      <div className="convert-bar">
        <span className="badge ok">lang: {lang}{langSel === 'auto' ? ' (auto)' : ''}</span>
        <label>
          Language
          <select value={langSel} onChange={(e) => setLangSel(e.target.value)}>
            <option value="auto">auto-detect</option>
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label>
          Diagram
          <select value={dtype} onChange={(e) => setDtype(e.target.value)}>
            {CODE_DIAGRAMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label>
          as
          <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
            <option value="plantuml">PlantUML</option>
            <option value="mermaid">Mermaid</option>
          </select>
        </label>
        <span className="spacer" />
        <button type="button" className="auto-btn" onClick={runGenerate} disabled={busy}>Generate ✦</button>
        {busy && <button type="button" onClick={cancel}>Stop</button>}
      </div>

      <div className="convert-cols">
        <Split storageKey="plantuml-editor.code-split">
          <div className="convert-col">
            <div className="convert-col-head">Code ({lang})</div>
            <div className="convert-edit"><CodeEditor value={code} onChange={setCode} lang={lang} /></div>
          </div>
          <div className="convert-col">
            <div className="convert-col-head">
              Diagram
              <span className="spacer" />
              <button type="button" className="link" disabled={!out} onClick={() => navigator.clipboard?.writeText(out)}>Copy</button>
              <button type="button" className="link" disabled={!out} onClick={() => onOpenInGraph?.(out)}>Open in graph →</button>
              <button type="button" className="link" disabled={!out} onClick={() => onOpenInEditor(out)}>Open in editor →</button>
            </div>
            <div className="convert-edit"><Editor value={out} onChange={setOut} /></div>
          </div>
        </Split>
      </div>

      <footer className="statusbar" data-kind={status.kind}>{status.text}</footer>
    </div>
  );
}
