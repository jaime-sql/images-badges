/**
 * Browser client for POST /portrait.
 * The API key stays on the Worker. This module only knows the public URL.
 */

import { siteLimitMessage, visitorLimitMessage } from './portrait-messages';

export interface PortraitSuccess {
  ok: true;
  blob: Blob;
  mock: boolean;
}

export interface PortraitFailure {
  ok: false;
  status: number;
  error: string;
  messageEs: string;
  messageEn: string;
  limit?: number;
}

export async function requestAiPortrait(apiUrl: string, pngBlob: Blob): Promise<PortraitSuccess | PortraitFailure> {
  if (pngBlob.size > 4 * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      error: 'too_large',
      messageEs: 'La foto supera 4 MB. Prueba con una imagen más pequeña o usa la versión sin IA.',
      messageEn: 'The photo is over 4 MB. Try a smaller image or use the version without AI.',
    };
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: pngBlob,
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'network',
      messageEs: 'No se pudo contactar el servicio de retrato.',
      messageEn: 'The portrait service could not be reached.',
    };
  }

  if (!response.ok) {
    let payload: { error?: string; message_es?: string; message_en?: string; limit?: number } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    const limit = typeof payload.limit === 'number' ? payload.limit : undefined;
    if (payload.error === 'visitor_limit') {
      const message = visitorLimitMessage(limit ?? 5);
      return {
        ok: false,
        status: response.status,
        error: 'visitor_limit',
        messageEs: payload.message_es || message.es,
        messageEn: payload.message_en || message.en,
        limit,
      };
    }
    if (payload.error === 'site_limit') {
      const message = siteLimitMessage();
      return {
        ok: false,
        status: response.status,
        error: 'site_limit',
        messageEs: payload.message_es || message.es,
        messageEn: payload.message_en || message.en,
        limit,
      };
    }
    return {
      ok: false,
      status: response.status,
      error: payload.error || 'upstream',
      messageEs: payload.message_es || 'El retrato con IA no está disponible.',
      messageEn: payload.message_en || 'The AI portrait is unavailable.',
    };
  }

  const blob = await response.blob();
  const mock = response.headers.get('X-Portrait-Mock') === '1';
  return { ok: true, blob, mock };
}
