import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestSuggestions } from '../services/suggestionsClient';
import { requestResumeContext } from '../services/pageAnswerStream';
import type { Suggestion } from '../types/suggestions';

type SuggestionsState = {
  suggestions: Suggestion[];
  isLoading: boolean;
  error?: string;
};

const INITIAL_STATE: SuggestionsState = {
  suggestions: [],
  isLoading: true,
};

function getDomainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch (_error) {
    return undefined;
  }
}

function getFallbackDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.location.hostname || undefined;
  } catch (_error) {
    return undefined;
  }
}

export function useSuggestions() {
  const [state, setState] = useState<SuggestionsState>(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      try {
        let domain: string | undefined;
        let context: string | undefined;

        try {
          const resumeContext = await requestResumeContext();
          domain = getDomainFromUrl(resumeContext.url);
          context = resumeContext.title ?? resumeContext.domSnapshot?.title ?? undefined;
        } catch (error) {
          console.warn('[Cometi] Impossible de récupérer le contexte page pour les suggestions:', error);
          domain = getFallbackDomain();
        }

        const suggestions = await requestSuggestions({ domain, context, language: 'fr' });

        if (!cancelled) {
          setState({ suggestions, isLoading: false, error: undefined });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Impossible de récupérer les suggestions disponibles.";
          setState({ suggestions: [], isLoading: false, error: message });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return useMemo(
    () => ({
      suggestions: state.suggestions,
      isLoading: state.isLoading,
      error: state.error,
      refresh,
    }),
    [state.suggestions, state.isLoading, state.error, refresh]
  );
}
