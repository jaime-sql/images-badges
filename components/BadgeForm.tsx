'use client';

/**
 * components/BadgeForm.tsx
 * Controls for participant metadata, dither tuning parameters,
 * and badge styling themes.
 */

import React from 'react';
import { ParticipantDetails, DitherConfig, BadgeTheme, DitherAlgorithm } from '../types/badge';
import { Sliders, User, Palette, Wand2 } from 'lucide-react';

interface BadgeFormProps {
  participant: ParticipantDetails;
  dither: DitherConfig;
  theme: BadgeTheme;
  onParticipantChange: (updated: Partial<ParticipantDetails>) => void;
  onDitherChange: (updated: Partial<DitherConfig>) => void;
  onThemeChange: (theme: BadgeTheme) => void;
}

export default function BadgeForm({
  participant,
  dither,
  theme,
  onParticipantChange,
  onDitherChange,
  onThemeChange,
}: BadgeFormProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* 1. Participant Details Section */}
      <div className="border border-zinc-800 bg-[#0d0f14] p-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-4">
          <User className="h-4 w-4 text-emerald-400" />
          <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
            02 // PARTICIPANT_METADATA
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-400">YOUR FULL NAME</label>
              {!participant.name?.trim() && (
                <span className="text-[10px] text-amber-400 font-mono tracking-wider animate-pulse">
                  ● INPUT REQUIRED
                </span>
              )}
            </div>
            <input
              type="text"
              value={participant.name}
              onChange={(e) => onParticipantChange({ name: e.target.value })}
              className={`w-full border px-3 py-2 text-zinc-200 focus:outline-none transition ${
                !participant.name?.trim()
                  ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                  : 'border-zinc-800 bg-black focus:border-emerald-500'
              }`}
              placeholder="Enter your name (e.g. Satoshi Nakamoto)"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">HANDLE / GITHUB</label>
            <input
              type="text"
              value={participant.handle}
              onChange={(e) => onParticipantChange({ handle: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. @satoshiarena"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">ROLE</label>
            <select
              value={participant.role}
              onChange={(e) => onParticipantChange({ role: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="BUILDER">BUILDER</option>
              <option value="AI ENGINEER">AI ENGINEER</option>
              <option value="DESIGNER">DESIGNER</option>
              <option value="MENTOR">MENTOR</option>
              <option value="JUDGE">JUDGE</option>
              <option value="ORGANIZER">ORGANIZER</option>
              <option value="VIP">VIP</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">TRACK</label>
            <select
              value={participant.track}
              onChange={(e) => onParticipantChange({ track: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="AGENTS & REASONING">AGENTS & REASONING</option>
              <option value="CREATIVE TECH">CREATIVE TECH</option>
              <option value="OPEN INFRAS">OPEN INFRAS</option>
              <option value="DECENTRALIZED">DECENTRALIZED</option>
              <option value="GENERAL HACK">GENERAL HACK</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">TICKET #</label>
            <input
              type="text"
              value={participant.ticketNumber}
              onChange={(e) => onParticipantChange({ ticketNumber: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="#0429"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">QR LINK / DATA</label>
            <input
              type="text"
              value={participant.qrPayload}
              onChange={(e) => onParticipantChange({ qrPayload: e.target.value })}
              className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="https://github.com/..."
            />
          </div>
        </div>
      </div>

      {/* 2. Dither Tuning Engine Section */}
      <div className="border border-zinc-800 bg-[#0d0f14] p-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-4">
          <Sliders className="h-4 w-4 text-emerald-400" />
          <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
            03 // DITHER_GRAPHICS_PIPELINE
          </span>
        </div>

        <div className="flex flex-col gap-4 font-mono text-xs">
          {/* Smart Auto-Enhance Banner */}
          <div className="flex items-center justify-between border border-emerald-500/40 bg-emerald-950/20 p-2.5">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-emerald-400" />
              <div>
                <span className="text-emerald-300 font-bold block text-[11px]">
                  SMART AUTO-EXPOSURE & FACE ENHANCE
                </span>
                <span className="text-zinc-400 text-[10px] block">
                  Prevents dark face silhouettes; normalizes skin tone & highlights
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDitherChange({ autoEnhance: !dither.autoEnhance })}
              className={`border px-3 py-1 text-[11px] font-bold transition ${
                dither.autoEnhance !== false
                  ? 'border-emerald-400 bg-emerald-400 text-black'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              }`}
            >
              {dither.autoEnhance !== false ? 'ENABLED' : 'OFF'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">ALGORITHM</label>
              <select
                value={dither.algorithm}
                onChange={(e) => onDitherChange({ algorithm: e.target.value as DitherAlgorithm })}
                className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="floyd-steinberg">Floyd-Steinberg (4-Level Organic)</option>
                <option value="atkinson">Atkinson (Classic Mac High-Contrast)</option>
                <option value="stucki">Stucki (Photographic Smooth)</option>
                <option value="bayer">Bayer 4x4 (CRT Dot Matrix)</option>
                <option value="bayer8">Bayer 8x8 (Fine Ordered Grid)</option>
                <option value="threshold">Threshold (Hard Posterize)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">PIXEL GRID ({dither.resolution}px)</label>
              <select
                value={dither.resolution}
                onChange={(e) => onDitherChange({ resolution: Number(e.target.value) })}
                className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value={96}>96 x 96 (Lo-Fi Retro)</option>
                <option value={128}>128 x 128 (Classic Pixel)</option>
                <option value={180}>180 x 180 (Crisp 2x - Recommended)</option>
                <option value={240}>240 x 240 (Fine Detail)</option>
                <option value={360}>360 x 360 (Ultra Sharp 1:1)</option>
              </select>
            </div>
          </div>

          {/* Midtone Lift / Gamma */}
          <div>
            <div className="flex justify-between text-zinc-400 mb-1">
              <span>MIDTONE LIFT / SHADOW BRIGHTNESS</span>
              <span>{dither.gamma ? dither.gamma.toFixed(2) : '1.00'}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.7"
              step="0.05"
              value={dither.gamma ?? 1.0}
              onChange={(e) => onDitherChange({ gamma: parseFloat(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>Darker Shadows</span>
              <span>Lifted Face Details</span>
            </div>
          </div>

          {/* Edge Sharpness Slider */}
          <div>
            <div className="flex justify-between text-zinc-400 mb-1">
              <span>CONTOUR & GLASSES SHARPNESS</span>
              <span>{Math.round((dither.sharpness ?? 0.35) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={dither.sharpness ?? 0.35}
              onChange={(e) => onDitherChange({ sharpness: parseFloat(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>Smooth</span>
              <span>Crisp Glasses & Eyes</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Contrast Slider */}
            <div>
              <div className="flex justify-between text-zinc-400 mb-1">
                <span>CONTRAST</span>
                <span>{Math.round(dither.contrast * 100)}%</span>
              </div>
              <input
                type="range"
                min="-0.5"
                max="0.8"
                step="0.05"
                value={dither.contrast}
                onChange={(e) => onDitherChange({ contrast: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            {/* Brightness Slider */}
            <div>
              <div className="flex justify-between text-zinc-400 mb-1">
                <span>BRIGHTNESS</span>
                <span>{Math.round(dither.brightness * 100)}%</span>
              </div>
              <input
                type="range"
                min="-0.4"
                max="0.4"
                step="0.05"
                value={dither.brightness}
                onChange={(e) => onDitherChange({ brightness: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Diffusion Strength */}
          <div>
            <div className="flex justify-between text-zinc-400 mb-1">
              <span>DIFFUSION SPREAD</span>
              <span>{Math.round(dither.diffusionStrength * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={dither.diffusionStrength}
              onChange={(e) => onDitherChange({ diffusionStrength: parseFloat(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
          </div>

          {/* Options: Serpentine & Invert */}
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dither.serpentine !== false}
                onChange={(e) => onDitherChange({ serpentine: e.target.checked })}
                className="accent-emerald-400 h-4 w-4 cursor-pointer"
              />
              <span>SERPENTINE SCAN (NO STREAKS)</span>
            </label>

            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dither.invert}
                onChange={(e) => onDitherChange({ invert: e.target.checked })}
                className="accent-emerald-400 h-4 w-4 cursor-pointer"
              />
              <span>INVERT LUMINANCE</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Visual Theme Selector */}
      <div className="border border-zinc-800 bg-[#0d0f14] p-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-3">
          <Palette className="h-4 w-4 text-emerald-400" />
          <span className="font-mono text-xs font-bold tracking-wider text-emerald-400">
            04 // BADGE_THEME
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          {[
            { id: 'dark-brutalist', label: 'DARK BRUTALIST', color: '#00ff66' },
            { id: 'matrix-green', label: 'MATRIX TERMINAL', color: '#22c55e' },
            { id: 'amber-crt', label: 'AMBER CRT', color: '#f59e0b' },
            { id: 'paper-light', label: 'BLUEPRINT', color: '#38bdf8' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onThemeChange(item.id as BadgeTheme)}
              className={`flex items-center gap-2 border p-2 text-left transition ${
                theme === item.id
                  ? 'border-emerald-400 bg-emerald-950/30 text-white font-bold'
                  : 'border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-black"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
