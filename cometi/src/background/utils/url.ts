export function isHttpProtocol(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch (_error) {
    return url;
  }
}
