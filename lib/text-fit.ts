/**
 * Text fitting for the event card.
 * Press Start 2P's latin subset has no accented capitals, so those glyphs are
 * folded to their base letters before the pixel font draws them.
 * Long lines shrink to 70% and, if they still overflow, end with an ellipsis.
 */

export function toPixelFontCaps(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'SS')
    .toUpperCase();
}

export function fitCanvasText(
  text: string,
  maxWidth: number,
  measure: (value: string, scale: number) => number
): { text: string; scale: number } {
  const trimmed = text.trim();
  if (!trimmed) return { text: '', scale: 1 };

  if (measure(trimmed, 1) <= maxWidth) {
    return { text: trimmed, scale: 1 };
  }
  if (measure(trimmed, 0.7) <= maxWidth) {
    return { text: trimmed, scale: 0.7 };
  }

  const ellipsis = '…';
  let best = ellipsis;
  let low = 0;
  let high = trimmed.length;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${trimmed.slice(0, mid).trimEnd()}${ellipsis}`;
    if (measure(candidate, 0.7) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { text: best, scale: 0.7 };
}
