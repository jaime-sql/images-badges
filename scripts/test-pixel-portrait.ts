import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIXEL_PALETTE,
  OUTLINE_COLOR,
  RIM_COLOR,
  PORTRAIT_GRID,
  PORTRAIT_OUTPUT,
  nearestPaletteIndex,
  posterize,
  posterizeFromForeground,
  upscaleNearest,
  applyOutlines,
  applyRim,
  applyLocalContrast,
  renderPixelPortrait,
  downsampleNearest,
  frameHeadAndShoulders,
  mergeTinyRegions,
  cleanCutoutMask,
  classifySkin,
  skinPalette,
  posterizeKeepingSkin,
  faceMedianLuminance,
} from '../lib/pixel-portrait.ts';
import { createImageData } from '../lib/dither.ts';

function solid(width, height, r, g, b, a = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return createImageData(data, width, height);
}

function setPixel(image, x, y, r, g, b, a = 255) {
  const i = (y * image.width + x) * 4;
  image.data[i] = r;
  image.data[i + 1] = g;
  image.data[i + 2] = b;
  image.data[i + 3] = a;
}

test('six-gray quantization uses only the palette', () => {
  assert.equal(nearestPaletteIndex(0, 0, 0), 0);
  assert.equal(nearestPaletteIndex(200, 200, 200), 4);
  assert.equal(nearestPaletteIndex(255, 255, 255), 5);

  const image = solid(4, 4, 200, 180, 160);
  const posted = posterize(image);
  const allowed = new Set(PIXEL_PALETTE.map((color) => `${color.r},${color.g},${color.b}`));
  for (let i = 0; i < posted.data.length; i += 4) {
    const key = `${posted.data[i]},${posted.data[i + 1]},${posted.data[i + 2]}`;
    assert.equal(posted.data[i + 3], 255);
    assert.ok(allowed.has(key), key);
  }
});

test('nearest upscale is a crisp 4x block', () => {
  const image = solid(1, 1, 15, 15, 18);
  const scaled = upscaleNearest(image, 4);
  assert.equal(scaled.width, 4);
  assert.equal(scaled.height, 4);
  for (let i = 0; i < scaled.data.length; i += 4) {
    assert.equal(scaled.data[i], 15);
    assert.equal(scaled.data[i + 1], 15);
    assert.equal(scaled.data[i + 2], 18);
  }
});

test('outline is one pixel on the dark side and does not paint 2x2 steps', () => {
  const size = 12;
  const image = solid(size, size, 244, 244, 246);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x + y < 10) setPixel(image, x, y, 58, 58, 64);
    }
  }
  const outlined = applyOutlines(image);
  let blocks = 0;
  for (let y = 2; y < size - 3; y++) {
    for (let x = 2; x < size - 3; x++) {
      const dark = (px: number, py: number) => {
        const i = (py * size + px) * 4;
        return outlined.data[i] === OUTLINE_COLOR.r && outlined.data[i + 1] === OUTLINE_COLOR.g;
      };
      if (dark(x, y) && dark(x + 1, y) && dark(x, y + 1) && dark(x + 1, y + 1)) blocks += 1;
    }
  }
  assert.equal(blocks, 0);
});

test('rim is a 2px #F4F4F6 edge around a transparent background', () => {
  const image = solid(11, 11, 0, 0, 0, 0);
  setPixel(image, 5, 5, 107, 107, 115, 255);
  const rimmed = applyRim(image);
  const at = (x, y) => {
    const i = (y * 11 + x) * 4;
    return [rimmed.data[i], rimmed.data[i + 1], rimmed.data[i + 2], rimmed.data[i + 3]];
  };
  assert.deepEqual(at(5, 5), [107, 107, 115, 255]);
  assert.deepEqual(at(5, 4), [RIM_COLOR.r, RIM_COLOR.g, RIM_COLOR.b, 255]);
  assert.deepEqual(at(5, 3), [RIM_COLOR.r, RIM_COLOR.g, RIM_COLOR.b, 255]);
  assert.deepEqual(at(5, 2), [0, 0, 0, 0]);
});

test('fallback and AI paths emit a 128 grid enlarged 4x with palette colors only', () => {
  const source = solid(32, 48, 30, 30, 36);
  for (let y = 8; y < 28; y++) {
    for (let x = 8; x < 24; x++) setPixel(source, x, y, 210, 210, 214);
  }
  for (let y = 14; y < 18; y++) {
    for (let x = 12; x < 15; x++) setPixel(source, x, y, 20, 20, 24);
    for (let x = 18; x < 21; x++) setPixel(source, x, y, 20, 20, 24);
  }

  for (const mode of ['fallback', 'ai']) {
    const { grid, output } = renderPixelPortrait(source, mode);
    assert.equal(grid.width, PORTRAIT_GRID);
    assert.equal(grid.height, PORTRAIT_GRID);
    assert.equal(output.width, PORTRAIT_OUTPUT);
    assert.equal(output.height, PORTRAIT_OUTPUT);
    const allowed = new Set(PIXEL_PALETTE.map((color) => `${color.r},${color.g},${color.b}`));
    for (let i = 0; i < grid.data.length; i += 4) {
      if (grid.data[i + 3] === 0) continue;
      const key = `${grid.data[i]},${grid.data[i + 1]},${grid.data[i + 2]}`;
      assert.ok(allowed.has(key), `${mode} ${key}`);
    }
    const i = (0 * output.width + 0) * 4;
    const j = (1 * output.width + 1) * 4;
    assert.equal(output.data[i], output.data[j]);
  }
});

test('foreground levels ignore transparent pixels and keep a cut-out transparent', () => {
  const image = solid(12, 12, 255, 255, 255, 0);
  for (let y = 2; y < 10; y++) {
    for (let x = 2; x < 10; x++) setPixel(image, x, y, 40, 40, 44, 255);
  }
  for (let y = 3; y < 6; y++) {
    for (let x = 4; x < 8; x++) setPixel(image, x, y, 210, 210, 214, 255);
  }
  const posted = posterizeFromForeground(image);
  const dark = posted.data[(4 * 12 + 3) * 4];
  const light = posted.data[(4 * 12 + 5) * 4];
  assert.ok(dark < light, `dark ${dark} should be below light ${light}`);
  assert.equal(posted.data[3], 0);
  assert.equal(posted.data[(0 * 12 + 11) * 4 + 3], 0);

  const { grid } = renderPixelPortrait(image, 'fallback');
  assert.equal(grid.data[3], 0);
  let rim = 0;
  for (let i = 0; i < grid.data.length; i += 4) {
    if (
      grid.data[i] === RIM_COLOR.r &&
      grid.data[i + 1] === RIM_COLOR.g &&
      grid.data[i + 2] === RIM_COLOR.b &&
      grid.data[i + 3] === 255
    ) {
      rim += 1;
    }
  }
  assert.ok(rim > 8, `expected a light rim, found ${rim}`);
});

test('local contrast separates eyes from nearby skin', () => {
  const size = 64;
  const image = solid(size, size, 30, 30, 34);
  for (let y = 8; y < 28; y++) {
    for (let x = 8; x < 28; x++) setPixel(image, x, y, 96, 96, 100);
  }
  for (let y = 14; y < 18; y++) {
    for (let x = 12; x < 16; x++) setPixel(image, x, y, 84, 84, 88);
  }
  for (let y = 48; y < 60; y++) {
    for (let x = 48; x < 60; x++) setPixel(image, x, y, 250, 250, 252);
  }
  const contrasted = applyLocalContrast(image);
  const mean = (x0, y0, x1, y1) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size + x) * 4;
        sum += contrasted.data[i];
        n += 1;
      }
    }
    return sum / n;
  };
  const eyes = mean(12, 14, 16, 18);
  const skin = mean(20, 10, 26, 16);
  assert.ok(skin - eyes > 24, `eyes ${eyes.toFixed(1)} stayed too close to skin ${skin.toFixed(1)}`);
});

test('head-and-shoulders crop puts the eyes near 40% from the top', () => {
  const width = 60;
  const height = 100;
  const image = solid(width, height, 0, 0, 0, 0);
  for (let y = 10; y < 48; y++) {
    for (let x = 22; x < 38; x++) setPixel(image, x, y, 180, 180, 184);
  }
  for (let y = 48; y < 88; y++) {
    for (let x = 8; x < 52; x++) setPixel(image, x, y, 120, 120, 124);
  }
  const eyeY = 28;
  for (let x = 24; x < 28; x++) setPixel(image, x, eyeY, 12, 12, 16);
  for (let x = 32; x < 36; x++) setPixel(image, x, eyeY, 12, 12, 16);

  const framed = frameHeadAndShoulders(image, 80);
  let bestMin = 256;
  let bestRow = 0;
  for (let y = 0; y < framed.height; y++) {
    let min = 256;
    let opaque = 0;
    for (let x = 0; x < framed.width; x++) {
      const i = (y * framed.width + x) * 4;
      if (framed.data[i + 3] < 20) continue;
      opaque += 1;
      min = Math.min(min, framed.data[i]);
    }
    if (opaque > 0 && min < bestMin) {
      bestMin = min;
      bestRow = y;
    }
  }
  const ratio = bestRow / framed.height;
  assert.ok(ratio > 0.32 && ratio < 0.48, `eyes landed at ${ratio.toFixed(2)} of the frame`);
  assert.equal(framed.data[3], 0);
});

test('a small head above a tall body is framed on the eyes, not the torso', () => {
  const width = 80;
  const height = 140;
  const image = solid(width, height, 0, 0, 0, 0);
  for (let y = 6; y < 36; y++) {
    const inset = y < 12 ? 30 : 26;
    for (let x = inset; x < width - inset; x++) setPixel(image, x, y, 176, 168, 160);
  }
  for (let y = 36; y < 130; y++) {
    for (let x = 8; x < 72; x++) setPixel(image, x, y, 40, 40, 44);
  }
  for (let x = 32; x < 36; x++) setPixel(image, x, 18, 10, 10, 12);
  for (let x = 44; x < 48; x++) setPixel(image, x, 18, 10, 10, 12);

  const framed = frameHeadAndShoulders(image, 96);
  let bestMin = 256;
  let bestRow = 0;
  const headLimit = Math.floor(framed.height * 0.6);
  for (let y = 0; y < headLimit; y++) {
    let min = 256;
    let opaque = 0;
    for (let x = 0; x < framed.width; x++) {
      const i = (y * framed.width + x) * 4;
      if (framed.data[i + 3] < 20) continue;
      opaque += 1;
      min = Math.min(min, framed.data[i]);
    }
    if (opaque > 0 && min < bestMin) {
      bestMin = min;
      bestRow = y;
    }
  }
  const ratio = bestRow / framed.height;
  assert.ok(ratio > 0.32 && ratio < 0.48, `eyes landed at ${ratio.toFixed(2)} of the frame`);
});

test('regions smaller than 6px merge into the neighboring gray', () => {
  const tone = PIXEL_PALETTE[3];
  const speck = PIXEL_PALETTE[0];
  const image = solid(16, 16, tone.r, tone.g, tone.b);
  setPixel(image, 8, 8, speck.r, speck.g, speck.b);
  setPixel(image, 9, 8, speck.r, speck.g, speck.b);
  setPixel(image, 8, 9, speck.r, speck.g, speck.b);
  const merged = mergeTinyRegions(image, 6);
  const i = (8 * 16 + 8) * 4;
  assert.equal(merged.data[i], tone.r);
  assert.equal(merged.data[i + 1], tone.g);
  assert.equal(merged.data[i + 2], tone.b);
});

test('cut-out mask drops the stray line above the head', () => {
  const image = solid(40, 40, 0, 0, 0, 0);
  for (let y = 14; y <= 36; y++) {
    for (let x = 10; x <= 30; x++) setPixel(image, x, y, 180, 170, 160);
  }
  for (let x = 12; x <= 28; x++) setPixel(image, x, 6, 200, 200, 200);
  setPixel(image, 20, 5, 200, 200, 200, 40);
  setPixel(image, 2, 2, 90, 90, 90);
  setPixel(image, 3, 2, 90, 90, 90);
  for (let y = 8; y <= 13; y++) setPixel(image, 20, y, 30, 30, 30);

  const cleaned = cleanCutoutMask(image);
  const alpha = (x, y) => cleaned.data[(y * 40 + x) * 4 + 3];
  assert.equal(alpha(20, 6), 0);
  assert.equal(alpha(20, 5), 0);
  assert.equal(alpha(2, 2), 0);
  assert.equal(alpha(20, 10), 0);
  assert.equal(alpha(20, 24), 255);

  const outlined = applyOutlines(posterize(cleaned));
  const line = (20 * 40 + 6) * 4;
  assert.equal(outlined.data[line + 3], 0);
});

test('a dark beard does not pull a lit face into the dark band', () => {
  const image = solid(80, 80, 42, 40, 38);
  for (let y = 34; y <= 38; y++) {
    for (let x = 28; x <= 36; x++) setPixel(image, x, y, 190, 184, 176);
    for (let x = 43; x <= 51; x++) setPixel(image, x, y, 190, 184, 176);
  }
  const tone = faceMedianLuminance(image);
  assert.ok(tone >= 170, `lit face measured ${tone.toFixed(0)}`);
  assert.equal(classifySkin(tone), 'light');
});

test('skin stays in its own band and a bright cheek does not turn white', () => {
  assert.equal(classifySkin(70), 'dark');
  assert.equal(classifySkin(110), 'dark');
  assert.equal(classifySkin(150), 'medium');
  assert.equal(classifySkin(190), 'light');
  assert.deepEqual(
    [skinPalette('dark').shadow, skinPalette('dark').base],
    [1, 2]
  );
  assert.deepEqual(
    [skinPalette('light').base, skinPalette('light').highlight],
    [4, 5]
  );

  const image = solid(64, 64, 0, 0, 0, 0);
  for (let y = 10; y < 54; y++) {
    for (let x = 16; x < 48; x++) setPixel(image, x, y, 58, 50, 46);
  }
  for (let y = 24; y < 46; y++) {
    for (let x = 16; x < 28; x++) setPixel(image, x, y, 36, 32, 30);
  }
  for (let y = 30; y < 36; y++) {
    for (let x = 34; x < 40; x++) setPixel(image, x, y, 230, 230, 230);
  }
  const posted = posterizeKeepingSkin(image, new Uint8Array(64 * 64));
  const tone = (x, y) => {
    const i = (y * 64 + x) * 4;
    return nearestPaletteIndex(posted.data[i], posted.data[i + 1], posted.data[i + 2]);
  };
  assert.ok(tone(40, 36) <= 2, `highlight became ${tone(40, 36)}`);
  assert.ok(tone(22, 34) <= 2, `shadow became ${tone(22, 34)}`);
  assert.ok(tone(40, 36) >= 1 && tone(22, 34) >= 1);
});

test('protected dark features smaller than 6px are not merged away', () => {
  const tone = PIXEL_PALETTE[4];
  const ink = PIXEL_PALETTE[0];
  const image = solid(16, 16, tone.r, tone.g, tone.b);
  setPixel(image, 8, 8, ink.r, ink.g, ink.b);
  setPixel(image, 9, 8, ink.r, ink.g, ink.b);
  const protect = new Uint8Array(16 * 16);
  protect[8 * 16 + 8] = 1;
  protect[8 * 16 + 9] = 1;
  const merged = mergeTinyRegions(image, 6, protect);
  const i = (8 * 16 + 8) * 4;
  assert.equal(merged.data[i], ink.r);
  assert.equal(merged.data[i + 1], ink.g);
});

test('floating specks that do not touch the person are dropped', () => {
  const image = solid(48, 48, 0, 0, 0, 0);
  for (let y = 12; y < 36; y++) {
    for (let x = 14; x < 34; x++) setPixel(image, x, y, 160, 150, 140);
  }
  for (let y = 2; y < 7; y++) {
    for (let x = 2; x < 7; x++) setPixel(image, x, y, 200, 200, 200);
  }
  const cleaned = cleanCutoutMask(image);
  assert.equal(cleaned.data[(4 * 48 + 4) * 4 + 3], 0);
  assert.equal(cleaned.data[(24 * 48 + 24) * 4 + 3], 255);
});

test('downsample nearest keeps a flat field', () => {
  const image = solid(4, 4, 100, 100, 100);
  const small = downsampleNearest(image, 2, 2);
  assert.equal(small.width, 2);
  assert.equal(small.data[0], 100);
});
