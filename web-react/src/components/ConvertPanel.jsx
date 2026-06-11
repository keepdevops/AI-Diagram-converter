// Fix / Convert editor. Load or paste Markdown (*.md) or raw diagram text, pick a
// diagram block, and convert it: PlantUML <-> Mermaid (format), or one PlantUML
// type to another. Deterministic by default; "Convert with AI ✦" routes through
// the matrix-safe agent for the hard cases. Output can be opened in the main
// editor. Every failure surfaces in the panel status — nothing fails silently.

import { useMemo, useRef, useState } from 'react';
import Editor from './Editor.jsx';
import Split from './Split.jsx';
import { extractBlocks } from '../lib/mdBlocks.js';
import { convertBlock, detectPlantumlType } from '../lib/convert.js';
import { convertPlantumlType, PUML_TYPES } from '../lib/convertType.js';
import { generate } from '../lib/agentClient.js';

const SAMPLE = `# Notes

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant A as App
  U->>A: login(creds)
  A-->>U: token
\`\`\`
`;

export default function ConvertPanel({ onOpenInEditor }) {
  const [src, setSrc] = useState(SAMPLE);
  const [out, setOut] = useState('');
  const [mode, setMode] = useState('format'); // 'format' | 'type'
  const [targetFmt, setTargetFmt] = useState('plantuml');
  const [targetType, setTargetType] = useState('activity');
  const [blockIdx, setBlockIdx] = useState(0);
  const [status, setStatus] = useState({ text: 'Load a .md file or paste a diagram', kind: 'info' });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const blocks = useMemo(() => extractBlocks(src), [src]);
  const block = blocks[Math.min(blockIdx, Math.max(0, blocks.length - 1))];
  const srcFmt = block?.lang || 'unknown';

  const say = (text, kind = 'info') => setStatus({ text, kind });

  const onLoadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setSrc(text);
      setBlockIdx(0);
      say(`Loaded ${file.name}`, 'ok');
    } catch (err) {
      console.error('file read failed:', err);
      say(`Could not read file: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const runConvert = () => {
    if (!block) { say('No diagram block detected', 'warn'); return; }
    try {
      if (mode === 'format') {
        const result = convertBlock(block.code, srcFmt, targetFmt);
        setOut(result);
        say(`Converted ${srcFmt} → ${targetFmt}`, 'ok');
      } else {
        if (srcFmt !== 'plantuml') { say('Type conversion needs a PlantUML source', 'warn'); return; }
        const from = detectPlantumlType(block.code);
        const { code, exact } = convertPlantumlType(block.code, from, targetType);
        setOut(code);
        say(exact ? `Converted ${from} → ${targetType}` : `No exact ${from} → ${targetType} route — see TODO`, exact ? 'ok' : 'warn');
      }
    } catch (err) {
      console.error('convert failed:', err);
      say(`Convert error: ${err.message}`, 'error');
    }
  };

  const runAI = async () => {
    if (!block) { say('No diagram block detected', 'warn'); return; }
    const toType = mode === 'type' ? targetType : '';
    const description =
      `Convert the following ${srcFmt} diagram into a valid PlantUML ${toType} diagram. ` +
      `Output only the diagram between @startuml and @enduml.\n\n${block.code}`;
    setBusy(true);
    say('Converting with AI via matrix-safe… (local models can be slow)', 'info');
    try {
      const t = await generate(description, toType || null);
      setOut(t.diagram || '');
      say(t.note || (t.ok ? 'Converted.' : 'Best effort.'), t.ok ? 'ok' : 'warn');
    } catch (err) {
      console.error('AI convert failed:', err);
      say(`AI error: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const aiDisabled = busy || targetFmt === 'mermaid' && mode === 'format';

  return (
    <div className="convert">
      <div className="convert-bar">
        <button type="button" onClick={() => fileRef.current?.click()}>Load .md</button>
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.puml,.mmd" hidden onChange={onLoadFile} />

        {blocks.length > 1 && (
          <label>
            Block
            <select value={blockIdx} onChange={(e) => setBlockIdx(Number(e.target.value))}>
              {blocks.map((b, i) => (
                <option key={i} value={i}>#{i + 1} · {b.lang}</option>
              ))}
            </select>
          </label>
        )}
        <span className={`badge ${srcFmt === 'unknown' ? 'err' : 'ok'}`}>source: {srcFmt}</span>

        <span className="spacer" />

        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="format">Format (PlantUML ↔ Mermaid)</option>
            <option value="type">PlantUML type → type</option>
          </select>
        </label>

        {mode === 'format' ? (
          <label>
            To
            <select value={targetFmt} onChange={(e) => setTargetFmt(e.target.value)}>
              <option value="plantuml">PlantUML</option>
              <option value="mermaid">Mermaid</option>
            </select>
          </label>
        ) : (
          <label>
            As type
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              {PUML_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}

        <button type="button" onClick={runConvert} disabled={busy}>Convert</button>
        <button type="button" onClick={runAI} disabled={aiDisabled} title="Use the matrix-safe model (PlantUML output only)">
          Convert with AI ✦
        </button>
      </div>

      <div className="convert-cols">
        <Split storageKey="plantuml-editor.convert-split">
          <div className="convert-col">
            <div className="convert-col-head">Source (Markdown / diagram)</div>
            <div className="convert-edit"><Editor value={src} onChange={setSrc} /></div>
          </div>
          <div className="convert-col">
            <div className="convert-col-head">
              Output
              <span className="spacer" />
              <button type="button" className="link" disabled={!out} onClick={() => navigator.clipboard?.writeText(out)}>Copy</button>
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
