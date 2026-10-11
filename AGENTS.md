# AGENTS.md - Hackathon Pixel Badge Generator

## 1. Project Overview & Architecture
Client-side Next.js web application that generates retro pixel-art hackathon badges.
- Users upload a photo or capture via webcam.
- Background is segmented and removed client-side.
- Image is downsampled, converted to luminance, and dithered using a 4-level grayscale error-diffusion algorithm (Floyd-Steinberg).
- Result is composited onto a styled 2D canvas with metadata, typography, and an event QR code, then exported as high-res PNG.

## 2. Technical Stack & Dependencies
- **Framework**: Next.js 15 (App Router, TypeScript, Tailwind CSS)
- **Icons**: lucide-react
- **Segmentation**: @imgly/background-removal (in-browser WASM/ONNX)
- **Utilities**: qrcode, canvas-confetti (optional reward on download)
- **Fonts**: Next.js Google Fonts (monospace/retro fonts such as 'Geist Mono', 'Press Start 2P', or 'Silkscreen')

## 3. Strict Development Rules & Constraints
- **Zero Server-Side Image Processing**: All canvas operations, segmentation, and dithering must run client-side.
- **Pixel-Art Preservation**: Canvas scaling must disable anti-aliasing via `ctx.imageSmoothingEnabled = false` and CSS `image-rendering: pixelated;`.
- **Modular Architecture**: 
  - Image processing and math in `/lib` must be pure functions independent of React components.
  - Keep canvas compositing decoupled from UI state.
- **Error Boundaries**: Handle camera permission denials, unsupported browsers, and WASM loading states gracefully.

## 4. Target Directory Layout
- `app/`
  - `page.tsx`: Split-screen layout (input panel left, live badge preview right)
  - `layout.tsx`: Root layout with imported retro fonts
- `components/`
  - `BadgePreview.tsx`: Live canvas display and PNG download action
  - `BadgeForm.tsx`: Inputs for Name, Track/Role, Ticket Number, and dither settings
  - `CameraModal.tsx`: Webcam capture interface via getUserMedia
  - `ImageUploader.tsx`: Drag-and-drop / file selector
- `lib/`
  - `dither.ts`: Grayscale conversion and error-diffusion dithering algorithms
  - `badge-composer.ts`: Canvas composite rendering (frame, text, QR code, portrait)
  - `segmentation.ts`: Client-side wrapper for @imgly/background-removal
- `types/`
  - `badge.ts`: Data types for badge configuration and participant details

## 5. Phased Roadmap
- Phase 1: Setup dependencies, types, and core dithering math (`lib/dither.ts`).
- Phase 2: Photo acquisition (webcam capture + file upload).
- Phase 3: Background segmentation integration (`@imgly/background-removal`).
- Phase 4: Canvas badge compositor (`lib/badge-composer.ts`) with live preview.
- Phase 5: Exporting (PNG blob download) and responsive polish.

## 6. Verification Commands
- Type checking: `npx tsc --noEmit`
- Linting: `npm run lint`
- Build verification: `npm run build`
