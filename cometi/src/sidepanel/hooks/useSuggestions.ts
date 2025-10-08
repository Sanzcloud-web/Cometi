import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestSuggestions } from '../services/suggestionsClient';
import type { Suggestion } from '../types/suggestions';
import { useActivePageContext } from './useActivePageContext';
import { requestResumeContext } from '../services/pageAnswerStream';
import { extractTextSnippet } from '../utils/html';

type SuggestionsState = {
  suggestions: Suggestion[];
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
};

type CachedSuggestionsEntry = {
  suggestions: Suggestion[];
  contextLabel?: string;
  fetchedAt: number;
};
const INITIAL_STATE: SuggestionsState = {
  suggestions: [],
  isLoading: true,
  isRefreshing: false,
};

export function useSuggestions() {
  const [state, setState] = useState<SuggestionsState>(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const cacheRef = useRef(new Map<string, CachedSuggestionsEntry>());
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

    // Build a cache key that includes domain + a small part of context (title/url)
    const contextLabel = (title && title.trim()) || url || undefined;
    const normalizedContext = contextLabel?.trim() || undefined;
    const cacheKey = `${targetDomain}|${(normalizedContext ?? '').slice(0, 120)}`;
    const cachedEntry = cacheRef.current.get(cacheKey);
    const cachedSuggestions = cachedEntry?.suggestions ?? [];
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
        // Retrieve a small text snippet of the current page DOM (if available)
        let snippet: string | undefined = undefined;
        try {
          const ctx = await requestResumeContext();
          const html = ctx.domSnapshot?.html;
          if (html && html.trim().length > 0) {
            snippet = extractTextSnippet(html, 1200);
          }
        } catch (_e) {
          // Non-fatal: if DOM snapshot is unavailable, continue without snippet
        }

        const suggestions = await requestSuggestions({
          domain: targetDomain,
          context: normalizedContext,
          snippet,
          language: 'fr',
        });

        if (!cancelled && requestCounterRef.current === requestId) {
          cacheRef.current.set(cacheKey, {
            suggestions,
            contextLabel: normalizedContext,
            fetchedAt: Date.now(),
          });
          setState({ suggestions, isLoading: false, isRefreshing: false, error: undefined });
        }
      } catch (error) {
        if (!cancelled && requestCounterRef.current === requestId) {
          const message =
            error instanceof Error ? error.message : "Impossible de récupérer les suggestions disponibles.";
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
