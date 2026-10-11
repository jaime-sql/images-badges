/**
 * Pixel-portrait post process.
 * 128×128 grid, six grays, no dither, 1px outline, 2px light rim, then ×4 nearest upscale.
 * The AI path quantizes a returned portrait. The browser fallback smooths with
 * several Kuwahara passes, posterizes to flat grays, and drops speckle.
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

function opaqueSpan(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  minX: number,
  maxX: number
): number {
  let left = -1;
  let right = -1;
  for (let x = minX; x <= maxX; x++) {
    if (data[(y * width + x) * 4 + 3] < 24) continue;
    if (left < 0) left = x;
    right = x;
  }
  return left < 0 ? 0 : right - left + 1;
}

/**
 * Eyes sit about 45% of the way from the crown to the shoulder line when the
 * head is narrower than the torso. A bust that is already square keeps the
 * eyes near 36% of its height, which the frame then places at 40%.
 */
function estimateEyeAndCrop(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { cropX: number; cropY: number; cropW: number; cropH: number; eyeInCrop: number } {
  const rows = maxY - minY + 1;
  const topLimit = minY + Math.max(1, Math.floor(rows * 0.18));
  const topSpans: number[] = [];
  for (let y = minY; y <= topLimit; y++) {
    topSpans.push(opaqueSpan(data, width, y, minX, maxX));
  }
  topSpans.sort((a, b) => a - b);
  const headWidth = topSpans[Math.floor(topSpans.length / 2)] ?? 1;

  // The shoulder line is the first widening under the head. The widest row is
  // often the bottom of a jacket, which would push the eyes too high.
  const search = minY + Math.floor(rows * 0.2);
  let shoulderY = -1;
  let run = 0;
  for (let y = search; y <= maxY; y++) {
    const span = opaqueSpan(data, width, y, minX, maxX);
    if (span > headWidth * 1.28) {
      run += 1;
      if (run >= 3) {
        shoulderY = y - 2;
        break;
      }
    } else {
      run = 0;
    }
  }

  const hasShoulders = shoulderY > minY + 4;
  const eyeAbs = hasShoulders ? minY + (shoulderY - minY) * 0.46 : minY + Math.min(rows, headWidth * 1.15) * 0.4;
  const cropBottom = hasShoulders
    ? Math.min(maxY, Math.round(shoulderY + (shoulderY - minY) * 0.55))
    : Math.min(maxY, minY + Math.round(Math.max(rows * 0.72, headWidth * 1.2)));

  let left = maxX;
  let right = minX;
  for (let y = minY; y <= cropBottom; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right < left) {
    left = minX;
    right = maxX;
  }

  return {
    cropX: left,
    cropY: minY,
    cropW: Math.max(1, right - left + 1),
    cropH: Math.max(1, cropBottom - minY + 1),
    eyeInCrop: eyeAbs - minY,
  };
}

/**
 * Square head-and-shoulders frame. Eyes land near 40% from the top.
 * Cut-outs use the opaque bounds. Full photos use an upper-biased square.
 */
export function frameHeadAndShoulders(source: ImageData, size: number): ImageData {
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

  const cutout = transparent > width * height * 0.08 && maxX >= minX;
  let cropX = 0;
  let cropY = 0;
  let cropW = width;
  let cropH = height;
  let eyeInCrop = height * 0.4;
  if (cutout) {
    const framed = estimateEyeAndCrop(data, width, minX, minY, maxX, maxY);
    cropX = framed.cropX;
    cropY = framed.cropY;
    cropW = framed.cropW;
    cropH = framed.cropH;
    eyeInCrop = framed.eyeInCrop;
  } else {
    const side = Math.min(width, height);
    cropW = side;
    cropH = side;
    cropX = Math.floor((width - side) / 2);
    cropY = height > width ? Math.floor((height - side) * 0.08) : Math.floor((height - side) / 2);
    eyeInCrop = cropH * 0.4;
  }

  const out = new Uint8ClampedArray(size * size * 4);
  const margin = Math.max(6, Math.round(size * 0.04));
  const above = Math.max(1, eyeInCrop);
  const below = Math.max(1, cropH - eyeInCrop);
  const scaleTop = Math.max(0.01, (size * 0.4 - margin) / above);
  const scaleBottom = Math.max(0.01, (size * 0.9 - size * 0.4) / below);
  const scaleW = Math.max(0.01, (size - margin * 2) / cropW);
  const scale = cutout
    ? Math.min(scaleW, scaleTop, scaleBottom)
    : Math.min((size * 0.92) / cropW, (size * 0.92) / cropH);
  const drawnW = cropW * scale;
  const drawnH = cropH * scale;
  const dx = (size - drawnW) / 2;
  let dy = size * 0.4 - eyeInCrop * scale;
  if (dy < margin) dy = margin;
  if (dy > size - margin - drawnH) dy = Math.max(margin, size - margin - drawnH);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = cropX + (x - dx) / scale;
      const sy = cropY + (y - dy) / scale;
      sampleBilinear(source, sx, sy, out, (y * size + x) * 4);
    }
  }
  return createImageData(out, size, size);
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

/** Three shrinking Kuwahara passes. Stronger than a single box blur, edges stay. */
export function smoothForDrawing(source: ImageData): ImageData {
  let current = source;
  for (const radius of [5, 4, 3]) current = kuwahara(current, radius);
  return current;
}

/**
 * Fold connected regions smaller than `minSize` into the neighboring gray.
 * Isolated speckle on the 128 grid disappears; large flat shapes stay.
 */
export function mergeTinyRegions(source: ImageData, minSize = 6): ImageData {
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

function dropThinProtrusions(mask: Uint8Array, width: number, height: number): void {
  for (let pass = 0; pass < 6; pass++) {
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

export function renderPixelPortrait(
  source: ImageData,
  mode: PortraitProcessMode
): { grid: ImageData; output: ImageData } {
  const cleaned = cleanCutoutMask(source);
  let prepared: ImageData;
  if (mode === 'ai') {
    prepared = posterize(downsampleNearest(keyPlainBackground(cleaned), PORTRAIT_GRID, PORTRAIT_GRID));
  } else {
    const framed = frameHeadAndShoulders(cleaned, FALLBACK_WORKING);
    const contrasted = applyLocalContrast(framed);
    const smoothed = smoothForDrawing(contrasted);
    const lit = applyCelLight(smoothed);
    const posted = posterizeFromForeground(lit);
    prepared = mergeTinyRegions(downsampleNearest(posted, PORTRAIT_GRID, PORTRAIT_GRID), 6);
  }
  const outlined = applyOutlines(prepared);
  const grid = applyRim(outlined);
  return { grid, output: upscaleNearest(grid, PORTRAIT_SCALE) };
}
