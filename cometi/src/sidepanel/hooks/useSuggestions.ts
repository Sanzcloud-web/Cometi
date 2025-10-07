import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestSuggestions } from '../services/suggestionsClient';
import type { Suggestion } from '../types/suggestions';
import { useActivePageContext } from './useActivePageContext';

type SuggestionsState = {
  suggestions: Suggestion[];
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
};

const INITIAL_STATE: SuggestionsState = {
  suggestions: [],
  isLoading: true,
  isRefreshing: false,
};

export function useSuggestions() {
  const [state, setState] = useState<SuggestionsState>(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const requestCounterRef = useRef(0);
  const { domain, title, url } = useActivePageContext();

  const resolvedDomain = useMemo(() => {
    if (domain && domain.trim().length > 0) {
      return domain.trim().toLowerCase();
    }
    if (typeof window !== 'undefined') {
      try {
        return window.location.hostname || undefined;
      } catch (_error) {
        return undefined;
      }
    }
    return undefined;
  }, [domain]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const targetDomain = resolvedDomain;

    if (!targetDomain) {
      setState({ suggestions: [], isLoading: false, isRefreshing: false, error: undefined });
      return;
    }

    const cachedSuggestions = cacheRef.current.get(targetDomain) ?? [];
    const hasCachedSuggestions = cachedSuggestions.length > 0;
    let cancelled = false;
    const requestId = ++requestCounterRef.current;

    async function load() {
      setState({
        suggestions: hasCachedSuggestions ? cachedSuggestions : [],
        isLoading: !hasCachedSuggestions,
        isRefreshing: hasCachedSuggestions,
        error: undefined,
      });

      try {
        const contextLabel = (title && title.trim()) || url || undefined;
        const suggestions = await requestSuggestions({ domain: targetDomain, context: contextLabel, language: 'fr' });

        if (!cancelled && requestCounterRef.current === requestId) {
          cacheRef.current.set(targetDomain, suggestions);
          setState({ suggestions, isLoading: false, isRefreshing: false, error: undefined });
        }
      } catch (error) {
        if (!cancelled && requestCounterRef.current === requestId) {
          const message =
            error instanceof Error ? error.message : 'Impossible de récupérer les suggestions disponibles.';
          setState((prev) => ({
            suggestions: hasCachedSuggestions ? cachedSuggestions : prev.suggestions,
            isLoading: !hasCachedSuggestions,
            isRefreshing: false,
            error: message,
          }));
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [resolvedDomain, title, url, reloadToken]);

  return useMemo(
    () => ({
      suggestions: state.suggestions,
      isLoading: state.isLoading,
      isRefreshing: state.isRefreshing,
      error: state.error,
      refresh,
    }),
    [state.suggestions, state.isLoading, state.isRefreshing, state.error, refresh]
  );
}

