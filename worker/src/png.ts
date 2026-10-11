/**
 * Tiny grayscale PNG encoder (zlib stored blocks). Used for the mock portrait.
 * Nothing here is stored per visitor.
 */

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function encodeGrayPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== width * height) {
    throw new Error('gray buffer size does not match width*height');
  }
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    raw[row] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), row + 1);
  }

  const blocks: number[] = [0x78, 0x01];
  const max = 65535;
  for (let offset = 0; offset < raw.length; offset += max) {
    const end = Math.min(raw.length, offset + max);
    const slice = raw.subarray(offset, end);
    const last = end >= raw.length;
    const len = slice.length;
    const nlen = (~len) & 0xffff;
    blocks.push(last ? 0x01 : 0x00, len & 0xff, (len >> 8) & 0xff, nlen & 0xff, (nlen >> 8) & 0xff);
    for (let i = 0; i < slice.length; i++) blocks.push(slice[i]);
  }
  const adler = adler32(raw);
  blocks.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(blocks)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Fixed grayscale face returned when MOCK_OPENAI is true. Not stored per request. */
export function mockPortraitPng(): Uint8Array {
  const size = 64;
  const pixels = new Uint8Array(size * size);
  pixels.fill(244);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - 32) / 16;
      const dy = (y - 26) / 18;
      const head = dx * dx + dy * dy <= 1;
      const hair = head && y < 18;
      const leftEye = Math.abs(x - 26) <= 2 && Math.abs(y - 26) <= 2;
      const rightEye = Math.abs(x - 38) <= 2 && Math.abs(y - 26) <= 2;
      const mouth = y === 34 && x >= 28 && x <= 36;
      const shoulder = y > 46 && Math.abs(x - 32) < 24 - (y - 46);
      let gray = 244;
      if (shoulder) gray = 107;
      if (head) gray = 207;
      if (hair) gray = 58;
      if (leftEye || rightEye || mouth) gray = 15;
      pixels[y * size + x] = gray;
    }
  }
  return encodeGrayPng(size, size, pixels);
}
