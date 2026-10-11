import { readFileSync } from 'node:fs';
import {
  GB_LEAF,
  GB_LEAF_HEX,
  PIXEL_SPRITE_PLACEHOLDERS,
  buildPixelSprite,
  contrastRatio,
  formatSpriteName,
  formatSpriteType,
  percentileLinear,
  pixelRoundedContains,
  roundHalfEven,
} from '../lib/pixel-sprite.ts';
import { createImageData } from '../lib/dither.ts';
import { parseFontCmap, shapePixelText } from '../lib/pixel-font.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('--- Testing Pixel Sprite ---');

assert(GB_LEAF_HEX.length === 8, 'palette has 8 colours');
assert(GB_LEAF[0].r === 16 && GB_LEAF[0].g === 42 && GB_LEAF[0].b === 20, 'P0');
assert(GB_LEAF[1].r === 42 && GB_LEAF[1].g === 74 && GB_LEAF[1].b === 42, 'P1 lifted face black');
assert(GB_LEAF[7].r === 238 && GB_LEAF[7].g === 247 && GB_LEAF[7].b === 200, 'P7 rim');

const pairs = [
  ['name P7/P0', GB_LEAF[7], GB_LEAF[0]],
  ['LVL P6/P0', GB_LEAF[6], GB_LEAF[0]],
  ['chip P7/P2', GB_LEAF[7], GB_LEAF[2]],
  ['body P0/P7', GB_LEAF[0], GB_LEAF[7]],
  ['moves P0/P6', GB_LEAF[0], GB_LEAF[6]],
];
for (const [name, a, b] of pairs) {
  const ratio = contrastRatio(a, b);
  assert(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)} is below AA`);
  console.log(`✓ ${name} ${ratio.toFixed(2)}:1`);
}

assert(PIXEL_SPRITE_PLACEHOLDERS.moves.length === 3, 'three placeholder moves');
assert(PIXEL_SPRITE_PLACEHOLDERS.hpFill === 0.82, 'HP fill');
for (const size of [24, 16, 16, 16, 12]) {
  assert(size >= 12, 'text under 12px');
}

assert(roundHalfEven(2.5) === 2, 'half even down');
assert(roundHalfEven(3.5) === 4, 'half even up');
assert(roundHalfEven(1.2) === 1, 'ordinary round');
const sorted = [0, 10, 20, 30];
assert(percentileLinear(sorted, 0) === 0, 'p0');
assert(percentileLinear(sorted, 100) === 30, 'p100');

// Black hair on a transparent field stays at P1, never the outline colour.
const src = new Uint8ClampedArray(4 * 4 * 4);
const put = (x, y, r, g, b, a) => {
  const o = (y * 4 + x) * 4;
  src[o] = r;
  src[o + 1] = g;
  src[o + 2] = b;
  src[o + 3] = a;
};
put(1, 1, 0, 0, 0, 255);
put(2, 1, 255, 255, 255, 255);
put(1, 2, 120, 120, 120, 100); // below the 128 cut, so it is background
const sprite = buildPixelSprite(createImageData(src, 4, 4));
assert(sprite.width === 8 && sprite.height === 8, `padded size ${sprite.width}`);

const at = (x, y) => {
  const o = (y * sprite.width + x) * 4;
  return [sprite.data[o], sprite.data[o + 1], sprite.data[o + 2], sprite.data[o + 3]];
};
const blackHair = at(3, 3);
assert(
  blackHair[0] === GB_LEAF[1].r && blackHair[1] === GB_LEAF[1].g && blackHair[2] === GB_LEAF[1].b,
  `face floor ${blackHair}`
);
const white = at(4, 3);
assert(white[0] === GB_LEAF[6].r && white[3] === 255, `highlight ${white}`);
const outline = at(3, 2);
assert(outline[0] === GB_LEAF[0].r && outline[1] === GB_LEAF[0].g && outline[3] === 255, `outline ${outline}`);
const rim = at(3, 1);
assert(rim[0] === GB_LEAF[7].r && rim[1] === GB_LEAF[7].g && rim[3] === 255, `rim ${rim}`);
const outside = at(0, 0);
assert(outside[3] === 0, 'padding outside the rim stays clear');

// Foreground pixels never use the outline colour.
for (const [x, y] of [
  [1, 1],
  [2, 1],
]) {
  const px = at(x + 2, y + 2);
  const isP0 = px[0] === GB_LEAF[0].r && px[1] === GB_LEAF[0].g && px[2] === GB_LEAF[0].b;
  assert(!isP0 && px[3] === 255, `P0 leaked into the sprite at ${x},${y}: ${px}`);
}
console.log('✓ Sprite quantize, outline, and rim passed');

assert(formatSpriteName('García') === 'GARCÍA', 'uppercase keeps the accent');
assert(formatSpriteName('i\u0301') === 'Í', 'combining acute is composed');
assert(formatSpriteName('  ') === 'YOUR NAME', 'empty name placeholder');
assert(formatSpriteType('Data Engineer') === 'DATA ENGINEER', 'type chip');
assert(formatSpriteType('ingeniería') === 'INGENIERÍA', 'type chip accent');

const asciiOnly = (cp) => cp < 128;
const shaped = shapePixelText('GARCÍA', asciiOnly);
assert(shaped.map((g) => g.source).join('') === 'GARCÍA', 'shaper keeps every source character');
const accent = shaped.find((g) => g.source === 'Í');
assert(accent && accent.char === 'I' && accent.accent === 'acute', 'missing Í falls back to I + acute');
const native = shapePixelText('GARCÍA', () => true);
assert(native.every((g) => !g.accent), 'present glyphs are not double-marked');
assert(native.map((g) => g.char).join('') === 'GARCÍA', 'native string is intact');
console.log('✓ Accent fallback passed');

const font = readFileSync(new URL('../public/fonts/PressStart2P-Regular.ttf', import.meta.url));
const cmap = parseFontCmap(font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength));
for (const ch of ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ', 'Ü']) {
  assert(cmap.has(ch.codePointAt(0)), `Press Start 2P is missing ${ch}`);
}
console.log('✓ Vendored Press Start 2P includes Spanish accents');

// Corners sampled from the 640×960 reference. Canvas arcTo antialiases these.
const outer = (x, y) => pixelRoundedContains(x, y, 0, 0, 640, 960, 32);
const bezel = (x, y) => pixelRoundedContains(x, y, 8, 8, 624, 944, 24);
const face = (x, y) => pixelRoundedContains(x, y, 20, 20, 600, 920, 16);
assert(!outer(0, 0) && !outer(24, 0) && !outer(639, 0) && !outer(0, 959), 'outer corner stays clear');
assert(outer(10, 10) && !bezel(10, 10), 'outer ring');
assert(bezel(18, 18) && !face(18, 18), 'bezel ring');
assert(face(28, 28) && face(320, 28), 'card face');
assert(!bezel(8, 8) && !face(20, 20), 'ring insets');
console.log('✓ Rounded frame matches the reference corners');

console.log('--- All Pixel Sprite Tests Passed ---');
