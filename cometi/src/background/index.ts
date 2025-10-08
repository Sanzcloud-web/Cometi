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
    const { origin, destination, language } = message.payload ?? {};
    void computeFastestRoute({ origin, destination, language })
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

async function computeFastestRoute(payload: { origin: string; destination: string; language?: string }): Promise<{
  best: { durationMin: number; distanceKm?: number; text?: string } | null;
  routes: { durationMin: number; distanceKm?: number; text?: string }[];
  pageUrl?: string;
}> {
  const tab = await getActiveHttpTab();
  if (typeof tab.id !== 'number') throw new Error("Impossible de déterminer l'onglet actif.");
  await logToBackend('route', 'info', 'start', { origin: payload.origin, destination: payload.destination, url: tab.url });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    args: [payload.origin, payload.destination],
    func: async (originValue: string, destinationValue: string) => {
      const dbg: any[] = [];
      const log = (msg: string, data?: any) => { dbg.push({ msg, data }); };
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
      async function waitForRoutesUntil(extract: () => { durationMin: number; distanceKm?: number; text?: string }[], maxWaitMs = 45000): Promise<void> {
        const start = Date.now();
        let lastCount = 0;
        let lastChange = Date.now();
        return new Promise((resolve) => {
          const loop = () => {
            const count = extract().length;
            if (count !== lastCount) {
              lastCount = count;
              lastChange = Date.now();
            }
            // If we have at least 1 route and stable for 1200ms, resolve
            if (lastCount > 0 && Date.now() - lastChange > 1200) {
              resolve();
              return;
            }
            if (Date.now() - start > maxWaitMs) {
              resolve();
              return;
            }
            setTimeout(loop, 300);
          };
          loop();
        });
      }

      async function navigateToDir(origin: string, dest: string) {
        const enc = (s: string) => encodeURIComponent(s.trim());
        const url = `https://www.google.com/maps/dir/${enc(origin)}/${enc(dest)}`;
        log('navigate_dir_url', { url });
        window.location.assign(url);
      }
      function extractRoutes(): { durationMin: number; distanceKm?: number; text?: string }[] {
        const results: { durationMin: number; distanceKm?: number; text?: string }[] = [];
        const nodes = Array.from(document.querySelectorAll('*')) as HTMLElement[];
        for (const el of nodes) {
          const txt = textCompact(el.innerText, 300);
          if (!txt) continue;
          if (!/(\d+\s*h\s*\d+\s*min|\d+\s*min)/i.test(txt)) continue;
          const dur = parseDuration(txt);
          let dist = parseDistance(txt);
          // Try parent text for distance if not present in same element
          if (typeof dist !== 'number' && el.parentElement) {
            const pTxt = textCompact(el.parentElement.innerText, 300) || '';
            dist = parseDistance(pTxt);
          }
          if (!dur) continue;
          results.push({ durationMin: dur, distanceKm: dist, text: txt });
        }
        // Deduplicate by duration+distance and keep top 5 shortest
        const seen = new Set<string>();
        const uniq = [] as { durationMin: number; distanceKm?: number; text?: string }[];
        for (const r of results.sort((a, b) => a.durationMin - b.durationMin)) {
          const key = `${r.durationMin}|${r.distanceKm ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          uniq.push(r);
          if (uniq.length >= 5) break;
        }
        return uniq;
      }

      // 0) Ensure directions panel if needed (click Directions button once)
      let { a, b } = findDirectionsFields();
      if (!a || !b) {
        const btns = directionsButtonCandidates();
        if (btns.length) {
          (btns[0] as HTMLElement).click();
          await sleep(800);
          await waitForRoutes(2000);
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

      // 2) Wait for rendering to settle
      await waitForRoutesUntil(extractRoutes);
      // If still no routes extracted, try a small nudge (press Enter on destination again) and wait longer
      if (extractRoutes().length === 0) {
        log('nudge_destination_enter');
        await pressEnter(b);
        await waitForRoutesUntil(extractRoutes, 30000);
      }
      // If still nothing, hard navigate to Maps dir URL
      if (extractRoutes().length === 0) {
        await navigateToDir(originValue, destinationValue);
        await waitForRoutesUntil(extractRoutes, 60000);
      }

      // 3) Extract route variants
      const routes = extractRoutes();
      log('routes_extracted', { count: routes.length });
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
    if (typeof tab2.id === 'number') {
      const enc = (s: string) => encodeURIComponent(s.trim());
      const dirUrl = `https://www.google.com/maps/dir/${enc(payload.origin)}/${enc(payload.destination)}`;
      await chrome.tabs.update(tab2.id, { url: dirUrl });
      // wait until complete
      await new Promise<void>((resolve) => {
        const started = Date.now();
        const max = 60000;
        const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo, updatedTab: chrome.tabs.Tab) => {
          if (updatedTabId !== tab2.id) return;
          if (info.status === 'complete' && typeof updatedTab.url === 'string' && updatedTab.url.includes('/maps/dir/')) {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        const tick = setInterval(async () => {
          try {
            const tinfo = await chrome.tabs.get(tab2.id!);
            if (tinfo.status === 'complete' && typeof tinfo.url === 'string' && tinfo.url.includes('/maps/dir/')) {
              chrome.tabs.onUpdated.removeListener(listener);
              clearInterval(tick);
              resolve();
            }
          } catch {}
          if (Date.now() - started > max) {
            chrome.tabs.onUpdated.removeListener(listener);
            clearInterval(tick);
            resolve();
          }
        }, 400);
      });
      const [{ result: re }] = await chrome.scripting.executeScript({
        target: { tabId: tab2.id },
        world: 'MAIN',
        func: async () => {
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
          function extractRoutes(): { durationMin: number; distanceKm?: number; text?: string }[] {
            const results: { durationMin: number; distanceKm?: number; text?: string }[] = [];
            const nodes = Array.from(document.querySelectorAll('*')) as HTMLElement[];
            for (const el of nodes) {
              const txt = textCompact(el.innerText, 300);
              if (!txt) continue;
              if (!/(\d+\s*h\s*\d+\s*min|\d+\s*min)/i.test(txt)) continue;
              const dur = parseDuration(txt);
              let dist = parseDistance(txt);
              if (typeof dist !== 'number' && el.parentElement) {
                const pTxt = textCompact(el.parentElement.innerText, 300) || '';
                dist = parseDistance(pTxt);
              }
              if (!dur) continue;
              results.push({ durationMin: dur, distanceKm: dist, text: txt });
            }
            const seen = new Set<string>();
            const uniq = [] as { durationMin: number; distanceKm?: number; text?: string }[];
            for (const r of results.sort((a, b) => a.durationMin - b.durationMin)) {
              const key = `${r.durationMin}|${r.distanceKm ?? ''}`;
              if (seen.has(key)) continue;
              seen.add(key);
              uniq.push(r);
              if (uniq.length >= 5) break;
            }
            return uniq;
          }
          async function waitForRoutesUntil(extract: () => { durationMin: number; distanceKm?: number; text?: string }[], maxWaitMs = 60000): Promise<void> {
            const start = Date.now();
            let lastCount = 0;
            let lastChange = Date.now();
            return new Promise((resolve) => {
              const loop = () => {
                const count = extract().length;
                if (count !== lastCount) {
                  lastCount = count;
                  lastChange = Date.now();
                }
                if (lastCount > 0 && Date.now() - lastChange > 1200) {
                  resolve();
                  return;
                }
                if (Date.now() - start > maxWaitMs) {
                  resolve();
                  return;
                }
                setTimeout(loop, 300);
              };
              loop();
            });
          }
          await waitForRoutesUntil(extractRoutes, 60000);
          const routes = extractRoutes();
          const best = routes[0] ?? null;
          return { routes, best, pageUrl: window.location.href };
        },
      });
      await logToBackend('route', 'info', 'done', { pageUrl: re?.pageUrl, routes: re?.routes?.length ?? 0, best: re?.best });
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
