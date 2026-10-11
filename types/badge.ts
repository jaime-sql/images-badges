/**
 * types/badge.ts
 * Core type definitions for participant data, dither configurations,
 * and badge styling for the Hackathon Pixel Badge Generator.
 */

export type DitherAlgorithm = 
  | 'floyd-steinberg' 
  | 'atkinson' 
  | 'bayer' 
  | 'bayer8'
  | 'stucki'
  | 'threshold';

export interface DitherPaletteColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Grayscale or custom color palette configuration.
 * Default is a 4-level retro grayscale palette.
 */
export interface DitherPalette {
  name: string;
  colors: DitherPaletteColor[];
}

/**
 * Image processing & dithering tuning parameters
 */
export interface DitherConfig {
  /** Target resolution (width/height of pixelated portrait, e.g., 96, 128, 180, 240, 360) */
  resolution: number;
  /** Number of quantization levels (default 4 for 4-level grayscale) */
  levels: number;
  /** Dithering algorithm to employ */
  algorithm: DitherAlgorithm;
  /** Contrast adjustment multiplier (-1.0 to 1.0, 0 is neutral) */
  contrast: number;
  /** Brightness adjustment offset (-1.0 to 1.0, 0 is neutral) */
  brightness: number;
  /** Strength of error diffusion (0.0 to 1.0, default 0.88) */
  diffusionStrength: number;
  /** Invert luminance levels */
  invert: boolean;
  /** Smart facial dynamic range expansion & auto-exposure (default true) */
  autoEnhance?: boolean;
  /** Midtone gamma lift for underexposed webcams (0.4 to 1.8, default 1.0) */
  gamma?: number;
  /** Pre-dither edge sharpness for glasses and eyes (0.0 to 1.0, default 0.4) */
  sharpness?: number;
  /** Serpentine error diffusion to eliminate directional artifacts (default true) */
  serpentine?: boolean;
  /** Custom 4-level color palette */
  customPalette?: DitherPaletteColor[];
}

/**
 * Participant metadata displayed on the retro brutalist badge
 */
export interface ParticipantDetails {
  name: string;
  handle: string;
  role: string;
  track: string;
  /** Editable label on the pixel-sprite type chip. */
  spriteType: string;
  ticketNumber: string;
  qrPayload: string;
  eventTitle: string;
  eventDate: string;
  location: string;
}

/**
 * Badge visual theme options
 */
export type BadgeTheme = 'dark-brutalist' | 'matrix-green' | 'amber-crt' | 'paper-light';

/** Classic 4-level dither badge, or the Game Boy pixel-sprite card. */
export type BadgeStyle = 'classic' | 'pixel-sprite';

/** Classic error-diffusion dither, or the illustrated pixel-portrait style. */
export type PortraitStyle = 'dither' | 'pixel-portrait';

export type PixelPortraitSource = 'ai' | 'fallback';

/**
 * Configurable event card. Defaults are generic and carry no third-party marks.
 * The logo slot starts empty; organizers upload their own artwork.
 */
export interface EventCardConfig {
  title: string;
  subtitle: string;
  role: string;
  footer: string;
  number: string;
  /** Rasterized logo (PNG data URL). Never raw SVG markup. */
  logoDataUrl: string | null;
}

export const DEFAULT_EVENT_CARD: EventCardConfig = {
  title: 'MY EVENT 2026',
  subtitle: 'Builder Badge',
  role: 'Builder',
  footer: '',
  number: '#0001',
  logoDataUrl: null,
};

export interface BadgeThemeConfig {
  id: BadgeTheme;
  name: string;
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  border: string;
  palette: DitherPaletteColor[];
}

/**
 * Complete badge state holding participant info, image sources, and rendering configurations
 */
export interface BadgeState {
  participant: ParticipantDetails;
  dither: DitherConfig;
  theme: BadgeTheme;
  style: BadgeStyle;
  /** Raw image file or data URL (before background removal) */
  rawImage: string | null;
  /** Image after background removal mask applied */
  segmentedImage: string | null;
  /** Current segmentation processing state */
  segmentationStatus: 'idle' | 'processing' | 'success' | 'error';
  segmentationError?: string | null;
  /** Dither keeps the classic card. Pixel portrait uses the event card. */
  portraitStyle: PortraitStyle;
  eventCard: EventCardConfig;
  /** 512px nearest-neighbor portrait, ready to draw. */
  pixelPortraitUrl: string | null;
  pixelPortraitSource: PixelPortraitSource | null;
  /** True when the Worker answered with the mock header. */
  pixelPortraitMock: boolean;
}
