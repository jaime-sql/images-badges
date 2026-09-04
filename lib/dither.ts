/**
 * lib/dither.ts
 * Pure functional image processing and dithering engine.
 * Decoupled from React components and canvas DOM.
 * 
 * Features:
 * - High-precision luminance calculation (ITU-R BT.601)
 * - Contrast, brightness, and inversion pre-filtering
 * - 4-Level Grayscale Quantization & Custom Palette mapping
 * - Floyd-Steinberg 4-level error diffusion
 * - Atkinson error diffusion (retro Macintosh style)
 * - Bayer 4x4 / 8x8 ordered dithering
 * - Pure-function downsampling / box-sampling for pixel grid preservation
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
 * Default tuning configuration for hackathon badges
 */
export const DEFAULT_DITHER_CONFIG: DitherConfig = {
  resolution: 128,
  levels: 4,
  algorithm: 'floyd-steinberg',
  contrast: 0.2,
  brightness: 0.05,
  diffusionStrength: 0.95,
  invert: false,
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
 * 
 * @param lum Base luminance in [0, 255]
 * @param contrast Contrast factor (-1.0 to 1.0, 0 is neutral)
 * @param brightness Brightness factor (-1.0 to 1.0, 0 is neutral)
 * @param invert Whether to invert luminance
 */
export function adjustLuminance(
  lum: number,
  contrast = 0,
  brightness = 0,
  invert = false
): number {
  // 1. Contrast adjustment centered at mid-gray 128
  const factor = (1.015 * (contrast + 1)) / (1.015 - contrast);
  let v = factor * (lum - 128) + 128;

  // 2. Brightness adjustment
  v += brightness * 255;

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
 * 
 * Returns quantized value, level index, and quantization error.
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
  // If palette length differs, interpolate or map proportionally
  const ratio = index / (levels - 1);
  const paletteIndex = Math.min(
    palette.length - 1,
    Math.max(0, Math.round(ratio * (palette.length - 1)))
  );
  return palette[paletteIndex];
}

/**
 * Helper to safely construct ImageData in browser and test/worker environments
 */
export function createImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(data as unknown as ImageDataArray, width, height);
  }
  return {
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData;
}

/**
 * Downsample an ImageData to target dimensions (targetW, targetH)
 * using area-averaging (box filter) for sharp pixel boundaries.
 */
export function downsampleImageData(
  source: ImageData,
  targetW: number,
  targetH: number
): ImageData {
  const srcW = source.width;
  const srcH = source.height;
  const srcData = source.data;

  // Create output buffer (in browser environment, create via Canvas or ImageData constructor)
  // In pure JS: Uint8ClampedArray
  const outData = new Uint8ClampedArray(targetW * targetH * 4);

  const xRatio = srcW / targetW;
  const yRatio = srcH / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    const srcYStart = Math.floor(dy * yRatio);
    const srcYEnd = Math.min(srcH, Math.floor((dy + 1) * yRatio));
    const sampleH = Math.max(1, srcYEnd - srcYStart);

    for (let dx = 0; dx < targetW; dx++) {
      const srcXStart = Math.floor(dx * xRatio);
      const srcXEnd = Math.min(srcW, Math.floor((dx + 1) * xRatio));
      const sampleW = Math.max(1, srcXEnd - srcXStart);
      const totalPixels = sampleW * sampleH;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = srcYStart; sy < srcYEnd; sy++) {
        const rowOffset = sy * srcW * 4;
        for (let sx = srcXStart; sx < srcXEnd; sx++) {
          const idx = rowOffset + (sx * 4);
          rSum += srcData[idx];
          gSum += srcData[idx + 1];
          bSum += srcData[idx + 2];
          aSum += srcData[idx + 3];
        }
      }

      const dstIdx = (dy * targetW + dx) * 4;
      outData[dstIdx] = Math.round(rSum / totalPixels);
      outData[dstIdx + 1] = Math.round(gSum / totalPixels);
      outData[dstIdx + 2] = Math.round(bSum / totalPixels);
      outData[dstIdx + 3] = Math.round(aSum / totalPixels);
    }
  }

  return createImageData(outData, targetW, targetH);
}

/**
 * Floyd-Steinberg 4-level error diffusion dithering.
 * 
 * Error distribution weights:
 *       [ * ]  7/16
 * 3/16  5/16   1/16
 * 
 * Works with arbitrary quantization levels (default 4) and custom palettes.
 * Handles alpha transparency cleanly so background-removed portraits retain crisp silhouettes.
 */
export function applyFloydSteinbergDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    contrast = 0,
    brightness = 0,
    diffusionStrength = 1.0,
    invert = false,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const w = source.width;
  const h = source.height;
  const src = source.data;

  // Extract luminance matrix & alpha into a floating-point 2D buffer to accumulate diffusion errors
  const lumBuffer = new Float32Array(w * h);
  const alphaBuffer = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const idx = (rowOffset + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const a = src[idx + 3];

      const lum = getLuminance(r, g, b);
      lumBuffer[rowOffset + x] = adjustLuminance(lum, contrast, brightness, invert);
      alphaBuffer[rowOffset + x] = a;
    }
  }

  // Destination pixel array
  const outputData = new Uint8ClampedArray(w * h * 4);

  // Floyd-Steinberg diffusion weights
  const wRight = (7 / 16) * diffusionStrength;
  const wDownLeft = (3 / 16) * diffusionStrength;
  const wDown = (5 / 16) * diffusionStrength;
  const wDownRight = (1 / 16) * diffusionStrength;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = y * w + x;
      const alpha = alphaBuffer[offset];

      // If pixel is fully transparent from background removal, preserve transparency
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

      // Select palette color
      const color = getPaletteColorForIndex(index, levels, customPalette);
      const dstIdx = offset * 4;
      outputData[dstIdx] = color.r;
      outputData[dstIdx + 1] = color.g;
      outputData[dstIdx + 2] = color.b;
      outputData[dstIdx + 3] = color.a ?? alpha;

      // Diffuse quantization error to neighbors within bounds
      if (x + 1 < w && alphaBuffer[offset + 1] >= 20) {
        lumBuffer[offset + 1] += error * wRight;
      }
      if (y + 1 < h) {
        const nextRowOffset = (y + 1) * w;
        if (x - 1 >= 0 && alphaBuffer[nextRowOffset + (x - 1)] >= 20) {
          lumBuffer[nextRowOffset + (x - 1)] += error * wDownLeft;
        }
        if (alphaBuffer[nextRowOffset + x] >= 20) {
          lumBuffer[nextRowOffset + x] += error * wDown;
        }
        if (x + 1 < w && alphaBuffer[nextRowOffset + (x + 1)] >= 20) {
          lumBuffer[nextRowOffset + (x + 1)] += error * wDownRight;
        }
      }
    }
  }

  return createImageData(outputData, w, h);
}

/**
 * Atkinson Dithering algorithm.
 * Diffuses only 3/4 of the error across 6 neighbors:
 *       [ * ]  1/8  1/8
 *  1/8   1/8   1/8
 *        1/8
 * Result: Distinct high-contrast retro Macintosh aesthetic.
 */
export function applyAtkinsonDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    contrast = 0,
    brightness = 0,
    diffusionStrength = 1.0,
    invert = false,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const w = source.width;
  const h = source.height;
  const src = source.data;

  const lumBuffer = new Float32Array(w * h);
  const alphaBuffer = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const idx = (rowOffset + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const a = src[idx + 3];

      const lum = getLuminance(r, g, b);
      lumBuffer[rowOffset + x] = adjustLuminance(lum, contrast, brightness, invert);
      alphaBuffer[rowOffset + x] = a;
    }
  }

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

      // Atkinson offsets: (+1, 0), (+2, 0), (-1, +1), (0, +1), (+1, +1), (0, +2)
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
 * Ordered Dithering using a 4x4 Bayer matrix.
 * Provides a structured, CRT dot-matrix style pattern.
 */
export function applyBayerDither(
  source: ImageData,
  config: Partial<DitherConfig> = {}
): ImageData {
  const {
    levels = 4,
    contrast = 0,
    brightness = 0,
    diffusionStrength = 1.0,
    invert = false,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const w = source.width;
  const h = source.height;
  const src = source.data;
  const outputData = new Uint8ClampedArray(w * h * 4);

  const stepSize = 255 / (levels - 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const alpha = src[idx + 3];

      if (alpha < 20) {
        outputData[idx] = 0;
        outputData[idx + 1] = 0;
        outputData[idx + 2] = 0;
        outputData[idx + 3] = 0;
        continue;
      }

      const lum = getLuminance(src[idx], src[idx + 1], src[idx + 2]);
      const adjusted = adjustLuminance(lum, contrast, brightness, invert);

      // Bayer threshold offset: matrix value is in [0, 1) -> center around 0
      const bayerVal = BAYER_4X4[y % 4][x % 4];
      const thresholdOffset = (bayerVal - 0.5) * stepSize * diffusionStrength;
      const perturbed = Math.max(0, Math.min(255, adjusted + thresholdOffset));

      const { index } = quantizeLevels(perturbed, levels);
      const color = getPaletteColorForIndex(index, levels, customPalette);

      outputData[idx] = color.r;
      outputData[idx + 1] = color.g;
      outputData[idx + 2] = color.b;
      outputData[idx + 3] = color.a ?? alpha;
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
    contrast = 0,
    brightness = 0,
    invert = false,
    customPalette = FOUR_LEVEL_GRAYSCALE,
  } = config;

  const w = source.width;
  const h = source.height;
  const src = source.data;
  const outputData = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3];
    if (alpha < 20) {
      outputData[i] = 0;
      outputData[i + 1] = 0;
      outputData[i + 2] = 0;
      outputData[i + 3] = 0;
      continue;
    }

    const lum = getLuminance(src[i], src[i + 1], src[i + 2]);
    const adjusted = adjustLuminance(lum, contrast, brightness, invert);
    const { index } = quantizeLevels(adjusted, levels);
    const color = getPaletteColorForIndex(index, levels, customPalette);

    outputData[i] = color.r;
    outputData[i + 1] = color.g;
    outputData[i + 2] = color.b;
    outputData[i + 3] = color.a ?? alpha;
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
    case 'threshold':
      return applyThresholdDither(source, config);
    case 'floyd-steinberg':
    default:
      return applyFloydSteinbergDither(source, config);
  }
}

/**
 * High-level helper: Downsamples and dithers an HTMLImageElement or Canvas
 * and renders it onto a destination canvas preserving pixelated edges.
 * 
 * @param sourceImage HTMLImageElement | HTMLCanvasElement
 * @param config DitherConfig settings
 * @returns An HTMLCanvasElement containing the dithered portrait at exact pixel resolution
 */
export function processImageToDitheredCanvas(
  sourceImage: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  config: Partial<DitherConfig> = {}
): HTMLCanvasElement {
  const targetRes = config.resolution || DEFAULT_DITHER_CONFIG.resolution;

  // Determine aspect ratio preserving square crop / fill
  let srcW = 0;
  let srcH = 0;
  if (typeof HTMLVideoElement !== 'undefined' && sourceImage instanceof HTMLVideoElement) {
    srcW = sourceImage.videoWidth;
    srcH = sourceImage.videoHeight;
  } else {
    srcW = sourceImage.width;
    srcH = sourceImage.height;
  }

  // Intermediate canvas for downsampling
  const downsampleCanvas = document.createElement('canvas');
  downsampleCanvas.width = targetRes;
  downsampleCanvas.height = targetRes;
  const ctx = downsampleCanvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context');
  }

  // Draw source image cropped to center square
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const minDim = Math.min(srcW, srcH);
  const sx = (srcW - minDim) / 2;
  const sy = (srcH - minDim) / 2;

  ctx.drawImage(sourceImage, sx, sy, minDim, minDim, 0, 0, targetRes, targetRes);

  // Extract ImageData
  const sampledData = ctx.getImageData(0, 0, targetRes, targetRes);

  // Apply dithering algorithm
  const ditheredData = ditherImageData(sampledData, config);

  // Put dithered pixels back
  ctx.putImageData(ditheredData, 0, 0);

  return downsampleCanvas;
}
