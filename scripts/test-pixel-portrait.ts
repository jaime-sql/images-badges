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
  let best = -1;
  let bestRow = 0;
  for (let y = 0; y < framed.height; y++) {
    let dark = 0;
    for (let x = 0; x < framed.width; x++) {
      const i = (y * framed.width + x) * 4;
      if (framed.data[i + 3] < 20) continue;
      if (framed.data[i] < 40) dark += 1;
    }
    if (dark > best) {
      best = dark;
      bestRow = y;
    }
  }
  const ratio = bestRow / framed.height;
  assert.ok(ratio > 0.32 && ratio < 0.48, `eyes landed at ${ratio.toFixed(2)} of the frame`);
  assert.equal(framed.data[3], 0);
});

test('downsample nearest keeps a flat field', () => {
  const image = solid(4, 4, 100, 100, 100);
  const small = downsampleNearest(image, 2, 2);
  assert.equal(small.width, 2);
  assert.equal(small.data[0], 100);
});
