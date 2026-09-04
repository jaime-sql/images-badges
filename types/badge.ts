/**
 * types/badge.ts
 * Core type definitions for participant data, dither configurations,
 * and badge styling for the Hackathon Pixel Badge Generator.
 */

export type DitherAlgorithm = 'floyd-steinberg' | 'atkinson' | 'bayer' | 'threshold';

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
  /** Target resolution (width/height of pixelated portrait, e.g., 96, 128, 160) */
  resolution: number;
  /** Number of quantization levels (default 4 for 4-level grayscale) */
  levels: number;
  /** Dithering algorithm to employ */
  algorithm: DitherAlgorithm;
  /** Contrast adjustment multiplier (-1.0 to 1.0, 0 is neutral) */
  contrast: number;
  /** Brightness adjustment offset (-1.0 to 1.0, 0 is neutral) */
  brightness: number;
  /** Strength of error diffusion (0.0 to 1.0, default 1.0) */
  diffusionStrength: number;
  /** Invert luminance levels */
  invert: boolean;
  /** Custom 4-level color palette (black -> dark gray -> light gray -> white or custom theme) */
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
  /** Raw image file or data URL (before background removal) */
  rawImage: string | null;
  /** Image after background removal mask applied */
  segmentedImage: string | null;
  /** Current segmentation processing state */
  segmentationStatus: 'idle' | 'processing' | 'success' | 'error';
  segmentationError?: string | null;
}
