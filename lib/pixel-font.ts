/**
 * Self-hosted Press Start 2P (OFL 1.1) for canvas drawing.
 * The file lives in public/fonts and is requested with the Pages basePath.
 *
 * The vendored TTF includes Latin-1 accents (á, é, í, ó, ú, ñ, ü and the
 * uppercase forms). If a glyph is absent, drawing falls back to the base
 * letter plus a pixel accent so the mark is never dropped.
 */

import { publicPath } from './public-path';

export type AccentMark = 'acute' | 'grave' | 'tilde' | 'diaeresis' | 'circumflex';

export interface ShapedGlyph {
  /** Glyph drawn from the pixel font (base letter when an accent is synthesized). */
  char: string;
  /** Set only when the font has no precomposed glyph and we draw the mark ourselves. */
  accent?: AccentMark;
  /** Original character, accent included. */
  source: string;
}

const DECOMPOSITION: Record<string, { base: string; accent: AccentMark }> = {
  á: { base: 'a', accent: 'acute' },
  Á: { base: 'A', accent: 'acute' },
  é: { base: 'e', accent: 'acute' },
  É: { base: 'E', accent: 'acute' },
  í: { base: 'i', accent: 'acute' },
  Í: { base: 'I', accent: 'acute' },
  ó: { base: 'o', accent: 'acute' },
  Ó: { base: 'O', accent: 'acute' },
  ú: { base: 'u', accent: 'acute' },
  Ú: { base: 'U', accent: 'acute' },
  à: { base: 'a', accent: 'grave' },
  À: { base: 'A', accent: 'grave' },
  è: { base: 'e', accent: 'grave' },
  È: { base: 'E', accent: 'grave' },
  ì: { base: 'i', accent: 'grave' },
  Ì: { base: 'I', accent: 'grave' },
  ò: { base: 'o', accent: 'grave' },
  Ò: { base: 'O', accent: 'grave' },
  ù: { base: 'u', accent: 'grave' },
  Ù: { base: 'U', accent: 'grave' },
  â: { base: 'a', accent: 'circumflex' },
  Â: { base: 'A', accent: 'circumflex' },
  ê: { base: 'e', accent: 'circumflex' },
  Ê: { base: 'E', accent: 'circumflex' },
  î: { base: 'i', accent: 'circumflex' },
  Î: { base: 'I', accent: 'circumflex' },
  ô: { base: 'o', accent: 'circumflex' },
  Ô: { base: 'O', accent: 'circumflex' },
  û: { base: 'u', accent: 'circumflex' },
  Û: { base: 'U', accent: 'circumflex' },
  ä: { base: 'a', accent: 'diaeresis' },
  Ä: { base: 'A', accent: 'diaeresis' },
  ë: { base: 'e', accent: 'diaeresis' },
  Ë: { base: 'E', accent: 'diaeresis' },
  ï: { base: 'i', accent: 'diaeresis' },
  Ï: { base: 'I', accent: 'diaeresis' },
  ö: { base: 'o', accent: 'diaeresis' },
  Ö: { base: 'O', accent: 'diaeresis' },
  ü: { base: 'u', accent: 'diaeresis' },
  Ü: { base: 'U', accent: 'diaeresis' },
  ñ: { base: 'n', accent: 'tilde' },
  Ñ: { base: 'N', accent: 'tilde' },
};

const FONT_FAMILY = 'Press Start 2P';
const FONT_URL = '/fonts/PressStart2P-Regular.ttf';

let glyphSet: Set<number> | null = null;
let usingPixelFont = false;
let loadPromise: Promise<void> | null = null;

/**
 * Read a TrueType cmap (format 4 and 12) into a set of supported code points.
 * Glyph id 0 (.notdef) is excluded.
 */
export function parseFontCmap(buffer: ArrayBuffer): Set<number> {
  const view = new DataView(buffer);
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const tagStart = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(tagStart),
      view.getUint8(tagStart + 1),
      view.getUint8(tagStart + 2),
      view.getUint8(tagStart + 3)
    );
    if (tag === 'cmap') {
      cmapOffset = view.getUint32(tagStart + 8);
      break;
    }
  }
  if (cmapOffset < 0) return new Set();

  const glyphs = new Set<number>();
  const numSubtables = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const sub = cmapOffset + view.getUint32(rec + 4);
    const format = view.getUint16(sub);
    const useful =
      (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
    if (!useful) continue;

    if (format === 4) {
      const segCount = view.getUint16(sub + 6) / 2;
      let recOff = sub + 14;
      const end: number[] = [];
      for (let s = 0; s < segCount; s++) end.push(view.getUint16(recOff + s * 2));
      recOff += segCount * 2 + 2;
      const start: number[] = [];
      for (let s = 0; s < segCount; s++) start.push(view.getUint16(recOff + s * 2));
      recOff += segCount * 2;
      const delta: number[] = [];
      for (let s = 0; s < segCount; s++) delta.push(view.getInt16(recOff + s * 2));
      recOff += segCount * 2;
      const idOffset: number[] = [];
      for (let s = 0; s < segCount; s++) idOffset.push(view.getUint16(recOff + s * 2));
      const idOffsetPos = recOff;

      for (let s = 0; s < segCount; s++) {
        for (let cp = start[s]; cp <= end[s]; cp++) {
          let gid: number;
          if (idOffset[s] === 0) {
            gid = (cp + delta[s]) & 0xffff;
          } else {
            const pos = idOffsetPos + s * 2 + idOffset[s] + (cp - start[s]) * 2;
            gid = view.getUint16(pos);
            if (gid !== 0) gid = (gid + delta[s]) & 0xffff;
          }
          if (gid !== 0) glyphs.add(cp);
        }
      }
    } else if (format === 12) {
      const nGroups = view.getUint32(sub + 12);
      let recOff = sub + 16;
      for (let g = 0; g < nGroups; g++) {
        const start = view.getUint32(recOff);
        const end = view.getUint32(recOff + 4);
        recOff += 12;
        for (let cp = start; cp <= end; cp++) glyphs.add(cp);
      }
    }
  }
  return glyphs;
}

export function shapePixelText(
  text: string,
  hasGlyph: (codePoint: number) => boolean
): ShapedGlyph[] {
  const shaped: ShapedGlyph[] = [];
  for (const char of text.normalize('NFC')) {
    const cp = char.codePointAt(0) ?? 0;
    if (hasGlyph(cp)) {
      shaped.push({ char, source: char });
      continue;
    }
    const decomp = DECOMPOSITION[char];
    if (decomp) {
      const baseCp = decomp.base.codePointAt(0) ?? 0;
      shaped.push({
        char: hasGlyph(baseCp) ? decomp.base : char,
        accent: decomp.accent,
        source: char,
      });
      continue;
    }
    shaped.push({ char, source: char });
  }
  return shaped;
}

export function pixelFontHasGlyph(codePoint: number): boolean {
  if (!usingPixelFont || !glyphSet) return true;
  return glyphSet.has(codePoint);
}

export function pixelFontIsReady(): boolean {
  return usingPixelFont;
}

/**
 * Load the self-hosted face and wait until canvas can draw it.
 * Safe to call more than once.
 */
export function loadPixelFont(): Promise<void> {
  if (typeof window === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const url = publicPath(FONT_URL);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load Press Start 2P from ${url}`);
    }
    const buffer = await response.arrayBuffer();
    glyphSet = parseFontCmap(buffer);
    const face = new FontFace(FONT_FAMILY, buffer);
    await face.load();
    document.fonts.add(face);
    await document.fonts.ready;
    usingPixelFont = true;
  })().catch((error) => {
    loadPromise = null;
    usingPixelFont = false;
    throw error;
  });
  return loadPromise;
}

const inkOffsetCache = new Map<string, number>();

/**
 * Canvas `top` does not mean "first ink row" for Press Start 2P.
 * Skia draws the bitmap above the requested y; Chrome draws it below.
 * Measure a capital once per font string and shift so the ink starts at y.
 */
function measureInkOffset(font: string, size: number): number {
  const cached = inkOffsetCache.get(font);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') {
    inkOffsetCache.set(font, 0);
    return 0;
  }
  const probe = document.createElement('canvas');
  const pad = size;
  probe.width = size * 2;
  probe.height = size * 3;
  const g = probe.getContext('2d', { willReadFrequently: true });
  if (!g) {
    inkOffsetCache.set(font, 0);
    return 0;
  }
  g.font = font;
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('H', 0, pad);
  const { data, width } = g.getImageData(0, 0, probe.width, probe.height);
  let ink = -1;
  for (let py = 0; py < probe.height && ink < 0; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (data[i] > 180) {
        ink = py;
        break;
      }
    }
  }
  const offset = ink < 0 ? 0 : pad - ink;
  inkOffsetCache.set(font, offset);
  return offset;
}

function drawAccent(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  size: number,
  mark: AccentMark
): void {
  const u = Math.max(1, Math.round(size / 8));
  const cx = x + size / 2;
  const y = top + u;
  if (mark === 'acute') {
    ctx.fillRect(cx - u, y, u, u);
    ctx.fillRect(cx, y - u, u, u);
  } else if (mark === 'grave') {
    ctx.fillRect(cx, y, u, u);
    ctx.fillRect(cx - u, y - u, u, u);
  } else if (mark === 'circumflex') {
    ctx.fillRect(cx - u * 2, y, u, u);
    ctx.fillRect(cx - u, y - u, u, u);
    ctx.fillRect(cx, y, u, u);
  } else if (mark === 'tilde') {
    ctx.fillRect(cx - u * 2, y - u, u * 2, u);
    ctx.fillRect(cx, y, u * 2, u);
  } else {
    ctx.fillRect(cx - u * 2, y - u, u, u);
    ctx.fillRect(cx + u, y - u, u, u);
  }
}

/**
 * Draw Press Start 2P text. Each glyph advances by exactly `size` pixels
 * (the font's em is the advance width). Accented letters the font cannot
 * draw are the base glyph plus a pixel mark above it.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
  baseline: 'top' | 'middle' = 'top'
): void {
  const shaped = shapePixelText(text, pixelFontHasGlyph);
  const width = shaped.length * size;
  let startX = x;
  if (align === 'right') startX = x - width;
  else if (align === 'center') startX = x - width / 2;
  ctx.save();
  ctx.font = usingPixelFont
    ? `${size}px "${FONT_FAMILY}"`
    : `${size}px "${FONT_FAMILY}", "Noto Sans", sans-serif`;
  const bearing = measureInkOffset(ctx.font, size);
  const top = (baseline === 'middle' ? y - size / 2 : y) + bearing;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shaped.forEach((glyph, index) => {
    const gx = startX + index * size;
    ctx.fillText(glyph.char, gx, top);
    if (glyph.accent) drawAccent(ctx, gx, top, size, glyph.accent);
  });
  ctx.restore();
}

/** Shrink a monospace line so it fits `maxWidth` without going under 12px. */
export function fitPixelSize(text: string, preferred: number, maxWidth: number, min = 12): number {
  const chars = Array.from(text.normalize('NFC')).length || 1;
  let size = preferred;
  while (size > min && chars * size > maxWidth) size -= 1;
  return Math.max(min, size);
}
