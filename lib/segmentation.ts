/**
 * lib/segmentation.ts
 * Client-side background removal wrapper using @imgly/background-removal.
 * Strictly runs in the browser using WASM/ONNX.
 */

export interface SegmentationProgress {
  key: string;
  current: number;
  total: number;
  percentage: number;
}

/**
 * The onnxruntime wasm worker reads this level inside _OrtInit, including
 * threads the page console cannot filter. @imgly only overwrites it when
 * debug is on, which this call leaves off.
 */
async function quietOnnxRuntime(): Promise<void> {
  const ort = await import('onnxruntime-web');
  ort.env.logLevel = 'error';
}

/**
 * Remove image background in-browser using WebAssembly and deep learning models.
 *
 * @param imageSource File, Blob, or image URL string
 * @param onProgress Optional callback to report download and inference progress
 * @returns Promise resolving to a Blob Object URL with background removed
 */
export async function removeImageBackground(
  imageSource: Blob | File | string,
  onProgress?: (progress: SegmentationProgress) => void
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Background removal is only available client-side in the browser');
  }

  try {
    await quietOnnxRuntime();
    const { removeBackground } = await import('@imgly/background-removal');

    const blob = await removeBackground(imageSource, {
      progress: (key: string, current: number, total: number) => {
        if (onProgress) {
          const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
          onProgress({ key, current, total, percentage });
        }
      },
      model: 'isnet_quint8',
    });

    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Failed to segment background:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Background segmentation failed. Please check browser WebAssembly support.'
    );
  }
}
