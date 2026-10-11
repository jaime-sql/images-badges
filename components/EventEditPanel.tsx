'use client';

/**
 * Event card fields. Each value can be restored on its own.
 * Logos are rasterized; SVG markup is never placed in the page.
 */

import React, { useState } from 'react';
import { RotateCcw, ImagePlus } from 'lucide-react';
import { DEFAULT_EVENT_CARD, EventCardConfig } from '../types/badge';
import { rasterizeLogoFile } from '../lib/logo-raster';

interface EventEditPanelProps {
  eventCard: EventCardConfig;
  onChange: (updated: Partial<EventCardConfig>) => void;
}

const FIELDS: { key: keyof Omit<EventCardConfig, 'logoDataUrl'>; label: string }[] = [
  { key: 'title', label: 'Título' },
  { key: 'subtitle', label: 'Subtítulo' },
  { key: 'role', label: 'Rol' },
  { key: 'footer', label: 'Pie' },
  { key: 'number', label: 'Número' },
];

export default function EventEditPanel({ eventCard, onChange }: EventEditPanelProps) {
  const [logoError, setLogoError] = useState<string | null>(null);

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    try {
      const dataUrl = await rasterizeLogoFile(file);
      onChange({ logoDataUrl: dataUrl });
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'No se pudo usar el logo.');
    }
  };

  return (
    <div className="border border-zinc-800 bg-[#0d0f14] p-5 flex flex-col gap-4">
      <div className="border-b border-zinc-800 pb-2">
        <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
          EVENT CARD
        </span>
      </div>

      {FIELDS.map((field) => (
        <div key={field.key}>
          <div className="flex items-center justify-between mb-1">
            <label className="font-mono text-[11px] text-zinc-400">{field.label}</label>
            <button
              type="button"
              onClick={() => onChange({ [field.key]: DEFAULT_EVENT_CARD[field.key] })}
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Restaurar
            </button>
          </div>
          <input
            type="text"
            value={eventCard[field.key]}
            onChange={(event) => onChange({ [field.key]: event.target.value })}
            className="w-full border border-zinc-800 bg-black px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      ))}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="font-mono text-[11px] text-zinc-400">Logo</label>
          <button
            type="button"
            onClick={() => {
              setLogoError(null);
              onChange({ logoDataUrl: null });
            }}
            className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar
          </button>
        </div>
        <label className="flex items-center justify-center gap-2 border border-dashed border-zinc-700 bg-black/40 px-3 py-3 font-mono text-[11px] text-zinc-300 cursor-pointer hover:border-zinc-500">
          <ImagePlus className="h-4 w-4 text-emerald-400" />
          PNG, JPG o SVG · máx. 1 MB
          <input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg,.svg,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              void onLogo(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        {eventCard.logoDataUrl && (
          <div className="mt-2 flex items-center gap-3">
            {/* Rasterized bitmap only. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={eventCard.logoDataUrl}
              alt="Logo del evento"
              className="h-12 w-12 object-contain bg-zinc-900 border border-zinc-800"
            />
            <span className="font-mono text-[10px] text-zinc-500">Listo para la tarjeta</span>
          </div>
        )}
        {logoError && <p className="mt-2 font-mono text-[10px] text-amber-400">{logoError}</p>}
      </div>
    </div>
  );
}
