/**
 * lib/dither.ts
 * Pure functional image processing and dithering engine.
 * Decoupled from React components and canvas DOM.
 * 
 * Features:
 * - High-precision luminance calculation (ITU-R BT.601)
 * - Smart Adaptive Auto-Exposure / Facial Dynamic Range Normalization
 * - Pre-dither Unsharp Masking for crisp glasses, eyes, and contours
 * - Serpentine (boustrophedon) Floyd-Steinberg error diffusion
 * - Atkinson dithering (legendary retro Macintosh high-contrast style)
 * - Stucki 12-neighbor error diffusion (photographic smooth stippling)
 * - Bayer 4x4 & 8x8 ordered matrix dithering
 * - Contrast, brightness, and gamma midtone lift controls
 * - 4-Level Grayscale Quantization & Custom Palette mapping
 * - Alpha transparency preservation for background-removed portraits
 */

import type { DitherConfig, DitherPaletteColor } from '../types/badge';

/**
 * Standard 4-level grayscale palette (values: 0, 85, 170, 255)
 */
export const FOUR_LEVEL_GRAYSCALE: DitherPaletteColor[] = [
  { r: 0, g: 0, b: 0, a: 255 },       // Pure Black (0x00)
  { r: 85, g: 85, b: 85, a: 255 },    // Dark Gray  (0x55)
  { r: 170, g: 170, b: 170, a: 255 }, // Light Gray (0xAA)
  { r: 255, g: 255, b: 255, a: 255 }, // Crisp White (0xFF)
];

/**
 * Cyber Green 4-level palette
 */
export const CYBER_GREEN_PALETTE: DitherPaletteColor[] = [
  { r: 10, g: 18, b: 12, a: 255 },
  { r: 22, g: 68, b: 37, a: 255 },
  { r: 34, g: 197, b: 94, a: 255 },
  { r: 187, g: 247, b: 208, a: 255 },
];

/**
 * Amber CRT 4-level palette
 */
export const AMBER_CRT_PALETTE: DitherPaletteColor[] = [
  { r: 20, g: 12, b: 4, a: 255 },
  { r: 120, g: 53, b: 15, a: 255 },
  { r: 245, g: 158, b: 11, a: 255 },
  { r: 254, g: 243, b: 199, a: 255 },
];

/**
 * Classic 1989 GameBoy 4-level palette
 */
export const GAMEBOY_PALETTE: DitherPaletteColor[] = [
  { r: 15, g: 56, b: 15, a: 255 },
  { r: 48, g: 98, b: 48, a: 255 },
  { r: 139, g: 172, b: 15, a: 255 },
  { r: 155, g: 188, b: 15, a: 255 },
];

export const PRESET_PALETTES: Record<string, DitherPaletteColor[]> = {
  'classic-grayscale': FOUR_LEVEL_GRAYSCALE,
  'cyber-green': CYBER_GREEN_PALETTE,
  'amber-crt': AMBER_CRT_PALETTE,
  'gameboy': GAMEBOY_PALETTE,
};

/**
 * Default tuning configuration for hackathon badges:
 * Neutral contrast & brightness + auto-exposure ON ensures
 * facial contours (glasses, eyes, beard) are never crushed to black.
 */
export const DEFAULT_DITHER_CONFIG: DitherConfig = {
  resolution: 180, // Crisp 2x integer scale to 360px portrait frame
  levels: 4,
  algorithm: 'floyd-steinberg',
  contrast: 0.0,
  brightness: 0.0,
  diffusionStrength: 0.88,
  invert: false,
  autoEnhance: true,
  gamma: 1.0,
  sharpness: 0.35,
  serpentine: true,
};

/**
 * Bayer 4x4 matrix for ordered dithering normalized to [0, 1)
 */
const BAYER_4X4 = [
  [ 0 / 16,  8 / 16,  2 / 16, 10 / 16],
  [12 / 16,  4 / 16, 14 / 16,  6 / 16],
  [ 3 / 16, 11 / 16,  1 / 16,  9 / 16],
  [15 / 16,  7 / 16, 13 / 16,  5 / 16],
];

/**
 * Bayer 8x8 matrix for fine-grained ordered dithering
 */
const BAYER_8X8 = [
  [ 0/64, 32/64,  8/64, 40/64,  2/64, 34/64, 10/64, 42/64],
  [48/64, 16/64, 56/64, 24/64, 50/64, 18/64, 58/64, 26/64],
  [12/64, 44/64,  4/64, 36/64, 14/64, 46/64,  6/64, 38/64],
  [60/64, 28/64, 52/64, 20/64, 62/64, 30/64, 54/64, 22/64],
  [ 3/64, 35/64, 11/64, 43/64,  1/64, 33/64,  9/64, 41/64],
  [51/64, 19/64, 59/64, 27/64, 49/64, 17/64, 57/64, 25/64],
  [15/64, 47/64,  7/64, 39/64, 13/64, 45/64,  5/64, 37/64],
  [63/64, 31/64, 55/64, 23/64, 61/64, 29/64, 53/64, 21/64],
];

/**
 * Calculate ITU-R BT.601 perceptual luminance
 */
export function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Clamp a number to an integer range [min, max]
 */
export function clamp(val: number, min = 0, max = 255): number {
  if (val < min) return min;
  if (val > max) return max;
  return Math.round(val);
}

/**
 * Pre-process luminance with contrast, brightness, and inversion curves
 */
export function adjustLuminance(
  lum: number,
  contrast = 0,
  brightness = 0,
  invert = false
): number {
  let v = lum;

  // 1. Contrast adjustment centered at mid-gray 128
  if (contrast !== 0) {
    const factor = (1.015 * (contrast + 1)) / (1.015 - contrast);
    v = factor * (v - 128) + 128;
  }

  // 2. Brightness adjustment
  if (brightness !== 0) {
    v += brightness * 255;
  }

  // 3. Clamp
  v = Math.max(0, Math.min(255, v));

  // 4. Invert
  if (invert) {
    v = 255 - v;
  }

  return v;
}

/**
 * Quantize a continuous value in [0, 255] into N evenly spaced levels.
 * For 4 levels: 0 (0), 1 (85), 2 (170), 3 (255).
 */
export function quantizeLevels(
  value: number,
  levels = 4
): { value: number; index: number; error: number } {
  const steps = Math.max(2, levels) - 1;
  const stepSize = 255 / steps;
  const rawIndex = Math.round(value / stepSize);
  const index = Math.max(0, Math.min(steps, rawIndex));
  const quantized = Math.round(index * stepSize);
  const error = value - quantized;

  return {
    value: quantized,
    index,
    error,
  };
}

/**
 * Map quantized level index to a target palette color
 */
export function getPaletteColorForIndex(
  index: number,
  levels: number,
  palette: DitherPaletteColor[]
): DitherPaletteColor {
  if (palette.length === levels) {
    return palette[index];
  }
  const ratio = index / (levels - 1);
  const paletteIndex = Math.min(
    palette.length - 1,
    Math.max(0, Math.round(ratio * (palette.length - 1)))
  );
  return palette[paletteIndex];
}

/**
 * Helper to safely construct ImageData in browser and worker environments
 */
export function createImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
  }
  return {
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData;
}

/**
 * Pre-filter & prepare luminance buffer:
 * - Computes adaptive dynamic range expansion (auto-exposure) so facial skin tones
 *   land cleanly in the active 4-level stipple range instead of getting crushed into solid black.
 * - Applies unsharp mask for glasses rims and eye outlines.
 * - Applies user contrast, brightness, and gamma.
 */
export function prepareLuminanceBuffer(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): { lumBuffer: Float32Array; alphaBuffer: Uint8Array; w: number; h: number } {
  const {
    contrast = 0,
    brightness = 0,
    invert = false,
    autoEnhance = true,
    gamma = 1.0,
    sharpness = 0.35,
  } = config;

  const w = source.width;
  const h = source.height;
  const src = source.data;

  const rawLum = new Float32Array(w * h);
  const alphaBuffer = new Uint8Array(w * h);

  // 1. Extract raw luminance and alpha
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    rawLum[i] = getLuminance(src[idx], src[idx + 1], src[idx + 2]);
    alphaBuffer[i] = src[idx + 3];
  }

  // 2. Adaptive Auto-Exposure / Facial Dynamic Range Normalization
  const processedLum = new Float32Array(w * h);

  if (autoEnhance) {
    // Collect foreground samples (alpha >= 20)
    const samples: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (alphaBuffer[i] >= 20) {
        samples.push(rawLum[i]);
      }
    }

    const sampleList = samples.length >= (w * h * 0.05) ? samples : Array.from(rawLum);
    sampleList.sort((a, b) => a - b);

    // 2nd and 98th percentile anchors
    const pLowIdx = Math.floor(sampleList.length * 0.02);
    const pHighIdx = Math.floor(sampleList.length * 0.98);
    const medianIdx = Math.floor(sampleList.length * 0.5);

    const low = sampleList[pLowIdx] ?? 0;
    const high = sampleList[pHighIdx] ?? 255;
    const median = sampleList[medianIdx] ?? 128;
    const range = Math.max(15, high - low);

    // Target midtone around 0.52 (~133/255) ensures skin tones stipple beautifully
    const normMedian = Math.max(0.05, Math.min(0.95, (median - low) / range));
    const targetMid = 0.52;
    const adaptGamma = Math.max(0.45, Math.min(1.4, Math.log(targetMid) / Math.log(normMedian)));
    const finalGamma = adaptGamma * (gamma > 0 ? gamma : 1.0);

    for (let i = 0; i < w * h; i++) {
      if (alphaBuffer[i] < 20) {
        processedLum[i] = 0;
        continue;
      }
      const norm = Math.max(0, Math.min(1, (rawLum[i] - low) / range));
      processedLum[i] = Math.pow(norm, finalGamma) * 255;
    }
  } else {
    const effectiveGamma = gamma > 0 ? gamma : 1.0;
    for (let i = 0; i < w * h; i++) {
      if (alphaBuffer[i] < 20) {
        processedLum[i] = 0;
        continue;
      }
      const norm = Math.max(0, Math.min(1, rawLum[i] / 255));
      processedLum[i] = Math.pow(norm, effectiveGamma) * 255;
    }
  }

  // 3. Pre-Dither Unsharp Masking (Enhances glasses rims, pupils, nose bridge, beard lines)
  const finalBuffer = new Float32Array(w * h);
  if (sharpness && sharpness > 0) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (alphaBuffer[idx] < 20) {
          finalBuffer[idx] = 0;
          continue;
        }

        const center = processedLum[idx];
        const left = x > 0 ? processedLum[idx - 1] : center;
        const right = x < w - 1 ? processedLum[idx + 1] : center;
        const up = y > 0 ? processedLum[idx - w] : center;
        const down = y < h - 1 ? processedLum[idx + w] : center;

        const avgSurrounding = (left + right + up + down) / 4;
        const sharpVal = center + sharpness * (center - avgSurrounding);
        const clampedLum = Math.max(0, Math.min(255, sharpVal));

        finalBuffer[idx] = adjustLuminance(clampedLum, contrast, brightness, invert);
      }
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      if (alphaBuffer[i] < 20) {
        finalBuffer[i] = 0;
      } else {
        finalBuffer[i] = adjustLuminance(processedLum[i], contrast, brightness, invert);
      }
    }
  }

  return { lumBuffer: finalBuffer, alphaBuffer, w, h };
}

/**
 * Floyd-Steinberg 4-level error diffusion dithering with Serpentine scanning.
 */
export function applyFloydSteinbergDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    diffusionStrength = 0.88,
    serpentine = true,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);

  const wRight = (7 / 16) * diffusionStrength;
  const wDownLeft = (3 / 16) * diffusionStrength;
  const wDown = (5 / 16) * diffusionStrength;
  const wDownRight = (1 / 16) * diffusionStrength;

  for (let y = 0; y < h; y++) {
    const isOddRow = serpentine && (y % 2 === 1);
    const startX = isOddRow ? w - 1 : 0;
    const endX = isOddRow ? -1 : w;
    const stepX = isOddRow ? -1 : 1;

    for (let x = startX; x !== endX; x += stepX) {
      const offset = y * w + x;
      const alpha = alphaBuffer[offset];

      if (alpha < 20) {
        const dstIdx = offset * 4;
        outputData[dstIdx] = 0;
        outputData[dstIdx + 1] = 0;
        outputData[dstIdx + 2] = 0;
        outputData[dstIdx + 3] = 0;
        continue;
      }

      const currentLum = Math.max(0, Math.min(255, lumBuffer[offset]));
      const { index, error } = quantizeLevels(currentLum, levels);

      const color = getPaletteColorForIndex(index, levels, customPalette);
      const dstIdx = offset * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;

      if (!isOddRow) {
        // Left to right diffusion
        if (x + 1 < w && alphaBuffer[offset + 1] >= 20) {
          lumBuffer[offset + 1] += error * wRight;
        }
        if (y + 1 < h) {
          const nextRow = (y + 1) * w;
          if (x - 1 >= 0 && alphaBuffer[nextRow + (x - 1)] >= 20) {
            lumBuffer[nextRow + (x - 1)] += error * wDownLeft;
          }
          if (alphaBuffer[nextRow + x] >= 20) {
            lumBuffer[nextRow + x] += error * wDown;
          }
          if (x + 1 < w && alphaBuffer[nextRow + (x + 1)] >= 20) {
            lumBuffer[nextRow + (x + 1)] += error * wDownRight;
          }
        }
      } else {
        // Right to left diffusion (Serpentine)
        if (x - 1 >= 0 && alphaBuffer[offset - 1] >= 20) {
          lumBuffer[offset - 1] += error * wRight;
        }
        if (y + 1 < h) {
          const nextRow = (y + 1) * w;
          if (x + 1 < w && alphaBuffer[nextRow + (x + 1)] >= 20) {
            lumBuffer[nextRow + (x + 1)] += error * wDownLeft;
          }
          if (alphaBuffer[nextRow + x] >= 20) {
            lumBuffer[nextRow + x] += error * wDown;
          }
          if (x - 1 >= 0 && alphaBuffer[nextRow + (x - 1)] >= 20) {
            lumBuffer[nextRow + (x - 1)] += error * wDownRight;
          }
        }
      }
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Atkinson Dithering algorithm (Classic Macintosh high-contrast aesthetic).
 */
export function applyAtkinsonDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    diffusionStrength = 1.0,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);
  const weight = (1 / 8) * diffusionStrength;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = y * w + x;
      const alpha = alphaBuffer[offset];

      if (alpha < 20) {
        const dstIdx = offset * 4;
        outputData[dstIdx] = 0;
        outputData[dstIdx + 1] = 0;
        outputData[dstIdx + 2] = 0;
        outputData[dstIdx + 3] = 0;
        continue;
      }

      const currentLum = Math.max(0, Math.min(255, lumBuffer[offset]));
      const { index, error } = quantizeLevels(currentLum, levels);

      const color = getPaletteColorForIndex(index, levels, customPalette);
      const dstIdx = offset * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;

      const spread = error * weight;

      if (x + 1 < w && alphaBuffer[offset + 1] >= 20) lumBuffer[offset + 1] += spread;
      if (x + 2 < w && alphaBuffer[offset + 2] >= 20) lumBuffer[offset + 2] += spread;

      if (y + 1 < h) {
        const r1 = (y + 1) * w;
        if (x - 1 >= 0 && alphaBuffer[r1 + (x - 1)] >= 20) lumBuffer[r1 + (x - 1)] += spread;
        if (alphaBuffer[r1 + x] >= 20) lumBuffer[r1 + x] += spread;
        if (x + 1 < w && alphaBuffer[r1 + (x + 1)] >= 20) lumBuffer[r1 + (x + 1)] += spread;
      }

      if (y + 2 < h) {
        const r2 = (y + 2) * w;
        if (alphaBuffer[r2 + x] >= 20) lumBuffer[r2 + x] += spread;
      }
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Stucki Error Diffusion Dithering (12-neighbor smooth photographic stippling).
 */
export function applyStuckiDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    diffusionStrength = 0.88,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);

  const d = 42;
  const s = diffusionStrength;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const offset = rowOffset + x;
      const alpha = alphaBuffer[offset];

      if (alpha < 20) {
        const dstIdx = offset * 4;
        outputData[dstIdx] = 0;
        outputData[dstIdx + 1] = 0;
        outputData[dstIdx + 2] = 0;
        outputData[dstIdx + 3] = 0;
        continue;
      }

      const currentLum = Math.max(0, Math.min(255, lumBuffer[offset]));
      const { index, error } = quantizeLevels(currentLum, levels);

      const color = getPaletteColorForIndex(index, levels, customPalette);
      const dstIdx = offset * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;

      const err = error * s;

      if (x + 1 < w && alphaBuffer[offset + 1] >= 20) lumBuffer[offset + 1] += (err * 8) / d;
      if (x + 2 < w && alphaBuffer[offset + 2] >= 20) lumBuffer[offset + 2] += (err * 4) / d;

      if (y + 1 < h) {
        const r1 = (y + 1) * w;
        if (x - 2 >= 0 && alphaBuffer[r1 + (x - 2)] >= 20) lumBuffer[r1 + (x - 2)] += (err * 2) / d;
        if (x - 1 >= 0 && alphaBuffer[r1 + (x - 1)] >= 20) lumBuffer[r1 + (x - 1)] += (err * 4) / d;
        if (alphaBuffer[r1 + x] >= 20) lumBuffer[r1 + x] += (err * 8) / d;
        if (x + 1 < w && alphaBuffer[r1 + (x + 1)] >= 20) lumBuffer[r1 + (x + 1)] += (err * 4) / d;
        if (x + 2 < w && alphaBuffer[r1 + (x + 2)] >= 20) lumBuffer[r1 + (x + 2)] += (err * 2) / d;
      }

      if (y + 2 < h) {
        const r2 = (y + 2) * w;
        if (x - 2 >= 0 && alphaBuffer[r2 + (x - 2)] >= 20) lumBuffer[r2 + (x - 2)] += (err * 1) / d;
        if (x - 1 >= 0 && alphaBuffer[r2 + (x - 1)] >= 20) lumBuffer[r2 + (x - 1)] += (err * 2) / d;
        if (alphaBuffer[r2 + x] >= 20) lumBuffer[r2 + x] += (err * 4) / d;
        if (x + 1 < w && alphaBuffer[r2 + (x + 1)] >= 20) lumBuffer[r2 + (x + 1)] += (err * 2) / d;
        if (x + 2 < w && alphaBuffer[r2 + (x + 2)] >= 20) lumBuffer[r2 + (x + 2)] += (err * 1) / d;
      }
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Ordered Dithering using 4x4 Bayer Matrix
 */
export function applyBayerDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    diffusionStrength = 1.0,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);
  const stepSize = 255 / (levels - 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const alpha = alphaBuffer[idx];

      if (alpha < 20) {
        const dstIdx = idx * 4;
        outputData[dstIdx] = 0;
        outputData[dstIdx + 1] = 0;
        outputData[dstIdx + 2] = 0;
        outputData[dstIdx + 3] = 0;
        continue;
      }

      const lum = lumBuffer[idx];
      const bayerVal = BAYER_4X4[y % 4][x % 4];
      const thresholdOffset = (bayerVal - 0.5) * stepSize * diffusionStrength;
      const perturbed = Math.max(0, Math.min(255, lum + thresholdOffset));

      const { index } = quantizeLevels(perturbed, levels);
      const color = getPaletteColorForIndex(index, levels, customPalette);

      const dstIdx = idx * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Ordered Dithering using 8x8 Bayer Matrix (Fine pattern)
 */
export function applyBayer8Dither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    diffusionStrength = 1.0,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);
  const stepSize = 255 / (levels - 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const alpha = alphaBuffer[idx];

      if (alpha < 20) {
        const dstIdx = idx * 4;
        outputData[dstIdx] = 0;
        outputData[dstIdx + 1] = 0;
        outputData[dstIdx + 2] = 0;
        outputData[dstIdx + 3] = 0;
        continue;
      }

      const lum = lumBuffer[idx];
      const bayerVal = BAYER_8X8[y % 8][x % 8];
      const thresholdOffset = (bayerVal - 0.5) * stepSize * diffusionStrength;
      const perturbed = Math.max(0, Math.min(255, lum + thresholdOffset));

      const { index } = quantizeLevels(perturbed, levels);
      const color = getPaletteColorForIndex(index, levels, customPalette);

      const dstIdx = idx * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Simple hard-quantization threshold (posterize) without diffusion
 */
export function applyThresholdDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const { lumBuffer, alphaBuffer, w, h } = prepareLuminanceBuffer(source, config);
  const outputData = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    const alpha = alphaBuffer[i];
    if (alpha < 20) {
      const dstIdx = i * 4;
      outputData[dstIdx] = 0;
      outputData[dstIdx + 1] = 0;
      outputData[dstIdx + 2] = 0;
      outputData[dstIdx + 3] = 0;
      continue;
    }

    const lum = lumBuffer[i];
    const { index } = quantizeLevels(lum, levels);
    const color = getPaletteColorForIndex(index, levels, customPalette);

    const dstIdx = i * 4;
    outputData[dstIdx] = color.r;
    outputData[dstIdx + 1] = color.g;
    outputData[dstIdx + 2] = color.b;
    outputData[dstIdx + 3] = color.a ?? alpha;
  }

  return createImageData(outputData, w, h);
}

/**
 * Unified pipeline function: applies the selected dithering algorithm
 */
export function ditherImageData(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const algo = config.algorithm || 'floyd-steinberg';

  switch (algo) {
    case 'atkinson':
      return applyAtkinsonDither(source, config);
    case 'bayer':
      return applyBayerDither(source, config);
    case 'bayer8':
      return applyBayer8Dither(source, config);
    case 'stucki':
      return applyStuckiDither(source, config);
    case 'threshold':
      return applyThresholdDither(source, config);
    case 'floyd-steinberg':
    default:
      return applyFloydSteinbergDither(source, config);
  }
}

/**
 * Downsamples and dithers an HTMLImageElement or Canvas with portrait-aware framing.
 */
export function processImageToDitheredCanvas(
  sourceImage: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  config: Partial<DitherConfig> = {}
): HTMLCanvasElement {
  const targetRes = config.resolution || DEFAULT_DITHER_CONFIG.resolution;

  let srcW = 0;
  let srcH = 0;
  if (typeof HTMLVideoElement !== 'undefined' && sourceImage instanceof HTMLVideoElement) {
    srcW = sourceImage.videoWidth;
    srcH = sourceImage.videoHeight;
  } else {
    srcW = sourceImage.width;
    srcH = sourceImage.height;
  }

  const downsampleCanvas = document.createElement('canvas');
  downsampleCanvas.width = targetRes;
  downsampleCanvas.height = targetRes;
  const ctx = downsampleCanvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const minDim = Math.min(srcW, srcH);
  const sx = (srcW - minDim) / 2;
  // If vertical image (srcH > srcW), portraits usually place the head in the upper-middle
  const sy = srcH > srcW ? Math.max(0, (srcH - minDim) * 0.15) : (srcH - minDim) / 2;

  ctx.drawImage(sourceImage, sx, sy, minDim, minDim, 0, 0, targetRes, targetRes);

  const sampledData = ctx.getImageData(0, 0, targetRes, targetRes);
  const ditheredData = ditherImageData(sampledData, config);
  ctx.putImageData(ditheredData, 0, 0);

  return downsampleCanvas;
}
