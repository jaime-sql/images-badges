/**
 * Strip active content from an uploaded SVG before it is rasterized.
 * The markup is never inserted into the document.
 */

const PAIRED_DANGEROUS_TAG =
  /<\s*(script|foreignObject|iframe|embed|object|audio|video|link|meta|style|set|animate|handler)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const UNPAIRED_DANGEROUS_TAG =
  /<\s*(script|foreignObject|iframe|embed|object|audio|video|link|meta|style|set|animate|handler)\b[^>]*\/?\s*>/gi;

const EVENT_HANDLER_ATTR = /\s(?:on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const EXTERNAL_REF_ATTR =
  /(\s(?:xlink:href|href)\s*=\s*)(['"])(?!#)([\s\S]*?)\2/gi;

export function sanitizeSvgMarkup(svg: string): string {
  if (svg.length > 1024 * 1024) {
    throw new Error('El logo debe pesar 1 MB o menos.');
  }
  if (/<!ENTITY|<!DOCTYPE|javascript:|data:text\/html/i.test(svg)) {
    throw new Error('El SVG incluye contenido que no se puede usar como logo.');
  }

  let clean = svg.replace(/^\uFEFF/, '');
  clean = clean.replace(PAIRED_DANGEROUS_TAG, '');
  clean = clean.replace(UNPAIRED_DANGEROUS_TAG, '');
  clean = clean.replace(EVENT_HANDLER_ATTR, '');
  clean = clean.replace(EXTERNAL_REF_ATTR, (_match, prefix: string, quote: string) => {
    return `${prefix}${quote}#${quote}`;
  });
  clean = clean.replace(/url\(\s*(['"]?)https?:[\s\S]*?\1\s*\)/gi, 'none');
  clean = clean.replace(/url\(\s*(['"]?)javascript:[\s\S]*?\1\s*\)/gi, 'none');

  if (!/<\s*svg\b/i.test(clean)) {
    throw new Error('El archivo no es un SVG válido.');
  }
  return clean;
}
