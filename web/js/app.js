import { encodePlantUml } from './encoder.js';
import { EXAMPLES, DEFAULT_DIAGRAM } from './examples.js';
import { isMermaid, renderMermaid } from './mmd.js';

const STORAGE_KEY = 'plantuml-editor.text';
const SERVER_KEY = 'plantuml-editor.server';
const RENDER_DEBOUNCE_MS = 500;

const els = {
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  mermaidPreview: document.getElementById('mermaid-preview'),
  status: document.getElementById('status'),
  serverInput: document.getElementById('server'),
  exampleSelect: document.getElementById('example'),
  format: document.getElementById('format'),
  downloadBtn: document.getElementById('download'),
  openBtn: document.getElementById('open-raw'),
};

let lastEncoded = '';
let lastMermaidSvg = '';
let currentMode = 'plantuml';   // 'plantuml' | 'mermaid'
let renderTimer = null;

function setStatus(text, kind = 'info') {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function serverBase() {
  const raw = (els.serverInput.value || '').trim().replace(/\/+$/, '');
  return raw || 'https://www.plantuml.com/plantuml';
}

function imageUrl(format, encoded) {
  return `${serverBase()}/${format}/${encoded}`;
}

function setMode(mode) {
  currentMode = mode;
  els.preview.hidden = mode !== 'plantuml';
  els.mermaidPreview.hidden = mode !== 'mermaid';
}

async function render() {
  const text = els.editor.value;
  if (!text.trim()) {
    setStatus('Empty diagram', 'warn');
    return;
  }
  if (isMermaid(text)) {
    await renderMermaidMode(text);
  } else {
    await renderPlantumlMode(text);
  }
}

async function renderMermaidMode(text) {
  setMode('mermaid');
  setStatus('Rendering (Mermaid)…', 'info');
  try {
    const svg = await renderMermaid(text);
    lastMermaidSvg = svg;
    els.mermaidPreview.innerHTML = svg;
    setStatus('Rendered (Mermaid)', 'ok');
  } catch (err) {
    console.error('Mermaid render failed:', err);
    setStatus(`Mermaid error: ${err.message || err}`, 'error');
  }
}

async function renderPlantumlMode(text) {
  setMode('plantuml');
  setStatus('Rendering…', 'info');
  try {
    const encoded = await encodePlantUml(text);
    lastEncoded = encoded;
    const url = imageUrl('svg', encoded);

    // Probe load so we can surface failures instead of a broken image.
    const probe = new Image();
    probe.onload = () => {
      els.preview.src = url;
      setStatus('Rendered', 'ok');
    };
    probe.onerror = () => {
      console.error('Preview image failed to load:', url);
      setStatus('Render failed — check syntax or server URL', 'error');
    };
    probe.src = url;
  } catch (err) {
    console.error('render() failed:', err);
    setStatus(`Encode error: ${err.message}`, 'error');
  }
}

function scheduleRender() {
  localStorage.setItem(STORAGE_KEY, els.editor.value);
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(render, RENDER_DEBOUNCE_MS);
}

function triggerDownload(href, filename, revoke = false) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function downloadCurrent() {
  if (currentMode === 'mermaid') return downloadMermaid(els.format.value);
  if (!lastEncoded) {
    setStatus('Nothing to download yet', 'warn');
    return;
  }
  const format = els.format.value;
  triggerDownload(imageUrl(format, lastEncoded), `diagram.${format}`);
}

function downloadMermaid(format) {
  if (!lastMermaidSvg) {
    setStatus('Nothing to download yet', 'warn');
    return;
  }
  if (format !== 'png') {  // svg or txt -> the SVG source
    const blob = new Blob([lastMermaidSvg], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), 'diagram.svg', true);
    return;
  }
  // PNG: rasterize the rendered SVG onto a white canvas.
  const svgEl = els.mermaidPreview.querySelector('svg');
  const w = (svgEl && svgEl.clientWidth) || 1200;
  const h = (svgEl && svgEl.clientHeight) || 800;
  const blob = new Blob([lastMermaidSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => triggerDownload(URL.createObjectURL(b), 'diagram.png', true), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('PNG export failed', 'error');
  };
  img.src = url;
}

function openRaw() {
  if (currentMode === 'mermaid') {
    if (!lastMermaidSvg) return setStatus('Render first', 'warn');
    const blob = new Blob([lastMermaidSvg], { type: 'image/svg+xml' });
    return window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  }
  if (!lastEncoded) {
    setStatus('Render first', 'warn');
    return;
  }
  window.open(imageUrl(els.format.value, lastEncoded), '_blank', 'noopener');
}

function populateExamples() {
  for (const name of Object.keys(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    els.exampleSelect.appendChild(opt);
  }
}

function onExampleChange() {
  const choice = els.exampleSelect.value;
  if (!choice || !EXAMPLES[choice]) return;
  els.editor.value = EXAMPLES[choice];
  els.exampleSelect.value = '';
  scheduleRender();
  render();
}

// Tab key inserts two spaces instead of moving focus.
function handleTab(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const { selectionStart: s, selectionEnd: end, value } = els.editor;
  els.editor.value = value.slice(0, s) + '  ' + value.slice(end);
  els.editor.selectionStart = els.editor.selectionEnd = s + 2;
  scheduleRender();
}

function init() {
  populateExamples();
  els.editor.value = localStorage.getItem(STORAGE_KEY) || DEFAULT_DIAGRAM;
  els.serverInput.value =
    localStorage.getItem(SERVER_KEY) || 'https://www.plantuml.com/plantuml';

  els.editor.addEventListener('input', scheduleRender);
  els.editor.addEventListener('keydown', handleTab);
  els.exampleSelect.addEventListener('change', onExampleChange);
  els.downloadBtn.addEventListener('click', downloadCurrent);
  els.openBtn.addEventListener('click', openRaw);
  els.serverInput.addEventListener('change', () => {
    localStorage.setItem(SERVER_KEY, serverBase());
    render();
  });

  // Bridge for agent.js (separate module): get/set diagram + status.
  window.plantumlEditor = {
    getDiagram: () => els.editor.value,
    setDiagram: (text) => {
      els.editor.value = text;
      scheduleRender();
      render();
    },
    setStatus,
  };

  render();
}

init();
