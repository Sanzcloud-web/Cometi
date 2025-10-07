import { useEffect, useMemo, useState } from 'react';
import { requestResumeContext } from '../services/pageAnswerStream';

type ActivePageContext = {
  url?: string;
  title?: string;
  domain?: string;
  lastUpdatedAt?: number;
};

type PageContextMessage = {
  type: 'page:context-changed';
  payload?: { url?: string; title?: string };
};

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return undefined;
  }
}

export function useActivePageContext(): ActivePageContext {
  const [context, setContext] = useState<ActivePageContext>({});

  useEffect(() => {
    let cancelled = false;

    const applyContext = (payload?: { url?: string; title?: string }) => {
      if (cancelled) return;
      const nextUrl = payload?.url;
      const nextTitle = payload?.title ?? undefined;
      const nextDomain = extractDomain(nextUrl);

      setContext((prev) => {
        if (prev.url === nextUrl && prev.title === nextTitle) {
          return prev;
        }

        return {
          url: nextUrl,
          title: nextTitle,
          domain: nextDomain,
          lastUpdatedAt: Date.now(),
        } satisfies ActivePageContext;
      });
    };

    const bootstrap = async () => {
      try {
        const resumeContext = await requestResumeContext();
        applyContext({
          url: resumeContext.url,
          title: resumeContext.title ?? resumeContext.domSnapshot?.title,
        });
      } catch (error) {
        console.warn('[Cometi] Impossible de récupérer le contexte de page initial :', error);
      }
    };

    void bootstrap();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
        message: PageContextMessage
      ) => {
        if (message?.type === 'page:context-changed') {
          applyContext(message.payload);
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      return () => {
        cancelled = true;
        chrome.runtime.onMessage.removeListener(listener);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => context, [context]);
}
