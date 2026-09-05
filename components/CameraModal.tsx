'use client';

/**
 * components/CameraModal.tsx
 * Modal interface for webcam capture via getUserMedia.
 * Features live stream preview, permission error handling, and snapshot capture.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, AlertCircle, Sparkles } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [countdown, setCountdown] = useState<number | null>(null);

  const stopStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize camera stream
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }

    let isMounted = true;

    async function startCamera() {
      try {
        setErrorMsg(null);
        if (streamRef.current) {
          stopStream();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 720 },
            height: { ideal: 720 },
            aspectRatio: 1,
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setHasPermission(true);
      } catch (err) {
        if (!isMounted) return;
        console.error('Camera access error:', err);
        setHasPermission(false);
        setErrorMsg(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Please allow camera permissions in your browser.'
            : 'No available camera found or device is currently busy.'
        );
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [isOpen, facingMode, stopStream]);

  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight) || 640;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Center crop square
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;

    // Mirror if front camera
    if (facingMode === 'user') {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/png');

    stopStream();
    onCapture(dataUrl);
    onClose();
  };

  const startCountdown = () => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSnap();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg border-2 border-zinc-800 bg-[#0c0e14] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-400" />
            <h2 className="font-mono text-sm font-bold tracking-wider text-zinc-200">
              WEBCAM // CAPTURE_PORTRAIT
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video Preview Container */}
        <div className="relative mt-4 aspect-square w-full overflow-hidden border border-zinc-700 bg-black">
          {errorMsg ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
              <p className="font-mono text-xs text-red-300">{errorMsg}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />

              {/* CRT Scanline Overlay */}
              <div className="pointer-events-none absolute inset-0 scanlines opacity-50" />

              {/* Viewport Tech Brackets */}
              <div className="pointer-events-none absolute inset-4 border border-dashed border-emerald-500/40">
                <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-emerald-400" />
              </div>

              {/* Countdown overlay */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="font-mono text-7xl font-extrabold text-emerald-400 animate-pulse">
                    {countdown}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={toggleCamera}
            disabled={!hasPermission}
            className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            FLIP
          </button>

          <div className="flex gap-2">
            <button
              onClick={startCountdown}
              disabled={!hasPermission || countdown !== null}
              className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              3S TIMER
            </button>

            <button
              onClick={handleSnap}
              disabled={!hasPermission || countdown !== null}
              className="flex items-center gap-2 border border-emerald-500 bg-emerald-500 px-5 py-2 font-mono text-xs font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              SNAP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
