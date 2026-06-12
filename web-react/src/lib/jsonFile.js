// Open/save a JSON document with the File System Access API (real overwrite via a
// handle) and a download / <input> fallback. Used for the .graph.json layout doc.

const supportsFS =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

function isGraph(obj) {
  return obj && Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

function pickViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.graph.json,application/json';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

// Returns { obj, handle, name } or null if cancelled. Throws loudly on bad JSON
// or a non-graph object.
export async function openJsonFile() {
  let file, handle = null;
  if (supportsFS) {
    try {
      [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Graph', accept: { 'application/json': ['.json'] } }],
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    file = await handle.getFile();
  } else {
    file = await pickViaInput();
    if (!file) return null;
  }
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch (err) {
    throw new Error(`${file.name} is not valid JSON`);
  }
  if (!isGraph(obj)) throw new Error(`${file.name} is not a graph document (needs nodes[] and edges[])`);
  return { obj, handle, name: file.name };
}

// Save obj as JSON. Reuses `handle` (real overwrite) when given; else picker /
// download. Returns { handle, name }.
export async function saveJsonFile(suggestedName, obj, handle = null) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  if (handle && supportsFS) {
    const w = await handle.createWritable();
    await w.write(blob); await w.close();
    return { handle, name: handle.name || suggestedName };
  }
  if (supportsFS) {
    let h;
    try {
      h = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Graph', accept: { 'application/json': ['.json'] } }],
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    const w = await h.createWritable();
    await w.write(blob); await w.close();
    return { handle: h, name: h.name || suggestedName };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = suggestedName;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return { handle: null, name: suggestedName };
}
