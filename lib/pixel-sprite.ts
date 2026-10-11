/**
 * Pixel-sprite badge: 64×64 cut-out, 6 green tones, 1px outline + 1px rim,
 * drawn on a 640×960 Game Boy card. No dithering. All of it is client-side;
 * the quantizer itself is a pure function of ImageData.
 */

import type { BadgeState } from '../types/badge';
import { createImageData, getLuminance, portraitCropRect } from './dither';
import { drawPixelText, fitPixelSize, loadPixelFont } from './pixel-font';

/** GB Leaf, darkest to lightest. Index 0 is outline/ink only, never a face tone. */
export const GB_LEAF_HEX = [
  '#102a14',
  '#2a4a2a',
  '#3e6b3a',
  '#5a8a3c',
  '#7fa83a',
  '#a7c957',
  '#cfe38a',
  '#eef7c8',
] as const;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const GB_LEAF: Rgb[] = GB_LEAF_HEX.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
});

export const P0 = GB_LEAF_HEX[0];
export const P1 = GB_LEAF_HEX[1];
export const P2 = GB_LEAF_HEX[2];
export const P4 = GB_LEAF_HEX[4];
export const P5 = GB_LEAF_HEX[5];
export const P6 = GB_LEAF_HEX[6];
export const P7 = GB_LEAF_HEX[7];

/**
 * Placeholder copy for the sprite card. Stats, moves, level, and the footer
 * labels live here so they can be edited without touching the layout.
 */
export const PIXEL_SPRITE_PLACEHOLDERS = {
  levelLabel: 'LVL 34',
  hpLabel: 'HP',
  hpFill: 0.82,
  statsLabel: 'ATK 88  DEF 72  SPD 95',
  moves: ['> SQL QUERY', '> ETL PIPELINE', '> DATA CLEAN'],
  footerLeft: 'NO.001',
  footerRight: 'PIXEL SPRITE',
} as const;

export const SPRITE_GRID = 64;
export const SPRITE_PAD = 2;

/** Numpy-compatible linear percentile. `p` is in 0–100. */
export function percentileLinear(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const t = rank - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

/** Round halves to even, matching numpy.round used by the reference pipeline. */
export function roundHalfEven(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const v = Math.abs(value);
  const floor = Math.floor(v);
  const frac = v - floor;
  if (Math.abs(frac - 0.5) < 1e-9) {
    return sign * (floor % 2 === 0 ? floor : floor + 1);
  }
  return sign * Math.round(v);
}

/**
 * Map a 64×64 (or any size) RGBA cut-out to the leaf palette.
 * Foreground is alpha >= 128. Levels land in P1–P6 only, so a face is never
 * darker than #2a4a2a. The result is padded by 2px: a 1px #102a14 outline
 * and a 1px #eef7c8 rim.
 */
export function buildPixelSprite(source: ImageData): ImageData {
  const w = source.width;
  const h = source.height;
  const mask = new Uint8Array(w * h);
  const samples: number[] = [];
  const lum = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    lum[i] = getLuminance(source.data[o], source.data[o + 1], source.data[o + 2]);
    if (source.data[o + 3] >= 128) {
      mask[i] = 1;
      samples.push(lum[i]);
    }
  }
  samples.sort((a, b) => a - b);
  const lo = percentileLinear(samples, 2);
  const hi = percentileLinear(samples, 98);
  const range = Math.max(15, hi - lo);

  const ow = w + SPRITE_PAD * 2;
  const oh = h + SPRITE_PAD * 2;
  const out = new Uint8ClampedArray(ow * oh * 4);
  const solid = new Uint8Array(ow * oh);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const n = Math.pow(Math.max(0, Math.min(1, (lum[i] - lo) / range)), 0.85);
      let idx = 1 + roundHalfEven(n * 5);
      if (idx < 1) idx = 1;
      if (idx > 6) idx = 6;
      const dx = x + SPRITE_PAD;
      const dy = y + SPRITE_PAD;
      const di = dy * ow + dx;
      solid[di] = 1;
      const color = GB_LEAF[idx];
      const o = di * 4;
      out[o] = color.r;
      out[o + 1] = color.g;
      out[o + 2] = color.b;
      out[o + 3] = 255;
    }
  }

  const adjacentTo = (x: number, y: number, kind: number) => {
    if (x > 0 && solid[y * ow + (x - 1)] === kind) return true;
    if (x + 1 < ow && solid[y * ow + (x + 1)] === kind) return true;
    if (y > 0 && solid[(y - 1) * ow + x] === kind) return true;
    if (y + 1 < oh && solid[(y + 1) * ow + x] === kind) return true;
    return false;
  };

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const i = y * ow + x;
      if (solid[i]) continue;
      if (!adjacentTo(x, y, 1)) continue;
      solid[i] = 2;
      const color = GB_LEAF[0];
      const o = i * 4;
      out[o] = color.r;
      out[o + 1] = color.g;
      out[o + 2] = color.b;
      out[o + 3] = 255;
    }
  }

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const i = y * ow + x;
      if (solid[i]) continue;
      let near = false;
      const look = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const;
      for (const [dy, dx] of look) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || nx < 0 || ny >= oh || nx >= ow) continue;
        const kind = solid[ny * ow + nx];
        if (kind === 1 || kind === 2) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      const color = GB_LEAF[7];
      const o = i * 4;
      out[o] = color.r;
      out[o + 1] = color.g;
      out[o + 2] = color.b;
      out[o + 3] = 255;
    }
  }

  return createImageData(out, ow, oh);
}

export function relativeLuminance(color: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(color.r);
  const g = channel(color.g);
  const b = channel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Inclusive PIL-style box → canvas fillRect. */
function fillBox(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/**
 * Pixel-center coverage of Pillow's rounded_rectangle.
 * A radius 0.8px past the requested one matches the reference card's
 * binary corners (canvas arcTo antialiases those same pixels).
 */
export function pixelRoundedContains(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): boolean {
  const r = Math.min(radius + 0.8, w / 2, h / 2);
  const cx = px + 0.5;
  const cy = py + 0.5;
  const right = x + w;
  const bottom = y + h;
  if (cx < x || cy < y || cx > right || cy > bottom) return false;
  const ix = Math.min(Math.max(cx, x + r), right - r);
  const iy = Math.min(Math.max(cy, y + r), bottom - r);
  const dx = cx - ix;
  const dy = cy - iy;
  return dx * dx + dy * dy <= r * r + 1e-9;
}

function fillRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const y0 = Math.floor(y);
  const y1 = Math.ceil(y + h);
  const x0 = Math.floor(x);
  const x1 = Math.ceil(x + w);
  for (let py = y0; py < y1; py++) {
    let start = -1;
    for (let px = x0; px < x1; px++) {
      const on = pixelRoundedContains(px, py, x, y, w, h, radius);
      if (on && start < 0) start = px;
      else if (!on && start >= 0) {
        ctx.fillRect(start, py, px - start, 1);
        start = -1;
      }
    }
    if (start >= 0) ctx.fillRect(start, py, x1 - start, 1);
  }
}

export function formatSpriteName(name: string): string {
  const trimmed = name.trim().normalize('NFC');
  return trimmed ? trimmed.toUpperCase() : 'YOUR NAME';
}

export function formatSpriteType(typeLabel: string): string {
  const trimmed = typeLabel.trim().normalize('NFC');
  return trimmed ? trimmed.toUpperCase() : 'DATA ENGINEER';
}

export interface SpriteCardContent {
  name: string;
  typeLabel: string;
  sprite: CanvasImageSource | null;
}

/**
 * Draw the 640×960 card. Caller sets the canvas size and loads the pixel font.
 * `sprite` is the 68×68 indexed image; it is scaled 5× with smoothing off.
 */
export function drawPixelSpriteCard(ctx: CanvasRenderingContext2D, content: SpriteCardContent): void {
  const W = 640;
  const H = 960;
  const copy = PIXEL_SPRITE_PLACEHOLDERS;

  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = P0;
  fillRounded(ctx, 0, 0, W, H, 32);
  ctx.fillStyle = P5;
  fillRounded(ctx, 8, 8, W - 16, H - 16, 24);
  ctx.fillStyle = P7;
  fillRounded(ctx, 20, 20, W - 40, H - 40, 16);

  ctx.fillStyle = P0;
  fillBox(ctx, 36, 36, 603, 112);
  const name = formatSpriteName(content.name);
  const nameSize = fitPixelSize(name, 24, 400);
  drawPixelText(ctx, name, 56, 60, nameSize, P7, 'left', 'top');
  drawPixelText(ctx, copy.levelLabel, 584, 64, 16, P6, 'right', 'top');

  const chipX0 = (W - 320) / 2;
  const chipY0 = 128;
  const chipX1 = chipX0 + 320;
  const chipY1 = 166;
  ctx.fillStyle = P0;
  fillBox(ctx, chipX0, chipY0, chipX1, chipY1);
  ctx.fillStyle = P2;
  fillBox(ctx, chipX0 + 4, chipY0 + 4, chipX1 - 4, chipY1 - 4);
  const typeText = formatSpriteType(content.typeLabel);
  const typeSize = fitPixelSize(typeText, 16, 280);
  drawPixelText(ctx, typeText, W / 2, 148, typeSize, P7, 'center', 'middle');

  const px = 140;
  const py = 184;
  ctx.fillStyle = P0;
  fillBox(ctx, px - 4, py - 4, px + 363, py + 363);
  ctx.fillStyle = P6;
  fillBox(ctx, px, py, px + 359, py + 359);
  ctx.fillStyle = P5;
  for (let gy = py; gy < py + 360; gy += 20) {
    fillBox(ctx, px, gy, px + 359, gy);
  }

  if (content.sprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(content.sprite, px + 10, py + 20, 68 * 5, 68 * 5);
    ctx.restore();
  }

  const hpY = 572;
  drawPixelText(ctx, copy.hpLabel, 40, hpY, 16, P0, 'left', 'top');
  ctx.fillStyle = P0;
  fillBox(ctx, 96, hpY - 2, W - 40, hpY + 18);
  const fillRight = 100 + Math.floor((W - 144) * copy.hpFill);
  ctx.fillStyle = P4;
  fillBox(ctx, 100, hpY + 2, fillRight, hpY + 14);
  drawPixelText(ctx, copy.statsLabel, 40, hpY + 40, 16, P0, 'left', 'top');

  ctx.fillStyle = P0;
  fillBox(ctx, 36, 660, W - 37, 836);
  ctx.fillStyle = P6;
  fillBox(ctx, 40, 664, W - 41, 832);
  copy.moves.forEach((line, index) => {
    drawPixelText(ctx, line, 60, 684 + index * 48, 16, P0, 'left', 'top');
  });

  ctx.fillStyle = P0;
  fillBox(ctx, 36, 860, W - 37, 920);
  drawPixelText(ctx, copy.footerLeft, 56, 882, 12, P6, 'left', 'top');
  drawPixelText(ctx, copy.footerRight, W - 56, 882, 12, P6, 'right', 'top');
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the portrait'));
    img.src = url;
  });
}

function rasterizeSprite(image: HTMLImageElement): HTMLCanvasElement {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const crop = portraitCropRect(srcW, srcH);

  const small = document.createElement('canvas');
  small.width = SPRITE_GRID;
  small.height = SPRITE_GRID;
  const smallCtx = small.getContext('2d', { willReadFrequently: true });
  if (!smallCtx) throw new Error('Could not read the sprite canvas');
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, SPRITE_GRID, SPRITE_GRID);

  const sprite = buildPixelSprite(smallCtx.getImageData(0, 0, SPRITE_GRID, SPRITE_GRID));
  const out = document.createElement('canvas');
  out.width = sprite.width;
  out.height = sprite.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Could not write the sprite canvas');
  outCtx.putImageData(sprite, 0, 0);
  return out;
}

/** Full client render of the pixel-sprite badge, including font load. */
export async function renderPixelSpriteBadge(
  canvas: HTMLCanvasElement,
  state: BadgeState
): Promise<void> {
  await loadPixelFont();
  canvas.width = 640;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for the pixel sprite badge');

  let sprite: HTMLCanvasElement | null = null;
  const imageUrl = state.segmentedImage || state.rawImage;
  if (imageUrl) {
    const image = await loadHtmlImage(imageUrl);
    sprite = rasterizeSprite(image);
  }

  drawPixelSpriteCard(ctx, {
    name: state.participant.name,
    typeLabel: state.participant.spriteType,
    sprite,
  });
}
