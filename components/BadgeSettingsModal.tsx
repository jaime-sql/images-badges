'use client';

/**
 * components/BadgeSettingsModal.tsx
 * Modal dialog for customizing badge metadata, graphics/dithering pipeline,
 * and visual theme without cluttering the primary user flow.
 */

import React, { useState } from 'react';
import {
  X,
  Sliders,
  User,
  Palette,
  Wand2,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  ParticipantDetails,
  DitherConfig,
  BadgeTheme,
  DitherAlgorithm,
} from '../types/badge';
import { DEFAULT_DITHER_CONFIG } from '../lib/dither';

interface BadgeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: ParticipantDetails;
  dither: DitherConfig;
  theme: BadgeTheme;
  onParticipantChange: (updated: Partial<ParticipantDetails>) => void;
  onDitherChange: (updated: Partial<DitherConfig>) => void;
  onThemeChange: (theme: BadgeTheme) => void;
}

type SettingsTab = 'details' | 'graphics' | 'theme';

export default function BadgeSettingsModal({
  isOpen,
  onClose,
  participant,
  dither,
  theme,
  onParticipantChange,
  onDitherChange,
  onThemeChange,
}: BadgeSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('details');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl border-2 border-zinc-700 bg-[#0c0e14] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-[#10131c] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-4 w-4 text-emerald-400" />
            <h2 className="font-mono text-sm font-bold tracking-wider text-zinc-100 uppercase">
              BADGE SETTINGS & GRAPHICS CONFIGURATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="border border-zinc-700 p-1 text-zinc-400 hover:border-zinc-500 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-[#090b10] px-4 font-mono text-xs">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
              activeTab === 'details'
                ? 'border-emerald-400 text-emerald-300 font-bold bg-zinc-900/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            EVENT & PARTICIPANT DETAILS
          </button>

          <button
            onClick={() => setActiveTab('graphics')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
              activeTab === 'graphics'
                ? 'border-emerald-400 text-emerald-300 font-bold bg-zinc-900/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            DITHER & GRAPHICS
          </button>

          <button
            onClick={() => setActiveTab('theme')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
              activeTab === 'theme'
                ? 'border-emerald-400 text-emerald-300 font-bold bg-zinc-900/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            BADGE THEME
          </button>
        </div>

        {/* Tab Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 font-mono text-xs space-y-5">
          {/* TAB 1: PARTICIPANT DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Customize your badge role, hackathon track, ticket ID, and dynamic QR code data payload.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="block text-zinc-400 mb-1">HANDLE / GITHUB</label>
                  <input
                    type="text"
                    value={participant.handle}
                    onChange={(e) => onParticipantChange({ handle: e.target.value })}
                    className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    placeholder="e.g. @builder_handle"
                  />
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
              </div>

              <div className="border-t border-zinc-850 pt-4 space-y-3">
                <div>
                  <label className="block text-zinc-400 mb-1">QR CODE LINK / PAYLOAD</label>
                  <input
                    type="text"
                    value={participant.qrPayload}
                    onChange={(e) => onParticipantChange({ qrPayload: e.target.value })}
                    className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    placeholder="https://github.com/..."
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Scannable via smartphone cameras directly on the badge.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-zinc-400 mb-1">EVENT TITLE</label>
                    <input
                      type="text"
                      value={participant.eventTitle}
                      onChange={(e) => onParticipantChange({ eventTitle: e.target.value })}
                      className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                      placeholder="BADGE GENERATOR // 2026"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 mb-1">EVENT DATE & CITY</label>
                    <input
                      type="text"
                      value={`${participant.eventDate} // ${participant.location}`}
                      onChange={(e) => {
                        const parts = e.target.value.split('//');
                        onParticipantChange({
                          eventDate: parts[0]?.trim() || participant.eventDate,
                          location: parts[1]?.trim() || participant.location,
                        });
                      }}
                      className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                      placeholder="OCT 16-18, 2026 // SAN FRANCISCO, CA"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DITHER & GRAPHICS PIPELINE */}
          {activeTab === 'graphics' && (
            <div className="space-y-4">
              {/* Auto-Exposure toggle */}
              <div className="flex items-center justify-between border border-emerald-500/40 bg-emerald-950/20 p-3">
                <div className="flex items-center gap-2.5">
                  <Wand2 className="h-4 w-4 text-emerald-400" />
                  <div>
                    <span className="text-emerald-300 font-bold block text-xs">
                      SMART AUTO-EXPOSURE & FACE ENHANCE
                    </span>
                    <span className="text-zinc-400 text-[10px] block">
                      Normalizes webcam lighting so facial features (eyes, glasses, smile) never black out.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDitherChange({ autoEnhance: !dither.autoEnhance })}
                  className={`border px-3 py-1.5 text-xs font-bold transition ${
                    dither.autoEnhance !== false
                      ? 'border-emerald-400 bg-emerald-400 text-black'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {dither.autoEnhance !== false ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">DITHER ALGORITHM</label>
                  <select
                    value={dither.algorithm}
                    onChange={(e) => onDitherChange({ algorithm: e.target.value as DitherAlgorithm })}
                    className="w-full border border-zinc-800 bg-black px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="floyd-steinberg">Floyd-Steinberg (4-Level Organic)</option>
                    <option value="atkinson">Atkinson (Classic Mac High-Contrast)</option>
                    <option value="stucki">Stucki (Photographic Smooth)</option>
                    <option value="bayer">Bayer 4x4 (CRT Dot Matrix)</option>
                    <option value="bayer8">Bayer 8x8 (Fine Ordered Pattern)</option>
                    <option value="threshold">Threshold (Hard Posterize)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">PIXEL GRID RESOLUTION</label>
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

              {/* Sliders */}
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>MIDTONE LIFT / SHADOW BRIGHTNESS</span>
                    <span className="text-emerald-400">{dither.gamma ? dither.gamma.toFixed(2) : '1.00'}x</span>
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
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>Darker Shadows</span>
                    <span>Lifts Face Out of Shadows</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>CONTOUR & GLASSES SHARPNESS</span>
                    <span className="text-emerald-400">{Math.round((dither.sharpness ?? 0.35) * 100)}%</span>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
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

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-850">
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={dither.serpentine !== false}
                      onChange={(e) => onDitherChange({ serpentine: e.target.checked })}
                      className="accent-emerald-400 h-4 w-4 cursor-pointer"
                    />
                    <span>SERPENTINE SCAN (NO STREAKS)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => onDitherChange(DEFAULT_DITHER_CONFIG)}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> RESET GRAPHICS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: THEME */}
          {activeTab === 'theme' && (
            <div className="space-y-4">
              <p className="text-zinc-400 text-[11px]">
                Choose the visual color palette and brutalist accents for your badge.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'dark-brutalist',
                    label: 'DARK BRUTALIST',
                    desc: 'Cyber dark with neon green accents and 4-level grayscale',
                    color: '#00ff66',
                    bg: '#090a0f',
                  },
                  {
                    id: 'matrix-green',
                    label: 'MATRIX TERMINAL',
                    desc: 'Phosphor green CRT terminal palette',
                    color: '#22c55e',
                    bg: '#040d06',
                  },
                  {
                    id: 'amber-crt',
                    label: 'AMBER CRT',
                    desc: 'Warm amber mainframe monitor theme',
                    color: '#f59e0b',
                    bg: '#120a02',
                  },
                  {
                    id: 'paper-light',
                    label: 'BRUTALIST BLUEPRINT',
                    desc: 'Deep cyan blueprint with white highlights',
                    color: '#38bdf8',
                    bg: '#021526',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onThemeChange(item.id as BadgeTheme)}
                    className={`flex flex-col gap-2 border p-3 text-left transition ${
                      theme === item.id
                        ? 'border-emerald-400 bg-emerald-950/30'
                        : 'border-zinc-800 bg-black/40 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-black shadow"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className={`font-bold text-xs ${theme === item.id ? 'text-white' : 'text-zinc-300'}`}>
                          {item.label}
                        </span>
                      </div>
                      {theme === item.id && <Check className="h-4 w-4 text-emerald-400" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 leading-tight">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-[#10131c] px-5 py-3">
          <span className="font-mono text-[10px] text-zinc-500">
            CHANGES APPLY INSTANTLY TO LIVE BADGE PREVIEW
          </span>
          <button
            onClick={onClose}
            className="border border-emerald-400 bg-emerald-400 px-4 py-1.5 font-mono text-xs font-bold text-black hover:bg-emerald-300 transition"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
