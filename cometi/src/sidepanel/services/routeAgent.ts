export type RouteVariant = {
  durationMin: number;
  distanceKm?: number;
  text?: string;
  mode?: string;
  modeLabel?: string;
};
export type RouteComputeResult = { routes: RouteVariant[]; best: RouteVariant | null };

type BgResponse = { ok: boolean; result?: RouteComputeResult; error?: string };

export async function computeFastestRouteViaBackground(params: {
  origin: string;
  destination: string;
  language?: string;
  mode?: string;
}): Promise<RouteComputeResult> {
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
    throw new Error('Commande disponible uniquement dans Chrome.');
  }
  return new Promise<RouteComputeResult>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'route:compute', payload: params }, (response?: BgResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Runtime error'));
        return;
      }
      if (!response?.ok || !response.result) {
        reject(new Error(response?.error ?? 'Échec du calcul de trajet.'));
        return;
      }
      resolve(response.result);
    });
  });
}

