import {
  quantizeLevels,
  adjustLuminance,
  getLuminance,
  downsampleImageData,
  applyFloydSteinbergDither,
  applyAtkinsonDither,
  applyBayerDither,
  applyThresholdDither,
  ditherImageData,
  FOUR_LEVEL_GRAYSCALE,
  createImageData,
  prepareLuminanceBuffer,
  paintCutoutOutline,
  cutoutOutlineForBackground,
  portraitCropRect,
} from '../lib/dither.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('--- Testing Dithering Math & Algorithms ---');

// 1. Test Quantize Levels for 4-level grayscale
const q0 = quantizeLevels(0, 4);
const q85 = quantizeLevels(85, 4);
const q170 = quantizeLevels(170, 4);
const q255 = quantizeLevels(255, 4);

assert(q0.index === 0 && q0.value === 0, `Failed q0: ${JSON.stringify(q0)}`);
assert(q85.index === 1 && q85.value === 85, `Failed q85: ${JSON.stringify(q85)}`);
assert(q170.index === 2 && q170.value === 170, `Failed q170: ${JSON.stringify(q170)}`);
assert(q255.index === 3 && q255.value === 255, `Failed q255: ${JSON.stringify(q255)}`);

// Mid-values
const q50 = quantizeLevels(50, 4);
assert(q50.index === 1 && q50.value === 85 && q50.error === -35, `Failed q50: ${JSON.stringify(q50)}`);

console.log('✓ 4-Level Quantization math passed');

// 2. Test Luminance
const lumWhite = getLuminance(255, 255, 255);
const lumBlack = getLuminance(0, 0, 0);
assert(Math.round(lumWhite) === 255, `lumWhite is ${lumWhite}`);
assert(lumBlack === 0, `lumBlack is ${lumBlack}`);
console.log('✓ Luminance calculation passed');

// 3. Test Luminance Adjustment (Contrast, Brightness, Invert)
const lumMid = 128;
const invMid = adjustLuminance(lumMid, 0, 0, true);
assert(Math.round(invMid) === 127, `invMid is ${invMid}`);
console.log('✓ Adjustment curves passed');

// 4. Test Downsampling 4x4 -> 2x2
const src4x4 = new Uint8ClampedArray(4 * 4 * 4);
for (let i = 0; i < src4x4.length; i += 4) {
  src4x4[i] = 100;
  src4x4[i + 1] = 100;
  src4x4[i + 2] = 100;
  src4x4[i + 3] = 255;
}
const img4x4 = createImageData(src4x4, 4, 4);
const downsampled = downsampleImageData(img4x4, 2, 2);
assert(downsampled.width === 2 && downsampled.height === 2, 'Dimensions match');
assert(downsampled.data[0] === 100, `Downsample value is ${downsampled.data[0]}`);
console.log('✓ Pure downsampling passed');

// 5. Test Floyd-Steinberg, Atkinson, Bayer, and Threshold Dithering Output Constraints
const gradData = new Uint8ClampedArray(8 * 8 * 4);
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const idx = (y * 8 + x) * 4;
    const val = Math.round((x / 7) * 255);
    gradData[idx] = val;
    gradData[idx + 1] = val;
    gradData[idx + 2] = val;
    gradData[idx + 3] = 255;
  }
}
const gradImg = createImageData(gradData, 8, 8);

const paletteKey = (r, g, b) => `${r},${g},${b}`;
const allowed4Levels = new Set(FOUR_LEVEL_GRAYSCALE.map((c) => paletteKey(c.r, c.g, c.b)));
const neutral = { levels: 4, autoEnhance: false, sharpness: 0 };

assert(
  FOUR_LEVEL_GRAYSCALE[0].r === 28 &&
    FOUR_LEVEL_GRAYSCALE[0].g === 30 &&
    FOUR_LEVEL_GRAYSCALE[0].b === 38,
  'darkest swatch must be lifted off pure black'
);

// Test individual direct algorithm functions
const directResults = [
  { name: 'applyFloydSteinbergDither', res: applyFloydSteinbergDither(gradImg, neutral) },
  { name: 'applyAtkinsonDither', res: applyAtkinsonDither(gradImg, neutral) },
  { name: 'applyBayerDither', res: applyBayerDither(gradImg, neutral) },
  { name: 'applyThresholdDither', res: applyThresholdDither(gradImg, neutral) },
];

for (const { name, res } of directResults) {
  for (let i = 0; i < res.data.length; i += 4) {
    const r = res.data[i];
    const g = res.data[i + 1];
    const b = res.data[i + 2];
    assert(allowed4Levels.has(paletteKey(r, g, b)), `${name} pixel ${r},${g},${b} not in palette`);
    assert(!(r === 0 && g === 0 && b === 0), `${name} emitted pure black`);
  }
  console.log(`✓ Direct function ${name} passed`);
}

// Test via unified dispatcher
for (const algo of ['floyd-steinberg', 'atkinson', 'bayer', 'threshold']) {
  const result = ditherImageData(gradImg, { ...neutral, algorithm: algo });
  assert(result.width === 8 && result.height === 8, `${algo} dims`);

  for (let i = 0; i < result.data.length; i += 4) {
    const r = result.data[i];
    const g = result.data[i + 1];
    const b = result.data[i + 2];
    assert(allowed4Levels.has(paletteKey(r, g, b)), `${algo} pixel ${r},${g},${b} not in palette`);
  }
  console.log(`✓ Dispatcher '${algo}' passed`);
}

// Source alpha is kept. Palette a:255 must not flatten soft edges.
const soft = new Uint8ClampedArray(2 * 2 * 4);
for (let i = 0; i < 4; i++) {
  const o = i * 4;
  soft[o] = 180;
  soft[o + 1] = 180;
  soft[o + 2] = 180;
  soft[o + 3] = i === 0 ? 140 : 255;
}
const softOut = applyThresholdDither(createImageData(soft, 2, 2), neutral);
assert(softOut.data[3] === 140, `source alpha was overwritten: ${softOut.data[3]}`);
assert(softOut.data[7] === 255, 'opaque pixels stay opaque');
console.log('✓ Source alpha preserved');

// Foreground-only exposure: a few mid-gray subject pixels must not be
// stretched against a sea of transparent black.
const side = 20;
const mixed = new Uint8ClampedArray(side * side * 4);
for (let i = 0; i < side * side; i++) {
  const o = i * 4;
  mixed[o] = 255;
  mixed[o + 1] = 255;
  mixed[o + 2] = 255;
  mixed[o + 3] = 0;
}
const fg = [
  [2, 2, 40],
  [3, 2, 80],
  [4, 2, 120],
  [5, 2, 160],
  [6, 2, 200],
];
for (const [x, y, lum] of fg) {
  const o = (y * side + x) * 4;
  mixed[o] = lum;
  mixed[o + 1] = lum;
  mixed[o + 2] = lum;
  mixed[o + 3] = 255;
}
const prepared = prepareLuminanceBuffer(createImageData(mixed, side, side), {
  autoEnhance: true,
  sharpness: 0,
  contrast: 0,
  brightness: 0,
  gamma: 1,
});
const mid = prepared.lumBuffer[2 * side + 4];
assert(mid > 40, `foreground midtone was crushed to ${mid}`);
console.log('✓ Foreground-only exposure passed');

// 0.5% low anchor keeps a dark-but-not-extreme tone above the floor.
const count = 200;
const tail = new Uint8ClampedArray(count * 4);
for (let i = 0; i < count; i++) {
  const lum = i < 4 ? 8 : 150;
  const o = i * 4;
  tail[o] = lum;
  tail[o + 1] = lum;
  tail[o + 2] = lum;
  tail[o + 3] = 255;
}
tail[4 * 4] = 40;
tail[4 * 4 + 1] = 40;
tail[4 * 4 + 2] = 40;
const tailPrep = prepareLuminanceBuffer(createImageData(tail, count, 1), {
  autoEnhance: true,
  sharpness: 0,
  contrast: 0,
  brightness: 0,
  gamma: 1,
});
assert(tailPrep.lumBuffer[4] > 15, `0.5% stretch still crushed lum 40 to ${tailPrep.lumBuffer[4]}`);
console.log('✓ Soft 0.5% stretch passed');

const outlineColor = cutoutOutlineForBackground('#090a0f');
assert(outlineColor.r > 9 && outlineColor.g > 10 && outlineColor.b > 15, 'outline is lighter than the badge');
const blob = new Uint8ClampedArray(4 * 4 * 4);
const center = (1 * 4 + 1) * 4;
blob[center] = 28;
blob[center + 1] = 30;
blob[center + 2] = 38;
blob[center + 3] = 255;
const outlined = paintCutoutOutline(createImageData(blob, 4, 4), outlineColor, 1);
const above = (0 * 4 + 1) * 4;
assert(outlined.data[above] === outlineColor.r, 'outline painted above the cut-out');
assert(outlined.data[above + 3] === 255, 'outline is opaque');
assert(outlined.data[3] === 0, 'far corner stays transparent');
console.log('✓ Cut-out outline passed');

const vertical = portraitCropRect(100, 200);
assert(vertical.size === 100 && vertical.sx === 0 && vertical.sy === 15, `vertical crop ${JSON.stringify(vertical)}`);
const wide = portraitCropRect(200, 100);
assert(wide.sx === 50 && wide.sy === 0, `wide crop ${JSON.stringify(wide)}`);
console.log('✓ Portrait crop passed');

console.log('--- All Dithering Pipeline Tests Passed Successfully! ---');
