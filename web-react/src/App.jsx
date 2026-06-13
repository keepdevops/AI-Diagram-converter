// Top-level app: owns diagram text, server/format config, and the agent endpoint.
// Persists everything to localStorage and orchestrates editor ↔ preview ↔ swarm.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Editor from './components/Editor.jsx';
import Preview, { imageUrl } from './components/Preview.jsx';
import SwarmLog from './components/SwarmLog.jsx';
import ConvertPanel from './components/ConvertPanel.jsx';
import Split from './components/Split.jsx';
import EditorBar from './components/EditorBar.jsx';
import ImageView from './components/ImageView.jsx';
import { detectFormat } from './lib/mdBlocks.js';
import { openFile, saveFileAs, saveToHandle, supportsFS } from './lib/fileAccess.js';

// mermaid is ~1.7 MB; load it only when a Mermaid diagram is actually previewed.
const MermaidView = lazy(() => import('./components/MermaidView.jsx'));
// React Flow + dagre are heavy; load the Graph editor only when its tab is opened.
const GraphView = lazy(() => import('./components/GraphView.jsx'));
// CodeMirror language packs load with the Code tab.
const CodeView = lazy(() => import('./components/CodeView.jsx'));
// The visual Designer (React Flow + palette/inspector) loads with its tab.
const DesignerView = lazy(() => import('./components/DesignerView.jsx'));
import { useAgent } from './hooks/useAgent.js';
import { agentBase, setAgentBase } from './lib/agentClient.js';
import { DEFAULT_DIAGRAM } from './lib/examples.js';
import { EXAMPLES } from './lib/examples.js';

const KEYS = {
  text: 'plantuml-editor.text',
  server: 'plantuml-editor.server',
  format: 'plantuml-editor.format',
};
// Same-origin by default so an air-gapped nginx can proxy /plantuml -> the render
// service (no external host reachable). Override at build time with VITE_PLANTUML_SERVER.
const DEFAULT_SERVER = import.meta.env.VITE_PLANTUML_SERVER || '/plantuml';

export default function App() {
  const [text, setText] = useState(() => localStorage.getItem(KEYS.text) || DEFAULT_DIAGRAM);
  const [server, setServer] = useState(() => localStorage.getItem(KEYS.server) || DEFAULT_SERVER);
  const [format, setFormat] = useState(() => localStorage.getItem(KEYS.format) || 'svg');
  const [agentUrl, setAgentUrl] = useState(() => agentBase());
  const [status, setStatusState] = useState({ text: 'Ready', kind: 'info' });
  const [swarmInfo, setSwarmInfo] = useState(undefined); // undefined=checking, null=offline
  const [logOpen, setLogOpen] = useState(false);
  const [view, setView] = useState('editor'); // 'editor' | 'convert' | 'graph' | 'code'
  const [pendingGraphImport, setPendingGraphImport] = useState(false);
  const encodedRef = useRef('');

  // File document state.
  const [fileName, setFileName] = useState('untitled');
  const [fileHandle, setFileHandle] = useState(null);
  const [fileFormat, setFileFormat] = useState('source');
  const [savedText, setSavedText] = useState(() => localStorage.getItem(KEYS.text) || DEFAULT_DIAGRAM);
  const [fileBusy, setFileBusy] = useState(false);
  const [importedImage, setImportedImage] = useState(null); // { url, mime } | null
  const imgUrlRef = useRef(null);
  const dirty = text !== savedText;

  const setStatus = useCallback((t, kind = 'info') => setStatusState({ text: t, kind }), []);

  // Track the imported-image object URL so we can revoke the previous one and
  // avoid leaks. Pass null to clear (and return to source-rendered preview).
  const showImage = useCallback((image) => {
    if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current);
    imgUrlRef.current = image?.url || null;
    setImportedImage(image);
  }, []);
  useEffect(() => () => { if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current); }, []);

  // Editing the diagram returns to the rendered preview (drops the imported image).
  const onEditText = useCallback((t) => {
    setText(t);
    if (imgUrlRef.current) showImage(null);
  }, [showImage]);

  // Persist on change.
  useEffect(() => { localStorage.setItem(KEYS.text, text); }, [text]);
  useEffect(() => { localStorage.setItem(KEYS.server, server.replace(/\/+$/, '') || DEFAULT_SERVER); }, [server]);
  useEffect(() => { localStorage.setItem(KEYS.format, format); }, [format]);

  const agent = useAgent({ applyDiagram: onEditText, setStatus });

  // Probe the agent bridge on mount and whenever its base changes.
  useEffect(() => {
    setSwarmInfo(undefined);
    let alive = true;
    agent.checkHealth().then((info) => { if (alive) setSwarmInfo(info); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentUrl]);

  const onAgentBase = useCallback((url) => {
    setAgentUrl(url);
    setAgentBase(url);
  }, []);

  const onExample = useCallback((name) => {
    if (name && EXAMPLES[name]) onEditText(EXAMPLES[name]);
  }, [onEditText]);

  // Clear the pasted code/text in the editor. Confirm first so content isn't
  // lost by accident; clearing the text also drops any imported image preview.
  // (No success status here: the Preview re-renders empty text and immediately
  // sets its own "Empty diagram" status, so any message set here is unseen.)
  const onClearEditor = useCallback(() => {
    if (!text.trim()) { setStatus('Editor already empty', 'info'); return; }
    if (!window.confirm('Clear the editor content?')) return;
    onEditText('');
  }, [text, onEditText, setStatus]);

  const serverBase = (server.replace(/\/+$/, '')) || DEFAULT_SERVER;

  const onViewRender = useCallback(() => {
    if (!encodedRef.current) { setStatus('Render first', 'warn'); return; }
    window.open(imageUrl(serverBase, format, encodedRef.current), '_blank', 'noopener');
  }, [serverBase, format, setStatus]);

  // -- file operations -----------------------------------------------------
  const resetDoc = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setText('');
    setSavedText('');
    setFileName('untitled');
    setFileHandle(null);
    showImage(null);
    setStatus('New document', 'info');
  }, [dirty, showImage, setStatus]);

  const onFileOpen = useCallback(async () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setFileBusy(true);
    try {
      const opened = await openFile();
      if (!opened) return; // cancelled
      setFileName(opened.name);
      setFileHandle(opened.handle);
      if (opened.image) {
        // Image with no embedded source: display it, leave the editor empty.
        setText('');
        setSavedText('');
        showImage(opened.image);
        setStatus(`Opened ${opened.name} (image — no editable source)`, 'ok');
        return;
      }
      showImage(null);
      setText(opened.source);
      setSavedText(opened.source);
      setStatus(`Opened ${opened.name}`, 'ok');
    } catch (err) {
      console.error('open failed:', err);
      setStatus(`Open failed: ${err.message}`, 'error');
    } finally {
      setFileBusy(false);
    }
  }, [dirty, setStatus]);

  const onFileSaveAs = useCallback(async (fmt) => {
    if (!text.trim()) { setStatus('Nothing to save', 'warn'); return; }
    setFileBusy(true);
    try {
      const saved = await saveFileAs(fmt, text, serverBase, fileName);
      if (!saved) return; // cancelled
      setFileHandle(saved.handle);
      setFileName(saved.name);
      setFileFormat(saved.format);
      setSavedText(text);
      setStatus(`Saved ${saved.name}`, 'ok');
    } catch (err) {
      console.error('save-as failed:', err);
      setStatus(`Save failed: ${err.message}`, 'error');
    } finally {
      setFileBusy(false);
    }
  }, [text, serverBase, fileName, setStatus]);

  const onFileSave = useCallback(async () => {
    if (!text.trim()) { setStatus('Nothing to save', 'warn'); return; }
    if (!(fileHandle && supportsFS)) { onFileSaveAs(fileFormat); return; }
    setFileBusy(true);
    try {
      await saveToHandle(fileHandle, fileFormat, text, serverBase);
      setSavedText(text);
      setStatus(`Saved ${fileName}`, 'ok');
    } catch (err) {
      console.error('save failed:', err);
      setStatus(`Save failed: ${err.message}`, 'error');
    } finally {
      setFileBusy(false);
    }
  }, [text, fileHandle, fileFormat, serverBase, fileName, onFileSaveAs, setStatus]);

  // Keyboard shortcuts: ⌘/Ctrl+S save, ⌘/Ctrl+⇧S save as, ⌘/Ctrl+O open.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); e.shiftKey ? onFileSaveAs(fileFormat) : onFileSave(); }
      else if (k === 'o') { e.preventDefault(); onFileOpen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFileSave, onFileSaveAs, onFileOpen, fileFormat]);

  const onFix = useCallback(() => {
    if (!text.trim()) { setStatus('Nothing to fix', 'warn'); return; }
    setLogOpen(true);
    agent.fix(text);
  }, [text, agent, setStatus]);

  const onGenerate = useCallback(() => {
    const description = window.prompt('Describe the diagram to generate:');
    if (description === null) return;
    if (!description.trim()) { setStatus('Empty description', 'warn'); return; }
    setLogOpen(true);
    agent.generate(description, null);
  }, [agent, setStatus]);

  return (
    <div className="app">
      <Toolbar
        view={view}
        onView={setView}
        swarmInfo={swarmInfo}
        settings={{ agentBaseValue: agentUrl, onAgentBase, server, onServer: setServer }}
        file={{
          name: fileName,
          dirty,
          format: fileFormat,
          busy: fileBusy,
          onFormat: setFileFormat,
          onNew: resetDoc,
          onOpen: onFileOpen,
          onSave: onFileSave,
          onSaveAs: onFileSaveAs,
          onClose: resetDoc,
        }}
      />

      {view === 'graph' ? (
        <Suspense fallback={<div className="preview-empty" style={{ padding: 24 }}>Loading graph editor…</div>}>
          <GraphView
            text={text}
            forceImport={pendingGraphImport}
            onConsumed={() => setPendingGraphImport(false)}
            onApply={(t) => { onEditText(t); setStatus('Applied graph to editor', 'ok'); }}
            setStatus={setStatus}
          />
        </Suspense>
      ) : view === 'designer' ? (
        <Suspense fallback={<div className="preview-empty" style={{ padding: 24 }}>Loading designer…</div>}>
          <DesignerView
            text={text}
            onApply={(t) => { onEditText(t); setStatus('Applied design to editor', 'ok'); }}
            setStatus={setStatus}
          />
        </Suspense>
      ) : view === 'code' ? (
        <Suspense fallback={<div className="preview-empty" style={{ padding: 24 }}>Loading code view…</div>}>
          <CodeView
            onOpenInEditor={(t) => { onEditText(t); setView('editor'); setStatus('Loaded generated diagram', 'ok'); }}
            onOpenInGraph={(t) => { onEditText(t); setPendingGraphImport(true); setView('graph'); }}
          />
        </Suspense>
      ) : view === 'convert' ? (
        <ConvertPanel
          onOpenInEditor={(t) => { onEditText(t); setView('editor'); setStatus('Loaded converted diagram', 'ok'); }}
        />
      ) : (
        <>
          <EditorBar
            onExample={onExample}
            onClear={onClearEditor}
            onFix={onFix}
            onGenerate={onGenerate}
            running={agent.running}
            format={format}
            onFormat={setFormat}
            onViewRender={onViewRender}
          />

          <SwarmLog
            open={logOpen}
            title={agent.title}
            log={agent.log}
            running={agent.running}
            onClose={() => setLogOpen(false)}
            onCancel={agent.cancel}
          />

          <main className="workspace">
            <Split storageKey="plantuml-editor.split">
              <div className="editor-pane">
                <Editor value={text} onChange={onEditText} />
              </div>
              {importedImage ? (
                <ImageView image={importedImage} name={fileName} />
              ) : detectFormat(text) === 'mermaid' ? (
                <Suspense fallback={<section className="preview-pane"><div className="preview-empty">Loading Mermaid…</div></section>}>
                  <MermaidView text={text} onStatus={setStatus} />
                </Suspense>
              ) : (
                <Preview
                  text={text}
                  server={serverBase}
                  format={format}
                  onStatus={setStatus}
                  onEncoded={(e) => { encodedRef.current = e; }}
                />
              )}
            </Split>
          </main>

          <footer className="statusbar" data-kind={status.kind}>{status.text}</footer>
        </>
      )}
    </div>
  );
}
