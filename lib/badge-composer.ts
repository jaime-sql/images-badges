/**
 * lib/badge-composer.ts
 * High-resolution canvas compositing engine for the Hackathon Pixel Badge.
 * Pure functional renderer decoupled from React components.
 * 
 * Features:
 * - 640x960 retro-digital brutalist dark badge
 * - Razor-sharp pixel art portrait scaling (imageSmoothingEnabled = false)
 * - Dynamic QR Code rendering
 * - Barcode generation
 * - Geometric cyber-brutalist typography, grid lines, and status telemetry
 */

import QRCode from 'qrcode';
import { BadgeState, BadgeThemeConfig } from '../types/badge';
import { FOUR_LEVEL_GRAYSCALE, processImageToDitheredCanvas } from './dither';

export const BADGE_WIDTH = 640;
export const BADGE_HEIGHT = 960;

export const BADGE_THEMES: Record<string, BadgeThemeConfig> = {
  'dark-brutalist': {
    id: 'dark-brutalist',
    name: 'Dark Brutalist',
    background: '#090a0f',
    foreground: '#f1f5f9',
    accent: '#00ff66',
    muted: '#64748b',
    border: '#27272a',
    palette: FOUR_LEVEL_GRAYSCALE,
  },
  'matrix-green': {
    id: 'matrix-green',
    name: 'Matrix Terminal',
    background: '#040d06',
    foreground: '#86efac',
    accent: '#22c55e',
    muted: '#166534',
    border: '#14532d',
    palette: [
      { r: 4, g: 13, b: 6, a: 255 },
      { r: 22, g: 101, b: 52, a: 255 },
      { r: 34, g: 197, b: 94, a: 255 },
      { r: 134, g: 239, b: 172, a: 255 },
    ],
  },
  'amber-crt': {
    id: 'amber-crt',
    name: 'Amber CRT',
    background: '#120a02',
    foreground: '#fef3c7',
    accent: '#f59e0b',
    muted: '#92400e',
    border: '#78350f',
    palette: [
      { r: 18, g: 10, b: 2, a: 255 },
      { r: 120, g: 53, b: 15, a: 255 },
      { r: 245, g: 158, b: 11, a: 255 },
      { r: 254, g: 243, b: 199, a: 255 },
    ],
  },
  'paper-light': {
    id: 'paper-light',
    name: 'Brutalist Blueprint',
    background: '#021526',
    foreground: '#e2e8f0',
    accent: '#38bdf8',
    muted: '#475569',
    border: '#1e3a8a',
    palette: [
      { r: 2, g: 21, b: 38, a: 255 },
      { r: 30, g: 58, b: 138, a: 255 },
      { r: 56, g: 189, b: 248, a: 255 },
      { r: 226, g: 232, b: 240, a: 255 },
    ],
  },
};

/**
 * Draw a decorative lanyard punch hole at the top of the badge
 */
function drawLanyardSlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 2;
  
  const r = h / 2;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.arc(x + w - r, y + r, r, (Math.PI * 3) / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw simulated barcode
 */
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: string): void {
  ctx.save();
  ctx.fillStyle = '#f1f5f9';
  let curX = x;
  let sIdx = 0;
  
  while (curX < x + w) {
    const charCode = seed.charCodeAt(sIdx % seed.length) || 42;
    const barW = ((charCode % 3) + 1) * 2;
    const spaceW = (((charCode * 3) % 3) + 1) * 2;
    
    if (curX + barW <= x + w) {
      ctx.fillRect(curX, y, barW, h);
    }
    curX += barW + spaceW;
    sIdx++;
  }
  ctx.restore();
}

/**
 * Draw crosshair corner marks
 */
function drawCornerBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len = 12): void {
  ctx.save();
  ctx.strokeStyle = '#00ff66';
  ctx.lineWidth = 2;
  
  // Top-left
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(x, y + h - len);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + len, y + h);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w - len, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - len);
  ctx.stroke();

  ctx.restore();
}

/**
 * Pure composite function rendering entire badge onto target canvas
 */
export async function renderBadgeToCanvas(
  canvas: HTMLCanvasElement,
  state: BadgeState,
  ditheredPortrait: HTMLCanvasElement | null
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for badge rendering');

  const theme = BADGE_THEMES[state.theme] || BADGE_THEMES['dark-brutalist'];
  const { participant, dither } = state;

  canvas.width = BADGE_WIDTH;
  canvas.height = BADGE_HEIGHT;

  // 1. Background Fill
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT);

  // 2. Subtle Tech Grid Pattern
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridSize = 20;
  for (let x = 0; x < BADGE_WIDTH; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BADGE_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < BADGE_HEIGHT; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BADGE_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Outer Brutalist Border
  ctx.save();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, BADGE_WIDTH - 32, BADGE_HEIGHT - 32);

  // Double inner corner accents
  ctx.fillStyle = theme.accent;
  ctx.fillRect(16, 16, 10, 10);
  ctx.fillRect(BADGE_WIDTH - 26, 16, 10, 10);
  ctx.fillRect(16, BADGE_HEIGHT - 26, 10, 10);
  ctx.fillRect(BADGE_WIDTH - 26, BADGE_HEIGHT - 26, 10, 10);
  ctx.restore();

  // 4. Lanyard Cutout Slot
  drawLanyardSlot(ctx, (BADGE_WIDTH - 120) / 2, 28, 120, 18);

  // 5. Header: Event Title & Track Badge
  ctx.save();
  ctx.fillStyle = theme.accent;
  ctx.font = '700 14px var(--font-silkscreen), "Press Start 2P", monospace';
  ctx.fillText(participant.eventTitle.toUpperCase(), 40, 80);

  // Event Date & Location subline
  ctx.fillStyle = theme.muted;
  ctx.font = '11px "Geist Mono", monospace';
  ctx.fillText(`${participant.eventDate} // ${participant.location}`, 40, 100);

  // Role pill banner
  const roleText = `[ ${participant.role.toUpperCase()} ]`;
  ctx.font = '700 14px "Geist Mono", monospace';
  const roleMetrics = ctx.measureText(roleText);
  const roleBoxW = roleMetrics.width + 24;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(BADGE_WIDTH - 40 - roleBoxW, 70, roleBoxW, 30);
  ctx.fillStyle = '#000000';
  ctx.fillText(roleText, BADGE_WIDTH - 40 - roleBoxW + 12, 90);
  ctx.restore();

  // Header Divider Rule
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 120);
  ctx.lineTo(BADGE_WIDTH - 40, 120);
  ctx.stroke();

  // 6. Portrait Display Viewport (360x360 px)
  const portraitSize = 360;
  const portraitX = (BADGE_WIDTH - portraitSize) / 2;
  const portraitY = 145;

  // Viewport Frame background
  ctx.save();
  ctx.fillStyle = '#06070a';
  ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(portraitX, portraitY, portraitSize, portraitSize);

  // Draw Corner Crosshair Brackets
  drawCornerBrackets(ctx, portraitX, portraitY, portraitSize, portraitSize, 16);

  // Render Dithered Portrait Pixel-Perfect!
  if (ditheredPortrait) {
    // CRITICAL: Disable antialiasing so scaled pixels remain razor-sharp retro blocks
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ditheredPortrait, portraitX, portraitY, portraitSize, portraitSize);
  } else {
    // Placeholder retro silhouette
    ctx.fillStyle = theme.muted;
    ctx.font = '14px "Geist Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO PORTRAIT ACQUIRED', BADGE_WIDTH / 2, portraitY + portraitSize / 2 - 10);
    ctx.font = '11px "Geist Mono", monospace';
    ctx.fillText('UPLOAD FILE OR WEBCAM', BADGE_WIDTH / 2, portraitY + portraitSize / 2 + 15);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Portrait Metadata Tag
  ctx.save();
  ctx.fillStyle = theme.muted;
  ctx.font = '10px "Geist Mono", monospace';
  const algoTag = `RES: ${dither.resolution}x${dither.resolution} // ALGO: ${dither.algorithm.toUpperCase()} // 4-LVL`;
  ctx.fillText(algoTag, portraitX, portraitY + portraitSize + 20);
  ctx.restore();

  // 7. Participant Primary Details
  const detailsY = portraitY + portraitSize + 48;

  // Name
  ctx.save();
  ctx.fillStyle = theme.foreground;
  ctx.font = '900 32px "Geist Mono", sans-serif';
  const nameDisplay = participant.name || 'HACKER_NAME';
  ctx.fillText(nameDisplay.toUpperCase(), 40, detailsY);

  // Handle & Track
  ctx.fillStyle = theme.accent;
  ctx.font = '600 16px "Geist Mono", monospace';
  ctx.fillText(participant.handle || '@builder', 40, detailsY + 28);

  ctx.fillStyle = theme.muted;
  ctx.font = '13px "Geist Mono", monospace';
  ctx.fillText(`TRACK: ${participant.track.toUpperCase()}`, 40, detailsY + 52);
  ctx.restore();

  // Mid Divider
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, detailsY + 70);
  ctx.lineTo(BADGE_WIDTH - 40, detailsY + 70);
  ctx.stroke();

  // 8. Footer Section: QR Code, Ticket ID, and Barcode
  const footerY = detailsY + 90;
  const qrSize = 130;
  const qrX = BADGE_WIDTH - 40 - qrSize;

  // Render QR code to an offscreen image and draw
  try {
    const qrDataUrl = await QRCode.toDataURL(participant.qrPayload || `ID:${participant.ticketNumber}`, {
      width: qrSize,
      margin: 1,
      color: {
        dark: theme.foreground,
        light: '#00000000', // transparent background
      },
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = reject;
    });

    // Draw QR code with crisp edges
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImg, qrX, footerY, qrSize, qrSize);
  } catch (err) {
    console.error('Failed to render QR Code:', err);
  }

  // Left Footer: Ticket number, Clearance, and Barcode
  ctx.save();
  ctx.fillStyle = theme.muted;
  ctx.font = '11px "Geist Mono", monospace';
  ctx.fillText('IDENTIFIER', 40, footerY + 14);

  ctx.fillStyle = theme.foreground;
  ctx.font = '900 28px var(--font-silkscreen), "Press Start 2P", monospace';
  ctx.fillText(participant.ticketNumber || '#0001', 40, footerY + 48);

  ctx.fillStyle = theme.muted;
  ctx.font = '10px "Geist Mono", monospace';
  ctx.fillText('AUTH: VERIFIED // CLEARANCE: BUILDER_PASS', 40, footerY + 74);

  // Barcode
  drawBarcode(ctx, 40, footerY + 86, 280, 24, participant.ticketNumber + participant.handle);
  ctx.restore();

  // 9. Bottom Telemetry Bar
  ctx.save();
  ctx.fillStyle = theme.muted;
  ctx.font = '9px "Geist Mono", monospace';
  ctx.fillText('NEXTCRAFT GRAPHICS ENGINE // CLIENT-SIDE DITHERING ACTIVE', 40, BADGE_HEIGHT - 32);
  ctx.textAlign = 'right';
  ctx.fillText('STATUS: ONLINE 🟢', BADGE_WIDTH - 40, BADGE_HEIGHT - 32);
  ctx.restore();
}

/**
 * Full pipeline orchestrator: creates a badge canvas from state and raw/segmented image
 */
export async function composeBadge(state: BadgeState): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_WIDTH;
  canvas.height = BADGE_HEIGHT;

  let ditheredPortraitCanvas: HTMLCanvasElement | null = null;
  const imageSourceUrl = state.segmentedImage || state.rawImage;

  if (imageSourceUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSourceUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });

    const theme = BADGE_THEMES[state.theme] || BADGE_THEMES['dark-brutalist'];
    ditheredPortraitCanvas = processImageToDitheredCanvas(img, {
      ...state.dither,
      customPalette: theme.palette,
    });
  }

  await renderBadgeToCanvas(canvas, state, ditheredPortraitCanvas);
  return canvas;
}
