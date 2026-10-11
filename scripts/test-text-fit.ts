import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCanvasText, toPixelFontCaps } from '../lib/text-fit.ts';
import {
  FALLBACK_BADGE_LABEL,
  FALLBACK_BUTTON_LABEL,
  GENERATING_LABEL,
  siteLimitMessage,
  visitorLimitMessage,
} from '../lib/portrait-messages.ts';

const measure = (value, scale) => value.length * 10 * scale;

test('accented capitals fold to the pixel-font latin subset', () => {
  assert.equal(toPixelFontCaps('José Muñoz'), 'JOSE MUNOZ');
  assert.equal(toPixelFontCaps('Ángel Íñiguez'), 'ANGEL INIGUEZ');
});

test('long text shrinks to 70% and then ellipsizes', () => {
  assert.deepEqual(fitCanvasText('ABCD', 50, measure), { text: 'ABCD', scale: 1 });
  assert.deepEqual(fitCanvasText('ABCDEF', 50, measure), { text: 'ABCDEF', scale: 0.7 });
  const fitted = fitCanvasText('ABCDEFGHIJKL', 50, measure);
  assert.equal(fitted.scale, 0.7);
  assert.ok(fitted.text.endsWith('…'));
  assert.ok(measure(fitted.text, 0.7) <= 50);
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
  assert.equal(FALLBACK_BADGE_LABEL, '«Versión sin IA»');
});
