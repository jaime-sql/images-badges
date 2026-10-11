/**
 * Logo upload. PNG, JPG, and SVG up to 1 MB.
 * SVG is sanitized and drawn to a canvas. The page only keeps the PNG result.
 */

import { sanitizeSvgMarkup } from './svg-sanitize';

const MAX_LOGO_BYTES = 1024 * 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer el logo.'));
    image.src = url;
  });
}

export async function rasterizeLogoFile(file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('El logo debe pesar 1 MB o menos.');
  }

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const isSvg = type === 'image/svg+xml' || name.endsWith('.svg');
  const isPng = type === 'image/png' || name.endsWith('.png');
  const isJpg = type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg');
  if (!isSvg && !isPng && !isJpg) {
    throw new Error('Sube un logo PNG, JPG o SVG.');
  }

  let src: string;
  if (isSvg) {
    const clean = sanitizeSvgMarkup(await file.text());
    src = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
  } else {
    src = URL.createObjectURL(file);
  }

  try {
    const image = await loadImage(src);
    const max = 256;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(src);
  }
}
