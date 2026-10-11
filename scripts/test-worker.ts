import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  handlePortrait,
  resolveModel,
  resolveQuality,
  parsePositiveInt,
  isAllowedOrigin,
  PORTRAIT_PROMPT,
} from '../worker/src/index.ts';
import { PortraitQuota } from '../worker/src/quota.ts';
import { encodeGrayPng, mockPortraitPng } from '../worker/src/png.ts';

function lockingStorage(cells) {
  let tail = Promise.resolve();
  return {
    transaction(fn) {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      return previous.then(async () => {
        try {
          return await fn({
            async get(key) {
              await Promise.resolve();
              return cells.has(key) ? cells.get(key) : undefined;
            },
            async put(key, value) {
              await Promise.resolve();
              cells.set(key, value);
            },
          });
        } finally {
          release();
        }
      });
    },
  };
}

function pngRequest(ip, origin, bytes = mockPortraitPng()) {
  return new Request('https://portrait.example/portrait', {
    method: 'POST',
    headers: {
      'content-type': 'image/png',
      'cf-connecting-ip': ip,
      origin,
    },
    body: bytes,
  });
}

function envWith(overrides = {}) {
  const quotaCells = new Map();
  const quota = new PortraitQuota({ storage: lockingStorage(quotaCells) }, {});
  return {
    PORTRAIT_QUOTA: {
      idFromName() {
        return 'quota';
      },
      get() {
        return {
          fetch(input, init) {
            return quota.fetch(new Request(input, init));
          },
        };
      },
    },
    quotaCells,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_IMAGE_MODEL: 'gpt-image-1',
    OPENAI_IMAGE_QUALITY: 'low',
    PER_IP_DAILY_LIMIT: '5',
    SITE_DAILY_LIMIT: '50',
    ...overrides,
  };
}

test('prompt, model, quality, and production config', () => {
  assert.equal(
    PORTRAIT_PROMPT,
    'pixel art portrait, same person, grayscale, clean 1px outlines, cel shading, cartoon face, plain background'
  );
  assert.equal(resolveModel(undefined), 'gpt-image-1');
  assert.equal(resolveModel('gpt-image-1-mini'), 'gpt-image-1-mini');
  assert.equal(resolveModel('gpt-4'), 'gpt-image-1');
  assert.equal(resolveQuality(undefined), 'low');
  assert.equal(resolveQuality('medium'), 'medium');
  assert.equal(resolveQuality('ultra'), 'low');
  assert.equal(parsePositiveInt(undefined, 5), 5);
  assert.equal(parsePositiveInt('7', 5), 7);
  assert.equal(isAllowedOrigin('https://jaime-sql.github.io', false), true);
  assert.equal(isAllowedOrigin('http://localhost:3000', false), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', true), true);
  assert.equal(isAllowedOrigin('https://evil.example', true), false);

  const toml = readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
  assert.equal(/MOCK_OPENAI/.test(toml), false);
  assert.match(toml, /PER_IP_DAILY_LIMIT = "5"/);
  assert.match(toml, /SITE_DAILY_LIMIT = "50"/);
  assert.match(toml, /OPENAI_IMAGE_QUALITY = "low"/);
  assert.match(toml, /OPENAI_IMAGE_MODEL = "gpt-image-1"/);
  assert.equal(/kv_namespaces/.test(toml), false);
  assert.equal(/00000000000000000000000000000000/.test(toml), false);
  assert.match(toml, /name = "PORTRAIT_QUOTA"/);
  assert.match(toml, /class_name = "PortraitQuota"/);
  assert.match(toml, /new_sqlite_classes = \["PortraitQuota"\]/);
});

test('mock mode returns a png and never calls OpenAI', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('OpenAI must not be called');
  };
  try {
    const env = envWith({ MOCK_OPENAI: 'true', OPENAI_API_KEY: undefined });
    const response = await handlePortrait(pngRequest('198.51.100.10', 'https://evil.example'), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Portrait-Mock'), '1');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes[0], 137);
    assert.equal(bytes[1], 80);
    assert.equal(calls, 0);
    assert.equal([...env.quotaCells.values()].includes(1), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('visitor and site caps return 429 in ES and EN and do not call OpenAI', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('OpenAI must not be called');
  };
  try {
    const env = envWith({ PER_IP_DAILY_LIMIT: '2', SITE_DAILY_LIMIT: '3', MOCK_OPENAI: 'true' });
    const first = await handlePortrait(pngRequest('203.0.113.8', 'https://jaime-sql.github.io'), env);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Access-Control-Allow-Origin'), 'https://jaime-sql.github.io');

    await handlePortrait(pngRequest('203.0.113.8', 'https://evil.example'), env);
    const third = await handlePortrait(pngRequest('203.0.113.8', 'https://evil.example'), env);
    assert.equal(third.status, 429);
    const body = await third.json();
    assert.equal(body.error, 'visitor_limit');
    assert.equal(body.limit, 2);
    assert.equal(body.message_es, 'Ya usaste tus 2 retratos de hoy. Vuelve mañana o usa la versión sin IA.');
    assert.match(body.message_en, /2/);
    assert.equal(calls, 0);

    const other = envWith({ PER_IP_DAILY_LIMIT: '5', SITE_DAILY_LIMIT: '1', MOCK_OPENAI: 'true' });
    await handlePortrait(pngRequest('203.0.113.9', 'https://nope.example'), other);
    const blocked = await handlePortrait(pngRequest('198.51.100.22', 'https://jaime-sql.github.io'), other);
    assert.equal(blocked.status, 429);
    const siteBody = await blocked.json();
    assert.equal(siteBody.error, 'site_limit');
    assert.equal(siteBody.message_es, 'Hoy se alcanzó el límite de retratos con IA. Usa la versión sin IA.');
    assert.match(siteBody.message_en, /without AI/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('oversized and non-png uploads never call OpenAI', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('OpenAI must not be called');
  };
  try {
    const env = envWith();
    const huge = new Request('https://portrait.example/portrait', {
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'content-length': String(5 * 1024 * 1024),
        'cf-connecting-ip': '203.0.113.4',
        origin: 'https://jaime-sql.github.io',
      },
      body: encodeGrayPng(1, 1, new Uint8Array([0])),
    });
    const tooBig = await handlePortrait(huge, env);
    assert.equal(tooBig.status, 413);
    assert.equal(env.quotaCells.size, 0);

    const text = new Request('https://portrait.example/portrait', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.4', origin: 'https://jaime-sql.github.io' },
      body: 'hello',
    });
    const rejected = await handlePortrait(text, env);
    assert.equal(rejected.status, 415);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('a real generation sends one 1024 image at low quality and logs usage', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  const png = mockPortraitPng();
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const form = init.body;
    assert.equal(form.get('model'), 'gpt-image-1-mini');
    assert.equal(form.get('quality'), 'low');
    assert.equal(form.get('size'), '1024x1024');
    assert.equal(form.get('n'), '1');
    assert.equal(form.get('prompt'), PORTRAIT_PROMPT);
    return new Response(
      JSON.stringify({
        data: [{ b64_json: Buffer.from(png).toString('base64') }],
        usage: { input_tokens: 80, output_tokens: 272 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  try {
    const env = envWith({ OPENAI_IMAGE_MODEL: 'gpt-image-1-mini' });
    const response = await handlePortrait(
      pngRequest('203.0.113.50', 'http://localhost:3000'),
      env
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Portrait-Mock'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    const devEnv = envWith({ OPENAI_IMAGE_MODEL: 'gpt-image-1-mini', DEV: 'true' });
    const devResponse = await handlePortrait(
      pngRequest('203.0.113.51', 'http://localhost:3000'),
      devEnv
    );
    assert.equal(devResponse.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    const joined = logs.join('\n');
    assert.match(joined, /"input_tokens":80/);
    assert.match(joined, /"output_tokens":272/);
  } finally {
    globalThis.fetch = original;
    console.log = originalLog;
  }
});

test('localhost preflight is refused unless DEV is set', async () => {
  const denied = await handlePortrait(
    new Request('https://portrait.example/portrait', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    }),
    envWith()
  );
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);

  const allowed = await handlePortrait(
    new Request('https://portrait.example/portrait', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    }),
    envWith({ DEV: 'true' })
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
});

test('20 concurrent requests against a cap of 5 succeed exactly 5 times', async () => {
  const env = envWith({ PER_IP_DAILY_LIMIT: '5', SITE_DAILY_LIMIT: '50', MOCK_OPENAI: 'true' });
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      handlePortrait(pngRequest('203.0.113.77', 'https://jaime-sql.github.io'), env)
    )
  );
  const statuses = await Promise.all(responses.map(async (response) => response.status));
  assert.equal(statuses.filter((status) => status === 200).length, 5);
  assert.equal(statuses.filter((status) => status === 429).length, 15);
});

test('a failed OpenAI call releases the reserved slot', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('upstream', { status: 500 });
  try {
    const env = envWith({ PER_IP_DAILY_LIMIT: '1', SITE_DAILY_LIMIT: '50' });
    const first = await handlePortrait(pngRequest('203.0.113.80', 'https://jaime-sql.github.io'), env);
    assert.equal(first.status, 502);
    const second = await handlePortrait(pngRequest('203.0.113.80', 'https://jaime-sql.github.io'), env);
    assert.equal(second.status, 502);
    const body = await second.json();
    assert.equal(body.error, 'upstream');
  } finally {
    globalThis.fetch = original;
  }
});
