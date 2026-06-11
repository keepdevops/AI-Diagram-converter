// Minimal PNG tEXt-chunk read/write, used to embed the diagram source inside an
// exported PNG so "Open" can recover an editable diagram from a raster export.
// Only the pieces we need: CRC32 + insert-before-IEND + linear chunk scan.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

// Return a new PNG with a `tEXt` chunk (keyword\0text) inserted before IEND.
export function embedText(pngBytes, keyword, text) {
  const enc = new TextEncoder();
  const data = new Uint8Array([...enc.encode(keyword), 0, ...enc.encode(text)]);
  const type = enc.encode('tEXt');
  const typed = new Uint8Array([...type, ...data]);
  const chunk = new Uint8Array([...u32(data.length), ...typed, ...u32(crc32(typed))]);

  const iend = pngBytes.length - 12; // IEND is always the final 12-byte chunk
  const out = new Uint8Array(pngBytes.length + chunk.length);
  out.set(pngBytes.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(pngBytes.subarray(iend), iend + chunk.length);
  return out;
}

// Find the first tEXt chunk with the given keyword and return its text, or null.
export function readText(pngBytes, keyword) {
  const dec = new TextDecoder();
  let i = 8; // skip the 8-byte PNG signature
  while (i + 8 <= pngBytes.length) {
    const len = ((pngBytes[i] << 24) | (pngBytes[i + 1] << 16) | (pngBytes[i + 2] << 8) | pngBytes[i + 3]) >>> 0;
    const type = dec.decode(pngBytes.subarray(i + 4, i + 8));
    const dataStart = i + 8;
    if (type === 'tEXt') {
      const data = pngBytes.subarray(dataStart, dataStart + len);
      const z = data.indexOf(0);
      if (z !== -1 && dec.decode(data.subarray(0, z)) === keyword) {
        return dec.decode(data.subarray(z + 1));
      }
    }
    if (type === 'IEND') break;
    i = dataStart + len + 4; // advance past data + 4-byte CRC
  }
  return null;
}
