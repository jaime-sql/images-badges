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
} from '../lib/dither.ts';

console.log('--- Testing Dithering Math & Algorithms ---');

// 1. Test Quantize Levels for 4-level grayscale
const q0 = quantizeLevels(0, 4);
const q85 = quantizeLevels(85, 4);
const q170 = quantizeLevels(170, 4);
const q255 = quantizeLevels(255, 4);

console.assert(q0.index === 0 && q0.value === 0, `Failed q0: ${JSON.stringify(q0)}`);
console.assert(q85.index === 1 && q85.value === 85, `Failed q85: ${JSON.stringify(q85)}`);
console.assert(q170.index === 2 && q170.value === 170, `Failed q170: ${JSON.stringify(q170)}`);
console.assert(q255.index === 3 && q255.value === 255, `Failed q255: ${JSON.stringify(q255)}`);

// Mid-values
const q50 = quantizeLevels(50, 4);
console.assert(q50.index === 1 && q50.value === 85 && q50.error === -35, `Failed q50: ${JSON.stringify(q50)}`);

console.log('✓ 4-Level Quantization math passed');

// 2. Test Luminance
const lumWhite = getLuminance(255, 255, 255);
const lumBlack = getLuminance(0, 0, 0);
console.assert(Math.round(lumWhite) === 255, `lumWhite is ${lumWhite}`);
console.assert(lumBlack === 0, `lumBlack is ${lumBlack}`);
console.log('✓ Luminance calculation passed');

// 3. Test Luminance Adjustment (Contrast, Brightness, Invert)
const lumMid = 128;
const invMid = adjustLuminance(lumMid, 0, 0, true);
console.assert(Math.round(invMid) === 127, `invMid is ${invMid}`);
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
console.assert(downsampled.width === 2 && downsampled.height === 2, 'Dimensions match');
console.assert(downsampled.data[0] === 100, `Downsample value is ${downsampled.data[0]}`);
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

const allowed4Levels = new Set(FOUR_LEVEL_GRAYSCALE.map((c) => c.r));

// Test individual direct algorithm functions
const directResults = [
  { name: 'applyFloydSteinbergDither', res: applyFloydSteinbergDither(gradImg, { levels: 4 }) },
  { name: 'applyAtkinsonDither', res: applyAtkinsonDither(gradImg, { levels: 4 }) },
  { name: 'applyBayerDither', res: applyBayerDither(gradImg, { levels: 4 }) },
  { name: 'applyThresholdDither', res: applyThresholdDither(gradImg, { levels: 4 }) },
];

for (const { name, res } of directResults) {
  for (let i = 0; i < res.data.length; i += 4) {
    const r = res.data[i];
    const g = res.data[i + 1];
    const b = res.data[i + 2];
    console.assert(allowed4Levels.has(r), `${name} pixel R=${r} not in 4 levels`);
    console.assert(r === g && g === b, `${name} pixel not grayscale`);
  }
  console.log(`✓ Direct function ${name} passed`);
}

// Test via unified dispatcher
for (const algo of ['floyd-steinberg', 'atkinson', 'bayer', 'threshold'] as const) {
  const result = ditherImageData(gradImg, { algorithm: algo, levels: 4 });
  console.assert(result.width === 8 && result.height === 8, `${algo} dims`);

  for (let i = 0; i < result.data.length; i += 4) {
    const r = result.data[i];
    const g = result.data[i + 1];
    const b = result.data[i + 2];
    console.assert(allowed4Levels.has(r), `${algo} pixel R=${r} not in 4 levels`);
    console.assert(r === g && g === b, `${algo} pixel not grayscale`);
  }
  console.log(`✓ Dispatcher '${algo}' passed`);
}

console.log('--- All Dithering Pipeline Tests Passed Successfully! ---');
