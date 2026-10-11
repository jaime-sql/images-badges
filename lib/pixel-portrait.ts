/**
 * Pixel-portrait post process.
 * 128×128 grid, six grays, no dither, 1px outline, 2px light rim, then ×4 nearest upscale.
 * The AI path quantizes a returned portrait. The browser fallback frames the
 * head, keeps the person's skin band, and inks eyes, brows, and glasses.
 */

import { createImageData } from './dither';

export const PORTRAIT_GRID = 128;
export const PORTRAIT_SCALE = 4;
export const PORTRAIT_OUTPUT = PORTRAIT_GRID * PORTRAIT_SCALE;
const FALLBACK_WORKING = 256;

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

/** #0F0F12 #3A3A40 #6B6B73 #9E9EA6 #CFCFD4 #F4F4F6 */
export const PIXEL_PALETTE: readonly PaletteColor[] = [
  { r: 0x0f, g: 0x0f, b: 0x12 },
  { r: 0x3a, g: 0x3a, b: 0x40 },
  { r: 0x6b, g: 0x6b, b: 0x73 },
  { r: 0x9e, g: 0x9e, b: 0xa6 },
  { r: 0xcf, g: 0xcf, b: 0xd4 },
  { r: 0xf4, g: 0xf4, b: 0xf6 },
];

export const OUTLINE_COLOR = PIXEL_PALETTE[0];
export const RIM_COLOR = PIXEL_PALETTE[5];

const PALETTE_LUM = PIXEL_PALETTE.map(
  (color) => 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
);

export type PortraitProcessMode = 'ai' | 'fallback';

export function nearestPaletteIndex(r: number, g: number, b: number): number {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE_LUM.length; i++) {
    const dist = Math.abs(lum - PALETTE_LUM[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function downsampleNearest(source: ImageData, width: number, height: number): ImageData {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(((y + 0.5) * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(((x + 0.5) * source.width) / width));
      const si = (sy * source.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = source.data[si];
      out[di + 1] = source.data[si + 1];
      out[di + 2] = source.data[si + 2];
      out[di + 3] = source.data[si + 3];
    }
  }
  return createImageData(out, width, height);
}

export function upscaleNearest(source: ImageData, factor: number): ImageData {
  const width = source.width * factor;
  const height = source.height * factor;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / factor);
      const si = (sy * source.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = source.data[si];
      out[di + 1] = source.data[si + 1];
      out[di + 2] = source.data[si + 2];
      out[di + 3] = source.data[si + 3];
    }
  }
  return createImageData(out, width, height);
}

function cloneImage(source: ImageData): ImageData {
  return createImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

function isOpaque(data: Uint8ClampedArray, index: number): boolean {
  return data[index * 4 + 3] >= 20;
}

/**
 * Remove a flat backdrop by flooding from the corners.
 * Cut-outs that already have transparency are left alone.
 */
export function keyPlainBackground(source: ImageData): ImageData {
  const { width, height } = source;
  const data = new Uint8ClampedArray(source.data);
  const count = width * height;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 20) transparent += 1;
  }
  if (transparent > count * 0.05) {
    return createImageData(data, width, height);
  }

  const cornerAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const samples = [
    cornerAt(0, 0),
    cornerAt(width - 1, 0),
    cornerAt(0, height - 1),
    cornerAt(width - 1, height - 1),
  ];
  const avg = [0, 1, 2].map(
    (channel) => samples.reduce((sum, pixel) => sum + pixel[channel], 0) / samples.length
  );
  const spread = Math.max(
    ...samples.map((pixel) =>
      Math.max(
        Math.abs(pixel[0] - avg[0]),
        Math.abs(pixel[1] - avg[1]),
        Math.abs(pixel[2] - avg[2])
      )
    )
  );
  if (spread > 18) return createImageData(data, width, height);

  const threshold = 28;
  const seen = new Uint8Array(count);
  const stack: number[] = [];
  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (seen[pixel]) return;
    const i = pixel * 4;
    if (
      Math.abs(data[i] - avg[0]) > threshold ||
      Math.abs(data[i + 1] - avg[1]) > threshold ||
      Math.abs(data[i + 2] - avg[2]) > threshold
    ) {
      return;
    }
    seen[pixel] = 1;
    stack.push(pixel);
  };

  consider(0, 0);
  consider(width - 1, 0);
  consider(0, height - 1);
  consider(width - 1, height - 1);

  let cleared = 0;
  while (stack.length > 0) {
    const pixel = stack.pop() as number;
    data[pixel * 4 + 3] = 0;
    cleared += 1;
    const x = pixel % width;
    const y = (pixel - x) / width;
    consider(x + 1, y);
    consider(x - 1, y);
    consider(x, y + 1);
    consider(x, y - 1);
  }

  if (cleared > count * 0.92) {
    return cloneImage(source);
  }
  return createImageData(data, width, height);
}

function sampleBilinear(
  source: ImageData,
  x: number,
  y: number,
  out: Uint8ClampedArray,
  di: number
): void {
  const { width, height, data } = source;
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    out[di + 3] = 0;
    return;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const corners = [
    [(y0 * width + x0) * 4, (1 - tx) * (1 - ty)],
    [(y0 * width + x1) * 4, tx * (1 - ty)],
    [(y1 * width + x0) * 4, (1 - tx) * ty],
    [(y1 * width + x1) * 4, tx * ty],
  ] as const;
  let weight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let alpha = 0;
  for (const [index, w] of corners) {
    const a = data[index + 3];
    if (a < 16 || w <= 0) continue;
    weight += w;
    r += data[index] * w;
    g += data[index + 1] * w;
    b += data[index + 2] * w;
    alpha += a * w;
  }
  if (weight < 0.2) {
    out[di + 3] = 0;
    return;
  }
  out[di] = Math.max(0, Math.min(255, Math.round(r / weight)));
  out[di + 1] = Math.max(0, Math.min(255, Math.round(g / weight)));
  out[di + 2] = Math.max(0, Math.min(255, Math.round(b / weight)));
  out[di + 3] = Math.max(0, Math.min(255, Math.round(alpha / weight)));
}

function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  minX: number,
  maxX: number
): { left: number; right: number; span: number } {
  let left = -1;
  let right = -1;
  for (let x = minX; x <= maxX; x++) {
    if (data[(y * width + x) * 4 + 3] < 24) continue;
    if (left < 0) left = x;
    right = x;
  }
  return { left, right, span: left < 0 ? 0 : right - left + 1 };
}

const HEAD_OF_PANEL = 0.45;
const EYE_FRACTION = 0.4;
const EYE_FRACTION_MIN = 0.3;
const EYE_FRACTION_MAX = 0.5;

/** A face rectangle in source pixels, with the eye line marked. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  eyeX: number;
  eyeY: number;
}

export interface PortraitPlacement {
  centerX: number;
  eyeY: number;
  headWidth: number;
  scale: number;
  destEyeY: number;
}

interface EyeRow {
  y: number;
  left: number;
  right: number;
  span: number;
}

/**
 * The eye line is the strongest thin dark feature sitting on skin: two pupils,
 * brows, or a glasses rim. A wide torso or a uniformly dark beard does not qualify.
 */
function findEyeRow(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): EyeRow | null {
  const bboxH = maxY - minY + 1;
  const refLimit = minY + Math.max(4, Math.floor(bboxH * 0.16));
  const refSpans: number[] = [];
  for (let y = minY; y <= refLimit; y++) {
    const span = opaqueBounds(data, width, y, minX, maxX).span;
    if (span >= 12) refSpans.push(span);
  }
  refSpans.sort((a, b) => a - b);
  const ref = refSpans[Math.floor(refSpans.length * 0.35)] ?? 32;
  const spanCap = Math.min(ref * 1.9, width * 0.72);
  const yLimit = minY + Math.floor(bboxH * 0.7);
  let bestScore = 0;
  let best: EyeRow | null = null;

  for (let y = minY + 2; y <= yLimit - 2; y++) {
    const bounds = opaqueBounds(data, width, y, minX, maxX);
    if (bounds.span < 12 || bounds.span > spanCap || bounds.left < 0) continue;
    const samples: { x: number; lum: number }[] = [];
    for (let x = bounds.left; x <= bounds.right; x++) {
      const pixel = y * width + x;
      if (data[pixel * 4 + 3] < 24) continue;
      samples.push({ x, lum: opaqueLuminance(data, pixel) });
    }
    if (samples.length < 12) continue;
    const sorted = samples.map((sample) => sample.lum).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    if (median < 48) continue;
    const hits: number[] = [];
    for (const sample of samples) {
      let sum = 0;
      let n = 0;
      for (const dy of [-3, -2, 2, 3]) {
        const yy = y + dy;
        if (yy < minY || yy > maxY) continue;
        const pixel = yy * width + sample.x;
        if (data[pixel * 4 + 3] < 24) continue;
        sum += opaqueLuminance(data, pixel);
        n += 1;
      }
      if (n < 2) continue;
      if (sample.lum < median - 22 && sample.lum < sum / n - 12 && sample.lum < 115) hits.push(sample.x);
    }
    if (hits.length < 4 || hits.length > samples.length * 0.45) continue;
    const groups: number[][] = [[hits[0]]];
    for (let i = 1; i < hits.length; i++) {
      const gap = Math.max(6, Math.floor(bounds.span * 0.04));
      if (hits[i] - groups[groups.length - 1][groups[groups.length - 1].length - 1] > gap) groups.push([hits[i]]);
      else groups[groups.length - 1].push(hits[i]);
    }
    const cx0 = bounds.left + bounds.span * 0.12;
    const cx1 = bounds.left + bounds.span * 0.88;
    const central = groups.filter((group) => {
      if (group.length < 2) return false;
      const mid = (group[0] + group[group.length - 1]) / 2;
      return mid >= cx0 && mid <= cx1;
    });
    if (central.length === 0) continue;
    let score = central.reduce((sum, group) => sum + group.length, 0);
    if (central.length >= 2 && central.length <= 4) score *= 1.6;
    const aboveY = y - Math.max(4, Math.floor(bounds.span * 0.18));
    if (aboveY >= minY) {
      const above = opaqueBounds(data, width, aboveY, minX, maxX);
      const x0 = Math.floor(above.left + above.span * 0.25);
      const x1 = Math.ceil(above.left + above.span * 0.75);
      const forehead: number[] = [];
      for (let x = x0; x <= x1; x++) {
        const pixel = aboveY * width + x;
        if (data[pixel * 4 + 3] < 24) continue;
        forehead.push(opaqueLuminance(data, pixel));
      }
      if (forehead.length >= 8) {
        forehead.sort((a, b) => a - b);
        const fore = forehead[Math.floor(forehead.length * 0.5)] ?? median;
        if (fore > median + 12) score *= 1.25;
        else if (fore + 8 < median) score *= 0.65;
      }
    }
    score += median * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = { y, left: bounds.left, right: bounds.right, span: bounds.span };
    }
  }
  return best;
}

function rowFill(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  minX: number,
  maxX: number
): { left: number; right: number; span: number; count: number } {
  let left = -1;
  let right = -1;
  let count = 0;
  const row = y * width;
  for (let x = minX; x <= maxX; x++) {
    if (data[(row + x) * 4 + 3] < 24) continue;
    count += 1;
    if (left < 0) left = x;
    right = x;
  }
  return { left, right, span: left < 0 ? 0 : right - left + 1, count };
}

/**
 * Top of the solid silhouette, plus the head width a half-head below it.
 * Sparse mask specks above the hair are skipped. A sudden widen is averaged
 * so a shoulder or a halo does not become the whole head.
 */
function maskHeadAnchor(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { crown: number; headWidth: number; centerX: number } {
  let crown = minY;
  for (let y = minY; y <= maxY; y++) {
    const row = rowFill(data, width, y, minX, maxX);
    if (row.count >= 10 && row.span >= 12 && row.count >= row.span * 0.55) {
      crown = y;
      break;
    }
  }
  let guess = Math.max(12, rowFill(data, width, crown, minX, maxX).span);
  for (let pass = 0; pass < 4; pass++) {
    const y = Math.min(maxY, Math.round(crown + guess * 0.5));
    const row = rowFill(data, width, y, minX, maxX);
    if (row.count < 10 || row.span < 12 || row.count < row.span * 0.55) continue;
    guess = row.span > guess * 1.85 ? Math.round((guess + row.span) / 2) : row.span;
  }
  const mid = rowFill(data, width, Math.min(maxY, Math.round(crown + guess * 0.4)), minX, maxX);
  const centerX = mid.span > 0 ? (mid.left + mid.right) / 2 : (minX + maxX) / 2;
  return { crown, headWidth: Math.max(8, guess), centerX };
}

function measureHead(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { headWidth: number; centerX: number; eyeY: number } {
  const anchor = maskHeadAnchor(data, width, minX, minY, maxX, maxY);
  const eye = findEyeRow(data, width, minX, minY, maxX, maxY);
  if (eye) {
    const drop = eye.y - anchor.crown;
    // A hit glued to the hairline is the crown, not the eyes. Dark hair on a
    // dark background does this. Anything else in a normal head is kept.
    const inHead = drop >= anchor.headWidth * 0.3 && drop <= anchor.headWidth * 1.4;
    if (inHead) {
      const reach = Math.max(4, Math.floor(eye.span * 0.42));
      const y0 = Math.max(minY, eye.y - reach);
      const spans: number[] = [eye.span];
      for (let y = y0; y < eye.y; y++) {
        const span = opaqueBounds(data, width, y, minX, maxX).span;
        if (span >= 12 && span <= eye.span * 1.45) spans.push(span);
      }
      spans.sort((a, b) => a - b);
      const headWidth = Math.max(8, spans[Math.floor(spans.length * 0.65)] ?? eye.span);
      let centerX = (eye.left + eye.right) / 2;
      if (eye.span > headWidth * 1.35) {
        const mid = Math.max(minY, eye.y - Math.max(2, Math.floor(headWidth * 0.2)));
        const top = opaqueBounds(data, width, mid, minX, maxX);
        if (top.span >= 8) centerX = (top.left + top.right) / 2;
      }
      return { headWidth, centerX, eyeY: eye.y };
    }
  }

  // No trustworthy eye row. A head that holds its width and then flares is
  // cut at the shoulders. A mass that never flares (a full head of hair) puts
  // the eyes one head-width under the crown.
  let stable = 0;
  const need = Math.max(4, Math.round(anchor.headWidth * 0.35));
  const searchEnd = Math.min(maxY, Math.round(anchor.crown + anchor.headWidth * 4));
  let eyeY = anchor.crown + anchor.headWidth * 0.84;
  for (let y = anchor.crown; y <= searchEnd; y++) {
    const span = rowFill(data, width, y, minX, maxX).span;
    if (span > anchor.headWidth * 1.45 && stable >= need) {
      eyeY = anchor.crown + (y - anchor.crown) * 0.46;
      break;
    }
    if (span >= anchor.headWidth * 0.8 && span <= anchor.headWidth * 1.2) stable += 1;
    else if (span > anchor.headWidth * 1.2) stable = 0;
  }
  eyeY = Math.max(anchor.crown + 4, Math.min(maxY - 1, eyeY));
  return { headWidth: anchor.headWidth, centerX: anchor.centerX, eyeY };
}

function boundsOf(source: ImageData): { minX: number; minY: number; maxX: number; maxY: number; cutout: boolean } {
  const { width, height, data } = source;
  let transparent = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 24) {
        transparent += 1;
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, cutout: transparent > width * height * 0.08 && maxX >= minX };
}

/**
 * Where the eyes go in the square frame. A face box wins. Otherwise the eyes
 * sit about one head-width under the top of the mask. The destination eye
 * line is clamped to 30–50% of the panel, and the face rectangle is kept
 * inside the panel when a box is known.
 */
export function portraitPlacement(source: ImageData, size: number, face?: FaceBox | null): PortraitPlacement {
  const { width, height } = source;
  const bounds = boundsOf(source);
  let centerX = width / 2;
  let eyeY = height * 0.36;
  let headWidth = Math.max(8, Math.min(width, height));
  if (face && face.width >= 8 && face.height >= 8) {
    centerX = face.eyeX;
    eyeY = face.eyeY;
    headWidth = Math.max(8, face.width);
  } else if (bounds.cutout) {
    const head = measureHead(source.data, width, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    centerX = head.centerX;
    eyeY = head.eyeY;
    headWidth = head.headWidth;
  } else {
    const side = Math.min(width, height);
    centerX = width / 2;
    eyeY = (height > width ? (height - side) * 0.08 : (height - side) / 2) + side * 0.4;
    headWidth = side / 0.92 * HEAD_OF_PANEL;
  }

  const destEyeY = Math.min(size * EYE_FRACTION_MAX, Math.max(size * EYE_FRACTION_MIN, size * EYE_FRACTION));
  let scale = (size * HEAD_OF_PANEL) / Math.max(8, headWidth);
  if (face && face.height >= 8) {
    const chin = face.y + face.height;
    if (chin > eyeY + 1) {
      const fitChin = (size * 0.97 - destEyeY) / (chin - eyeY);
      if (fitChin > 0) scale = Math.min(scale, fitChin);
    }
    if (eyeY > face.y + 1) {
      const fitTop = (destEyeY - size * 0.02) / (eyeY - face.y);
      if (fitTop > 0) scale = Math.min(scale, fitTop);
    }
  }
  // Keep about 5% of the panel clear above the hair. A crown pasted to the
  // top edge is pulled down; a crown that already sits lower is left alone.
  if (bounds.cutout && eyeY > bounds.minY + 1) {
    const crownDest = destEyeY + (bounds.minY - eyeY) * scale;
    const margin = size * 0.05;
    if (crownDest < margin) {
      const fitCrown = (destEyeY - margin) / (eyeY - bounds.minY);
      if (fitCrown > 0) scale = Math.min(scale, fitCrown);
    }
  }
  return { centerX, eyeY, headWidth, scale, destEyeY };
}

/**
 * Square frame. The head is about 45% of the width, eyes sit at 40% from the
 * top, and the shoulders run off the bottom edge instead of shrinking the face.
 */
export function frameHeadAndShoulders(source: ImageData, size: number, face?: FaceBox | null): ImageData {
  const place = portraitPlacement(source, size, face);
  const out = new Uint8ClampedArray(size * size * 4);
  const destCenterX = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = place.centerX + (x - destCenterX) / place.scale;
      const sy = place.eyeY + (y - place.destEyeY) / place.scale;
      sampleBilinear(source, sx, sy, out, (y * size + x) * 4);
    }
  }
  return squareCroppedTorso(createImageData(out, size, size));
}

/**
 * A photo that ends inside the panel leaves a diagonal cut along the bottom.
 * When that edge is still as wide as the torso, replace it with one horizontal
 * line at chest level. A narrow chin, or a figure that already leaves the
 * frame, is left alone.
 */
function squareCroppedTorso(source: ImageData): ImageData {
  const { width, height, data } = source;
  const rows: { left: number; right: number; span: number }[] = [];
  let minY = height;
  let maxY = -1;
  let maxSpan = 0;
  for (let y = 0; y < height; y++) {
    const row = opaqueBounds(data, width, y, 0, width - 1);
    rows.push(row);
    if (row.span <= 0) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (row.span > maxSpan) maxSpan = row.span;
  }
  if (maxY < 0 || maxY >= height - 2 || maxSpan < 8) return source;
  const bottom = rows[maxY];
  if (!bottom || bottom.span < maxSpan * 0.72) return source;

  let cut = maxY;
  const scanFrom = Math.max(minY, maxY - Math.floor(height * 0.12));
  for (let y = maxY; y >= scanFrom; y--) {
    const here = rows[y];
    const above = rows[Math.max(minY, y - 3)];
    if (!here || !above || here.span < maxSpan * 0.8) continue;
    const slide = Math.abs(here.left - above.left) + Math.abs(here.right - above.right);
    if (slide <= Math.max(2, width * 0.03)) {
      cut = y;
      break;
    }
  }

  const edge = rows[cut];
  if (!edge || edge.span < 8) return source;
  const out = new Uint8ClampedArray(data);
  for (let x = edge.left; x <= edge.right; x++) {
    const pixel = cut * width + x;
    if (out[pixel * 4 + 3] >= 24) continue;
    let donor = -1;
    for (let step = 1; step < edge.span; step++) {
      if (x - step >= edge.left && out[(cut * width + x - step) * 4 + 3] >= 24) {
        donor = x - step;
        break;
      }
      if (x + step <= edge.right && out[(cut * width + x + step) * 4 + 3] >= 24) {
        donor = x + step;
        break;
      }
    }
    if (donor < 0) continue;
    const from = (cut * width + donor) * 4;
    const to = pixel * 4;
    out[to] = out[from];
    out[to + 1] = out[from + 1];
    out[to + 2] = out[from + 2];
    out[to + 3] = 255;
  }
  for (let y = cut + 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }
  return createImageData(out, width, height);
}

function opaqueLuminance(data: Uint8ClampedArray, pixel: number): number {
  const i = pixel * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/**
 * Light from the top-left, as a multiply that never brightens past the
 * current tone. Local contrast has already separated eyes from skin.
 */
export function applyCelLight(source: ImageData): ImageData {
  const { width, height } = source;
  const data = new Uint8ClampedArray(source.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!isOpaque(data, pixel)) continue;
      const i = pixel * 4;
      const lx = 1 - x / Math.max(1, width - 1);
      const ly = 1 - y / Math.max(1, height - 1);
      const gain = 0.74 + 0.26 * (0.62 * lx + 0.38 * ly);
      data[i] = Math.max(0, Math.min(255, Math.round(data[i] * gain)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * gain)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * gain)));
    }
  }
  return createImageData(data, width, height);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

/**
 * CLAHE-like local contrast on foreground pixels. Each tile stretches the
 * band between its own 15th and 85th percentiles, and the stretch is capped
 * so a flat cheek does not turn into noise. Transparent pixels are ignored.
 */
export function applyLocalContrast(source: ImageData): ImageData {
  const { width, height } = source;
  const count = width * height;
  const lum = new Float32Array(count);
  const mask = new Uint8Array(count);
  const global: number[] = [];
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4;
    if (source.data[i + 3] < 20) continue;
    mask[pixel] = 1;
    lum[pixel] = opaqueLuminance(source.data, pixel);
    global.push(lum[pixel]);
  }
  global.sort((a, b) => a - b);
  const globalLow = percentile(global, 0.15);
  const globalHigh = percentile(global, 0.85);

  const tiles = 8;
  const tileW = width / tiles;
  const tileH = height / tiles;
  const lows = new Float32Array(tiles * tiles);
  const highs = new Float32Array(tiles * tiles);
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const samples: number[] = [];
      const y0 = Math.floor(ty * tileH);
      const y1 = Math.min(height, Math.floor((ty + 1) * tileH));
      const x0 = Math.floor(tx * tileW);
      const x1 = Math.min(width, Math.floor((tx + 1) * tileW));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const pixel = y * width + x;
          if (mask[pixel]) samples.push(lum[pixel]);
        }
      }
      samples.sort((a, b) => a - b);
      const slot = ty * tiles + tx;
      if (samples.length < 8) {
        lows[slot] = globalLow;
        highs[slot] = globalHigh;
      } else {
        lows[slot] = percentile(samples, 0.15);
        highs[slot] = percentile(samples, 0.85);
      }
    }
  }

  const out = new Uint8ClampedArray(source.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      const gx = tileW > 0 ? (x + 0.5) / tileW - 0.5 : 0;
      const gy = tileH > 0 ? (y + 0.5) / tileH - 0.5 : 0;
      const x0 = Math.max(0, Math.min(tiles - 1, Math.floor(gx)));
      const y0 = Math.max(0, Math.min(tiles - 1, Math.floor(gy)));
      const x1 = Math.min(tiles - 1, x0 + 1);
      const y1 = Math.min(tiles - 1, y0 + 1);
      const tx = Math.max(0, Math.min(1, gx - x0));
      const ty = Math.max(0, Math.min(1, gy - y0));
      const blend = (grid: Float32Array) =>
        grid[y0 * tiles + x0] * (1 - tx) * (1 - ty) +
        grid[y0 * tiles + x1] * tx * (1 - ty) +
        grid[y1 * tiles + x0] * (1 - tx) * ty +
        grid[y1 * tiles + x1] * tx * ty;
      const low = blend(lows);
      const high = blend(highs);
      const span = high - low;
      const current = lum[pixel];
      let next = current;
      if (span >= 8) {
        const mid = (low + high) / 2;
        const expand = Math.min(5, 140 / span);
        next = Math.max(0, Math.min(255, mid + (current - mid) * expand));
      }
      const scale = current < 1 ? next : next / current;
      const i = pixel * 4;
      out[i] = Math.max(0, Math.min(255, Math.round(source.data[i] * scale)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(source.data[i + 1] * scale)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(source.data[i + 2] * scale)));
    }
  }
  return createImageData(out, width, height);
}

export function boxBlur(source: ImageData, radius: number): ImageData {
  const { width, height } = source;
  const src = source.data;
  const horizontal = new Float32Array(width * height * 3);
  const alpha = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        const i = (y * width + xx) * 4;
        if (src[i + 3] < 20) continue;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
        count += 1;
      }
      const o = (y * width + x) * 3;
      if (count > 0) {
        horizontal[o] = r / count;
        horizontal[o + 1] = g / count;
        horizontal[o + 2] = b / count;
      }
      alpha[y * width + x] = src[(y * width + x) * 4 + 3];
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const di = pixel * 4;
      out[di + 3] = alpha[pixel];
      if (alpha[pixel] < 20) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        const neighbor = yy * width + x;
        if (alpha[neighbor] < 20) continue;
        const o = neighbor * 3;
        r += horizontal[o];
        g += horizontal[o + 1];
        b += horizontal[o + 2];
        count += 1;
      }
      if (count === 0) continue;
      out[di] = Math.max(0, Math.min(255, Math.round(r / count)));
      out[di + 1] = Math.max(0, Math.min(255, Math.round(g / count)));
      out[di + 2] = Math.max(0, Math.min(255, Math.round(b / count)));
    }
  }
  return createImageData(out, width, height);
}

/**
 * Six equal steps across the foreground luminance range. Transparent pixels
 * stay transparent and do not move the black or white point.
 */
export function posterizeFromForeground(source: ImageData): ImageData {
  const { width, height } = source;
  const samples: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (isOpaque(source.data, pixel)) samples.push(opaqueLuminance(source.data, pixel));
  }
  samples.sort((a, b) => a - b);
  const count = samples.length;
  const low = samples[Math.floor(count * 0.02)] ?? 0;
  const high = samples[Math.min(Math.max(0, count - 1), Math.floor(count * 0.98))] ?? 255;
  const span = Math.max(1, high - low);
  const out = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    if (out[i + 3] < 20) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const lum = opaqueLuminance(out, pixel);
    const t = Math.max(0, Math.min(1, (lum - low) / span));
    const index = Math.min(PIXEL_PALETTE.length - 1, Math.floor(t * PIXEL_PALETTE.length));
    const color = PIXEL_PALETTE[index];
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = 255;
  }
  return createImageData(out, width, height);
}

export function posterize(source: ImageData): ImageData {
  const { width, height } = source;
  const out = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    if (out[i + 3] < 20) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const index = nearestPaletteIndex(out[i], out[i + 1], out[i + 2]);
    const color = PIXEL_PALETTE[index];
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = 255;
  }
  return createImageData(out, width, height);
}

function paletteIndexAt(data: Uint8ClampedArray, pixel: number): number {
  if (!isOpaque(data, pixel)) return -1;
  const i = pixel * 4;
  return nearestPaletteIndex(data[i], data[i + 1], data[i + 2]);
}

/**
 * 1px #0F0F12 silhouette plus key inner lines.
 * Lines are written from the original so they cannot thicken, and only the
 * darker side of a 4-connected edge is marked (no 2px diagonal steps).
 */
export function applyOutlines(source: ImageData): ImageData {
  const { width, height } = source;
  const src = source.data;
  const out = new Uint8ClampedArray(src);
  const indexOf = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    return paletteIndexAt(src, y * width + x);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const mine = indexOf(x, y);
      if (mine < 0) continue;
      const neighbors = [
        indexOf(x - 1, y),
        indexOf(x + 1, y),
        indexOf(x, y - 1),
        indexOf(x, y + 1),
      ];
      const silhouette = neighbors.some((index) => index < 0);
      const keyLine = neighbors.some((index) => index >= 0 && index - mine >= 2);
      if (silhouette || keyLine) {
        const i = pixel * 4;
        out[i] = OUTLINE_COLOR.r;
        out[i + 1] = OUTLINE_COLOR.g;
        out[i + 2] = OUTLINE_COLOR.b;
        out[i + 3] = 255;
      }
    }
  }
  return createImageData(out, width, height);
}

/** Two 4-connected dilations of #F4F4F6 into transparent pixels. */
export function applyRim(source: ImageData): ImageData {
  let current = source;
  for (let pass = 0; pass < 2; pass++) {
    const { width, height } = current;
    const src = current.data;
    const out = new Uint8ClampedArray(src);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (isOpaque(src, pixel)) continue;
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        const touches = neighbors.some(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
          return isOpaque(src, ny * width + nx);
        });
        if (!touches) continue;
        const i = pixel * 4;
        out[i] = RIM_COLOR.r;
        out[i + 1] = RIM_COLOR.g;
        out[i + 2] = RIM_COLOR.b;
        out[i + 3] = 255;
      }
    }
    current = createImageData(out, width, height);
  }
  return current;
}

/**
 * Edge-preserving mean of the smoothest quadrant. Repeated passes turn a photo
 * into flat cel regions without the blur of a box filter.
 */
export function kuwahara(source: ImageData, radius: number): ImageData {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  const r = Math.max(1, radius);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!isOpaque(data, pixel)) continue;
      let bestVar = Infinity;
      let bestR = data[pixel * 4];
      let bestG = data[pixel * 4 + 1];
      let bestB = data[pixel * 4 + 2];
      const quads = [
        [x - r, x, y - r, y],
        [x, x + r, y - r, y],
        [x - r, x, y, y + r],
        [x, x + r, y, y + r],
      ];
      for (const [x0, x1, y0, y1] of quads) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumL = 0;
        let sumL2 = 0;
        let n = 0;
        const yStart = Math.max(0, y0);
        const yEnd = Math.min(height - 1, y1);
        const xStart = Math.max(0, x0);
        const xEnd = Math.min(width - 1, x1);
        for (let yy = yStart; yy <= yEnd; yy++) {
          for (let xx = xStart; xx <= xEnd; xx++) {
            const neighbor = yy * width + xx;
            if (!isOpaque(data, neighbor)) continue;
            const i = neighbor * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
            sumL += lum;
            sumL2 += lum * lum;
            n += 1;
          }
        }
        if (n < 4) continue;
        const meanL = sumL / n;
        const variance = sumL2 / n - meanL * meanL;
        if (variance < bestVar) {
          bestVar = variance;
          bestR = Math.round(sumR / n);
          bestG = Math.round(sumG / n);
          bestB = Math.round(sumB / n);
        }
      }
      const i = pixel * 4;
      out[i] = bestR;
      out[i + 1] = bestG;
      out[i + 2] = bestB;
    }
  }
  return createImageData(out, width, height);
}

/** Two small Kuwahara passes. Enough to flatten skin, not enough to erase eyes. */
export function smoothForDrawing(source: ImageData): ImageData {
  let current = source;
  for (const radius of [2, 2]) current = kuwahara(current, radius);
  return current;
}

/**
 * Fold connected regions smaller than `minSize` into the neighboring gray.
 * Isolated speckle on the 128 grid disappears; large flat shapes stay.
 */
export function mergeTinyRegions(source: ImageData, minSize = 6, protect?: Uint8Array): ImageData {
  const { width, height } = source;
  const count = width * height;
  let index = new Int16Array(count);
  for (let pixel = 0; pixel < count; pixel++) index[pixel] = paletteIndexAt(source.data, pixel);

  for (let pass = 0; pass < 4; pass++) {
    const seen = new Uint8Array(count);
    const next = new Int16Array(index);
    const stack: number[] = [];
    const region: number[] = [];
    for (let start = 0; start < count; start++) {
      if (seen[start] || index[start] < 0) continue;
      stack.length = 0;
      region.length = 0;
      stack.push(start);
      seen[start] = 1;
      const color = index[start];
      while (stack.length > 0) {
        const pixel = stack.pop() as number;
        region.push(pixel);
        const x = pixel % width;
        const y = (pixel - x) / width;
        const neighbors = [
          x > 0 ? pixel - 1 : -1,
          x + 1 < width ? pixel + 1 : -1,
          y > 0 ? pixel - width : -1,
          y + 1 < height ? pixel + width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || seen[neighbor] || index[neighbor] !== color) continue;
          seen[neighbor] = 1;
          stack.push(neighbor);
        }
      }
      if (region.length >= minSize) continue;
      if (protect && region.some((pixel) => protect[pixel])) continue;
      const votes = [0, 0, 0, 0, 0, 0];
      for (const pixel of region) {
        const x = pixel % width;
        const y = (pixel - x) / width;
        const neighbors = [
          x > 0 ? pixel - 1 : -1,
          x + 1 < width ? pixel + 1 : -1,
          y > 0 ? pixel - width : -1,
          y + 1 < height ? pixel + width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0) continue;
          const other = index[neighbor];
          if (other < 0 || other === color) continue;
          votes[other] += 1;
        }
      }
      let winner = -1;
      let best = 0;
      for (let tone = 0; tone < votes.length; tone++) {
        if (votes[tone] > best) {
          best = votes[tone];
          winner = tone;
        }
      }
      if (winner < 0) continue;
      for (const pixel of region) next[pixel] = winner;
    }
    index = next;
  }

  const out = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4;
    const tone = index[pixel];
    if (tone < 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const color = PIXEL_PALETTE[tone];
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = 255;
  }
  return createImageData(out, width, height);
}

const MASK_ALPHA = 128;
const MASK_MIN_COMPONENT = 6;

function erodeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || mask[yy * width + xx] === 0) {
            keep = 0;
            break;
          }
        }
      }
      out[y * width + x] = keep;
    }
  }
  return out;
}

function dilateMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (mask[yy * width + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function dropSmallComponents(mask: Uint8Array, width: number, height: number, minSize: number): void {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const region: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || mask[start] === 0) continue;
    stack.length = 0;
    region.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const pixel = stack.pop() as number;
      region.push(pixel);
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor] || mask[neighbor] === 0) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (region.length >= minSize) continue;
    for (const pixel of region) mask[pixel] = 0;
  }
}

function keepLargestComponent(mask: Uint8Array, width: number, height: number): void {
  const count = mask.length;
  const labels = new Int32Array(count);
  const sizes: number[] = [0];
  const stack: number[] = [];
  let label = 0;
  for (let start = 0; start < count; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue;
    label += 1;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const pixel = stack.pop() as number;
      size += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || mask[neighbor] === 0 || labels[neighbor] !== 0) continue;
        labels[neighbor] = label;
        stack.push(neighbor);
      }
    }
    sizes[label] = size;
  }
  if (label === 0) return;
  let best = 1;
  for (let id = 2; id <= label; id++) {
    if (sizes[id] > sizes[best]) best = id;
  }
  const keep = new Uint8Array(label + 1);
  keep[best] = 1;
  for (let pixel = 0; pixel < count; pixel++) {
    if (labels[pixel] !== best) continue;
    const x = pixel % width;
    const y = (pixel - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const other = labels[yy * width + xx];
        if (other > 0) keep[other] = 1;
      }
    }
  }
  for (let pixel = 0; pixel < count; pixel++) {
    if (!keep[labels[pixel]]) mask[pixel] = 0;
  }
}

function dropThinProtrusions(mask: Uint8Array, width: number, height: number): void {
  for (let pass = 0; pass < 3; pass++) {
    const remove: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (mask[pixel] === 0) continue;
        let neighbors = 0;
        if (x > 0 && mask[pixel - 1]) neighbors += 1;
        if (x + 1 < width && mask[pixel + 1]) neighbors += 1;
        if (y > 0 && mask[pixel - width]) neighbors += 1;
        if (y + 1 < height && mask[pixel + width]) neighbors += 1;
        if (neighbors < 2) remove.push(pixel);
      }
    }
    if (remove.length === 0) break;
    for (const pixel of remove) mask[pixel] = 0;
  }
}

/**
 * Threshold the cut-out, open then close the mask, and drop specks and
 * whiskers. A 1px stray line above the head never reaches the outline.
 */
export function cleanCutoutMask(source: ImageData): ImageData {
  const { width, height, data } = source;
  const count = width * height;
  let transparent = 0;
  const mask = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    if (data[pixel * 4 + 3] >= MASK_ALPHA) mask[pixel] = 1;
    else transparent += 1;
  }
  if (transparent > count * 0.08) {
    keepLargestComponent(mask, width, height);
    const opened = dilateMask(erodeMask(mask, width, height), width, height);
    const closed = erodeMask(dilateMask(opened, width, height), width, height);
    mask.set(closed);
    dropSmallComponents(mask, width, height, MASK_MIN_COMPONENT);
    dropThinProtrusions(mask, width, height);
  }
  const out = new Uint8ClampedArray(data);
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4;
    if (mask[pixel]) {
      out[i + 3] = 255;
      continue;
    }
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;
  }
  return createImageData(out, width, height);
}

export type SkinKind = 'light' | 'medium' | 'dark';

export interface SkinBand {
  shadow: number;
  base: number;
  highlight: number;
}

/** Light uses the two lightest grays plus a one-step shadow. Dark never climbs past #6B6B73. */
export function skinPalette(kind: SkinKind): SkinBand {
  if (kind === 'light') return { shadow: 3, base: 4, highlight: 5 };
  if (kind === 'medium') return { shadow: 2, base: 3, highlight: 3 };
  return { shadow: 1, base: 2, highlight: 2 };
}

export function classifySkin(faceMedian: number): SkinKind {
  // Buckets follow the nearest palette gray, so a dark cheek is not stretched up.
  if (faceMedian >= 182) return 'light';
  if (faceMedian >= 132) return 'medium';
  return 'dark';
}

/**
 * 95th percentile of opaque pixels that are not a clipped white background.
 * A white wall exposed to the sensor leaves the face darker than this anchor.
 */
export function brightReference(source: ImageData): number {
  const values: number[] = [];
  const { data } = source;
  for (let pixel = 0; pixel < data.length / 4; pixel++) {
    if (data[pixel * 4 + 3] < 24) continue;
    const lum = opaqueLuminance(data, pixel);
    if (lum >= 248) continue;
    values.push(lum);
  }
  if (values.length < 20) return 0;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0;
}

/**
 * Lift a cheek that sits well below the photo's own bright anchor.
 * A dark scene with no separate highlight is left alone, so a dark face stays dark.
 */
export function normalizeExposure(cheek: number, reference: number): number {
  if (reference < 140 || cheek <= 0 || cheek >= reference * 0.9) return cheek;
  const lifted = (cheek / reference) * 220;
  return Math.min(255, Math.max(cheek, lifted));
}

function sampleLuminance(
  source: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number[] {
  const samples: number[] = [];
  const yStart = Math.max(0, y0);
  const yEnd = Math.min(source.height - 1, y1);
  const xStart = Math.max(0, x0);
  const xEnd = Math.min(source.width - 1, x1);
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const pixel = y * source.width + x;
      if (!isOpaque(source.data, pixel)) continue;
      samples.push(opaqueLuminance(source.data, pixel));
    }
  }
  samples.sort((a, b) => a - b);
  return samples;
}

/** Cheek median of the framed portrait, before any contrast change. Glasses sit between the two patches. */
export function faceMedianLuminance(source: ImageData): number {
  const { width, height } = source;
  const cheeks = [
    sampleLuminance(source, Math.floor(width * 0.36), Math.floor(height * 0.36), Math.floor(width * 0.46), Math.floor(height * 0.48)),
    sampleLuminance(source, Math.floor(width * 0.54), Math.floor(height * 0.36), Math.floor(width * 0.64), Math.floor(height * 0.48)),
  ].flat();
  cheeks.sort((a, b) => a - b);
  const samples = cheeks.length >= 12 ? cheeks : sampleLuminance(source, 0, 0, width - 1, height - 1);
  if (samples.length === 0) return 128;
  const mid = samples[Math.floor(samples.length * 0.5)] ?? 128;
  const upper = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.75))] ?? mid;
  // A beard or a hard shadow makes the median darker than the skin. When the
  // upper quartile jumps, that quartile is the lit face; otherwise the median stands.
  return upper > mid + 48 ? upper : mid;
}

function blurLuminance(source: ImageData, sigma: number): Float32Array {
  const { width, height, data } = source;
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const weight = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }
  const lum = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < lum.length; pixel++) {
    if (data[pixel * 4 + 3] < 20) continue;
    mask[pixel] = 1;
    lum[pixel] = opaqueLuminance(data, pixel);
  }
  const horizontal = new Float32Array(width * height);
  const horizontalWeight = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const pixel = y * width + xx;
        if (!mask[pixel]) continue;
        const w = kernel[k + radius];
        sum += lum[pixel] * w;
        weight += w;
      }
      const pixel = y * width + x;
      horizontal[pixel] = sum;
      horizontalWeight[pixel] = weight;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const pixel = yy * width + x;
        const w = kernel[k + radius];
        sum += horizontal[pixel] * w;
        weight += horizontalWeight[pixel] * w;
      }
      const pixel = y * width + x;
      out[pixel] = weight > kernelSum * 0.15 ? sum / weight : lum[pixel];
    }
  }
  return out;
}

/**
 * Fine-scale dark features: pupils, brows, glasses, and the mouth line.
 * A pixel has to be darker than the slightly wider blur and darker than its neighbors.
 */
export function detectDarkFeatures(source: ImageData): Uint8Array {
  const { width, height } = source;
  const fine = blurLuminance(source, 0.8);
  const coarse = blurLuminance(source, 2.1);
  const protect = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const ny = y / height;
    const eyeBand = ny >= 0.33 && ny <= 0.48;
    const mouthBand = ny >= 0.5 && ny <= 0.56;
    if (!eyeBand && !mouthBand) continue;
    for (let x = 1; x < width - 1; x++) {
      const nx = x / width;
      if (eyeBand && (nx < 0.3 || nx > 0.7)) continue;
      if (!eyeBand && (nx < 0.4 || nx > 0.6)) continue;
      const pixel = y * width + x;
      if (!isOpaque(source.data, pixel)) continue;
      const score = coarse[pixel] - fine[pixel];
      if (score < 11) continue;
      let darker = 0;
      const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
      for (const neighbor of neighbors) {
        if (fine[neighbor] > fine[pixel] + 3) darker += 1;
      }
      if (darker >= 2) protect[pixel] = 1;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const clear: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pixel = y * width + x;
        if (!protect[pixel]) continue;
        if (protect[pixel - 1] && protect[pixel + 1] && protect[pixel - width] && protect[pixel + width]) {
          clear.push(pixel);
        }
      }
    }
    for (const pixel of clear) protect[pixel] = 0;
  }
  const mouthY0 = Math.floor(height * 0.5);
  const mouthY1 = Math.floor(height * 0.56);
  const mouthX0 = Math.floor(width * 0.4);
  const mouthX1 = Math.floor(width * 0.6);
  let mouthOn = 0;
  let mouthCount = 0;
  for (let y = mouthY0; y <= mouthY1; y++) {
    for (let x = mouthX0; x <= mouthX1; x++) {
      mouthCount += 1;
      if (protect[y * width + x]) mouthOn += 1;
    }
  }
  if (mouthCount > 0 && mouthOn > mouthCount * 0.22) {
    for (let y = mouthY0; y <= mouthY1; y++) {
      for (let x = mouthX0; x <= mouthX1; x++) protect[y * width + x] = 0;
    }
  }
  strengthenEyeLine(protect, source);
  return protect;
}

/** Join broken glasses rims and mark dark dips in the eye band. */
function strengthenEyeLine(protect: Uint8Array, source: ImageData): void {
  const { width, height, data } = source;
  const y0 = Math.floor(height * 0.34);
  const y1 = Math.min(height - 2, Math.floor(height * 0.47));
  const x0 = Math.floor(width * 0.28);
  const x1 = Math.min(width - 2, Math.floor(width * 0.72));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const pixel = y * width + x;
      if (data[pixel * 4 + 3] < 24) continue;
      const lum = opaqueLuminance(data, pixel);
      const left = opaqueLuminance(data, pixel - 1);
      const right = opaqueLuminance(data, pixel + 1);
      if (lum + 8 < left && lum + 8 < right) protect[pixel] = 1;
    }
    for (let x = x0; x <= x1; x++) {
      const pixel = y * width + x;
      if (!protect[pixel]) continue;
      for (let gap = 1; gap <= 3; gap++) {
        const nextX = x + gap + 1;
        if (nextX > x1) break;
        const next = y * width + nextX;
        if (!protect[next]) continue;
        let bridge = true;
        for (let step = 1; step <= gap; step++) {
          const between = pixel + step;
          if (data[between * 4 + 3] < 24) {
            bridge = false;
            break;
          }
          if (opaqueLuminance(data, between) > opaqueLuminance(data, pixel) + 28) {
            bridge = false;
            break;
          }
        }
        if (!bridge) continue;
        for (let step = 1; step <= gap; step++) protect[pixel + step] = 1;
      }
    }
  }
}

function downsampleMask(mask: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Uint8Array {
  const out = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor((y * srcH) / dstH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor((x * srcW) / dstW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / dstW));
      let on = 0;
      for (let yy = y0; yy < y1 && !on; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          if (mask[yy * srcW + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * dstW + x] = on;
    }
  }
  return out;
}

function skinIndex(kind: SkinKind, rank: number): number {
  const band = skinPalette(kind);
  if (kind === 'light') {
    if (rank < 0.3) return band.shadow;
    if (rank < 0.72) return band.base;
    return band.highlight;
  }
  if (rank < 0.42) return band.shadow;
  return band.base;
}

/**
 * Map the face into the skin band chosen from the original cheek median.
 * Other pixels keep the nearest gray, with no stretch toward white.
 */
export function posterizeKeepingSkin(source: ImageData, features: Uint8Array, original?: ImageData): ImageData {
  const { width, height } = source;
  const measured = original ?? source;
  const median = faceMedianLuminance(measured);
  const kind = classifySkin(normalizeExposure(median, brightReference(measured)));
  const skinLuma: number[] = [];
  const skinAt: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!isOpaque(source.data, pixel) || features[pixel]) continue;
      const nx = x / width;
      const ny = y / height;
      if (nx < 0.3 || nx > 0.7 || ny < 0.18 || ny > 0.66) continue;
      const lum = opaqueLuminance(source.data, pixel);
      if (lum < median * 0.62) continue;
      skinLuma.push(lum);
      skinAt.push(pixel);
    }
  }
  const order = skinLuma.map((lum, index) => ({ lum, index }));
  order.sort((a, b) => a.lum - b.lum);
  const rankOf = new Float32Array(skinLuma.length);
  for (let i = 0; i < order.length; i++) rankOf[order[i].index] = order.length <= 1 ? 0.5 : i / (order.length - 1);
  const rankAt = new Float32Array(width * height);
  rankAt.fill(-1);
  for (let i = 0; i < skinAt.length; i++) rankAt[skinAt[i]] = rankOf[i];

  const out = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    if (out[i + 3] < 20) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const index = rankAt[pixel] >= 0 ? skinIndex(kind, rankAt[pixel]) : nearestPaletteIndex(out[i], out[i + 1], out[i + 2]);
    const color = PIXEL_PALETTE[index];
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = 255;
  }
  return createImageData(out, width, height);
}

/** If hair collapsed onto the skin gray, push it one step darker so the hairline shows. */
export function separateHair(posted: ImageData, original: ImageData, kind: SkinKind): ImageData {
  const band = skinPalette(kind);
  const faceMedian = faceMedianLuminance(original);
  const { width, height } = original;
  const hair = sampleLuminance(
    original,
    Math.floor(width * 0.34),
    Math.floor(height * 0.12),
    Math.floor(width * 0.66),
    Math.floor(height * 0.32)
  );
  if (hair.length < 8) return posted;
  const hairMedian = hair[Math.floor(hair.length * 0.5)];
  if (hairMedian > faceMedian - 16) return posted;
  const out = new Uint8ClampedArray(posted.data);
  const y0 = Math.floor(height * 0.08);
  const y1 = Math.floor(height * 0.36);
  const x0 = Math.floor(width * 0.28);
  const x1 = Math.floor(width * 0.72);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const pixel = y * width + x;
      if (!isOpaque(original.data, pixel)) continue;
      if (opaqueLuminance(original.data, pixel) > faceMedian - 10) continue;
      const tone = paletteIndexAt(out, pixel);
      if (tone < 0 || tone < band.base) continue;
      const next = Math.max(0, band.base - 1);
      const color = PIXEL_PALETTE[next];
      const i = pixel * 4;
      out[i] = color.r;
      out[i + 1] = color.g;
      out[i + 2] = color.b;
      out[i + 3] = 255;
    }
  }
  return createImageData(out, width, height);
}

/**
 * On a dark face, hair and beard sit one step below the skin.
 * Skin is the cheek-lit forehead, nose, and cheeks. A shadow that is actually
 * darker than the cheek stays put, so a portrait that already uses both dark
 * grays is not flattened.
 */
export function separateDarkHairAndBeard(posted: ImageData, original: ImageData, kind: SkinKind): ImageData {
  if (kind !== 'dark') return posted;
  const median = faceMedianLuminance(original);
  if (median <= 8) return posted;
  const skinFloor = median * 0.78;
  const hairCeiling = median * 0.7;
  const { width, height } = posted;
  const out = new Uint8ClampedArray(posted.data);
  const paint = (pixel: number, index: number) => {
    const color = PIXEL_PALETTE[index];
    const i = pixel * 4;
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = 255;
  };
  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!isOpaque(original.data, pixel)) continue;
      const nx = x / Math.max(1, width - 1);
      const lum = opaqueLuminance(original.data, pixel);
      const hairZone = ny < 0.34 && (ny < 0.22 || nx < 0.36 || nx > 0.64);
      const beardZone = ny > 0.58 && ny < 0.82 && nx > 0.3 && nx < 0.7;
      const skinZone = nx > 0.34 && nx < 0.66 && ny > 0.24 && ny < 0.58;
      const tone = paletteIndexAt(out, pixel);
      // A bright speck in the hair is not skin. The crown and the dark beard stay #3A3A40.
      if ((hairZone && (lum < hairCeiling || tone >= 4)) || (beardZone && lum < hairCeiling)) {
        paint(pixel, 1);
        continue;
      }
      if (skinZone && lum >= skinFloor) {
        const tone = paletteIndexAt(out, pixel);
        if (tone >= 0 && tone < 2) paint(pixel, 2);
      }
    }
  }
  return createImageData(out, width, height);
}

function paintProtected(source: ImageData, protect: Uint8Array): ImageData {
  const out = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < protect.length; pixel++) {
    if (!protect[pixel]) continue;
    const i = pixel * 4;
    out[i] = OUTLINE_COLOR.r;
    out[i + 1] = OUTLINE_COLOR.g;
    out[i + 2] = OUTLINE_COLOR.b;
    out[i + 3] = 255;
  }
  return createImageData(out, source.width, source.height);
}

export function renderPixelPortrait(
  source: ImageData,
  mode: PortraitProcessMode,
  face?: FaceBox | null
): { grid: ImageData; output: ImageData } {
  const cleaned = cleanCutoutMask(source);
  let prepared: ImageData;
  if (mode === 'ai') {
    prepared = posterize(downsampleNearest(keyPlainBackground(cleaned), PORTRAIT_GRID, PORTRAIT_GRID));
  } else {
    const framed = frameHeadAndShoulders(cleaned, FALLBACK_WORKING, face);
    const features = detectDarkFeatures(framed);
    const smoothed = smoothForDrawing(framed);
    const posted = posterizeKeepingSkin(smoothed, features, framed);
    const kind = classifySkin(normalizeExposure(faceMedianLuminance(framed), brightReference(framed)));
    const small = downsampleNearest(posted, PORTRAIT_GRID, PORTRAIT_GRID);
    const originalSmall = downsampleNearest(framed, PORTRAIT_GRID, PORTRAIT_GRID);
    const featureSmall = downsampleMask(features, framed.width, framed.height, PORTRAIT_GRID, PORTRAIT_GRID);
    const separated = separateHair(small, originalSmall, kind);
    const merged = mergeTinyRegions(separated, 6, featureSmall);
    const parted = separateDarkHairAndBeard(merged, originalSmall, kind);
    prepared = paintProtected(parted, featureSmall);
  }
  const outlined = applyOutlines(prepared);
  const grid = applyRim(outlined);
  return { grid, output: upscaleNearest(grid, PORTRAIT_SCALE) };
}
