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
 * Remove image background in-browser using WebAssembly and deep learning models.
 * 
 * @param imageSource File, Blob, or image URL string
 * @param onProgress Optional callback to report download and inference progress
 * @returns Promise resolving to a Blob Object URL with background removed
 */
let xnnpackFilterDepth = 0;
let savedConsoleError: typeof console.error | null = null;

function pushXnnpackFilter(): void {
  if (xnnpackFilterDepth === 0) {
    savedConsoleError = console.error;
    const original = savedConsoleError;
    console.error = (...args: unknown[]) => {
      const text = args.map((item) => String(item)).join(' ');
      if (text.includes('XNNPACK')) return;
      original.apply(console, args);
    };
  }
  xnnpackFilterDepth += 1;
}

function popXnnpackFilter(): void {
  xnnpackFilterDepth = Math.max(0, xnnpackFilterDepth - 1);
  if (xnnpackFilterDepth === 0 && savedConsoleError) {
    console.error = savedConsoleError;
    savedConsoleError = null;
  }
}

export async function removeImageBackground(
  imageSource: Blob | File | string,
  onProgress?: (progress: SegmentationProgress) => void
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Background removal is only available client-side in the browser');
  }

  const previousError = console.error;
  pushXnnpackFilter();

  try {
    // Dynamic import to avoid any SSR evaluation
    const { removeBackground } = await import('@imgly/background-removal');

    const blob = await removeBackground(imageSource, {
      progress: (key: string, current: number, total: number) => {
        if (onProgress) {
          const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
          onProgress({ key, current, total, percentage });
        }
      },
      model: 'isnet_quint8', // Use quantized model for fast client-side inference
    });

    return URL.createObjectURL(blob);
  } catch (error) {
    previousError.call(console, 'Failed to segment background:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Background segmentation failed. Please check browser WebAssembly support.'
    );
  } finally {
    popXnnpackFilter();
  }
}
