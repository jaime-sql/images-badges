/**
 * Copy for the pixel-portrait flow.
 * Spanish is what the badge UI shows. English is the equivalent for the API and a secondary line.
 */

export interface BilingualMessage {
  es: string;
  en: string;
}

export function visitorLimitMessage(limit: number): BilingualMessage {
  return {
    es: `Ya usaste tus ${limit} retratos de hoy. Vuelve mañana o usa la versión sin IA.`,
    en: `You've used your ${limit} portraits for today. Come back tomorrow or use the version without AI.`,
  };
}

export function siteLimitMessage(): BilingualMessage {
  return {
    es: 'Hoy se alcanzó el límite de retratos con IA. Usa la versión sin IA.',
    en: "Today's AI portrait limit has been reached. Use the version without AI.",
  };
}

export const FALLBACK_BUTTON_LABEL = 'Usar versión sin IA';
export const GENERATING_LABEL = 'Creando tu retrato…';
/** Small label drawn on the card when the browser fallback produced the portrait. */
export const FALLBACK_BADGE_LABEL = 'Versión sin IA';
