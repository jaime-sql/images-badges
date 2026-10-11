/**
 * POST /portrait
 * Accepts a cut-out PNG, calls the OpenAI Images edit API, and returns a PNG.
 * The API key is a Worker secret. Images are not stored. There is no sign-in.
 */

import { siteLimitMessage, visitorLimitMessage } from '../../lib/portrait-messages';
import { mockPortraitPng } from './png';
import { PortraitQuota, type QuotaDecision, type QuotaRequest } from './quota';

export { PortraitQuota };

export const PORTRAIT_PROMPT =
  'pixel art portrait, same person, grayscale, clean 1px outlines, cel shading, cartoon face, plain background';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_ORIGIN = 'https://jaime-sql.github.io';
export const DEV_ORIGIN = 'http://localhost:3000';
const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits';

export interface PortraitQuotaNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

export interface PortraitEnv {
  PORTRAIT_QUOTA: PortraitQuotaNamespace;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_IMAGE_QUALITY?: string;
  PER_IP_DAILY_LIMIT?: string;
  SITE_DAILY_LIMIT?: string;
  MOCK_OPENAI?: string;
  DEV?: string;
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function resolveModel(value: string | undefined): 'gpt-image-1' | 'gpt-image-1-mini' {
  const model = (value || '').trim();
  if (model === 'gpt-image-1') return 'gpt-image-1';
  return 'gpt-image-1-mini';
}

export function resolveQuality(value: string | undefined): 'low' | 'medium' | 'high' {
  const quality = (value || '').trim().toLowerCase();
  if (quality === 'medium' || quality === 'high') return quality;
  return 'low';
}

export function isTruthyFlag(value: string | undefined): boolean {
  return (value || '').trim().toLowerCase() === 'true';
}

export function isAllowedOrigin(origin: string | null, dev: boolean): boolean {
  if (!origin) return false;
  if (origin === ALLOWED_ORIGIN) return true;
  return dev && origin === DEV_ORIGIN;
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

function corsHeaders(origin: string | null, dev: boolean): Headers {
  const headers = new Headers();
  headers.set('Vary', 'Origin');
  if (isAllowedOrigin(origin, dev)) {
    headers.set('Access-Control-Allow-Origin', origin as string);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Expose-Headers', 'X-Portrait-Mock');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function withCors(response: Response, cors: Headers): Response {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function pngResponse(bytes: Uint8Array, mock: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store',
  });
  if (mock) headers.set('X-Portrait-Mock', '1');
  return new Response(bytes, { status: 200, headers });
}

async function readBody(request: Request): Promise<{ bytes: Uint8Array } | { error: Response }> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_UPLOAD_BYTES) {
    return {
      error: jsonResponse(413, {
        error: 'too_large',
        message_es: 'La imagen supera 4 MB.',
        message_en: 'The image is larger than 4 MB.',
      }),
    };
  }

  if (!request.body) {
    return {
      error: jsonResponse(400, {
        error: 'empty',
        message_es: 'Falta la imagen PNG.',
        message_en: 'The PNG image is missing.',
      }),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return {
        error: jsonResponse(413, {
          error: 'too_large',
          message_es: 'La imagen supera 4 MB.',
          message_en: 'The image is larger than 4 MB.',
        }),
      };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  );
}

interface OpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
}

async function callOpenAi(
  env: PortraitEnv,
  pngBytes: Uint8Array
): Promise<{ bytes: Uint8Array; usage: OpenAiUsage }> {
  const model = resolveModel(env.OPENAI_IMAGE_MODEL);
  const quality = resolveQuality(env.OPENAI_IMAGE_QUALITY);
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', PORTRAIT_PROMPT);
  form.set('size', '1024x1024');
  form.set('quality', quality);
  form.set('n', '1');
  form.set('output_format', 'png');
  form.set('image', new Blob([pngBytes], { type: 'image/png' }), 'portrait.png');

  const response = await fetch(OPENAI_EDITS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    console.error(JSON.stringify({ message: 'openai_image_error', status: response.status, model, quality }));
    throw new Error(`openai_${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: { b64_json?: string }[];
    usage?: OpenAiUsage;
  };
  const usage = payload.usage ?? {};
  console.log(
    JSON.stringify({
      message: 'openai_image_usage',
      model,
      quality,
      size: '1024x1024',
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
    })
  );

  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error('openai_empty');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, usage };
}

const QUOTA_OBJECT_NAME = 'quota';

function limitResponse(decision: QuotaDecision, env: PortraitEnv): Response | null {
  if (decision === 'ok') return null;
  if (decision === 'visitor_limit') {
    const ipLimit = parsePositiveInt(env.PER_IP_DAILY_LIMIT, 5);
    const message = visitorLimitMessage(ipLimit);
    return jsonResponse(429, {
      error: 'visitor_limit',
      limit: ipLimit,
      message_es: message.es,
      message_en: message.en,
    });
  }
  const siteLimit = parsePositiveInt(env.SITE_DAILY_LIMIT, 50);
  const message = siteLimitMessage();
  return jsonResponse(429, {
    error: 'site_limit',
    limit: siteLimit,
    message_es: message.es,
    message_en: message.en,
  });
}

async function quotaFetch(env: PortraitEnv, body: QuotaRequest): Promise<QuotaDecision> {
  const id = env.PORTRAIT_QUOTA.idFromName(QUOTA_OBJECT_NAME);
  const stub = env.PORTRAIT_QUOTA.get(id);
  const response = await stub.fetch('https://quota.internal/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (body.op === 'release') return 'ok';
  const payload = (await response.json()) as { result?: QuotaDecision };
  return payload.result ?? 'visitor_limit';
}

export async function handlePortrait(request: Request, env: PortraitEnv): Promise<Response> {
  const url = new URL(request.url);
  const dev = isTruthyFlag(env.DEV);
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, dev);

  if (url.pathname !== '/portrait' && url.pathname !== '/portrait/') {
    return withCors(jsonResponse(404, { error: 'not_found' }), cors);
  }

  if (request.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), cors);
  }

  if (request.method !== 'POST') {
    return withCors(
      jsonResponse(405, {
        error: 'method',
        message_es: 'Usa POST /portrait.',
        message_en: 'Use POST /portrait.',
      }),
      cors
    );
  }

  const body = await readBody(request);
  if ('error' in body) return withCors(body.error, cors);
  if (!isPng(body.bytes)) {
    return withCors(
      jsonResponse(415, {
        error: 'not_png',
        message_es: 'La imagen tiene que ser un PNG.',
        message_en: 'The image must be a PNG.',
      }),
      cors
    );
  }

  const mock = isTruthyFlag(env.MOCK_OPENAI);
  if (!mock && !env.OPENAI_API_KEY) {
    return withCors(
      jsonResponse(500, {
        error: 'unconfigured',
        message_es: 'El retrato con IA no está configurado.',
        message_en: 'The AI portrait is not configured.',
      }),
      cors
    );
  }

  const ipHash = await hashIp(clientIp(request));
  const day = utcDay();
  const quotaBody: QuotaRequest = {
    op: 'reserve',
    ipHash,
    day,
    ipLimit: parsePositiveInt(env.PER_IP_DAILY_LIMIT, 5),
    siteLimit: parsePositiveInt(env.SITE_DAILY_LIMIT, 50),
  };
  const reserved = await quotaFetch(env, quotaBody);
  const limited = limitResponse(reserved, env);
  if (limited) return withCors(limited, cors);

  if (mock) {
    return withCors(pngResponse(mockPortraitPng(), true), cors);
  }

  try {
    const result = await callOpenAi(env, body.bytes);
    return withCors(pngResponse(result.bytes, false), cors);
  } catch (error) {
    try {
      await quotaFetch(env, { ...quotaBody, op: 'release' });
    } catch (releaseError) {
      console.error(
        JSON.stringify({
          message: 'quota_release_failed',
          error: releaseError instanceof Error ? releaseError.message : 'unknown',
        })
      );
    }
    console.error(
      JSON.stringify({
        message: 'portrait_failed',
        error: error instanceof Error ? error.message : 'unknown',
      })
    );
    return withCors(
      jsonResponse(502, {
        error: 'upstream',
        message_es: 'No se pudo crear el retrato con IA.',
        message_en: 'The AI portrait could not be created.',
      }),
      cors
    );
  }
}

type WorkerEnv = Env & PortraitEnv;

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handlePortrait(request, env);
  },
} satisfies ExportedHandler<WorkerEnv>;
