'use client';

/**
 * app/page.tsx
 * Hackathon Pixel-Art Badge Generator
 * Retro-digital dark brutalist split-screen layout.
 * Simplified primary flow: (1) Photo -> (2) Name -> (3) Badge at a glance.
 */

import React, { useState } from 'react';
import { BadgeState, ParticipantDetails, DitherConfig, BadgeTheme } from '@/types/badge';
import { DEFAULT_DITHER_CONFIG } from '@/lib/dither';
import ImageUploader from '@/components/ImageUploader';
import CameraModal from '@/components/CameraModal';
import BadgeForm from '@/components/BadgeForm';
import BadgeSettingsModal from '@/components/BadgeSettingsModal';
import BadgePreview from '@/components/BadgePreview';
import { Terminal, Shield, Sparkles, Image as ImageIcon, Sliders } from 'lucide-react';

const INITIAL_PARTICIPANT: ParticipantDetails = {
  name: '',
  handle: '',
  role: 'BUILDER',
  track: 'GENERAL HACK',
  ticketNumber: '#0429',
  qrPayload: 'https://github.com/jaime-sql/images-badges',
  eventTitle: 'BADGE GENERATOR // 2026',
  eventDate: 'OCT 16-18, 2026',
  location: 'SAN FRANCISCO, CA',
};

export default function Home() {
  const [badgeState, setBadgeState] = useState<BadgeState>({
    participant: INITIAL_PARTICIPANT,
    dither: DEFAULT_DITHER_CONFIG,
    theme: 'dark-brutalist',
    rawImage: null,
    segmentedImage: null,
    segmentationStatus: 'idle',
    segmentationError: null,
  });

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Participant updates
  const handleParticipantChange = (updated: Partial<ParticipantDetails>) => {
    setBadgeState((prev) => ({
      ...prev,
      participant: { ...prev.participant, ...updated },
    }));
  };

  // Dither tuning updates
  const handleDitherChange = (updated: Partial<DitherConfig>) => {
    setBadgeState((prev) => ({
      ...prev,
      dither: { ...prev.dither, ...updated },
    }));
  };

  // Theme updates
  const handleThemeChange = (theme: BadgeTheme) => {
    setBadgeState((prev) => ({
      ...prev,
      theme,
    }));
  };

  // Load a built-in demo avatar for instant testing
  const loadDemoAvatar = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Procedural cyber avatar
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Head silhouette
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(128, 110, 60, 0, Math.PI * 2);
    ctx.fill();

    // Visor / glasses
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(80, 95, 96, 26);

    // Visor glow
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(88, 102, 35, 10);
    ctx.fillRect(135, 102, 35, 10);

    // Shoulders
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(128, 240, 90, 60, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tech lines
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 170);
    ctx.lineTo(128, 256);
    ctx.stroke();

    const dataUrl = canvas.toDataURL('image/png');
    setBadgeState((prev) => ({
      ...prev,
      rawImage: dataUrl,
      segmentedImage: null,
      segmentationStatus: 'idle',
      participant: {
        ...prev.participant,
        name: prev.participant.name || 'SATOSHI N.',
        handle: prev.participant.handle || '@satoshin',
      },
    }));
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 selection:bg-emerald-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-800 bg-[#0b0d13]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 bg-emerald-400 flex items-center justify-center font-bold text-black font-mono text-sm">
              BG
            </div>
            <div>
              <span className="font-bold text-sm tracking-widest text-zinc-100 uppercase font-mono">
                BADGE GENERATOR
              </span>
              <span className="hidden sm:inline-block ml-3 px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/40 text-[10px] text-emerald-400 font-mono">
                CLIENT-SIDE DITHER v1.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900/80 hover:border-emerald-400 px-3 py-1.5 font-mono text-xs text-zinc-300 transition"
            >
              <Sliders className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">BADGE SETTINGS</span>
              <span className="sm:hidden">SETTINGS</span>
            </button>

            <button
              onClick={loadDemoAvatar}
              className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:text-white transition"
            >
              <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">DEMO AVATAR</span>
              <span className="sm:hidden">DEMO</span>
            </button>

            <a
              href="https://github.com/jaime-sql/images-badges"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition"
            >
              <Terminal className="h-3.5 w-3.5" />
              GITHUB
            </a>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Simplified Primary Input Panel (7 Cols) */}
          <section className="lg:col-span-7 flex flex-col gap-5">
            <div className="border border-zinc-800 bg-[#0a0c11] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-400" />
                <h1 className="font-mono text-xs font-bold tracking-widest text-zinc-200 uppercase">
                  BADGE GENERATOR // FAST & STREAMLINED
                </h1>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                <span>LOCAL_PROCESSING: 100%</span>
                <span className="text-emerald-400">●</span>
              </div>
            </div>

            {/* Step 1: Photo Acquisition */}
            <ImageUploader
              rawImage={badgeState.rawImage}
              segmentedImage={badgeState.segmentedImage}
              segmentationStatus={badgeState.segmentationStatus}
              segmentationError={badgeState.segmentationError}
              onRawImageChange={(url) => setBadgeState((prev) => ({ ...prev, rawImage: url }))}
              onSegmentedImageChange={(url) =>
                setBadgeState((prev) => ({ ...prev, segmentedImage: url }))
              }
              onSegmentationStatusChange={(status, error) =>
                setBadgeState((prev) => ({
                  ...prev,
                  segmentationStatus: status,
                  segmentationError: error,
                }))
              }
              onOpenWebcam={() => setIsCameraOpen(true)}
            />

            {/* Step 2: Name Input & Settings at a Glance */}
            <BadgeForm
              participant={badgeState.participant}
              dither={badgeState.dither}
              theme={badgeState.theme}
              onParticipantChange={handleParticipantChange}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </section>

          {/* Right Column: Live Badge Preview (5 Cols) */}
          <section className="lg:col-span-5 lg:sticky lg:top-24 flex flex-col items-center">
            <div className="w-full border border-zinc-800 bg-[#0a0c11] p-4 mb-4 flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-400 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                LIVE_CANVAS_RENDER
              </span>
              <span className="text-[11px] text-emerald-400 border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5">
                PIXEL_SMOOTHING: OFF
              </span>
            </div>

            <BadgePreview badgeState={badgeState} />
          </section>
        </div>
      </main>

      {/* Webcam Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(dataUrl) => {
          setBadgeState((prev) => ({
            ...prev,
            rawImage: dataUrl,
            segmentedImage: null,
            segmentationStatus: 'idle',
          }));
        }}
      />

      {/* Advanced Settings Modal (Role, Track, QR, Dither, Theme) */}
      <BadgeSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        participant={badgeState.participant}
        dither={badgeState.dither}
        theme={badgeState.theme}
        onParticipantChange={handleParticipantChange}
        onDitherChange={handleDitherChange}
        onThemeChange={handleThemeChange}
      />
    </div>
  );
}
