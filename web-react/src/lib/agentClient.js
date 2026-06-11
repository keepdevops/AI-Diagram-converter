// Client for the local diagram-agent bridge (diagram_agent/server.py), which is
// backed by a single local model through matrix-safe. Plain request/response JSON
// — the bridge no longer streams. Contract:
//   POST /api/fix       {text}               -> {ok, diagram, note, error, attempts}
//   POST /api/generate  {description, type?}  -> same shape
//   GET  /api/health                          -> {ok, agent, matrix_url}
//
// In dev, requests are same-origin: Vite proxies /api -> :8770 (vite.config.js).
// Override with a full base (e.g. http://127.0.0.1:8770) for static hosting.

const AGENT_KEY = 'plantuml-editor.agent';

export function agentBase() {
  return (localStorage.getItem(AGENT_KEY) || '').trim().replace(/\/+$/, ''); // '' => proxied
}

export function setAgentBase(url) {
  localStorage.setItem(AGENT_KEY, (url || '').trim().replace(/\/+$/, ''));
}

// GET /api/health -> { ok, agent, matrix_url } or throws.
export async function health(signal) {
  const resp = await fetch(`${agentBase()}/api/health`, { signal });
  if (!resp.ok) throw new Error(`health HTTP ${resp.status}`);
  return resp.json();
}

// POST a JSON body and return the parsed transcript, raising on transport or
// HTTP error so the UI surfaces failures instead of stalling.
async function post(path, body, signal) {
  let resp;
  try {
    resp = await fetch(`${agentBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.error('agent fetch failed:', err);
    throw new Error(`agent unreachable: ${err.message}`);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.error || `agent HTTP ${resp.status}`;
    console.error('agent error:', msg);
    throw new Error(msg);
  }
  return data; // { ok, diagram, note, error, attempts }
}

export const fix = (text, signal) => post('/api/fix', { text }, signal);

export const generate = (description, type, signal) =>
  post('/api/generate', { description, type }, signal);
