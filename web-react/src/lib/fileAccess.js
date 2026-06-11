// Open/save plumbing. Prefers the File System Access API (real Save/overwrite
// via a file handle + native pickers) and falls back to <input type=file> +
// download for browsers without it (Firefox/Safari). Cancellation is signalled
// by returning null, not throwing.

import { serialize, parseOpened } from './fileFormats.js';

export const supportsFS =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

const OPEN_ACCEPT = '.puml,.mmd,.txt,.md,.markdown,.json,.svg,.png,.jpg,.jpeg';
const OPEN_TYPES = [{
  description: 'Diagrams & images',
  accept: {
    'text/plain': ['.puml', '.mmd', '.txt'],
    'text/markdown': ['.md', '.markdown'],
    'application/json': ['.json'],
    'image/svg+xml': ['.svg'],
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
  },
}];

const IMAGE_EXTS = ['svg', 'png', 'jpg', 'jpeg'];
const ext = (name) => (name.split('.').pop() || '').toLowerCase();
const mimeFromExt = (e) => ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[e] || '');

// Returns { name, handle, source } for editable files, or { name, handle, image }
// for images with no embedded source (displayed, not edited). svg/png are probed
// for embedded source first; jpg is always display-only.
async function readFileObject(file, handle) {
  const name = file.name;
  const e = ext(name);
  if (IMAGE_EXTS.includes(e)) {
    let source = null;
    try {
      if (e === 'png') source = parseOpened(name, null, new Uint8Array(await file.arrayBuffer()));
      else if (e === 'svg') source = parseOpened(name, await file.text(), null);
    } catch (err) {
      source = null; // no embedded source -> fall through to display the image
    }
    if (source) return { name, handle, source };
    return { name, handle, image: { url: URL.createObjectURL(file), mime: file.type || mimeFromExt(e) } };
  }
  return { name, handle, source: parseOpened(name, await file.text(), null) };
}

function pickViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = OPEN_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] || null);
    // If the dialog is dismissed there's no reliable event; resolve(null) on focus return.
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] || null), 300), { once: true });
    input.click();
  });
}

// Returns { name, handle, source } or null if cancelled. Throws on parse failure.
export async function openFile() {
  if (supportsFS) {
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES, multiple: false });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    return readFileObject(await handle.getFile(), handle);
  }
  const file = await pickViaInput();
  return file ? readFileObject(file, null) : null;
}

function ensureExt(name, ext) {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base || 'diagram'}.${ext}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function writeHandle(handle, blob) {
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

// Save As: serialize, then native picker (handle returned for later Save) or
// download fallback. Returns { handle, name, ext, format } or null if cancelled.
export async function saveFileAs(format, source, server, suggestedName = 'diagram') {
  const { blob, ext, mime } = await serialize(format, source, server);
  const name = ensureExt(suggestedName, ext);
  if (supportsFS) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }],
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    await writeHandle(handle, blob);
    return { handle, name: handle.name || name, ext, format };
  }
  download(blob, name);
  return { handle: null, name, ext, format };
}

// Save to an existing handle in the given format (true overwrite, no dialog).
export async function saveToHandle(handle, format, source, server) {
  const { blob } = await serialize(format, source, server);
  await writeHandle(handle, blob);
}
