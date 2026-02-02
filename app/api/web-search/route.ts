import { NextResponse } from 'next/server';

type WebSearchResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedDate?: string;
};

const TAVILY_MISSING_MESSAGE = "Chief, TAVILY_API_KEY is missing from the environment. I'm flying blind.";

function toDomain(u: string): string {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function dedupeByUrl(items: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  const out: WebSearchResult[] = [];
  for (const r of items) {
    const key = r.url.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function tavilySearch(query: string, maxResults: number, includeDomains?: string[]): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY || '';
  if (!apiKey) return [];
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_domains: Array.isArray(includeDomains) && includeDomains.length ? includeDomains : undefined,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
  };
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .map((r) => {
      const url = String(r.url || '');
      const title = String(r.title || '').trim();
      const snippet = String(r.content || '').trim();
      const domain = toDomain(url);
      return {
        title: title || url,
        url,
        source: domain || 'web',
        snippet,
        publishedDate: r.published_date ? String(r.published_date) : undefined,
      } satisfies WebSearchResult;
    })
    .filter((r) => r.url && r.title);
}

async function serperSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY || '';
  if (!apiKey) return [];
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: Math.max(1, Math.min(20, maxResults)),
      gl: 'us',
      hl: 'en',
    }),
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string; source?: string }>;
  };
  const rows = Array.isArray(data.organic) ? data.organic : [];
  return rows
    .map((r) => {
      const url = String(r.link || '');
      const domain = toDomain(url);
      return {
        title: String(r.title || url).trim(),
        url,
        source: String(r.source || domain || 'web'),
        snippet: String(r.snippet || '').trim(),
        publishedDate: r.date ? String(r.date) : undefined,
      } satisfies WebSearchResult;
    })
    .filter((r) => r.url && r.title);
}

export async function GET() {
  return NextResponse.json({
    tavilyConfigured: !!process.env.TAVILY_API_KEY,
    serperConfigured: !!process.env.SERPER_API_KEY,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: unknown; maxResults?: unknown };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const maxResultsRaw = typeof body.maxResults === 'number' ? body.maxResults : Number(body.maxResults);
    const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(1, Math.min(10, Math.floor(maxResultsRaw))) : 10;
    if (!query) return NextResponse.json({ results: [] satisfies WebSearchResult[] });

    const tier1Domains = ['reuters.com', 'bloomberg.com', 'theguardian.com'];
    const socialDomains = ['reddit.com', 'bsky.app', 'x.com', 'twitter.com'];

    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasSerper = !!process.env.SERPER_API_KEY;
    if (!hasTavily && !hasSerper) {
      return NextResponse.json({ results: [] satisfies WebSearchResult[], error: TAVILY_MISSING_MESSAGE });
    }

    const viaTier1 = hasTavily
      ? await tavilySearch(query, maxResults, tier1Domains)
      : await serperSearch(`${query} (site:reuters.com OR site:bloomberg.com OR site:theguardian.com)`, maxResults);

    const viaOpenWeb = hasTavily
      ? await tavilySearch(query, maxResults)
      : await serperSearch(query, maxResults);

    const viaSocial = hasTavily
      ? await tavilySearch(query, Math.max(3, Math.floor(maxResults / 2)), socialDomains)
      : await serperSearch(`${query} (site:reddit.com OR site:bsky.app OR site:x.com OR site:twitter.com)`, Math.max(3, Math.floor(maxResults / 2)));

    const merged = dedupeByUrl([...viaTier1, ...viaOpenWeb, ...viaSocial]).slice(0, maxResults);
    return NextResponse.json({
      results: merged,
      warning: hasTavily ? undefined : TAVILY_MISSING_MESSAGE,
    });
  } catch {
    return NextResponse.json({ results: [] satisfies WebSearchResult[] }, { status: 200 });
  }
}
