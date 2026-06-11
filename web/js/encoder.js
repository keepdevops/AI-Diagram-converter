// PlantUML text -> URL-safe encoded string.
// Pipeline: UTF-8 bytes -> raw DEFLATE -> PlantUML's base64 variant.
// Uses the browser-native CompressionStream('deflate-raw').

const SIX_BIT =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

function encode6bit(b) {
  // b is guaranteed 0..63 by callers (masked with & 0x3f).
  return SIX_BIT[b];
}

// Pack three input bytes into four 6-bit symbols (PlantUML's encode64).
function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return (
    encode6bit(c1 & 0x3f) +
    encode6bit(c2 & 0x3f) +
    encode6bit(c3 & 0x3f) +
    encode6bit(c4 & 0x3f)
  );
}

function bytesToPlantUmlBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += append3bytes(b1, b2, b3);
  }
  return out;
}

async function rawDeflate(bytes) {
  if (typeof CompressionStream === 'undefined') {
    throw new Error(
      'CompressionStream is unavailable; use a modern browser (Chrome/Edge/Firefox/Safari 16.4+).'
    );
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

// Public API: returns the encoded path segment for a PlantUML server URL.
export async function encodePlantUml(text) {
  try {
    const utf8 = new TextEncoder().encode(text);
    const deflated = await rawDeflate(utf8);
    return bytesToPlantUmlBase64(deflated);
  } catch (err) {
    console.error('encodePlantUml failed:', err);
    throw err;
  }
}
