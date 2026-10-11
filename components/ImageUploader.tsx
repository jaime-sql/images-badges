'use client';

/**
 * components/ImageUploader.tsx
 * Photo acquisition component supporting drag-and-drop, file dialog,
 * and webcam capture launching, plus in-browser background removal triggering.
 */

import React, { useRef, useState } from 'react';
import { Upload, Camera, Trash2, Wand2, Loader2, CheckCircle2 } from 'lucide-react';
import { SegmentationProgress } from '../lib/segmentation';

interface ImageUploaderProps {
  rawImage: string | null;
  segmentedImage: string | null;
  segmentationStatus: 'idle' | 'processing' | 'success' | 'error';
  segmentationError?: string | null;
  segmentationProgress: SegmentationProgress | null;
  onPhotoSelected: (dataUrl: string) => void;
  onUseOriginal: () => void;
  onReset: () => void;
  onOpenWebcam: () => void;
}

export default function ImageUploader({
  rawImage,
  segmentedImage,
  segmentationStatus,
  segmentationError,
  segmentationProgress,
  onPhotoSelected,
  onUseOriginal,
  onReset,
  onOpenWebcam,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!looksLikeImage) {
      alert('Please upload a valid image file (PNG, JPG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) onPhotoSelected(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const activeImage = segmentedImage || rawImage;
  const progressPct = segmentationProgress?.percentage ?? 0;

  return (
    <div className="flex flex-col gap-4 border border-zinc-800 bg-[#0d0f14] p-4">
      <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
        <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
          01 // PHOTO_ACQUISITION
        </span>
        {activeImage && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 font-mono text-[10px] text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" /> RESET
          </button>
        )}
      </div>

      {activeImage ? (
        <div className="flex flex-col gap-3">
          {/* Preview thumbnail */}
          <div className="relative aspect-square w-full max-w-[200px] mx-auto border border-zinc-700 bg-black/40 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage}
              alt="Participant source"
              className="h-full w-full object-cover"
            />
            {segmentationStatus === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                <span className="font-mono text-[10px] font-bold text-emerald-300">
                  REMOVING BACKGROUND {progressPct}%
                </span>
              </div>
            )}
            {segmentedImage && segmentationStatus === 'success' && (
              <span className="absolute top-1 right-1 bg-emerald-500/90 text-black px-1.5 py-0.5 font-mono text-[9px] font-bold">
                CUT OUT
              </span>
            )}
          </div>

          {/* Background removal runs on upload and webcam capture. */}
          <div className="flex flex-col gap-2">
            {segmentationStatus === 'processing' ? (
              <div className="flex items-center justify-center gap-2 border border-emerald-500/80 bg-emerald-950/40 py-2 px-3 font-mono text-xs font-semibold text-emerald-300">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>REMOVING BACKGROUND ({progressPct}%)...</span>
              </div>
            ) : segmentationStatus === 'success' && segmentedImage ? (
              <div className="flex items-center justify-between border border-zinc-800 bg-zinc-900/50 p-2 text-xs font-mono text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Background Removed
                </span>
                <button
                  onClick={onUseOriginal}
                  className="text-[11px] text-zinc-400 hover:text-white underline"
                >
                  Use Original
                </button>
              </div>
            ) : segmentationStatus === 'error' ? (
              <button
                onClick={() => rawImage && onPhotoSelected(rawImage)}
                className="flex items-center justify-center gap-2 border border-amber-500/80 bg-amber-950/30 py-2 px-3 font-mono text-xs font-semibold text-amber-200 hover:bg-amber-950/50 transition"
              >
                <Wand2 className="h-4 w-4" />
                RETRY BACKGROUND REMOVAL
              </button>
            ) : (
              <button
                onClick={() => rawImage && onPhotoSelected(rawImage)}
                className="flex items-center justify-center gap-2 border border-emerald-500/80 bg-emerald-950/40 py-2 px-3 font-mono text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition"
              >
                <Wand2 className="h-4 w-4 text-emerald-400" />
                REMOVE BACKGROUND (AI WASM)
              </button>
            )}

            {segmentationError && (
              <p className="font-mono text-[10px] text-amber-400">
                Notice: {segmentationError}. Using the original photo.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Upload & Webcam Area */
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed p-6 text-center cursor-pointer transition ${
              isDragging
                ? 'border-emerald-400 bg-emerald-950/20'
                : 'border-zinc-800 hover:border-zinc-700 bg-black/20'
            }`}
          >
            <Upload className="mb-2 h-6 w-6 text-zinc-400" />
            <p className="font-mono text-xs text-zinc-300">DRAG PHOTO HERE OR CLICK TO BROWSE</p>
            <span className="mt-1 font-mono text-[10px] text-zinc-500">PNG, JPG, WebP up to 10MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
          </div>

          <button
            onClick={onOpenWebcam}
            className="flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-900 py-2.5 px-4 font-mono text-xs font-semibold text-zinc-200 hover:border-emerald-500 hover:bg-zinc-800 transition"
          >
            <Camera className="h-4 w-4 text-emerald-400" />
            CAPTURE VIA WEBCAM
          </button>
        </div>
      )}
    </div>
  );
}
