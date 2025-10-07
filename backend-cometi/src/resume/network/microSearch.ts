export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function flattenTopics(topics: Array<Record<string, unknown>>, accumulator: SearchResult[]) {
  topics.forEach((topic) => {
    if (Array.isArray(topic.Topics)) {
      flattenTopics(topic.Topics as Array<Record<string, unknown>>, accumulator);
      return;
    }

    const text = typeof topic.Text === 'string' ? topic.Text : undefined;
    const firstUrl = typeof topic.FirstURL === 'string' ? topic.FirstURL : undefined;
    const title =
      typeof topic.Result === 'string'
        ? topic.Result
        : typeof topic.Text === 'string'
          ? topic.Text
          : undefined;

    if (text && firstUrl) {
      accumulator.push({
        title: title ?? text,
        url: firstUrl,
        snippet: text,
      });
    }
  });
}

export async function microSearch(query: string, limit = 4): Promise<SearchResult[]> {
  const endpoint = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo a renvoyé ${response.status}`);
    }

    const data = (await response.json()) as {
      RelatedTopics?: Array<Record<string, unknown>>;
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
    };

    const results: SearchResult[] = [];
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading ?? data.AbstractText,
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      flattenTopics(data.RelatedTopics, results);
    }

    const deduped: SearchResult[] = [];
    const seen = new Set<string>();
    for (const result of results) {
      const key = result.url;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(result);
      if (deduped.length >= limit) {
        break;
      }
    }

    return deduped;
  } catch (_error) {
    return [];
  }
}
