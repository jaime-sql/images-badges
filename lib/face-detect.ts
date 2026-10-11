/**
 * Lazy face box for the portrait crop.
 * The model file is local. The wasm runtime is loaded on first use.
 * A failure leaves framing on the mask fallback.
 */

import type { FaceDetector } from '@mediapipe/tasks-vision';
import type { FaceBox } from './pixel-portrait';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';

let loading: Promise<FaceDetector | null> | null = null;

function modelUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}/models/blaze_face_full_range.tflite`;
}

async function loadDetector(): Promise<FaceDetector | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const wasm = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        return await vision.FaceDetector.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: modelUrl() },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        });
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

/** Highest-scoring face, with the eye line taken from the two eye keypoints. */
export async function detectFaceBox(source: ImageData): Promise<FaceBox | null> {
  const detector = await loadDetector();
  if (!detector || typeof document === 'undefined') return null;
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = source.width;
  sourceCanvas.height = source.height;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return null;
  sourceCtx.putImageData(source, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  let detections: ReturnType<FaceDetector['detect']>['detections'];
  try {
    detections = detector.detect(canvas).detections;
  } catch {
    return null;
  }
  if (!detections.length) return null;
  const best = detections.reduce((winner, item) => {
    const area = (item.boundingBox?.width ?? 0) * (item.boundingBox?.height ?? 0);
    const winnerArea = (winner.boundingBox?.width ?? 0) * (winner.boundingBox?.height ?? 0);
    return area > winnerArea ? item : winner;
  });
  const box = best.boundingBox;
  if (!box || box.width < 8 || box.height < 8) return null;
  const eyes = (best.keypoints ?? []).slice(0, 2).filter((point) => point.x > 0 && point.y > 0);
  const eyeX = eyes.length
    ? (eyes.reduce((sum, point) => sum + point.x, 0) / eyes.length) * width
    : box.originX + box.width / 2;
  const eyeY = eyes.length
    ? (eyes.reduce((sum, point) => sum + point.y, 0) / eyes.length) * height
    : box.originY + box.height * 0.38;
  return {
    x: box.originX / scale,
    y: box.originY / scale,
    width: box.width / scale,
    height: box.height / scale,
    eyeX: eyeX / scale,
    eyeY: eyeY / scale,
  };
}
