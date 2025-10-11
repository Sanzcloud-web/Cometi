import type { ChatCompletionMessage } from './types';
import { createChatCompletion } from './network/chatCompletion';
import { handleResumeCommand, buildResumeContext } from './orchestration/resumeCommand';
import { isHttpProtocol, normalizeUrl } from './utils/url';
import { getActiveHttpTab } from './network/getActiveTab';

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');

async function logToBackend(scope: string, level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  if (!API_BASE) {
    // eslint-disable-next-line no-console
    (console[level] || console.log)(`[${scope}] ${message}`, data ?? '');
    return;
  }
  try {
    await fetch(`${API_BASE}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, level, message, data }),
    });
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
    });
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Erreur lors de la configuration du panneau latéral :', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'chat:complete') {
    void handleChatCompletion(message)
      .then((assistantMessage) => {
        sendResponse({ message: assistantMessage });
      })
      .catch((error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : 'Erreur inattendue lors de la requête serveur.',
        });
      });
    return true;
  }

  if (message?.type === 'commands:resume') {
    void handleResumeCommand()
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Échec inattendu de la commande /resume.',
        });
      });
    return true;
  }

  // Collect DOM fields (origin/destination/waypoints candidates)
  if (message?.type === 'dom:collect-fields') {
    void collectDomFields()
      .then((items) => {
        sendResponse({ ok: true, items });
      })
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Échec de collecte DOM.' });
      });
    return true;
  }

  if (message?.type === 'route:compute') {
    const { origin, destination, language, mode, url } = message.payload ?? {};
    void computeFastestRoute({ origin, destination, language, mode, url })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Échec du calcul de trajet.' });
      });
    return true;
  }

  if (message?.type === 'commands:resume:context') {
    void buildResumeContext()
      .then((payload) => {
        sendResponse({ ok: true, payload });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Échec inattendu lors de la récupération du contexte /resume.',
        });
      });
    return true;
  }

  return undefined;
});

async function handleChatCompletion(message: { payload: { messages: ChatCompletionMessage[]; chatId?: string } }): Promise<string> {
  return createChatCompletion(message.payload.messages, { chatId: message.payload.chatId });
}

type DomFieldFeature = {
  id: string;
  tag?: string;
  type?: string;
  placeholder?: string;
  aria?: string[];
  labelNearby?: string;
  parentText?: string;
  x?: number;
  y?: number;
};

async function collectDomFields(): Promise<DomFieldFeature[]> {
  const tab = await getActiveHttpTab();
  if (typeof tab.id !== 'number') throw new Error("Impossible de déterminer l'onglet actif.");

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: () => {
      function textCompact(s?: string | null, max = 140): string | undefined {
        if (!s) return undefined;
        const v = s.replace(/\s+/g, ' ').trim();
        return v.length ? v.slice(0, max) : undefined;
      }

      function nearestLabel(el: Element): string | undefined {
        // HTML label via <label for>
        const id = (el as HTMLElement).id;
        if (id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl) return textCompact(lbl.textContent, 120);
        }
        // Wrapped label <label><input/></label>
        let p: Element | null = el.parentElement;
        while (p) {
          if (p.tagName === 'LABEL') return textCompact(p.textContent, 120);
          p = p.parentElement;
        }
        // Previous sibling text
        const prev = el.previousElementSibling;
        if (prev && prev.textContent) return textCompact(prev.textContent, 120);
        return undefined;
      }

      function collectCandidates(): Element[] {
        const list: Element[] = [];
        const nodes = document.querySelectorAll(
          [
            'input[type="text"]',
            'input[type="search"]',
            'input:not([type])',
            'textarea',
            '[role="combobox"]',
            '[contenteditable="true"]',
          ].join(',')
        );
        nodes.forEach((el) => {
          const he = el as HTMLElement;
          const style = window.getComputedStyle(he);
          if (style.visibility === 'hidden' || style.display === 'none') return;
          const rect = he.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 16) return;
          list.push(el);
        });
        return Array.from(new Set(list)).slice(0, 30);
      }

      function cssPath(el: Element): string {
        if (!(el instanceof Element)) return '';
        const path: string[] = [];
        while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 5) {
          let selector = el.nodeName.toLowerCase();
          if ((el as HTMLElement).id) {
            selector += '#' + (el as HTMLElement).id;
            path.unshift(selector);
            break;
          } else {
            let sib = el.previousElementSibling;
            let idx = 1;
            while (sib) {
              if (sib.nodeName === el.nodeName) idx++;
              sib = sib.previousElementSibling;
            }
            selector += `:nth-of-type(${idx})`;
          }
          path.unshift(selector);
          el = el.parentElement as Element;
        }
        return path.join('>');
      }

      const out: DomFieldFeature[] = [] as any;
      for (const el of collectCandidates()) {
        const he = el as HTMLElement & HTMLInputElement;
        const rect = he.getBoundingClientRect();
        const id = he.id || cssPath(el);
        const aria: string[] = [];
        for (const attr of Array.from(he.attributes)) {
          if (attr.name.startsWith('aria-') && attr.value) aria.push(`${attr.name}:${attr.value}`);
        }
        const item = {
          id,
          tag: el.tagName.toLowerCase(),
          type: (he as HTMLInputElement).type,
          placeholder: textCompact((he as HTMLInputElement).placeholder),
          aria,
          labelNearby: nearestLabel(el),
          parentText: textCompact(he.parentElement?.textContent, 160),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        };
        out.push(item);
      }
      return out;
    },
    args: [],
  });

  return result ?? [];
}

async function computeFastestRoute(payload: { origin: string; destination: string; language?: string; mode?: string; url?: string }): Promise<{
  best: { durationMin: number; distanceKm?: number; text?: string } | null;
  routes: { durationMin: number; distanceKm?: number; text?: string }[];
  pageUrl?: string;
}> {
  const tab = await getActiveHttpTab();
  if (typeof tab.id !== 'number') throw new Error("Impossible de déterminer l'onglet actif.");
  await logToBackend('route', 'info', 'start', {
    origin: payload.origin,
    destination: payload.destination,
    url: tab.url,
    mode: payload.mode ?? null,
  });

  const isGoogleMapsUrl = (url?: string | null) => {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if (!/google\.[^/]+$/i.test(parsed.hostname)) return false;
      return parsed.pathname.includes('/maps');
    } catch {
      return false;
    }
  };

  const matchesDirectionsUrl = (url?: string | null) => {
    if (typeof url !== 'string') return false;
    return url.includes('/maps/dir/');
  };

  const computeWaitBudgetMs = (loadDurationMs?: number | null) => {
    const base = typeof loadDurationMs === 'number' && Number.isFinite(loadDurationMs) ? Math.max(loadDurationMs, 4000) : 9000;
    const scaled = Math.round(base * 2.2);
    return Math.min(90000, Math.max(12000, scaled));
  };

  async function waitForTabNavigation(tabId: number, expectedUrl: string, timeoutMs = 90000): Promise<number> {
    const start = Date.now();
    const urlMatches = (url?: string | null) => matchesDirectionsUrl(url) || (typeof url === 'string' && url.startsWith(expectedUrl));
    return new Promise((resolve) => {
      let resolved = false;
      let settleTimeout: ReturnType<typeof setTimeout> | null = null;
      let poller: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (settleTimeout) {
          clearTimeout(settleTimeout);
          settleTimeout = null;
        }
        if (poller) {
          clearInterval(poller);
          poller = null;
        }
        chrome.tabs.onUpdated.removeListener(listener);
      };

      const finalize = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(Date.now() - start);
      };

      const scheduleFinalize = () => {
        if (resolved) return;
        const elapsed = Date.now() - start;
        const delay = Math.min(2000, Math.max(400, Math.round(elapsed * 0.2)));
        if (settleTimeout) {
          clearTimeout(settleTimeout);
        }
        settleTimeout = setTimeout(finalize, delay);
      };

      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo, updatedTab: chrome.tabs.Tab) => {
        if (updatedTabId !== tabId) return;
        if (info.status === 'complete' && urlMatches(updatedTab.url)) {
          scheduleFinalize();
          return;
        }
        if (info.url && urlMatches(info.url)) {
          scheduleFinalize();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      poller = setInterval(async () => {
        try {
          const tinfo = await chrome.tabs.get(tabId);
          if (tinfo.status === 'complete' && urlMatches(tinfo.url)) {
            scheduleFinalize();
          }
        } catch {
          // Ignore transient navigation errors.
        }
        if (Date.now() - start > timeoutMs) {
          finalize();
        }
      }, 350);
    });
  }

  async function ensureDirectionsTab(dirUrl: string, currentTabId?: number): Promise<{ tabId: number; loadMs: number; reused: boolean }> {
    if (typeof currentTabId === 'number') {
      try {
        const current = await chrome.tabs.get(currentTabId);
        if (isGoogleMapsUrl(current.url)) {
          await chrome.tabs.update(currentTabId, { url: dirUrl, active: true });
          const loadMs = await waitForTabNavigation(currentTabId, dirUrl);
          return { tabId: currentTabId, loadMs, reused: true };
        }
      } catch {
        // Ignore and fallback to creating a fresh tab.
      }
    }
    const created = await chrome.tabs.create({ url: dirUrl, active: true });
    if (typeof created.id !== 'number') {
      throw new Error("Impossible de créer l'onglet Google Maps.");
    }
    const loadMs = await waitForTabNavigation(created.id, dirUrl);
    return { tabId: created.id, loadMs, reused: false };
  }

  // 0) If a URL is provided by the LLM, navigate to it directly; else build from origin/destination/mode
  const normalizeTravelMode = (raw?: string | null): string | null => {
    if (!raw) return null;
    const v = String(raw).toLowerCase();
    if (/(velo|vélo|bike|cycl)/i.test(v)) return 'bicycling';
    if (/(two|2).*-?wheeler|deux.?roues|scooter|moto/i.test(v)) return 'two-wheeler';
    if (/(pied|walk|marche|foot)/i.test(v)) return 'walking';
    if (/(train|metro|métro|rer|tram|bus|transit|transport)/i.test(v)) return 'transit';
    if (/(drive|car|auto|voiture|condui)/i.test(v)) return 'driving';
    return null;
  };

  let targetTabId = typeof tab.id === 'number' ? tab.id : undefined;
  let extractionWaitBudgetMs = 22000;

  {
    const enc = (s: string) => encodeURIComponent(String(s ?? '').trim());
    const travelModeParam = normalizeTravelMode(payload.mode ?? null);
    const dirUrl = typeof payload.url === 'string' && payload.url.trim().startsWith('http')
      ? payload.url.trim()
      : (() => {
          const base = `https://www.google.com/maps/dir/?api=1&origin=${enc(payload.origin)}&destination=${enc(payload.destination)}`;
          return travelModeParam ? `${base}&travelmode=${encodeURIComponent(travelModeParam)}` : base;
        })();
    try {
      const navigationStart = Date.now();
      const dirTab = await ensureDirectionsTab(dirUrl, targetTabId);
      targetTabId = dirTab.tabId;
      const loadMs = dirTab.loadMs ?? Date.now() - navigationStart;
      extractionWaitBudgetMs = computeWaitBudgetMs(loadMs);
      const [{ result: re }] = await chrome.scripting.executeScript({
        target: { tabId: dirTab.tabId },
        world: 'MAIN',
        args: [extractionWaitBudgetMs],
        func: async (maxWaitBudgetMsRaw: number) => {
          const defaultWaitBudget = typeof maxWaitBudgetMsRaw === 'number' && Number.isFinite(maxWaitBudgetMsRaw)
            ? Math.min(90000, Math.max(12000, maxWaitBudgetMsRaw))
            : 22000;
          const chooseWaitBudget = (requested?: number) => {
            const cap = 12000;
            if (typeof requested === 'number' && Number.isFinite(requested)) {
              const normalized = Math.max(0, requested);
              return Math.max(defaultWaitBudget, Math.min(normalized, defaultWaitBudget + cap));
            }
            return defaultWaitBudget;
          };

          function textCompact(s?: string | null, max = 200): string | undefined {
            if (!s) return undefined;
            const v = s.replace(/\s+/g, ' ').trim();
            return v.length ? v.slice(0, max) : undefined;
          }
          function parseDuration(text: string): number | undefined {
            const t = text.toLowerCase();
            let m = t.match(/(\d+)\s*h\s*(\d+)\s*min/);
            if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
            m = t.match(/(\d+)\s*h(?!\w)/);
            if (m) return parseInt(m[1]) * 60;
            m = t.match(/(\d+)\s*min/);
            if (m) return parseInt(m[1]);
            return undefined;
          }
          function parseDistance(text: string): number | undefined {
            const m = text.toLowerCase().match(/(\d+[\.,]?\d*)\s*km/);
            if (m) return parseFloat(m[1].replace(',', '.'));
            return undefined;
          }

          const ensureNetworkCollectors = () => {
            const globalAny = window as Record<string, unknown>;
            if (typeof globalAny.__cometiEnsureRouteWatchers !== 'function' || typeof globalAny.__cometiReadRouteVariants !== 'function') {
              const NET_STATE_KEY = '__cometiRouteNetState';
              const NET_HOOK_KEY = '__cometiRouteNetHook';

              type SharedRouteSnapshot = {
                durationSec: number;
                durationText?: string;
                distanceMeters?: number;
                distanceText?: string;
              };

              const storeRoutes = (input: SharedRouteSnapshot[]) => {
                if (!Array.isArray(input) || input.length === 0) return;
                const byKey = new Map<string, SharedRouteSnapshot>();
                for (const item of input) {
                  if (!item || typeof item.durationSec !== 'number' || !Number.isFinite(item.durationSec) || item.durationSec <= 0) continue;
                  const key = `${Math.round(item.durationSec)}|${Math.round(item.distanceMeters ?? 0)}`;
                  if (!byKey.has(key)) byKey.set(key, item);
                }
                if (byKey.size === 0) return;
                try {
                  (globalAny as any)[NET_STATE_KEY] = {
                    timestamp: Date.now(),
                    routes: Array.from(byKey.values()),
                  };
                  window.dispatchEvent(new CustomEvent('cometi:routes-updated'));
                } catch {
                  // ignore
                }
              };

              const parsePayload = (raw: string): SharedRouteSnapshot[] => {
                if (typeof raw !== 'string' || raw.trim().length === 0) return [];
                let textPayload = raw.trim();
                if (textPayload.startsWith(")]}'")) {
                  const newlineIndex = textPayload.indexOf('\n');
                  textPayload = newlineIndex >= 0 ? textPayload.slice(newlineIndex + 1) : '';
                }

                const routes: SharedRouteSnapshot[] = [];
                const addRoute = (durationSec?: number, durationText?: string, distanceMeters?: number, distanceText?: string) => {
                  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) return;
                  routes.push({ durationSec, durationText, distanceMeters, distanceText });
                };

                const maybeJson = (() => {
                  try {
                    return JSON.parse(textPayload);
                  } catch {
                    return undefined;
                  }
                })();

                if (maybeJson) {
                  const visit = (node: unknown) => {
                    if (Array.isArray(node)) {
                      for (const child of node) visit(child);
                      return;
                    }
                    if (node && typeof node === 'object') {
                      const record = node as Record<string, unknown>;
                      const durationObj = record.duration ?? record.duration_in_traffic;
                      const distanceObj = record.distance ?? record.fallbackDistance;
                      const durationValue = durationObj ? Number((durationObj as any).value) : undefined;
                      const durationLabel = typeof (durationObj as any)?.text === 'string' ? (durationObj as any).text : undefined;
                      const distanceValue = distanceObj ? Number((distanceObj as any).value) : undefined;
                      const distanceLabel = typeof (distanceObj as any)?.text === 'string' ? (distanceObj as any).text : undefined;
                      if (Number.isFinite(durationValue)) {
                        addRoute(durationValue, durationLabel, Number.isFinite(distanceValue) ? distanceValue : undefined, distanceLabel);
                      }
                      Object.values(record).forEach((value: unknown) => {
                        if (value && typeof value === 'object') visit(value);
                      });
                    }
                  };
                  visit(maybeJson);
                }

                if (!routes.length) {
                  const durationRegex = /"duration"\s*:\s*{[^}]*"value"\s*:\s*(\d+)[^}]*"text"\s*:\s*"([^"]+)"/g;
                  const distanceRegex = /"distance"\s*:\s*{[^}]*"value"\s*:\s*(\d+)[^}]*"text"\s*:\s*"([^"]+)"/g;
                  const durationEntries: Array<{ value: number; text?: string }> = [];
                  let match: RegExpExecArray | null;
                  while ((match = durationRegex.exec(textPayload))) {
                    durationEntries.push({ value: Number(match[1]), text: match[2] });
                  }
                  const distanceEntries: Array<{ value: number; text?: string }> = [];
                  while ((match = distanceRegex.exec(textPayload))) {
                    distanceEntries.push({ value: Number(match[1]), text: match[2] });
                  }
                  const fallbackDistance = distanceEntries[distanceEntries.length - 1];
                  durationEntries.forEach((entry, index) => {
                    const distanceEntry = distanceEntries[index] ?? fallbackDistance;
                    addRoute(entry.value, entry.text, distanceEntry ? distanceEntry.value : undefined, distanceEntry ? distanceEntry.text : undefined);
                  });
                }

                return routes;
              };

              const capturePayload = (url: string, payloadText: string) => {
                if (typeof url !== 'string' || typeof payloadText !== 'string') return;
                if (!/directions/i.test(url)) return;
                const parsed = parsePayload(payloadText);
                if (parsed.length) storeRoutes(parsed);
              };

              const installWatchers = () => {
                if ((globalAny as any)[NET_HOOK_KEY]) return;
                (globalAny as any)[NET_HOOK_KEY] = true;
                const originalFetch = window.fetch;
                window.fetch = async function (...fetchArgs: Parameters<typeof fetch>): Promise<Response> {
                  const response = await originalFetch.apply(this, fetchArgs);
                  try {
                    const request = fetchArgs[0];
                    const requestUrl = typeof request === 'string' ? request : request instanceof Request ? request.url : '';
                    if (requestUrl && /directions/i.test(requestUrl)) {
                      void response.clone().text().then((payload) => {
                        capturePayload(requestUrl, payload);
                      }).catch(() => {});
                    }
                  } catch {
                    // ignore
                  }
                  return response;
                };

                const originalOpen = XMLHttpRequest.prototype.open;
                const originalSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
                  try {
                    (this as any).__cometiRouteUrl = typeof url === 'string' ? url : url?.toString() ?? '';
                  } catch {
                    (this as any).__cometiRouteUrl = '';
                  }
                  return originalOpen.apply(this, [method, url, ...rest] as any);
                };

                XMLHttpRequest.prototype.send = function (body?: Document | BodyInit | null) {
                  try {
                    const targetUrl = String((this as any).__cometiRouteUrl ?? '');
                    if (targetUrl && /directions/i.test(targetUrl)) {
                      this.addEventListener('load', () => {
                        try {
                          if (typeof this.responseText === 'string') {
                            capturePayload(targetUrl, this.responseText);
                          }
                        } catch {
                          // ignore
                        }
                      });
                    }
                  } catch {
                    // ignore
                  }
                  return originalSend.apply(this, [body] as any);
                };
              };

              (globalAny as any).__cometiEnsureRouteWatchers = installWatchers;
              (globalAny as any).__cometiReadRouteVariants = () => {
                try {
                  const state = (globalAny as any)[NET_STATE_KEY];
                  if (!state || typeof state !== 'object') return [];
                  if (Date.now() - (state.timestamp ?? 0) > 15000) return [];
                  const list = Array.isArray(state.routes) ? state.routes : [];
                  return list
                    .map((route: SharedRouteSnapshot | undefined) => {
                      if (!route || typeof route.durationSec !== 'number' || !Number.isFinite(route.durationSec) || route.durationSec <= 0) return undefined;
                      const durationMin = Math.max(1, Math.round(route.durationSec / 60));
                      const distanceMeters = Number(route.distanceMeters);
                      const distanceKm = Number.isFinite(distanceMeters) ? Math.round((distanceMeters / 1000) * 100) / 100 : undefined;
                      const text = typeof route.durationText === 'string' ? route.durationText : undefined;
                      return { durationMin, distanceKm, text };
                    })
                    .filter((value): value is { durationMin: number; distanceKm?: number; text?: string } => Boolean(value));
                } catch {
                  return [] as { durationMin: number; distanceKm?: number; text?: string }[];
                }
              };

              try {
                const installer = (globalAny as any).__cometiEnsureRouteWatchers;
                if (typeof installer === 'function') installer();
              } catch {
                // ignore
              }
            } else {
              try {
                const installer = (globalAny as any).__cometiEnsureRouteWatchers;
                if (typeof installer === 'function') installer();
              } catch {
                // ignore
              }
            }
          };

          const readNetworkRoutes = (): { durationMin: number; distanceKm?: number; text?: string }[] => {
            try {
              const reader = (window as any).__cometiReadRouteVariants;
              if (typeof reader === 'function') {
                const value = reader();
                if (Array.isArray(value)) return value;
              }
            } catch {
              // ignore
            }
            return [];
          };

          ensureNetworkCollectors();
          if (typeof (window as any).__cometiEnsureRouteWatchers !== 'function') {
            (window as any).__cometiEnsureRouteWatchers = ensureNetworkWatchers;
          }
          if (typeof (window as any).__cometiReadRouteVariants !== 'function') {
            (window as any).__cometiReadRouteVariants = readNetworkRoutes;
          }

          const durationPattern = /((\d+\s*h\s*\d+\s*min)|(\d+\s*h(?!\w))|(\d+\s*min))/i;

          const gatherTexts = (element?: Element | null, max = 260): string[] => {
            if (!element) return [];
            const list: string[] = [];
            const push = (value?: string | null, limit = max) => {
              const normalized = textCompact(value, limit);
              if (normalized && !list.includes(normalized)) list.push(normalized);
            };
            if (element instanceof HTMLElement) {
              push(element.innerText, 320);
              push(element.getAttribute('aria-label'), 220);
              push(element.getAttribute('title'), 220);
              for (const attr of Array.from(element.attributes)) {
                if (attr.name.startsWith('data-')) push(attr.value, 200);
              }
            } else {
              push(element.textContent, 320);
            }
            return list;
          };

          const pickDuration = (texts: string[]): number | undefined => {
            for (const text of texts) {
              const dur = parseDuration(text);
              if (typeof dur === 'number') return dur;
            }
            return undefined;
          };

          const pickDistance = (texts: string[]): number | undefined => {
            for (const text of texts) {
              const dist = parseDistance(text);
              if (typeof dist === 'number') return dist;
            }
            return undefined;
          };

          function extractRoutes(): { durationMin: number; distanceKm?: number; text?: string }[] {
            const results: { durationMin: number; distanceKm?: number; text?: string }[] = [...readNetworkRoutes()];
            const seenFromNetwork = new Set(results.map((item) => `${item.durationMin}|${item.distanceKm ?? ''}`));
            const nodes = Array.from(document.querySelectorAll('*')) as HTMLElement[];
            const seenPairs = new Set<string>();
            for (const el of nodes) {
              const texts: string[] = [];
              const merge = (src: Element | null | undefined, max = 260) => {
                if (!src) return;
                for (const entry of gatherTexts(src, max)) {
                  if (!texts.includes(entry)) texts.push(entry);
                }
              };
              merge(el, 320);
              merge(el.parentElement, 260);
              merge(el.previousElementSibling, 200);
              merge(el.nextElementSibling, 200);
              if (texts.length === 0) continue;
              const combined = texts.join(' • ');
              if (!durationPattern.test(combined)) continue;
              const dur = pickDuration(texts);
              if (typeof dur !== 'number') continue;
              let dist = pickDistance(texts);
              if (typeof dist !== 'number' && el.parentElement) {
                dist = pickDistance(gatherTexts(el.parentElement, 260));
              }
              const distanceKm = typeof dist === 'number' ? Math.round(dist * 100) / 100 : undefined;
              const sample = texts[0] ?? combined;
              const durationMin = Math.max(1, Math.round(dur));
              const dedupKey = `${durationMin}|${distanceKm ?? ''}`;
              if (seenPairs.has(dedupKey)) continue;
              seenPairs.add(dedupKey);
              if (seenFromNetwork.has(dedupKey)) continue;
              results.push({ durationMin, distanceKm, text: sample });
              if (results.length >= 20) break;
            }
            const dedup: { durationMin: number; distanceKm?: number; text?: string }[] = [];
            const seen = new Set<string>();
            for (const route of results.sort((a, b) => a.durationMin - b.durationMin)) {
              const key = `${route.durationMin}|${route.distanceKm ?? ''}`;
              if (seen.has(key)) continue;
              seen.add(key);
              dedup.push(route);
              if (dedup.length >= 5) break;
            }
            return dedup;
          }
          async function waitForRoutesUntil(
            extract: () => { durationMin: number; distanceKm?: number; text?: string }[],
            maxWaitMs?: number
          ): Promise<void> {
            const limit = chooseWaitBudget(maxWaitMs);
            const start = Date.now();
            let lastCount = 0;
            let lastStableAt = start;
            return new Promise((resolve) => {
              let settled = false;
              let timeoutId: ReturnType<typeof setTimeout> | undefined;
              let pollerId: ReturnType<typeof setInterval> | undefined;
              let observer: MutationObserver | undefined;
              let listener: ((event: Event) => void) | undefined;

              const cleanup = () => {
                if (observer) {
                  observer.disconnect();
                  observer = undefined;
                }
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = undefined;
                }
                if (pollerId) {
                  clearInterval(pollerId);
                  pollerId = undefined;
                }
                if (listener) {
                  window.removeEventListener('cometi:routes-updated', listener);
                  listener = undefined;
                }
              };

              const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
              };

              const check = () => {
                if (settled) return;
                const routes = extract();
                const count = routes.length;
                if (count !== lastCount) {
                  lastCount = count;
                  lastStableAt = Date.now();
                }
                if (count > 0 && Date.now() - lastStableAt >= 600) {
                  finish();
                  return;
                }
                if (Date.now() - start > limit) {
                  finish();
                }
              };

              try {
                observer = new MutationObserver(() => {
                  check();
                });
                observer.observe(document.body, { childList: true, subtree: true });
              } catch {
                observer = undefined;
              }

              pollerId = setInterval(check, 200);
              listener = () => {
                check();
              };
              window.addEventListener('cometi:routes-updated', listener);
              timeoutId = setTimeout(finish, limit);
              check();
            });
          }
          await waitForRoutesUntil(extractRoutes, 32000);
          const routes = extractRoutes();
          const best = routes[0] ?? null;
          return { routes, best, pageUrl: window.location.href };
        },
      });
      await logToBackend('route', 'info', 'done', {
        pageUrl: re?.pageUrl,
        routes: re?.routes?.length ?? 0,
        best: re?.best,
        loadMs,
        waitBudget: extractionWaitBudgetMs,
        reusedTab: dirTab.reused,
      });
      return re ?? { routes: [], best: null };
    } catch (error) {
      await logToBackend('route', 'warn', 'direct_navigation_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const activeTargetTabId = targetTabId ?? tab.id;
  if (typeof activeTargetTabId !== 'number') {
    throw new Error("Impossible de déterminer l'onglet cible pour l'extraction de trajet.");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: activeTargetTabId },
    world: 'MAIN',
    args: [payload.origin, payload.destination, payload.mode ?? null, extractionWaitBudgetMs],
    func: async (
      originValue: string,
      destinationValue: string,
      requestedMode: string | null,
      maxWaitBudgetMsRaw?: number
    ) => {
      const dbg: any[] = [];
      const log = (msg: string, data?: any) => { dbg.push({ msg, data }); };
      const defaultWaitBudget = typeof maxWaitBudgetMsRaw === 'number' && Number.isFinite(maxWaitBudgetMsRaw)
        ? Math.min(90000, Math.max(12000, maxWaitBudgetMsRaw))
        : 22000;
      const chooseWaitBudget = (requested?: number) => {
        const cap = 12000;
        if (typeof requested === 'number' && Number.isFinite(requested)) {
          const normalized = Math.max(0, requested);
          return Math.max(defaultWaitBudget, Math.min(normalized, defaultWaitBudget + cap));
        }
        return defaultWaitBudget;
      };

      type TravelMode = 'driving' | 'transit' | 'walking' | 'cycling';
      const MODE_CONFIG: Record<TravelMode, { label: string; keywords: string[] }> = {
        driving: {
          label: 'Voiture',
          keywords: ['driving', 'drive', 'voiture', 'car', 'auto', 'automobile'],
        },
        transit: {
          label: 'Transports en commun',
          keywords: ['transit', 'transport', 'public', 'commun', 'bus', 'train', 'rer', 'metro', 'tram', 'rail'],
        },
        walking: {
          label: 'À pied',
          keywords: ['walking', 'walk', 'marche', 'pied', 'foot'],
        },
        cycling: {
          label: 'Vélo',
          keywords: ['cycling', 'bike', 'vélo', 'bicycle', 'bicyclette'],
        },
      };

      const normalizeMode = (value?: string | null): TravelMode | undefined => {
        if (!value) return undefined;
        const low = value.toLowerCase();
        if (/(velo|vélo|bike|cycl)/i.test(low)) return 'cycling';
        if (/(pied|walk|marche|foot)/i.test(low)) return 'walking';
        if (/(train|metro|métro|rer|tram|bus|transit|transport)/i.test(low)) return 'transit';
        if (/(drive|car|auto|voiture|condui)/i.test(low)) return 'driving';
        return undefined;
      };

      const requestedTravelMode = normalizeMode(requestedMode);
      function textCompact(s?: string | null, max = 200): string | undefined {
        if (!s) return undefined;
        const v = s.replace(/\s+/g, ' ').trim();
        return v.length ? v.slice(0, max) : undefined;
      }
      function nearestLabel(el: Element): string | undefined {
        const he = el as HTMLElement;
        // by for= id
        const id = he.id;
        if (id) {
          try {
            const q = typeof (globalThis as any).CSS !== 'undefined' && (CSS as any).escape ? `label[for="${(CSS as any).escape(id)}"]` : `label[for="${id}"]`;
            const lbl = document.querySelector(q);
            if (lbl) return textCompact(lbl.textContent, 120);
          } catch {
            // ignore
          }
        }
        // wrapped label
        let p: Element | null = he.parentElement;
        while (p) {
          if (p.tagName === 'LABEL') return textCompact(p.textContent, 120);
          p = p.parentElement;
        }
        // previous sibling text
        const prev = he.previousElementSibling as HTMLElement | null;
        if (prev && prev.textContent) return textCompact(prev.textContent, 120);
        return undefined;
      }
      function sleep(ms: number): Promise<void> { return new Promise((res) => setTimeout(res, ms)); }
      function dispatch(el: Element, type: string, init: any = {}) {
        const evt = new (type.startsWith('key') ? KeyboardEvent : Event)(type, { bubbles: true, cancelable: true, ...init });
        el.dispatchEvent(evt);
      }
      function setInputValue(el: Element, value: string) {
        const he = el as any;
        if (he.tagName === 'INPUT' || he.tagName === 'TEXTAREA') {
          const proto = he.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          desc?.set?.call(he, value);
          dispatch(he, 'input');
          dispatch(he, 'change');
          return;
        }
        if ((he as HTMLElement).isContentEditable) {
          (he as HTMLElement).focus();
          (he as HTMLElement).textContent = value;
          dispatch(he, 'input');
          dispatch(he, 'change');
          return;
        }
      }
      function isEditable(el: Element): boolean {
        const he = el as any;
        if (!he) return false;
        if (he.tagName === 'INPUT' || he.tagName === 'TEXTAREA') return true;
        if ((he as HTMLElement).isContentEditable) return true;
        return false;
      }
      function getDeepEditable(el: HTMLElement): HTMLElement | null {
        if (isEditable(el)) return el;
        const q = el.querySelector<HTMLElement>('input[type="text"], input:not([type]), textarea, [contenteditable="true"]');
        return q ?? null;
      }
      function findFieldCandidates(): HTMLElement[] {
        const nodes = document.querySelectorAll<HTMLElement>([
          'input[type="text"]',
          'input[type="search"]',
          'input:not([type])',
          'textarea',
          '[role="combobox"]',
          '[contenteditable="true"]',
        ].join(','));
        const list: HTMLElement[] = [];
        nodes.forEach((el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          if (rect.width < 20 || rect.height < 16) return;
          list.push(el);
        });
        return list.slice(0, 30);
      }

      function directionsButtonCandidates(): HTMLElement[] {
        const labels = [
          'Directions', 'Itinerary', 'Route', 'Itinéraire', 'Itinerario', 'Indicaciones', 'Directions',
        ];
        const btns: HTMLElement[] = [];
        const els = document.querySelectorAll<HTMLElement>('button,[role="button"],a');
        els.forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (!text) return;
          const low = text.toLowerCase();
          if (labels.some((lbl) => low.includes(lbl.toLowerCase()))) btns.push(el);
        });
        // Also consider toolbar icons with data-value or title
        const iconBtns = document.querySelectorAll<HTMLElement>('*[aria-label],*[title]');
        iconBtns.forEach((el) => {
          const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
          const low = label.toLowerCase();
          if (labels.some((lbl) => low.includes(lbl.toLowerCase()))) btns.push(el);
        });
        const unique = Array.from(new Set(btns)).slice(0, 10);
        log('directionButtons', { count: unique.length });
        return unique;
      }

      function findTravelModeButton(mode: TravelMode): HTMLElement | null {
        const keywords = MODE_CONFIG[mode].keywords;
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('button, [role="button"], [aria-pressed], [aria-selected]')
        );
        for (const node of nodes) {
          const button = (node.closest('button') as HTMLElement) || node;
          const texts = [
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || '',
            button.textContent || '',
            node.getAttribute('aria-label') || '',
            node.getAttribute('title') || '',
            node.textContent || '',
          ];
          const dataVals = [
            button.getAttribute('data-travel_mode') || '',
            button.getAttribute('data-value') || '',
            node.getAttribute('data-travel_mode') || '',
            node.getAttribute('data-value') || '',
          ];
          for (const raw of dataVals) {
            const low = raw.toLowerCase();
            if (!low) continue;
            if (['d', 'driving', 'drive', '0'].includes(low) && mode === 'driving') return button;
            if (['t', 'transit', 'transport', '3', 'public'].includes(low) && mode === 'transit') return button;
            if (['w', 'walking', 'walk', '1', 'pedestrian'].includes(low) && mode === 'walking') return button;
            if (['b', 'cycling', 'bike', '2', 'bicycling'].includes(low) && mode === 'cycling') return button;
          }
          for (const txt of texts) {
            const low = txt.trim().toLowerCase();
            if (!low) continue;
            if (keywords.some((kw) => low.includes(kw))) return button;
          }
        }
        return null;
      }

      function isModeButtonActive(button: HTMLElement): boolean {
        if (button.getAttribute('aria-pressed') === 'true') return true;
        if (button.getAttribute('aria-selected') === 'true') return true;
        const cls = button.className || '';
        return /selected|active|on/i.test(cls);
      }

      async function ensureTravelMode(mode: TravelMode): Promise<void> {
        const button = findTravelModeButton(mode);
        if (!button) {
          log('mode_button_missing', { mode });
          return;
        }
        if (!isModeButtonActive(button)) {
          button.scrollIntoView({ block: 'center' });
          button.click();
          await sleep(200);
        }
        await waitForRoutesUntil(() => extractRoutes(mode, MODE_CONFIG[mode].label), 24000);
      }

      function scoreField(el: HTMLElement): number {
        const labelTexts = [
          (el.getAttribute('aria-label') || ''),
          nearestLabel(el) || '',
          (el.getAttribute('placeholder') || ''),
          textCompact(el.parentElement?.textContent, 140) || '',
        ].join(' ').toLowerCase();
        let s = 0;
        const originKw = ['from', 'origin', 'start', 'départ', 'depart', 'point a', 'a ', 'point de départ', 'choisissez un point de départ'];
        const destKw = ['to', 'destination', 'arrivée', 'arrivee', 'dest', 'point b', 'b ', 'destination', 'choisissez une destination', 'vers'];
        if (originKw.some((k) => labelTexts.includes(k))) s += 3;
        if (destKw.some((k) => labelTexts.includes(k))) s += 3;
        if ((el as HTMLInputElement).type === 'search') s += 1;
        // Favor elements near top-left
        const rect = el.getBoundingClientRect();
        s += Math.max(0, 40 - Math.min(40, rect.top / 10));
        return s;
      }

      function findDirectionsFields(): { a?: HTMLElement; b?: HTMLElement } {
        const candidates = findFieldCandidates();
        log('fieldCandidates', { count: candidates.length });
        if (candidates.length === 0) return {};
        // Score and keep top 4
        const top = candidates
          .map((el) => ({ el, s: scoreField(el) }))
          .sort((x, y) => y.s - x.s)
          .slice(0, 6)
          .map((x) => x.el)
          .map((el) => getDeepEditable(el) ?? el);
        // Sort top by position and pick first 2
        const sorted = top
          .slice()
          .sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left);
        return { a: sorted[0], b: sorted.find((el) => el !== sorted[0]) };
      }
      function guessTwoInputs(list: HTMLElement[]): { a?: HTMLElement; b?: HTMLElement } {
        // Sort by top,left and pick first 2 distinct
        const sorted = list.slice().sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left);
        return { a: sorted[0], b: sorted.find((el) => el !== sorted[0]) };
      }
      async function pressEnter(el?: Element) {
        const t = (el as HTMLElement) || document.activeElement || document.body;
        dispatch(t, 'keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
        await sleep(50);
        dispatch(t, 'keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
      }
      async function selectFirstSuggestion(el?: Element) {
        const t = (el as HTMLElement) || document.activeElement || document.body;
        dispatch(t, 'keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40 });
        await sleep(80);
        dispatch(t, 'keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40 });
        await sleep(80);
        await pressEnter(t);
      }
      async function fillAndSubmit(a: HTMLElement, b: HTMLElement, aVal: string, bVal: string) {
        a.scrollIntoView({ block: 'center' });
        a.focus();
        await sleep(50);
        setInputValue(a, aVal);
        await sleep(200);
        await selectFirstSuggestion(a);
        await sleep(400);

        b.scrollIntoView({ block: 'center' });
        b.focus();
        await sleep(50);
        setInputValue(b, bVal);
        await sleep(200);
        await selectFirstSuggestion(b);
      }
      function parseDuration(text: string): number | undefined {
        const t = text.toLowerCase();
        // e.g., "1 h 22 min", "1h22", "53 min"
        let m = t.match(/(\d+)\s*h\s*(\d+)\s*min/);
        if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
        m = t.match(/(\d+)\s*h(?!\w)/);
        if (m) return parseInt(m[1]) * 60;
        m = t.match(/(\d+)\s*min/);
        if (m) return parseInt(m[1]);
        return undefined;
      }
      function parseDistance(text: string): number | undefined {
        const m = text.toLowerCase().match(/(\d+[\.,]?\d*)\s*km/);
        if (m) return parseFloat(m[1].replace(',', '.'));
        return undefined;
      }

      ensureNetworkCollectors();
      async function waitForRoutesUntil(
        extract: () => { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[],
        maxWaitMs?: number
      ): Promise<void> {
        const limit = chooseWaitBudget(maxWaitMs);
        const start = Date.now();
        let lastCount = 0;
        let lastStableAt = start;
        return new Promise((resolve) => {
          let settled = false;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let pollerId: ReturnType<typeof setInterval> | undefined;
          let observer: MutationObserver | undefined;
          let listener: ((event: Event) => void) | undefined;

          const cleanup = () => {
            if (observer) {
              observer.disconnect();
              observer = undefined;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
            }
            if (pollerId) {
              clearInterval(pollerId);
              pollerId = undefined;
            }
            if (listener) {
              window.removeEventListener('cometi:routes-updated', listener);
              listener = undefined;
            }
          };

          const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };

          const check = () => {
            if (settled) return;
            const routes = extract();
            const count = routes.length;
            if (count !== lastCount) {
              lastCount = count;
              lastStableAt = Date.now();
            }
            if (count > 0 && Date.now() - lastStableAt >= 600) {
              finish();
              return;
            }
            if (Date.now() - start > limit) {
              finish();
            }
          };

          try {
            observer = new MutationObserver(() => {
              check();
            });
            observer.observe(document.body, { childList: true, subtree: true });
          } catch {
            observer = undefined;
          }

          pollerId = setInterval(check, 200);
          listener = () => {
            check();
          };
          window.addEventListener('cometi:routes-updated', listener);
          timeoutId = setTimeout(finish, limit);
          check();
        });
      }

      async function navigateToDir(origin: string, dest: string) {
        const enc = (s: string) => encodeURIComponent(String(s ?? '').trim());
        // Map requestedMode (raw string) to Google maps travelmode param
        const raw = (requestedMode || '').toLowerCase();
        let travelParam: string | null = null;
        if (raw) {
          if (/(velo|vélo|bike|cycl)/i.test(raw)) travelParam = 'bicycling';
          else if (/(two|2).*-?wheeler|deux.?roues|scooter|moto/i.test(raw)) travelParam = 'two-wheeler';
          else if (/(pied|walk|marche|foot)/i.test(raw)) travelParam = 'walking';
          else if (/(train|metro|métro|rer|tram|bus|transit|transport)/i.test(raw)) travelParam = 'transit';
          else if (/(drive|car|auto|voiture|condui)/i.test(raw)) travelParam = 'driving';
        }
        const base = `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(dest)}`;
        const url = travelParam ? `${base}&travelmode=${encodeURIComponent(travelParam)}` : base;
        log('navigate_dir_url', { url, requestedMode });
        window.location.assign(url);
      }
      const durationPattern = /((\d+\s*h\s*\d+\s*min)|(\d+\s*h(?!\w))|(\d+\s*min))/i;

      const gatherTexts = (element?: Element | null, max = 260): string[] => {
        if (!element) return [];
        const list: string[] = [];
        const push = (value?: string | null, limit = max) => {
          const normalized = textCompact(value, limit);
          if (normalized && !list.includes(normalized)) list.push(normalized);
        };
        if (element instanceof HTMLElement) {
          push(element.innerText, 320);
          push(element.getAttribute('aria-label'), 220);
          push(element.getAttribute('title'), 220);
          for (const attr of Array.from(element.attributes)) {
            if (attr.name.startsWith('data-')) push(attr.value, 200);
          }
        } else {
          push(element.textContent, 320);
        }
        return list;
      };

      const pickDuration = (texts: string[]): number | undefined => {
        for (const text of texts) {
          const dur = parseDuration(text);
          if (typeof dur === 'number') return dur;
        }
        return undefined;
      };

      const pickDistance = (texts: string[]): number | undefined => {
        for (const text of texts) {
          const dist = parseDistance(text);
          if (typeof dist === 'number') return dist;
        }
        return undefined;
      };

      function extractRoutes(
        mode?: TravelMode,
        modeLabel?: string
      ): { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] {
        const base = readNetworkRoutes().map((item) => ({ ...item, mode, modeLabel }));
        const seenKeys = new Set(base.map((item) => `${item.mode ?? 'default'}|${item.durationMin}|${item.distanceKm ?? ''}`));
        const nodes = Array.from(document.querySelectorAll('*')) as HTMLElement[];
        const results: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] = [...base];
        const seenPairs = new Set<string>(base.map((item) => `${item.durationMin}|${item.distanceKm ?? ''}`));
        for (const el of nodes) {
          const texts: string[] = [];
          const merge = (src: Element | null | undefined, max = 260) => {
            if (!src) return;
            for (const entry of gatherTexts(src, max)) {
              if (!texts.includes(entry)) texts.push(entry);
            }
          };
          merge(el, 320);
          merge(el.parentElement, 260);
          merge(el.previousElementSibling, 200);
          merge(el.nextElementSibling, 200);
          if (texts.length === 0) continue;
          const combined = texts.join(' • ');
          if (!durationPattern.test(combined)) continue;
          const dur = pickDuration(texts);
          if (typeof dur !== 'number') continue;
          let dist = pickDistance(texts);
          if (typeof dist !== 'number' && el.parentElement) {
            dist = pickDistance(gatherTexts(el.parentElement, 260));
          }
          const distanceKm = typeof dist === 'number' ? Math.round(dist * 100) / 100 : undefined;
          const durationMin = Math.max(1, Math.round(dur));
          const key = `${durationMin}|${distanceKm ?? ''}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          const sample = texts[0] ?? combined;
          const route = { durationMin, distanceKm, text: sample, mode, modeLabel };
          const signature = `${route.mode ?? 'default'}|${route.durationMin}|${route.distanceKm ?? ''}`;
          if (seenKeys.has(signature)) continue;
          results.push(route);
          seenKeys.add(signature);
          if (results.length >= 20) break;
        }
        const dedup: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] = [];
        const seen = new Set<string>();
        for (const route of results.sort((a, b) => a.durationMin - b.durationMin)) {
          const key = `${route.mode ?? 'default'}|${route.durationMin}|${route.distanceKm ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          dedup.push(route);
          if (dedup.length >= 5) break;
        }
        return dedup;
      }

      // 0) Ensure directions panel if needed (click Directions button once)
      let { a, b } = findDirectionsFields();
      if (!a || !b) {
        const btns = directionsButtonCandidates();
        if (btns.length) {
          (btns[0] as HTMLElement).click();
          await sleep(800);
          // small settle delay
          await sleep(2000);
          const f = findDirectionsFields();
          a = f.a;
          b = f.b;
        }
      }
      if (!a || !b) {
        // fallback to guess two first inputs
        const fields = findFieldCandidates();
        log('fallbackFields', { count: fields.length });
        const g = guessTwoInputs(fields);
        a = g.a; b = g.b;
      }
      if (!a || !b) return { routes: [], best: null, debug: dbg } as any;
      log('using_fields', { a: a.tagName.toLowerCase(), b: b.tagName.toLowerCase(), aPh: (a as HTMLInputElement).placeholder, bPh: (b as HTMLInputElement).placeholder });
      await fillAndSubmit(a, b, originValue, destinationValue);

      const primaryMode = requestedTravelMode;
      const primaryLabel = primaryMode ? MODE_CONFIG[primaryMode].label : undefined;
      const getPrimaryRoutes = () => extractRoutes(primaryMode, primaryLabel);

      // 2) Wait for rendering to settle on the primary mode (or default)
      await waitForRoutesUntil(getPrimaryRoutes);
      // If still no routes extracted, try a small nudge (press Enter on destination again) and wait longer
      if (getPrimaryRoutes().length === 0) {
        log('nudge_destination_enter');
        await pressEnter(b);
        await waitForRoutesUntil(getPrimaryRoutes, 18000);
      }
      // If still nothing, hard navigate to Maps dir URL
      if (getPrimaryRoutes().length === 0) {
        await navigateToDir(originValue, destinationValue);
        await waitForRoutesUntil(getPrimaryRoutes, 28000);
      }

      const aggregated: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] = [];
      const seen = new Set<string>();
      const pushRoutes = (
        routes: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[]
      ) => {
        for (const route of routes) {
          const key = `${route.mode ?? 'default'}|${route.durationMin}|${route.distanceKm ?? ''}|${route.text ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          aggregated.push(route);
          if (aggregated.length >= 5) break;
        }
      };

      const collectForMode = async (mode?: TravelMode) => {
        const label = mode ? MODE_CONFIG[mode].label : undefined;
        if (mode) {
          await ensureTravelMode(mode);
        } else {
          await waitForRoutesUntil(() => extractRoutes(undefined, undefined));
        }
        pushRoutes(extractRoutes(mode, label));
      };

      if (requestedTravelMode) {
        await collectForMode(requestedTravelMode);
        if (aggregated.length < 3) {
          await waitForRoutesUntil(() => extractRoutes(requestedTravelMode, MODE_CONFIG[requestedTravelMode].label), 20000);
          pushRoutes(extractRoutes(requestedTravelMode, MODE_CONFIG[requestedTravelMode].label));
        }
      } else {
        await collectForMode(undefined);
        const modeOrder: TravelMode[] = ['driving', 'transit', 'walking', 'cycling'];
        for (const mode of modeOrder) {
          if (aggregated.length >= 5) break;
          await collectForMode(mode);
          if (aggregated.length >= 3) break;
        }
      }

      const routes = aggregated
        .slice(0, 5)
        .sort((a, b) => a.durationMin - b.durationMin);
      log('routes_extracted', { count: routes.length, requestedMode: requestedTravelMode ?? null });
      const best = routes[0] ?? null;
      return { routes, best, pageUrl: window.location.href, debug: dbg } as any;
    },
  });
  await logToBackend('route', 'info', 'done', { pageUrl: result?.pageUrl, routes: result?.routes?.length ?? 0, best: result?.best });
  const debug = (result as any)?.debug;
  if (debug && Array.isArray(debug)) {
    for (const d of debug) {
      await logToBackend('route-debug', 'info', d.msg ?? 'dbg', d.data);
    }
  }
  if (!result || (result.routes ?? []).length === 0) {
    await logToBackend('route', 'warn', 'no_routes');
    // Fallback: hard navigate via background then re-inject a lightweight extractor
    const tab2 = await getActiveHttpTab();
    const preferredTabId = typeof tab2.id === 'number' ? tab2.id : targetTabId;
    if (typeof preferredTabId === 'number') {
      const enc = (s: string) => encodeURIComponent(String(s ?? '').trim());
      const raw = String(payload.mode ?? '').toLowerCase();
      let travelParam: string | null = null;
      if (raw) {
        if (/(velo|vélo|bike|cycl)/i.test(raw)) travelParam = 'bicycling';
        else if (/(two|2).*-?wheeler|deux.?roues|scooter|moto/i.test(raw)) travelParam = 'two-wheeler';
        else if (/(pied|walk|marche|foot)/i.test(raw)) travelParam = 'walking';
        else if (/(train|metro|métro|rer|tram|bus|transit|transport)/i.test(raw)) travelParam = 'transit';
        else if (/(drive|car|auto|voiture|condui)/i.test(raw)) travelParam = 'driving';
      }
      const base = `https://www.google.com/maps/dir/?api=1&origin=${enc(payload.origin)}&destination=${enc(payload.destination)}`;
      const dirUrl = travelParam ? `${base}&travelmode=${encodeURIComponent(travelParam)}` : base;
      const dirTab = await ensureDirectionsTab(dirUrl, preferredTabId);
      const fallbackWaitBudget = computeWaitBudgetMs(dirTab.loadMs);
      const [{ result: re }] = await chrome.scripting.executeScript({
        target: { tabId: dirTab.tabId },
        world: 'MAIN',
        args: [fallbackWaitBudget],
        func: async (maxWaitBudgetMsRaw?: number) => {
          const defaultWaitBudget = typeof maxWaitBudgetMsRaw === 'number' && Number.isFinite(maxWaitBudgetMsRaw)
            ? Math.min(90000, Math.max(12000, maxWaitBudgetMsRaw))
            : 22000;
          const chooseWaitBudget = (requested?: number) => {
            const cap = 12000;
            if (typeof requested === 'number' && Number.isFinite(requested)) {
              const normalized = Math.max(0, requested);
              return Math.max(defaultWaitBudget, Math.min(normalized, defaultWaitBudget + cap));
            }
            return defaultWaitBudget;
          };

          function textCompact(s?: string | null, max = 200): string | undefined {
            if (!s) return undefined;
            const v = s.replace(/\s+/g, ' ').trim();
            return v.length ? v.slice(0, max) : undefined;
          }
          function parseDuration(text: string): number | undefined {
            const t = text.toLowerCase();
            let m = t.match(/(\d+)\s*h\s*(\d+)\s*min/);
            if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
            m = t.match(/(\d+)\s*h(?!\w)/);
            if (m) return parseInt(m[1]) * 60;
            m = t.match(/(\d+)\s*min/);
            if (m) return parseInt(m[1]);
            return undefined;
          }
          function parseDistance(text: string): number | undefined {
            const m = text.toLowerCase().match(/(\d+[\.,]?\d*)\s*km/);
            if (m) return parseFloat(m[1].replace(',', '.'));
            return undefined;
          }
          const durationPattern = /((\d+\s*h\s*\d+\s*min)|(\d+\s*h(?!\w))|(\d+\s*min))/i;

          const gatherTexts = (element?: Element | null, max = 260): string[] => {
            if (!element) return [];
            const list: string[] = [];
            const push = (value?: string | null, limit = max) => {
              const normalized = textCompact(value, limit);
              if (normalized && !list.includes(normalized)) list.push(normalized);
            };
            if (element instanceof HTMLElement) {
              push(element.innerText, 320);
              push(element.getAttribute('aria-label'), 220);
              push(element.getAttribute('title'), 220);
              for (const attr of Array.from(element.attributes)) {
                if (attr.name.startsWith('data-')) push(attr.value, 200);
              }
            } else {
              push(element.textContent, 320);
            }
            return list;
          };

          const pickDuration = (texts: string[]): number | undefined => {
            for (const text of texts) {
              const dur = parseDuration(text);
              if (typeof dur === 'number') return dur;
            }
            return undefined;
          };

          const pickDistance = (texts: string[]): number | undefined => {
            for (const text of texts) {
              const dist = parseDistance(text);
              if (typeof dist === 'number') return dist;
            }
            return undefined;
          };

          function extractRoutes(): { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] {
        const base = readNetworkRoutes().map((item) => ({ ...item, mode: undefined as string | undefined, modeLabel: undefined as string | undefined }));
            const seenKeys = new Set(base.map((item) => `${item.mode ?? 'default'}|${item.durationMin}|${item.distanceKm ?? ''}`));
            const nodes = Array.from(document.querySelectorAll('*')) as HTMLElement[];
            const results: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] = [...base];
            const seenPairs = new Set<string>(base.map((item) => `${item.durationMin}|${item.distanceKm ?? ''}`));
            for (const el of nodes) {
              const texts: string[] = [];
              const merge = (src: Element | null | undefined, max = 260) => {
                if (!src) return;
                for (const entry of gatherTexts(src, max)) {
                  if (!texts.includes(entry)) texts.push(entry);
                }
              };
              merge(el, 320);
              merge(el.parentElement, 260);
              merge(el.previousElementSibling, 200);
              merge(el.nextElementSibling, 200);
              if (texts.length === 0) continue;
              const combined = texts.join(' • ');
              if (!durationPattern.test(combined)) continue;
              const dur = pickDuration(texts);
              if (typeof dur !== 'number') continue;
              let dist = pickDistance(texts);
              if (typeof dist !== 'number' && el.parentElement) {
                dist = pickDistance(gatherTexts(el.parentElement, 260));
              }
              const distanceKm = typeof dist === 'number' ? Math.round(dist * 100) / 100 : undefined;
              const durationMin = Math.max(1, Math.round(dur));
              const key = `${durationMin}|${distanceKm ?? ''}`;
              if (seenPairs.has(key)) continue;
              seenPairs.add(key);
              const sample = texts[0] ?? combined;
              const route = { durationMin, distanceKm, text: sample, mode: undefined, modeLabel: undefined };
              const signature = `${route.mode ?? 'default'}|${route.durationMin}|${route.distanceKm ?? ''}`;
              if (seenKeys.has(signature)) continue;
              seenKeys.add(signature);
              results.push(route);
              if (results.length >= 20) break;
            }
            const dedup: { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[] = [];
            const seen = new Set<string>();
            for (const route of results.sort((a, b) => a.durationMin - b.durationMin)) {
              const key = `${route.mode ?? 'default'}|${route.durationMin}|${route.distanceKm ?? ''}`;
              if (seen.has(key)) continue;
              seen.add(key);
              dedup.push(route);
              if (dedup.length >= 5) break;
            }
            return dedup;
          }
          async function waitForRoutesUntil(
            extract: () => { durationMin: number; distanceKm?: number; text?: string; mode?: string; modeLabel?: string }[],
            maxWaitMs?: number
          ): Promise<void> {
            const limit = chooseWaitBudget(maxWaitMs);
            const start = Date.now();
            let lastCount = 0;
            let lastStableAt = start;
            return new Promise((resolve) => {
              let settled = false;
              let timeoutId: ReturnType<typeof setTimeout> | undefined;
              let pollerId: ReturnType<typeof setInterval> | undefined;
              let observer: MutationObserver | undefined;
              let listener: ((event: Event) => void) | undefined;

              const cleanup = () => {
                if (observer) {
                  observer.disconnect();
                  observer = undefined;
                }
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = undefined;
                }
                if (pollerId) {
                  clearInterval(pollerId);
                  pollerId = undefined;
                }
                if (listener) {
                  window.removeEventListener('cometi:routes-updated', listener);
                  listener = undefined;
                }
              };

              const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
              };

              const check = () => {
                if (settled) return;
                const routes = extract();
                const count = routes.length;
                if (count !== lastCount) {
                  lastCount = count;
                  lastStableAt = Date.now();
                }
                if (count > 0 && Date.now() - lastStableAt >= 600) {
                  finish();
                  return;
                }
                if (Date.now() - start > limit) {
                  finish();
                }
              };

          try {
            observer = new MutationObserver(() => {
              check();
            });
            observer.observe(document.body, { childList: true, subtree: true });
          } catch {
            observer = undefined;
          }

          pollerId = setInterval(check, 200);
          listener = () => {
            check();
          };
          window.addEventListener('cometi:routes-updated', listener);
          timeoutId = setTimeout(finish, limit);
          check();
        });
      }
          await waitForRoutesUntil(extractRoutes, 32000);
          const routes = extractRoutes();
          const best = routes[0] ?? null;
          return { routes, best, pageUrl: window.location.href };
        },
      });
      await logToBackend('route', 'info', 'done', {
        pageUrl: re?.pageUrl,
        routes: re?.routes?.length ?? 0,
        best: re?.best,
        loadMs: dirTab.loadMs,
        waitBudget: fallbackWaitBudget,
        reusedTab: dirTab.reused,
      });
      if (!re || (re.routes ?? []).length === 0) {
        await logToBackend('route', 'warn', 'no_routes');
      }
      return re ?? { routes: [], best: null };
    }
  }
  return result ?? { routes: [], best: null };
}

type PageContextPayload = {
  url: string;
  title?: string;
};

let lastBroadcastKey: string | undefined;

function dispatchPageContextChange(payload: PageContextPayload) {
  const message = { type: 'page:context-changed' as const, payload };
  try {
    chrome.runtime.sendMessage(message, () => {
      // In MV3, sendMessage throws via runtime.lastError when no listeners are ready.
      if (chrome.runtime.lastError) {
        // Swallow errors silently; the sidepanel may not be active yet.
      }
    });
  } catch (error) {
    console.debug('Unable to broadcast page context change', error);
  }
}

function shouldBroadcastForTab(tab?: chrome.tabs.Tab): tab is chrome.tabs.Tab & { url: string } {
  if (!tab || typeof tab.url !== 'string') {
    return false;
  }
  return isHttpProtocol(tab.url);
}

function notifyActiveContext(tab?: chrome.tabs.Tab) {
  if (!shouldBroadcastForTab(tab)) {
    return;
  }

  const normalizedUrl = normalizeUrl(tab.url);
  const title = tab.title ?? undefined;
  const nextKey = `${normalizedUrl}::${title ?? ''}`;

  if (lastBroadcastKey === nextKey) {
    return;
  }

  lastBroadcastKey = nextKey;
  dispatchPageContextChange({ url: normalizedUrl, title });
}

async function emitCurrentActiveContext() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    notifyActiveContext(activeTab);
  } catch (error) {
    console.debug('Unable to resolve active tab context', error);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  void chrome.tabs
    .get(activeInfo.tabId)
    .then((tab) => {
      if (tab.active) {
        notifyActiveContext(tab);
      }
    })
    .catch(() => {
      // Ignore failures when the tab is no longer available.
    });
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab || !tab.active) {
    return;
  }

  const navigated = typeof changeInfo.url === 'string' || changeInfo.status === 'complete';
  if (!navigated) {
    return;
  }

  notifyActiveContext(tab);
});

void emitCurrentActiveContext();
