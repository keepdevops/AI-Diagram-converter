// Serialize the editor's diagram to a file Blob, and parse an opened file back
// into editable source. Supported: source (.puml/.mmd), Markdown (.md), JSON
// (.json), SVG, PNG. SVG/PNG embed the source (base64 JSON) so a raster/vector
// export can be reopened as an editable diagram. Every failure throws loudly.

import { encodePlantUml } from './encoder.js';
import { detectFormat } from './mdBlocks.js';
import { extractBlocks } from './mdBlocks.js';
import { embedText, readText } from './png.js';

const MARK = 'plantuml-editor-source'; // keyword for embedded source (svg comment / png tEXt)

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (b64) => decodeURIComponent(escape(atob(b64)));
const isMermaid = (source) => detectFormat(source) === 'mermaid';

// ---- render helpers --------------------------------------------------------

async function plantumlBytes(source, server, kind) {
  const enc = await encodePlantUml(source);
  const resp = await fetch(`${server.replace(/\/+$/, '')}/${kind}/${enc}`);
  if (!resp.ok) throw new Error(`PlantUML server returned ${resp.status} for ${kind}`);
  return kind === 'svg' ? resp.text() : new Uint8Array(await resp.arrayBuffer());
}

async function mermaidSvg(source) {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  const { svg } = await mermaid.render(`file-mmd-${Date.now()}`, source);
  return svg;
}

// Rasterize an SVG to a PNG/JPEG via canvas. JPEG has no alpha, so we paint a
// white background first to avoid black fills where the SVG was transparent.
async function svgToRaster(svgText, mime, quality) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('could not rasterize SVG'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;
    const ctx = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
    if (!blob) throw new Error(`canvas could not encode ${mime}`);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

const embedPayload = (source) => b64encode(JSON.stringify({ format: detectFormat(source), source }));

// ---- serialize -------------------------------------------------------------

// Returns { blob, ext, mime }. `server` is only needed for PlantUML svg/png.
export async function serialize(format, source, server) {
  if (!source || !source.trim()) throw new Error('nothing to save (empty diagram)');
  switch (format) {
    case 'source': {
      const ext = isMermaid(source) ? 'mmd' : 'puml';
      return { blob: new Blob([source], { type: 'text/plain' }), ext, mime: 'text/plain' };
    }
    case 'md': {
      const lang = isMermaid(source) ? 'mermaid' : 'plantuml';
      const md = `\`\`\`${lang}\n${source.trim()}\n\`\`\`\n`;
      return { blob: new Blob([md], { type: 'text/markdown' }), ext: 'md', mime: 'text/markdown' };
    }
    case 'json': {
      const doc = { app: 'plantuml-editor', version: 1, format: detectFormat(source), source };
      const json = JSON.stringify(doc, null, 2);
      return { blob: new Blob([json], { type: 'application/json' }), ext: 'json', mime: 'application/json' };
    }
    case 'svg': {
      const raw = isMermaid(source) ? await mermaidSvg(source) : await plantumlBytes(source, server, 'svg');
      const withSrc = raw.replace('</svg>', `<!--${MARK}:${embedPayload(source)}--></svg>`);
      return { blob: new Blob([withSrc], { type: 'image/svg+xml' }), ext: 'svg', mime: 'image/svg+xml' };
    }
    case 'png': {
      const bytes = isMermaid(source)
        ? await svgToRaster(await mermaidSvg(source), 'image/png')
        : await plantumlBytes(source, server, 'png');
      const withSrc = embedText(bytes, MARK, embedPayload(source));
      return { blob: new Blob([withSrc], { type: 'image/png' }), ext: 'png', mime: 'image/png' };
    }
    case 'jpg': {
      // No JPG endpoint on the PlantUML server (and JPEG can't carry the source
      // chunk), so this is a flattened, export-only raster from the SVG.
      const svg = isMermaid(source) ? await mermaidSvg(source) : await plantumlBytes(source, server, 'svg');
      const bytes = await svgToRaster(svg, 'image/jpeg', 0.92);
      return { blob: new Blob([bytes], { type: 'image/jpeg' }), ext: 'jpg', mime: 'image/jpeg' };
    }
    default:
      throw new Error(`unknown save format: ${format}`);
  }
}

// ---- parse (open) ----------------------------------------------------------

function decodeEmbedded(payload) {
  try {
    const obj = JSON.parse(b64decode(payload));
    if (obj && typeof obj.source === 'string') return obj.source;
  } catch (err) {
    console.error('embedded source decode failed:', err);
  }
  return null;
}

// `text` for text files, `bytes` (Uint8Array) for binary (png). Returns source.
export function parseOpened(name, text, bytes) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') {
    throw new Error('JPG is a flattened export and has no embedded source to edit');
  }
  if (ext === 'png') {
    const payload = bytes ? readText(bytes, MARK) : null;
    const src = payload && decodeEmbedded(payload);
    if (!src) throw new Error('PNG has no embedded editable source');
    return src;
  }
  if (ext === 'svg') {
    const m = text.match(new RegExp(`${MARK}:([A-Za-z0-9+/=]+)`));
    const src = m && decodeEmbedded(m[1]);
    if (!src) throw new Error('SVG has no embedded editable source');
    return src;
  }
  if (ext === 'json') {
    const obj = JSON.parse(text);
    if (typeof obj.source === 'string') return obj.source;
    throw new Error('JSON file has no "source" field');
  }
  if (ext === 'md' || ext === 'markdown') {
    const blocks = extractBlocks(text);
    return blocks.length ? blocks[0].code : text.trim();
  }
  return text; // .puml / .mmd / .txt and anything else: raw source
}
