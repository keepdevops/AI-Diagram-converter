// Fix / Convert editor. Load or paste Markdown (*.md) or raw diagram text and:
//  - Format: convert a diagram block PlantUML <-> Mermaid
//  - Type:   convert one PlantUML diagram type to another
//  - Generate from text: generate diagrams from ```diagram / <!-- diagram -->
//    prompts (or the whole prose), expanding the doc in place
//  - Auto ✦: one-click "convert the whole .md to diagrams + code"
// Deterministic where possible; the model handles generation/AI conversion.

import { useMemo, useRef, useState } from 'react';
import Editor from './Editor.jsx';
import Split from './Split.jsx';
import { extractBlocks } from '../lib/mdBlocks.js';
import { convertBlock, detectPlantumlType, plantumlToMermaid } from '../lib/convert.js';
import { convertPlantumlType, PUML_TYPES } from '../lib/convertType.js';
import { generate } from '../lib/agentClient.js';
import { findPrompts } from '../lib/docPrompts.js';
import { runDocGeneration } from '../lib/docGenerate.js';
import { autoConvertDoc } from '../lib/docAuto.js';

const SAMPLE = `# Design Notes

Generate-from-text prompts (run "Generate from text" mode):

\`\`\`diagram:sequence
User logs in, the app validates against the database, then returns a session token.
\`\`\`

<!-- diagram(component): a frontend editor and preview talking to a PlantUML server -->

An existing diagram to convert (Format / Type modes):

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
  const [mode, setMode] = useState('format'); // 'format' | 'type' | 'generate'
  const [targetFmt, setTargetFmt] = useState('plantuml');
  const [targetType, setTargetType] = useState('activity');
  const [genType, setGenType] = useState('auto');   // diagram-type hint for generate
  const [genFmt, setGenFmt] = useState('plantuml'); // generate output format
  const [blockIdx, setBlockIdx] = useState(0);
  const [status, setStatus] = useState({ text: 'Load a .md file or paste a diagram', kind: 'info' });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([]); // [{ n, total, description, ok }]
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  const blocks = useMemo(() => extractBlocks(src), [src]);
  const block = blocks[Math.min(blockIdx, Math.max(0, blocks.length - 1))];
  const srcFmt = block?.lang || 'unknown';
  const prompts = useMemo(() => findPrompts(src), [src]);

  const say = (text, kind = 'info') => setStatus({ text, kind });

  const onLoadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSrc(await file.text());
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
        setOut(convertBlock(block.code, srcFmt, targetFmt));
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
      `Convert the following ${srcFmt} diagram into a valid PlantUML ${toType} diagram. `
      + `Output only the diagram between @startuml and @enduml.\n\n${block.code}`;
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

  // Generate from prompts (expand in place) or whole prose (one diagram).
  const runGenerate = async () => {
    const typeArg = genType === 'auto' ? null : genType;
    const toMermaid = genFmt === 'mermaid';
    if (prompts.length === 0 && !src.trim()) {
      say('Nothing to generate — paste a description or add ```diagram prompts', 'warn');
      return;
    }
    setBusy(true);
    setProgress([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (prompts.length > 0) {
        say(`Generating ${prompts.length} diagram(s) via matrix-safe… (local models are slow)`, 'info');
        const { expanded, results } = await runDocGeneration(src, {
          generate, type: typeArg, toMermaid, signal: controller.signal,
          onProgress: (n, total, result) => {
            setProgress((prev) => [...prev, { n, total, description: result.description, ok: result.ok }]);
            say(`Generating ${n}/${total}…`, 'info');
          },
        });
        setOut(expanded || '');
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        say(`Generated ${ok} of ${results.length}${failed ? ` (${failed} failed)` : ''}`, failed ? 'warn' : 'ok');
      } else {
        say('Generating from text via matrix-safe… (local models are slow)', 'info');
        const t = await generate(src.trim(), typeArg, controller.signal);
        let diagram = t.diagram || '';
        if (toMermaid && diagram) diagram = plantumlToMermaid(diagram);
        setOut(diagram);
        say(t.note || (t.ok ? 'Generated.' : 'Best effort.'), t.ok ? 'ok' : 'warn');
      }
    } catch (err) {
      if (err.name === 'AbortError') { say('Cancelled', 'warn'); }
      else { console.error('doc generate failed:', err); say(`Generate error: ${err.message}`, 'error'); }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };
  const cancelGenerate = () => abortRef.current?.abort();

  // One-click: convert the whole .md to diagrams + code in the target format.
  const runAuto = async () => {
    if (!src.trim()) { say('Load or paste a Markdown document first', 'warn'); return; }
    setBusy(true);
    setProgress([]);
    const controller = new AbortController();
    abortRef.current = controller;
    say(`Auto-converting markdown → ${genFmt}… (may call the model)`, 'info');
    try {
      const { kind, output, results } = await autoConvertDoc(src, {
        generate, target: genFmt, signal: controller.signal,
        onProgress: (n, total, r) => {
          setProgress((prev) => [...prev, { n, total, description: r.description, ok: r.ok }]);
          say(`Auto ${n}/${total}…`, 'info');
        },
      });
      setOut(output || '');
      const ok = results.filter((r) => r.ok).length;
      const total = results.length || 1;
      say(`Auto (${kind}): ${ok}/${total} → ${genFmt}`, ok === total ? 'ok' : 'warn');
    } catch (err) {
      if (err.name === 'AbortError') { say('Cancelled', 'warn'); }
      else { console.error('auto-convert failed:', err); say(`Auto error: ${err.message}`, 'error'); }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const aiDisabled = busy || (targetFmt === 'mermaid' && mode === 'format');

  return (
    <div className="convert">
      <div className="convert-bar">
        <button type="button" onClick={() => fileRef.current?.click()}>Load .md</button>
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.puml,.mmd" hidden onChange={onLoadFile} />

        <button type="button" className="auto-btn" onClick={runAuto} disabled={busy}
          title="Auto-convert the whole .md to diagrams + code">Auto ✦</button>
        <label>
          as
          <select value={genFmt} onChange={(e) => setGenFmt(e.target.value)} title="Output format for Auto / Generate">
            <option value="plantuml">PlantUML</option>
            <option value="mermaid">Mermaid</option>
          </select>
        </label>
        {busy && <button type="button" onClick={cancelGenerate}>Stop</button>}

        {mode === 'generate' ? (
          <span className={`badge ${prompts.length || src.trim() ? 'ok' : 'err'}`}>
            {prompts.length ? `prompts: ${prompts.length}` : 'whole text'}
          </span>
        ) : (
          <>
            {blocks.length > 1 && (
              <label>
                Block
                <select value={blockIdx} onChange={(e) => setBlockIdx(Number(e.target.value))}>
                  {blocks.map((b, i) => <option key={i} value={i}>#{i + 1} · {b.lang}</option>)}
                </select>
              </label>
            )}
            <span className={`badge ${srcFmt === 'unknown' ? 'err' : 'ok'}`}>source: {srcFmt}</span>
          </>
        )}

        <span className="spacer" />

        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="format">Format (PlantUML ↔ Mermaid)</option>
            <option value="type">PlantUML type → type</option>
            <option value="generate">Generate from text</option>
          </select>
        </label>

        {mode === 'format' && (
          <label>
            To
            <select value={targetFmt} onChange={(e) => setTargetFmt(e.target.value)}>
              <option value="plantuml">PlantUML</option>
              <option value="mermaid">Mermaid</option>
            </select>
          </label>
        )}
        {mode === 'type' && (
          <label>
            As type
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              {PUML_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        {mode === 'generate' && (
          <label>
            Type
            <select value={genType} onChange={(e) => setGenType(e.target.value)}>
              <option value="auto">auto</option>
              {PUML_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}

        {mode === 'generate' ? (
          <button type="button" onClick={runGenerate} disabled={busy || (prompts.length === 0 && !src.trim())}
            title="Generate diagram(s) from the prompts in the document, or from the whole text if none">
            {prompts.length ? `Generate diagrams (${prompts.length}) ✦` : 'Generate from text ✦'}
          </button>
        ) : (
          <>
            <button type="button" onClick={runConvert} disabled={busy}>Convert</button>
            <button type="button" onClick={runAI} disabled={aiDisabled} title="Use the matrix-safe model (PlantUML output only)">
              Convert with AI ✦
            </button>
          </>
        )}
      </div>

      {mode === 'generate' && progress.length > 0 && (
        <div className="convert-progress">
          {progress.map((p, i) => (
            <div key={i} className={`agent-log-row ${p.ok ? 'ok' : 'warn'}`}>
              {p.n}/{p.total} {p.ok ? '✅' : '❌'} {p.description.slice(0, 90)}
            </div>
          ))}
        </div>
      )}

      <div className="convert-cols">
        <Split storageKey="plantuml-editor.convert-split">
          <div className="convert-col">
            <div className="convert-col-head">
              Source (Markdown / diagram)
              <span className="spacer" />
              <button type="button" className="link" disabled={!src}
                onClick={() => { setSrc(''); setBlockIdx(0); say('Cleared source', 'info'); }}>Clear</button>
            </div>
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
