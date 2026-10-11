import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitCanvasText } from '../lib/text-fit.ts';
import {
  EVENT_BADGE_HEIGHT,
  FALLBACK_LABEL_SIZE,
  demoTagBox,
  eventCardMetrics,
  PANEL_BORDER,
} from '../lib/event-badge.ts';
import { configurePixelFont, pixelFontHasGlyph, shapePixelText } from '../lib/pixel-font.ts';
import {
  FALLBACK_BADGE_LABEL,
  FALLBACK_BUTTON_LABEL,
  GENERATING_LABEL,
  siteLimitMessage,
  visitorLimitMessage,
} from '../lib/portrait-messages.ts';

const measure = (value, scale) => value.length * 10 * scale;

test('capital accents stay as a full-height letter plus a pixel mark', () => {
  const file = readFileSync(new URL('../public/fonts/PressStart2P-Regular.ttf', import.meta.url));
  const copy = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  configurePixelFont(copy);
  const shaped = shapePixelText('JOSÉ MUÑOZ', pixelFontHasGlyph);
  const acute = shaped.find((glyph) => glyph.source === 'É');
  const tilde = shaped.find((glyph) => glyph.source === 'Ñ');
  assert.ok(acute);
  assert.ok(tilde);
  assert.equal(acute.char, 'E');
  assert.equal(acute.accent, 'acute');
  assert.equal(tilde.char, 'N');
  assert.equal(tilde.accent, 'tilde');
  assert.equal(shaped.map((glyph) => glyph.source).join(''), 'JOSÉ MUÑOZ');
});

test('long text shrinks to 70% and then ellipsizes', () => {
  assert.deepEqual(fitCanvasText('ABCD', 50, measure), { text: 'ABCD', scale: 1 });
  assert.deepEqual(fitCanvasText('ABCDEF', 50, measure), { text: 'ABCDEF', scale: 0.7 });
  const fitted = fitCanvasText('ABCDEFGHIJKL', 50, measure);
  assert.equal(fitted.scale, 0.7);
  assert.ok(fitted.text.endsWith('…'));
  assert.ok(measure(fitted.text, 0.7) <= 50);
});

test('name and role sit on the footer band with a bordered portrait panel', () => {
  for (const fallback of [false, true]) {
    const metrics = eventCardMetrics(fallback);
    assert.equal(metrics.panelW > 400, true);
    assert.equal(metrics.panelH > 400, true);
    assert.equal(PANEL_BORDER, 2);
    const roleGap = metrics.bottomBandY - metrics.roleBaseline;
    assert.ok(roleGap > 8 && roleGap < 40, `footer gap ${roleGap}`);
    assert.ok(metrics.nameY + 26 < metrics.roleBaseline);
    assert.ok(metrics.panelY + metrics.panelH <= metrics.nameY);
    assert.ok(metrics.bottomBandY + 76 <= EVENT_BADGE_HEIGHT);
  }
  assert.ok(FALLBACK_LABEL_SIZE >= 12);
});

test('DEMO tag sits in the portrait top-right, off the face', () => {
  const portraitX = 40;
  const portraitY = 120;
  const side = 500;
  const box = demoTagBox(portraitX, portraitY, side);
  assert.ok(box.x > portraitX + side * 0.6);
  assert.ok(box.x + box.w <= portraitX + side);
  assert.ok(box.y >= portraitY);
  assert.ok(box.y + box.h < portraitY + side * 0.25);
});

test('limit and fallback copy', () => {
  assert.equal(
    visitorLimitMessage(5).es,
    'Ya usaste tus 5 retratos de hoy. Vuelve mañana o usa la versión sin IA.'
  );
  assert.equal(
    visitorLimitMessage(8).es,
    'Ya usaste tus 8 retratos de hoy. Vuelve mañana o usa la versión sin IA.'
  );
  assert.match(visitorLimitMessage(5).en, /5/);
  assert.equal(siteLimitMessage().es, 'Hoy se alcanzó el límite de retratos con IA. Usa la versión sin IA.');
  assert.equal(FALLBACK_BUTTON_LABEL, 'Usar versión sin IA');
  assert.equal(GENERATING_LABEL, 'Creando tu retrato…');
  assert.equal(FALLBACK_BADGE_LABEL, 'Versión sin IA');
  assert.doesNotMatch(FALLBACK_BADGE_LABEL, /[«»]/);
});
