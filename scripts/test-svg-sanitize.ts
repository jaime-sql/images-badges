import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSvgMarkup } from '../lib/svg-sanitize.ts';

test('svg sanitizer removes scripts, handlers, and external refs', () => {
  const dirty = `
    <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div onclick="alert(2)">x</div></foreignObject>
      <image href="https://evil.example/a.png" />
      <rect width="10" height="10" fill="black" />
    </svg>
  `;
  const clean = sanitizeSvgMarkup(dirty);
  assert.equal(/<script/i.test(clean), false);
  assert.equal(/onload/i.test(clean), false);
  assert.equal(/foreignObject/i.test(clean), false);
  assert.equal(/https:\/\/evil/.test(clean), false);
  assert.match(clean, /<svg/i);
  assert.match(clean, /<rect/i);
});

test('svg sanitizer rejects entity payloads', () => {
  assert.throws(() => sanitizeSvgMarkup('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'));
});
