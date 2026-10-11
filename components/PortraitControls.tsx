'use client';

/**
 * Pixel portrait actions.
 * AI is the main path when a Worker URL is set. The browser fallback covers
 * a missing URL, a failed call, or an explicit "sin IA" choice.
 */

import React, { useState } from 'react';
import {
  FALLBACK_BUTTON_LABEL,
  GENERATING_LABEL,
  siteLimitMessage,
  visitorLimitMessage,
} from '../lib/portrait-messages';
import { imageUrlToPngBlob, renderPortraitDataUrl } from '../lib/pixel-portrait-browser';
import { requestAiPortrait } from '../lib/portrait-client';
import type { PixelPortraitSource } from '../types/badge';

interface PortraitControlsProps {
  imageUrl: string | null;
  apiUrl: string;
  onResult: (result: { url: string; source: PixelPortraitSource; mock: boolean }) => void;
}

type LimitKind = 'visitor_limit' | 'site_limit';

interface PortraitError {
  kind: LimitKind | 'other';
  es: string;
  en: string;
}

export default function PortraitControls({ imageUrl, apiUrl, onResult }: PortraitControlsProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<PortraitError | null>(null);

  const runFallback = async () => {
    if (!imageUrl) return;
    setGenerating(true);
    setError(null);
    try {
      const url = await renderPortraitDataUrl(imageUrl, 'fallback');
      onResult({ url, source: 'fallback', mock: false });
    } catch (err) {
      setError({
        kind: 'other',
        es: err instanceof Error ? err.message : 'No se pudo crear la versión sin IA.',
        en: 'The version without AI could not be created.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const runAi = async () => {
    if (!imageUrl || generating) return;
    if (!apiUrl) {
      await runFallback();
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const blob = await imageUrlToPngBlob(imageUrl);
      const result = await requestAiPortrait(apiUrl, blob);
      if (!result.ok) {
        if (result.error === 'visitor_limit' || result.error === 'site_limit') {
          const fallbackCopy =
            result.error === 'visitor_limit'
              ? visitorLimitMessage(result.limit ?? 5)
              : siteLimitMessage();
          setError({
            kind: result.error,
            es: result.messageEs || fallbackCopy.es,
            en: result.messageEn || fallbackCopy.en,
          });
          setGenerating(false);
          return;
        }
        setGenerating(false);
        await runFallback();
        return;
      }

      const objectUrl = URL.createObjectURL(result.blob);
      try {
        const url = await renderPortraitDataUrl(objectUrl, 'ai');
        onResult({ url, source: 'ai', mock: result.mock });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setGenerating(false);
      await runFallback();
      return;
    }
    setGenerating(false);
  };

  const showLimit = error?.kind === 'visitor_limit' || error?.kind === 'site_limit';

  return (
    <div className="border border-zinc-800 bg-[#0d0f14] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
          PIXEL PORTRAIT
        </span>
        {!apiUrl && (
          <span className="font-mono text-[10px] text-zinc-500">SIN SERVICIO · VERSIÓN LOCAL</span>
        )}
      </div>

      <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
        Retrato en pixel art a mano: contorno limpio, cel shading y la misma persona, sobre el recorte
        sin fondo. Si el servicio no responde, se usa la versión sin IA.
      </p>
      {!imageUrl && (
        <p className="font-mono text-[10px] text-amber-300/90">
          Espera el recorte sin fondo. El retrato no usa la foto con el cuarto detrás.
        </p>
      )}

      <button
        type="button"
        onClick={() => void runAi()}
        disabled={!imageUrl || generating}
        className="flex items-center justify-center gap-2 border border-emerald-400 bg-emerald-400 px-4 py-2 font-mono text-xs font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? (
          <>
            <span className="pixel-spinner" aria-hidden="true" />
            {GENERATING_LABEL}
          </>
        ) : (
          'Crear retrato con IA'
        )}
      </button>

      {!generating && (
        <button
          type="button"
          onClick={() => void runFallback()}
          disabled={!imageUrl}
          className="border border-zinc-700 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-200 disabled:opacity-50"
        >
          {FALLBACK_BUTTON_LABEL}
        </button>
      )}

      {error && (
        <div className="border border-amber-500/40 bg-amber-950/20 p-3 flex flex-col gap-2">
          <p className="font-mono text-xs text-amber-200">{error.es}</p>
          <p className="font-mono text-[10px] text-zinc-400" lang="en">
            {error.en}
          </p>
          {showLimit && (
            <button
              type="button"
              onClick={() => void runFallback()}
              disabled={generating || !imageUrl}
              className="border border-amber-400/80 bg-black px-3 py-2 font-mono text-xs text-amber-100 disabled:opacity-50"
            >
              {FALLBACK_BUTTON_LABEL}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
