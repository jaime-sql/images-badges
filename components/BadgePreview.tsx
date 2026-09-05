'use client';

/**
 * components/BadgePreview.tsx
 * Live canvas display and PNG download action with confetti reward.
 * Strictly preserves pixel-art scaling (ctx.imageSmoothingEnabled = false).
 */

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { Download, Eye, Sparkles, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BadgeState } from '../types/badge';
import { composeBadge } from '../lib/badge-composer';

interface BadgePreviewProps {
  badgeState: BadgeState;
}

export default function BadgePreview({ badgeState }: BadgePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showScanlines, setShowScanlines] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isRendering, startRenderTransition] = useTransition();

  // Re-render canvas whenever badgeState changes
  useEffect(() => {
    let isCancelled = false;

    startRenderTransition(async () => {
      try {
        const renderedCanvas = await composeBadge(badgeState);
        if (isCancelled || !canvasRef.current) return;

        const targetCanvas = canvasRef.current;
        targetCanvas.width = renderedCanvas.width;
        targetCanvas.height = renderedCanvas.height;

        const ctx = targetCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(renderedCanvas, 0, 0);
        }
      } catch (err) {
        console.error('Error rendering live badge preview:', err);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [badgeState]);

  // Export high-res PNG
  const handleDownload = () => {
    if (!canvasRef.current) return;

    // Trigger celebration confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#00ff66', '#ffffff', '#22c55e', '#38bdf8'],
    });

    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (badgeState.participant.name || 'badge').toLowerCase().replace(/\s+/g, '-');
      a.download = `badge-${badgeState.participant.ticketNumber || '001'}-${safeName}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // Copy PNG to Clipboard
  const handleCopyClipboard = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }, 'image/png');
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Visual Canvas Container */}
      <div className="relative border-4 border-zinc-800 bg-black shadow-2xl p-2 max-w-full">
        <canvas
          ref={canvasRef}
          className="pixelated block h-auto w-full max-w-[340px] md:max-w-[420px] lg:max-w-[460px] border border-zinc-900 shadow-inner"
        />

        {/* Scanlines Effect */}
        {showScanlines && (
          <div className="pointer-events-none absolute inset-2 scanlines opacity-40 mix-blend-screen" />
        )}

        {isRendering && (
          <div className="absolute top-4 right-4 bg-black/80 px-2 py-1 font-mono text-[10px] text-emerald-400 border border-emerald-500/40">
            RENDER_SYNC...
          </div>
        )}
      </div>

      {/* Control Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs w-full max-w-[460px]">
        <button
          onClick={() => setShowScanlines(!showScanlines)}
          className={`flex items-center gap-1.5 border px-3 py-2 transition ${
            showScanlines
              ? 'border-emerald-500/60 bg-emerald-950/20 text-emerald-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          SCANLINES: {showScanlines ? 'ON' : 'OFF'}
        </button>

        <button
          onClick={handleCopyClipboard}
          className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 transition"
        >
          {isCopied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              COPIED!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              COPY IMAGE
            </>
          )}
        </button>

        <button
          onClick={handleDownload}
          className="flex flex-1 items-center justify-center gap-2 border border-emerald-400 bg-emerald-400 px-4 py-2 font-bold text-black hover:bg-emerald-300 transition shadow-[0_0_15px_rgba(0,255,102,0.3)]"
        >
          <Download className="h-4 w-4" />
          <Sparkles className="h-3.5 w-3.5" />
          DOWNLOAD BADGE (PNG)
        </button>
      </div>

      <span className="font-mono text-[10px] text-zinc-500 text-center">
        640x960 HIGH-RES PNG // 4-LEVEL DITHERED // 100% CLIENT-SIDE
      </span>
    </div>
  );
}
