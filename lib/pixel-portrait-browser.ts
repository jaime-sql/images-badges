/**
 * Browser entry for the pixel-portrait pipeline.
 * Canvas scaling of the finished grid disables smoothing.
 */

import { detectFaceBox } from './face-detect';
import { renderPixelPortrait, type PortraitProcessMode } from './pixel-portrait';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la foto.'));
    image.src = url;
  });
}

export async function imageUrlToPngBlob(url: string, maxSide = 1024): Promise<Blob> {
  const image = await loadImage(url);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo preparar el PNG.');
  return blob;
}

export async function renderPortraitDataUrl(
  sourceUrl: string,
  mode: PortraitProcessMode
): Promise<string> {
  const image = await loadImage(sourceUrl);
  const maxSide = mode === 'ai' ? 1024 : 640;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas no disponible.');
  ctx.imageSmoothingEnabled = mode !== 'ai';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const source = ctx.getImageData(0, 0, width, height);
  const face = mode === 'fallback' ? await detectFaceBox(source) : null;
  const { output } = renderPixelPortrait(source, mode, face);

  const out = document.createElement('canvas');
  out.width = output.width;
  out.height = output.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Canvas no disponible.');
  outCtx.imageSmoothingEnabled = false;
  outCtx.putImageData(output, 0, 0);
  return out.toDataURL('image/png');
}
