// Wires the Fix / Generate buttons to the diagram-agent service
// (diagram_agent/server.py), which builds/corrects PlantUML via matrix-safe.
// Reads/replaces the editor through the bridge exposed by app.js.

const AGENT_KEY = 'plantuml-editor.agent';
const DEFAULT_AGENT = 'http://127.0.0.1:8770';

const agentInput = document.getElementById('agent-server');

function agentBase() {
  // The textbox is the source of truth when present; fall back to storage/default.
  const fromInput = (agentInput?.value || '').trim().replace(/\/+$/, '');
  if (fromInput) return fromInput;
  const stored = (localStorage.getItem(AGENT_KEY) || '').trim().replace(/\/+$/, '');
  return stored || DEFAULT_AGENT;
}

function initAgentInput() {
  if (!agentInput) return;
  agentInput.value = (localStorage.getItem(AGENT_KEY) || DEFAULT_AGENT);
  agentInput.addEventListener('change', () => {
    const v = agentInput.value.trim().replace(/\/+$/, '');
    localStorage.setItem(AGENT_KEY, v || DEFAULT_AGENT);
    window.plantumlEditor?.setStatus(`matrix-safe endpoint set to ${agentBase()}`, 'info');
  });
}

function editor() {
  const e = window.plantumlEditor;
  if (!e) throw new Error('editor bridge not ready');
  return e;
}

async function callAgent(path, body) {
  const resp = await fetch(`${agentBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `agent HTTP ${resp.status}`);
  return data;
}

function summarize(data) {
  if (data.note) return data.note;
  return data.ok ? 'Done.' : (data.error ? `Best effort — ${data.error}` : 'Best effort.');
}

async function run(path, body, label) {
  const ed = editor();
  ed.setStatus(`${label} via matrix-safe… (local model, ~10–40s)`, 'info');
  try {
    const data = await callAgent(path, body);
    if (data.diagram) ed.setDiagram(data.diagram);
    ed.setStatus(summarize(data), data.ok ? 'ok' : 'warn');
  } catch (err) {
    console.error(`${label} failed:`, err);
    ed.setStatus(`${label} failed: ${err.message}`, 'error');
  }
}

function onFix() {
  const text = editor().getDiagram();
  if (!text.trim()) { editor().setStatus('Nothing to fix', 'warn'); return; }
  run('/api/fix', { text }, 'Fixing');
}

function onGenerate() {
  const description = window.prompt('Describe the diagram to generate:');
  if (description === null) return;
  if (!description.trim()) { editor().setStatus('Empty description', 'warn'); return; }
  run('/api/generate', { description }, 'Generating');
}

function onConvert() {
  const text = editor().getDiagram();
  if (!text.trim()) { editor().setStatus('Paste content to convert first', 'warn'); return; }
  const target = document.getElementById('convert-target')?.value || 'plantuml';
  run('/api/convert', { text, target }, `Converting → ${target}`);
}

initAgentInput();
document.getElementById('fix')?.addEventListener('click', onFix);
document.getElementById('generate')?.addEventListener('click', onGenerate);
document.getElementById('convert')?.addEventListener('click', onConvert);
