/**
 * Badge style selection.
 * Classic dither and the pixel-sprite card both leave the pixel-portrait preview.
 */

import type { BadgeStyle, PortraitStyle } from '../types/badge';

export function applyBadgeStyle<T extends { style: BadgeStyle; portraitStyle: PortraitStyle }>(
  state: T,
  style: BadgeStyle
): T {
  return { ...state, style, portraitStyle: 'dither' };
}
