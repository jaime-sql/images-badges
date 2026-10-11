/**
 * Event card, 640×960.
 * Top band: logo slot (max 64px) on the left, title and subtitle beside it.
 * Portrait panel: light gray, 2px #0F0F12 border, filling the space above the name.
 * Name and role sit directly under the panel. Bottom band holds footer and number.
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

export const EVENT_TOP_BAND = 104;
export const EVENT_BOTTOM_BAND = 76;
export const EVENT_SIDE = 32;
export const PANEL_BORDER = 2;
/** Canvas pixels. The fallback line stays at least 12px. */
export const FALLBACK_LABEL_SIZE = 16;
const LOGO_MAX = 64;
const DEMO_TAG_SIZE = 12;

export interface EventCardMetrics {
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  nameY: number;
  roleBaseline: number;
  labelY: number | null;
  bottomBandY: number;
  canvasW: number;
  canvasH: number;
}

/** Geometry for the event card. The name block is pinned to the footer band. */
export function eventCardMetrics(showFallbackLabel: boolean): EventCardMetrics {
  const nameSize = 26;
  const labelBlock = showFallbackLabel ? FALLBACK_LABEL_SIZE + 24 : 16;
  const bottomBandY = EVENT_BADGE_HEIGHT - EVENT_BOTTOM_BAND;
  const roleBaseline = bottomBandY - 18;
  const nameY = roleBaseline - 30 - nameSize;
  const panelBottom = nameY - labelBlock;
  const panelY = EVENT_TOP_BAND + 12;
  return {
    panelX: EVENT_SIDE,
    panelY,
    panelW: EVENT_BADGE_WIDTH - EVENT_SIDE * 2,
    panelH: panelBottom - panelY,
    nameY,
    roleBaseline,
    labelY: showFallbackLabel ? panelBottom + 4 : null,
    bottomBandY,
    canvasW: EVENT_BADGE_WIDTH,
    canvasH: EVENT_BADGE_HEIGHT,
  };
}

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
    showDemoTag: boolean;
  }
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for the event card');

  const textFont = cssFamily('--font-inter', 'Inter, sans-serif');
  await loadPixelFont();
  await readyFont(textFont, 18);

  canvas.width = EVENT_BADGE_WIDTH;
  canvas.height = EVENT_BADGE_HEIGHT;

  const metrics = eventCardMetrics(options.showFallbackLabel);
  const textX = EVENT_SIDE + LOGO_MAX + 16;
  const textW = EVENT_BADGE_WIDTH - EVENT_SIDE - textX;

  ctx.fillStyle = CARD;
  ctx.fillRect(0, 0, EVENT_BADGE_WIDTH, EVENT_BADGE_HEIGHT);

  ctx.fillStyle = BAND;
  ctx.fillRect(0, 0, EVENT_BADGE_WIDTH, EVENT_TOP_BAND);
  ctx.fillStyle = BORDER;
  ctx.fillRect(0, EVENT_TOP_BAND - PANEL_BORDER, EVENT_BADGE_WIDTH, PANEL_BORDER);

  let logo: HTMLImageElement | null = null;
  if (options.eventCard.logoDataUrl) {
    try {
      logo = await loadImage(options.eventCard.logoDataUrl);
    } catch {
      logo = null;
    }
  }

  const logoY = Math.round((EVENT_TOP_BAND - LOGO_MAX) / 2);
  if (logo) {
    const scale = Math.min(LOGO_MAX / logo.width, LOGO_MAX / logo.height);
    const dw = Math.max(1, logo.width * scale);
    const dh = Math.max(1, logo.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, EVENT_SIDE, logoY + (LOGO_MAX - dh) / 2, dw, dh);
  }

  const titleSize = drawPixelLine(ctx, options.eventCard.title, textX, logoY + 8, textW, 18, INK, 'left');
  ctx.fillStyle = MUTED;
  drawFitted(
    ctx,
    options.eventCard.subtitle,
    textX,
    logoY + 8 + titleSize + 20,
    textW,
    16,
    textFont,
    'left'
  );

  const { panelX, panelY, panelW, panelH } = metrics;
  ctx.fillStyle = BORDER;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.fillStyle = PANEL;
  ctx.fillRect(
    panelX + PANEL_BORDER,
    panelY + PANEL_BORDER,
    panelW - PANEL_BORDER * 2,
    panelH - PANEL_BORDER * 2
  );

  const innerX = panelX + PANEL_BORDER;
  const innerY = panelY + PANEL_BORDER;
  const innerW = panelW - PANEL_BORDER * 2;
  const innerH = panelH - PANEL_BORDER * 2;
  const portraitSide = Math.min(innerW, innerH);
  const portraitX = innerX + (innerW - portraitSide) / 2;
  const portraitY = innerY + (innerH - portraitSide) / 2;

  if (options.portraitUrl) {
    try {
      const portrait = await loadImage(options.portraitUrl);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(portrait, portraitX, portraitY, portraitSide, portraitSide);
    } catch {
      drawEmptyPortrait(ctx, panelX, panelY, panelW, panelH, textFont);
    }
  } else {
    drawEmptyPortrait(ctx, panelX, panelY, panelW, panelH, textFont);
  }

  if (options.showDemoTag) {
    drawDemoTag(ctx, portraitX, portraitY, portraitSide);
  }

  if (metrics.labelY != null) {
    ctx.fillStyle = MUTED;
    ctx.font = `${FALLBACK_LABEL_SIZE}px ${textFont}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(FALLBACK_BADGE_LABEL, EVENT_SIDE, metrics.labelY);
  }

  const name = options.name.trim() || 'YOUR NAME';
  const nameColor = options.name.trim() ? INK : '#8A8A94';
  drawPixelLine(ctx, name, EVENT_SIDE, metrics.nameY, EVENT_BADGE_WIDTH - EVENT_SIDE * 2, 26, nameColor, 'left');
  ctx.fillStyle = MUTED;
  drawFitted(
    ctx,
    options.eventCard.role,
    EVENT_SIDE,
    metrics.roleBaseline,
    EVENT_BADGE_WIDTH - EVENT_SIDE * 2,
    18,
    textFont,
    'left'
  );

  ctx.fillStyle = BAND;
  ctx.fillRect(0, metrics.bottomBandY, EVENT_BADGE_WIDTH, EVENT_BOTTOM_BAND);
  ctx.fillStyle = BORDER;
  ctx.fillRect(0, metrics.bottomBandY, EVENT_BADGE_WIDTH, PANEL_BORDER);

  const footerW = (EVENT_BADGE_WIDTH - EVENT_SIDE * 2) * 0.62;
  drawPixelLine(
    ctx,
    options.eventCard.footer,
    EVENT_SIDE,
    metrics.bottomBandY + 30,
    footerW,
    12,
    MUTED,
    'left'
  );
  drawPixelLine(
    ctx,
    options.eventCard.number,
    EVENT_BADGE_WIDTH - EVENT_SIDE,
    metrics.bottomBandY + 26,
    (EVENT_BADGE_WIDTH - EVENT_SIDE * 2) * 0.32,
    16,
    INK,
    'right'
  );
}

/** Top-right corner of the portrait square, inset so it sits off the face. */
export function demoTagBox(
  portraitX: number,
  portraitY: number,
  portraitSide: number
): { x: number; y: number; w: number; h: number } {
  const textW = 'DEMO'.length * DEMO_TAG_SIZE;
  const w = textW + 16;
  const h = DEMO_TAG_SIZE + 12;
  return {
    x: Math.round(portraitX + portraitSide - w - 10),
    y: Math.round(portraitY + 10),
    w,
    h,
  };
}

function drawDemoTag(
  ctx: CanvasRenderingContext2D,
  portraitX: number,
  portraitY: number,
  portraitSide: number
): void {
  const box = demoTagBox(portraitX, portraitY, portraitSide);
  ctx.fillStyle = '#000000';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  drawPixelText(ctx, 'DEMO', box.x + 8, box.y + 6, DEMO_TAG_SIZE, '#FFFFFF', 'left', 'top');
}

function drawEmptyPortrait(
  ctx: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  textFont: string
): void {
  ctx.fillStyle = '#6B6B73';
  ctx.font = `16px ${textFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO PORTRAIT', panelX + panelW / 2, panelY + panelH / 2);
  ctx.textAlign = 'left';
}
