/**
 * Pixel-portrait post process.
 * 128×128 grid, six grays, no dither, 1px outline, 2px light rim, then ×4 nearest upscale.
 * The AI path quantizes a returned portrait. The browser fallback blurs, posterizes,
 * finds edges, and downsamples when that service is unset or fails.
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
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const a00 = data[i00 + 3];
  const a10 = data[i10 + 3];
  const a01 = data[i01 + 3];
  const a11 = data[i11 + 3];
  const alpha =
    a00 * (1 - tx) * (1 - ty) + a10 * tx * (1 - ty) + a01 * (1 - tx) * ty + a11 * tx * ty;
  if (alpha < 16) {
    out[di + 3] = 0;
    return;
  }
  for (let c = 0; c < 3; c++) {
    const v =
      data[i00 + c] * (1 - tx) * (1 - ty) +
      data[i10 + c] * tx * (1 - ty) +
      data[i01 + c] * (1 - tx) * ty +
      data[i11 + c] * tx * ty;
    out[di + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  out[di + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
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
  if (cutout) {
    cropX = minX;
    cropY = minY;
    cropW = maxX - minX + 1;
    cropH = maxY - minY + 1;
  } else {
    const side = Math.min(width, height);
    cropW = side;
    cropH = side;
    cropX = Math.floor((width - side) / 2);
    cropY = height > width ? Math.floor((height - side) * 0.08) : Math.floor((height - side) / 2);
  }

  const out = new Uint8ClampedArray(size * size * 4);
  const targetW = size * (cutout ? 0.78 : 0.92);
  const targetH = size * (cutout ? 0.88 : 0.92);
  const scale = Math.min(targetW / cropW, targetH / cropH);
  const drawnW = cropW * scale;
  const drawnH = cropH * scale;
  const dx = (size - drawnW) / 2;
  const eyeInCrop = cropH * (cutout ? 0.32 : 0.4);
  let dy = size * 0.4 - eyeInCrop * scale;
  const margin = 3;
  if (dy < margin) dy = margin;
  if (dy > size - margin - drawnH) dy = size - margin - drawnH;

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

/** Spread face tones, then brighten toward the top-left so cel bands have a light direction. */
export function applyCelLight(source: ImageData): ImageData {
  const { width, height } = source;
  const data = new Uint8ClampedArray(source.data);
  const samples: number[] = [];
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (isOpaque(data, pixel)) samples.push(opaqueLuminance(data, pixel));
  }
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * 0.04)] ?? 0;
  const high = samples[Math.floor(samples.length * 0.96)] ?? 255;
  const span = Math.max(24, high - low);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (!isOpaque(data, pixel)) continue;
      const i = pixel * 4;
      const lum = opaqueLuminance(data, pixel);
      const stretched = Math.max(0, Math.min(1, (lum - low) / span));
      const lx = 1 - x / Math.max(1, width - 1);
      const ly = 1 - y / Math.max(1, height - 1);
      const gain = 0.78 + 0.34 * lx + 0.2 * ly;
      const next = Math.max(0, Math.min(255, stretched * 255 * gain));
      const scale = lum < 1 ? next / 1 : next / lum;
      data[i] = Math.max(0, Math.min(255, Math.round(data[i] * scale)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * scale)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * scale)));
    }
  }
  return createImageData(data, width, height);
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

export function renderPixelPortrait(
  source: ImageData,
  mode: PortraitProcessMode
): { grid: ImageData; output: ImageData } {
  let prepared: ImageData;
  if (mode === 'ai') {
    prepared = posterize(downsampleNearest(keyPlainBackground(source), PORTRAIT_GRID, PORTRAIT_GRID));
  } else {
    const framed = frameHeadAndShoulders(source, FALLBACK_WORKING);
    const lit = applyCelLight(framed);
    const blurred = boxBlur(lit, 2);
    const posted = posterize(blurred);
    prepared = downsampleNearest(posted, PORTRAIT_GRID, PORTRAIT_GRID);
  }
  const outlined = applyOutlines(prepared);
  const grid = applyRim(outlined);
  return { grid, output: upscaleNearest(grid, PORTRAIT_SCALE) };
}
