import { detect } from 'tinyld';

const LANGUAGE_FALLBACK = 'fr';

export function detectLanguage(text: string): string {
  if (!text) {
    return LANGUAGE_FALLBACK;
  }

  try {
    const detected = detect(text);
    if (detected && typeof detected === 'string' && detected.length <= 5) {
      return detected;
    }
  } catch (_error) {
    // ignore detection failure
  }

  return LANGUAGE_FALLBACK;
}
