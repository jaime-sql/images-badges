/**
 * Event card, 640×960.
 * Top band: optional logo (max 64px) and title, then subtitle.
 * Portrait panel: light gray, 2px dark border.
 * Name and role, then a bottom band with footer and number.
 */

import { FALLBACK_BADGE_LABEL } from './portrait-messages';
import { drawPixelText, loadPixelFont } from './pixel-font';
import { fitCanvasText } from './text-fit';
import type { EventCardConfig } from '../types/badge';

export const EVENT_BADGE_WIDTH = 640;
export const EVENT_BADGE_HEIGHT = 960;

const INK = '#F4F4F6';
const MUTED = '#C5C5CE';
const PANEL = '#E4E4E8';
const BORDER = '#0F0F12';
const CARD = '#141418';
const BAND = '#101014';

function cssFamily(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

async function readyFont(family: string, size: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load(`${size}px ${family}`);
    await document.fonts.ready;
  } catch {
    // The canvas falls back to a generic family if the face is still loading.
  }
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  basePx: number,
  family: string,
  align: CanvasTextAlign
): void {
  const fitted = fitCanvasText(text, maxWidth, (value, scale) => {
    ctx.font = `${Math.max(1, Math.round(basePx * scale))}px ${family}`;
    return ctx.measureText(value).width;
  });
  ctx.font = `${Math.max(1, Math.round(basePx * fitted.scale))}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitted.text, x, y);
}

/** Press Start 2P, uppercased, with the pixel-font accent marks. Returns the size used. */
function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  basePx: number,
  color: string,
  align: 'left' | 'right'
): number {
  const upper = text.trim().normalize('NFC').toUpperCase();
  if (!upper) return 0;
  const units = Array.from(upper);
  const widthAt = (count: number, size: number) => count * size;
  let drawn = upper;
  let size = basePx;
  if (widthAt(units.length, basePx) > maxWidth) {
    size = Math.max(8, Math.round(basePx * 0.7));
    if (widthAt(units.length, size) > maxWidth) {
      const ellipsis = '…';
      let best = ellipsis;
      let low = 0;
      let high = units.length;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = `${units.slice(0, mid).join('').trimEnd()}${ellipsis}`;
        if (widthAt(Array.from(candidate).length, size) <= maxWidth) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      drawn = best;
    }
  }
  drawPixelText(ctx, drawn, x, y, size, color, align, 'top');
  return size;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen del logo o del retrato.'));
    image.src = url;
  });
}

export async function renderEventCard(
  canvas: HTMLCanvasElement,
  options: {
    name: string;
    eventCard: EventCardConfig;
    portraitUrl: string | null;
    showFallbackLabel: boolean;
  }
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for the event card');

  const textFont = cssFamily('--font-inter', 'Inter, sans-serif');
  await loadPixelFont();
  await readyFont(textFont, 18);

  canvas.width = EVENT_BADGE_WIDTH;
  canvas.height = EVENT_BADGE_HEIGHT;

  ctx.fillStyle = CARD;
  ctx.fillRect(0, 0, EVENT_BADGE_WIDTH, EVENT_BADGE_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  const margin = 40;
  const contentW = EVENT_BADGE_WIDTH - margin * 2;
  let y = 56;

  let logo: HTMLImageElement | null = null;
  if (options.eventCard.logoDataUrl) {
    try {
      logo = await loadImage(options.eventCard.logoDataUrl);
    } catch {
      logo = null;
    }
  }

  if (logo) {
    const box = 64;
    const scale = Math.min(box / logo.width, box / logo.height);
    const dw = Math.max(1, logo.width * scale);
    const dh = Math.max(1, logo.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, margin, y, dw, dh);
    const textX = margin + box + 16;
    const textW = contentW - box - 16;
    const titleSize = drawPixelLine(ctx, options.eventCard.title, textX, y + 4, textW, 18, INK, 'left');
    ctx.fillStyle = MUTED;
    drawFitted(ctx, options.eventCard.subtitle, textX, y + 4 + titleSize + 18, textW, 16, textFont, 'left');
    y += box + 28;
  } else {
    const titleSize = drawPixelLine(ctx, options.eventCard.title, margin, y, contentW, 22, INK, 'left');
    y += titleSize + 16;
    ctx.fillStyle = MUTED;
    drawFitted(ctx, options.eventCard.subtitle, margin, y, contentW, 18, textFont, 'left');
    y += 28;
  }

  const panel = 516;
  const panelX = Math.round((EVENT_BADGE_WIDTH - panel) / 2);
  const panelY = y;
  ctx.fillStyle = BORDER;
  ctx.fillRect(panelX, panelY, panel, panel);
  ctx.fillStyle = PANEL;
  ctx.fillRect(panelX + 2, panelY + 2, panel - 4, panel - 4);

  if (options.portraitUrl) {
    try {
      const portrait = await loadImage(options.portraitUrl);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(portrait, panelX + 2, panelY + 2, panel - 4, panel - 4);
    } catch {
      drawEmptyPortrait(ctx, panelX, panelY, panel, textFont);
    }
  } else {
    drawEmptyPortrait(ctx, panelX, panelY, panel, textFont);
  }

  y = panelY + panel + 22;
  if (options.showFallbackLabel) {
    ctx.fillStyle = MUTED;
    ctx.font = `12px ${textFont}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(FALLBACK_BADGE_LABEL, margin, y);
    // The label sits under the panel. The gap below it clears the name and the accent marks.
    y += 12 + 36;
  } else {
    y += 14;
  }

  const name = options.name.trim() || 'YOUR NAME';
  const nameColor = options.name.trim() ? INK : '#8A8A94';
  const nameSize = drawPixelLine(ctx, name, margin, y, contentW, 26, nameColor, 'left');
  y += nameSize + 20;
  ctx.fillStyle = MUTED;
  drawFitted(ctx, options.eventCard.role, margin, y, contentW, 18, textFont, 'left');

  const bandY = EVENT_BADGE_HEIGHT - 84;
  ctx.fillStyle = BAND;
  ctx.fillRect(0, bandY, EVENT_BADGE_WIDTH, 84);
  ctx.fillStyle = BORDER;
  ctx.fillRect(0, bandY, EVENT_BADGE_WIDTH, 2);

  drawPixelLine(ctx, options.eventCard.footer, margin, bandY + 34, contentW * 0.62, 12, MUTED, 'left');
  drawPixelLine(
    ctx,
    options.eventCard.number,
    EVENT_BADGE_WIDTH - margin,
    bandY + 30,
    contentW * 0.32,
    16,
    INK,
    'right'
  );
}

function drawEmptyPortrait(
  ctx: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  panel: number,
  textFont: string
): void {
  ctx.fillStyle = '#6B6B73';
  ctx.font = `16px ${textFont}`;
  ctx.textAlign = 'center';
  ctx.fillText('NO PORTRAIT', panelX + panel / 2, panelY + panel / 2);
  ctx.textAlign = 'left';
}
