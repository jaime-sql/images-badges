/**
 * One Durable Object holds the site counter and a key per visitor IP hash.
 * storage.transaction reserves a slot before OpenAI is called, so parallel
 * requests cannot all read the same count and slip past the cap.
 *
 * A failed OpenAI call releases that reservation. Mock mode and a successful
 * image keep it.
 */

export type QuotaDecision = 'ok' | 'visitor_limit' | 'site_limit';

export interface QuotaRequest {
  op: 'reserve' | 'release';
  ipHash: string;
  day: string;
  ipLimit: number;
  siteLimit: number;
}

interface QuotaTxn {
  get(key: string): Promise<unknown>;
  put(key: string, value: number): Promise<void>;
}

interface QuotaStorage {
  transaction<T>(closure: (txn: QuotaTxn) => Promise<T>): Promise<T>;
}

function countOf(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function ipKey(ipHash: string, day: string): string {
  return `ip:${ipHash}:${day}`;
}

export function siteKey(day: string): string {
  return `site:${day}`;
}

export async function reserveQuota(
  storage: QuotaStorage,
  request: QuotaRequest
): Promise<QuotaDecision> {
  return storage.transaction(async (txn) => {
    const ip = countOf(await txn.get(ipKey(request.ipHash, request.day)));
    const site = countOf(await txn.get(siteKey(request.day)));
    if (ip >= request.ipLimit) return 'visitor_limit';
    if (site >= request.siteLimit) return 'site_limit';
    await txn.put(ipKey(request.ipHash, request.day), ip + 1);
    await txn.put(siteKey(request.day), site + 1);
    return 'ok';
  });
}

/** Give back a slot that was reserved and then not used. Counts never go below zero. */
export async function releaseQuota(storage: QuotaStorage, request: QuotaRequest): Promise<void> {
  await storage.transaction(async (txn) => {
    const ip = countOf(await txn.get(ipKey(request.ipHash, request.day)));
    const site = countOf(await txn.get(siteKey(request.day)));
    if (ip > 0) await txn.put(ipKey(request.ipHash, request.day), ip - 1);
    if (site > 0) await txn.put(siteKey(request.day), site - 1);
  });
}

/**
 * Single `quota` object. Callers key it with idFromName('quota') and pass the UTC day in the body.
 */
export class PortraitQuota {
  private readonly storage: QuotaStorage;

  constructor(ctx: { storage: QuotaStorage }, _env: unknown) {
    this.storage = ctx.storage;
  }

  async fetch(request: Request): Promise<Response> {
    let body: QuotaRequest;
    try {
      body = (await request.json()) as QuotaRequest;
    } catch {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
    if (!body || (body.op !== 'reserve' && body.op !== 'release') || !body.ipHash || !body.day) {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
    if (body.op === 'release') {
      await releaseQuota(this.storage, body);
      return Response.json({ ok: true });
    }
    const result = await reserveQuota(this.storage, body);
    return Response.json({ result });
  }
}
