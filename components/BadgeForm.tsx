'use client';

/**
 * components/BadgeForm.tsx
 * Streamlined participant input form: simple name input on the primary view,
 * with an "at a glance" menu button to customize all other metadata & graphics.
 */

import React from 'react';
import { ParticipantDetails, DitherConfig, BadgeTheme } from '../types/badge';
import { User, Sliders, Settings2 } from 'lucide-react';

interface BadgeFormProps {
  participant: ParticipantDetails;
  dither: DitherConfig;
  theme: BadgeTheme;
  onParticipantChange: (updated: Partial<ParticipantDetails>) => void;
  onOpenSettings: () => void;
}

export default function BadgeForm({
  participant,
  dither,
  theme,
  onParticipantChange,
  onOpenSettings,
}: BadgeFormProps) {
  const isNameEmpty = !participant.name?.trim();

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Name Input Section (Simple, Prominent) */}
      <div className="border border-zinc-800 bg-[#0d0f14] p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-400" />
            <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
              02 // YOUR_NAME
            </span>
          </div>
          {isNameEmpty && (
            <span className="text-[10px] text-amber-400 font-mono tracking-wider animate-pulse flex items-center gap-1">
              ● NAME REQUIRED
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 font-mono text-xs">
          <div>
            <label className="block text-zinc-300 font-bold mb-1.5 text-xs">
              PARTICIPANT NAME
            </label>
            <input
              type="text"
              value={participant.name}
              onChange={(e) => onParticipantChange({ name: e.target.value })}
              className={`w-full border px-3.5 py-2.5 text-sm font-semibold text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition ${
                isNameEmpty
                  ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                  : 'border-zinc-700 bg-black focus:border-emerald-400'
              }`}
              placeholder="Enter your name (e.g. Satoshi Nakamoto)"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1 text-[11px]">
              HANDLE / GITHUB (OPTIONAL)
            </label>
            <input
              type="text"
              value={participant.handle}
              onChange={(e) => onParticipantChange({ handle: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. @satoshiarena"
            />
          </div>
        </div>
      </div>

      {/* 2. Badge Settings Menu At A Glance */}
      <div className="border border-zinc-800 bg-[#0d0f14] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-emerald-400" />
            <span className="font-mono text-xs font-bold tracking-wider text-zinc-300">
              BADGE CONFIGURATION AT A GLANCE
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 border border-emerald-500/80 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 px-3 py-1.5 font-mono text-xs font-bold transition"
          >
            <Sliders className="h-3.5 w-3.5" />
            CUSTOMIZE SETTINGS
          </button>
        </div>

        {/* At a glance pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1">
          <div
            onClick={onOpenSettings}
            className="border border-zinc-800 bg-black/50 p-2 cursor-pointer hover:border-zinc-700 transition"
          >
            <span className="text-zinc-500 text-[9px] block">ROLE</span>
            <span className="text-zinc-200 font-bold truncate block">{participant.role}</span>
          </div>

          <div
            onClick={onOpenSettings}
            className="border border-zinc-800 bg-black/50 p-2 cursor-pointer hover:border-zinc-700 transition"
          >
            <span className="text-zinc-500 text-[9px] block">TRACK</span>
            <span className="text-zinc-200 font-bold truncate block">{participant.track}</span>
          </div>

          <div
            onClick={onOpenSettings}
            className="border border-zinc-800 bg-black/50 p-2 cursor-pointer hover:border-zinc-700 transition"
          >
            <span className="text-zinc-500 text-[9px] block">DITHER</span>
            <span className="text-emerald-400 font-bold truncate block uppercase">
              {dither.algorithm.replace('-', ' ')}
            </span>
          </div>

          <div
            onClick={onOpenSettings}
            className="border border-zinc-800 bg-black/50 p-2 cursor-pointer hover:border-zinc-700 transition"
          >
            <span className="text-zinc-500 text-[9px] block">THEME</span>
            <span className="text-zinc-200 font-bold truncate block uppercase">
              {theme.replace('-', ' ')}
            </span>
          </div>
        </div>

        <p className="font-mono text-[10px] text-zinc-500 leading-normal">
          Click &ldquo;Customize Settings&rdquo; to adjust role, track, QR code payload, dither resolution, contrast, or color themes.
        </p>
      </div>
    </div>
  );
}
