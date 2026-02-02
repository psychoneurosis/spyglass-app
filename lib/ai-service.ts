export type ExtractEntity = { type: 'person' | 'location' | 'event' | 'evidence' | 'theory'; name: string; metadata?: unknown };
export type Relationship = { from: string; to: string; type: string };
export type AnalyzeTextResult = { entities: ExtractEntity[]; dates: string[]; locations: string[]; relationships: Relationship[] };

export type SuggestedAction = { label: string; priority: 'low' | 'medium' | 'high' | 'critical' };
export type Pattern = { description: string; confidence: number };
export type Contradiction = { description: string; involved: string[] };
export type Gap = { description: string; suggestedNextStep: string };
export type AnalyzeStoryResult = { suggestedActions: SuggestedAction[]; detectedPatterns: Pattern[]; contradictions: Contradiction[]; missingInfo: Gap[]; storyStrength: number };

export type ProcessCommandResult = { action: 'filter' | 'create' | 'search' | 'export' | 'analyze'; parameters: Record<string, unknown> };

export type ConnectionSuggestion = { targetNode: string; type: string; confidence: number };

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export type WebSearchResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedDate?: string;
  tier?: 'tier1' | 'unknown';
};

export type IntelWirePayload = {
  query: string;
  results: WebSearchResult[];
  meat?: { people: string[]; orgs: string[]; dates: string[] };
  populateDesk?: boolean;
  warning?: string;
  error?: string;
};

const SYSTEM_PROMPT =
  'You are an AI assistant for Spyglass, a journalistic investigation platform. Help journalists investigate stories, verify claims, and organize evidence. Be precise, factual, ethical. When asked for JSON, return strict JSON only.';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const withoutStart = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, '');
    return withoutStart.replace(/\n?```$/, '').trim();
  }
  return trimmed;
}

async function groqCall(prompt: string): Promise<string> {
  if (!GROQ_API_KEY) return 'Error: Missing Groq API Key. Check .env.local.';
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq Error:', response.status, errText);
      return `Error: ${response.status}. Click RESET STATION.`;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content;
    return text || 'No response.';
  } catch (err) {
    console.error('Groq Connection Failed:', err);
    return 'Station Offline. Check Network.';
  }
}

type GroqTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

type GroqMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

async function groqChat(messages: GroqMessage[], opts?: { tools?: GroqTool[]; toolChoice?: 'auto' | 'none'; maxTokens?: number }) {
  if (!GROQ_API_KEY) {
    return {
      ok: false as const,
      error: 'Error: Missing Groq API Key. Check .env.local.',
    };
  }
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: opts?.tools,
        tool_choice: opts?.tools ? (opts?.toolChoice || 'auto') : undefined,
        temperature: 0.3,
        max_tokens: opts?.maxTokens ?? 2000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq Error:', response.status, errText);
      return { ok: false as const, error: `Error: ${response.status}. Click RESET STATION.` };
    }
    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const message = data?.choices?.[0]?.message;
    return { ok: true as const, message };
  } catch (err) {
    console.error('Groq Connection Failed:', err);
    return { ok: false as const, error: 'Station Offline. Check Network.' };
  }
}

export async function groqGenerateText(prompt: string): Promise<string | null> {
  return await groqCall(prompt);
}

export async function geminiGenerateText(prompt: string): Promise<string | null> {
  return await groqCall(prompt);
}

export async function callGeminiJson(prompt: string): Promise<unknown | null> {
  const txt = await groqCall(prompt);
  if (!txt) return null;
  const cleaned = stripCodeFences(txt);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function basicDates(text: string) {
  const m = Array.from(text.matchAll(/\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\b\d{4}-\d{2}-\d{2}\b/gi)).map(x => x[0]);
  return Array.from(new Set(m));
}

function basicLocations(text: string) {
  const m = Array.from(text.matchAll(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g)).map(x => x[0]).filter(w => w.length > 2);
  return Array.from(new Set(m)).slice(0, 10);
}

export async function analyzeText(text: string): Promise<AnalyzeTextResult> {
  const prompt = `Extract entities, dates, locations, and relationships from the following text. Return strict JSON with keys: entities[{type,name,metadata}], dates[], locations[], relationships[{from,to,type}]. Text:\n${text}`;
  const json = await callGeminiJson(prompt);
  if (json) {
    const obj = json as Record<string, unknown>;
    const entitiesRaw = obj['entities'];
    const datesRaw = obj['dates'];
    const locationsRaw = obj['locations'];
    const relationshipsRaw = obj['relationships'];
    return {
      entities: Array.isArray(entitiesRaw) ? (entitiesRaw as ExtractEntity[]) : [],
      dates: Array.isArray(datesRaw) ? (datesRaw as string[]) : [],
      locations: Array.isArray(locationsRaw) ? (locationsRaw as string[]) : [],
      relationships: Array.isArray(relationshipsRaw) ? (relationshipsRaw as Relationship[]) : [],
    };
  }
  return { entities: [], dates: basicDates(text), locations: basicLocations(text), relationships: [] };
}

export async function analyzeStoryState(storyData: unknown): Promise<AnalyzeStoryResult> {
  const prompt = `Given this story JSON, analyze and return strict JSON keys: suggestedActions[{label,priority}], detectedPatterns[{description,confidence}], contradictions[{description,involved}], missingInfo[{description,suggestedNextStep}], storyStrength.\nStory:\n${JSON.stringify(storyData)}`;
  const json = await callGeminiJson(prompt);
  if (json) {
    const obj = json as Record<string, unknown>;
    const suggestedActionsRaw = obj['suggestedActions'];
    const detectedPatternsRaw = obj['detectedPatterns'];
    const contradictionsRaw = obj['contradictions'];
    const missingInfoRaw = obj['missingInfo'];
    const storyStrengthRaw = obj['storyStrength'];
    return {
      suggestedActions: Array.isArray(suggestedActionsRaw) ? (suggestedActionsRaw as SuggestedAction[]) : [],
      detectedPatterns: Array.isArray(detectedPatternsRaw) ? (detectedPatternsRaw as Pattern[]) : [],
      contradictions: Array.isArray(contradictionsRaw) ? (contradictionsRaw as Contradiction[]) : [],
      missingInfo: Array.isArray(missingInfoRaw) ? (missingInfoRaw as Gap[]) : [],
      storyStrength: typeof storyStrengthRaw === 'number' ? (storyStrengthRaw as number) : 0,
    };
  }
  return { suggestedActions: [], detectedPatterns: [], contradictions: [], missingInfo: [], storyStrength: 0 };
}

export async function processCommand(command: string, storyContext: unknown): Promise<ProcessCommandResult> {
  const prompt = `Parse the command for this investigation. Return strict JSON with keys: action in ["filter","create","search","export","analyze"] and parameters(object). Command: "${command}". Context:\n${JSON.stringify(storyContext)}`;
  const json = await callGeminiJson(prompt);
  if (json) {
    const obj = json as Record<string, unknown>;
    const action = obj['action'];
    const parameters = obj['parameters'];
    const allowed = ['filter', 'create', 'search', 'export', 'analyze'] as const;
    const act = typeof action === 'string' && (allowed as readonly string[]).includes(action) ? (action as (typeof allowed)[number]) : null;
    if (act) {
      return { action: act, parameters: (parameters as Record<string, unknown>) || {} };
    }
  }
  if (/create/i.test(command)) return { action: 'create', parameters: {} };
  if (/filter|find|show/i.test(command)) return { action: 'filter', parameters: {} };
  if (/search/i.test(command)) return { action: 'search', parameters: {} };
  if (/export|report/i.test(command)) return { action: 'export', parameters: {} };
  return { action: 'analyze', parameters: {} };
}

export async function suggestConnections(
  newNode: { name?: string },
  existingNodes: Array<{ id: string; name?: string }>
): Promise<ConnectionSuggestion[]> {
  const prompt = `Suggest connections for a new node based on existing nodes. Return strict JSON array of {targetNode,type,confidence}. New:\n${JSON.stringify(newNode)}\nExisting:\n${JSON.stringify(existingNodes)}`;
  const json = await callGeminiJson(prompt);
  if (Array.isArray(json)) return json as ConnectionSuggestion[];
  return [];
}

export async function testGeminiConnection() {
  try {
    const t = await groqCall('ping');
    if (!t) return { ok: false, message: 'Groq not configured' };
    return { ok: true, message: t.slice(0, 64) };
  } catch (e: unknown) {
    const msg = typeof e === 'object' && e && 'message' in (e as Record<string, unknown>) ? String((e as Record<string, unknown>).message) : String(e);
    return { ok: false, message: msg };
  }
}

export type EditorialVerdict = { verdict: 'PURSUE' | 'REFINE' | 'ABANDON'; score: number; reasoning?: string };

export type StoryViabilityResult = {
  verdict: 'PURSUE' | 'REFINE' | 'ABANDON';
  score: number;
  publicInterest: number;
  feasibility: number;
  ethicalConcerns: string[];
  suggestedAngles: string[];
  reasoning: string;
};

export async function assessStoryViability(
  storyIdeaOrAnswers:
    | string
    | {
        story_title: string;
        public_interest: string;
        initial_nodes: string;
        ethics_flag: string;
      }
): Promise<StoryViabilityResult | null> {
  const inputs =
    typeof storyIdeaOrAnswers === 'string'
      ? {
          story_title: storyIdeaOrAnswers,
          public_interest: 'Unknown',
          initial_nodes: 'None provided',
          ethics_flag: 'Unknown',
        }
      : storyIdeaOrAnswers;

  const prompt = [
    'You are a Pulitzer-winning Investigative Editor.',
    'Assess whether this story is worth pursuing.',
    'Return ONLY valid JSON with keys:',
    '{ "verdict": "PURSUE" | "REFINE" | "ABANDON", "publicInterest": <1-10>, "feasibility": <1-10>, "ethicalConcerns": ["<item>"], "suggestedAngles": ["<angle>"], "reasoning": "<brief>", "score": <1-10> }',
    'Inputs:',
    JSON.stringify(inputs),
  ].join('\n');

  try {
    const raw = await groqCall(prompt);
    const obj = JSON.parse(cleanJSON(raw)) as Record<string, unknown>;
    const verdictRaw = String(obj['verdict'] || '').toUpperCase();
    const reasoning = typeof obj['reasoning'] === 'string' ? String(obj['reasoning']) : '';
    const scoreRaw = obj['score'];
    const publicInterestRaw = obj['publicInterest'];
    const feasibilityRaw = obj['feasibility'];
    const ethicalConcernsRaw = obj['ethicalConcerns'];
    const suggestedAnglesRaw = obj['suggestedAngles'];

    const toScore10 = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isNaN(n)) return 0;
      return Math.max(0, Math.min(10, Math.round(n)));
    };

    if (verdictRaw !== 'PURSUE' && verdictRaw !== 'REFINE' && verdictRaw !== 'ABANDON') return null;

    const publicInterest = toScore10(publicInterestRaw);
    const feasibility = toScore10(feasibilityRaw);
    const score = toScore10(scoreRaw || obj['viability_score']);

    return {
      verdict: verdictRaw as StoryViabilityResult['verdict'],
      score,
      publicInterest,
      feasibility,
      ethicalConcerns: Array.isArray(ethicalConcernsRaw) ? (ethicalConcernsRaw as string[]).map(String) : [],
      suggestedAngles: Array.isArray(suggestedAnglesRaw) ? (suggestedAnglesRaw as string[]).map(String) : [],
      reasoning,
    };
  } catch {
    return null;
  }
}

function domainFromUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function rankDomainTier(domain: string): 'tier1' | 'unknown' {
  const d = domain.toLowerCase();
  const tier1 = new Set(['reuters.com', 'bloomberg.com', 'theguardian.com']);
  if (tier1.has(d)) return 'tier1';
  if (d.endsWith('.reuters.com')) return 'tier1';
  return 'unknown';
}

function extractMeat(results: WebSearchResult[]): { people: string[]; orgs: string[]; dates: string[] } {
  const text = results.map(r => `${r.title}\n${r.snippet}\n${r.publishedDate || ''}`).join('\n');

  const dateMatches = Array.from(text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map(m => m[0]);
  const monthMatches = Array.from(text.matchAll(/\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2}(?:,\s*\d{4})?\b/g)).map(m => m[0]);
  const dates = Array.from(new Set([...dateMatches, ...monthMatches])).slice(0, 12);

  const orgMatches = Array.from(
    text.matchAll(/\b[A-Z][A-Za-z&.\-]+(?:\s+[A-Z][A-Za-z&.\-]+){0,5}\s+(?:Ltd|Limited|Inc|Incorporated|Corp|Corporation|PLC|LLP|Group|Holdings)\b/g),
  ).map(m => m[0].trim());
  const orgKeywordMatches = Array.from(text.matchAll(/\b(?:Adani|Tata|Reliance|Vedanta|ONGC|SEBI|CBI|ED|CVC)\b/g)).map(m => m[0].trim());
  const orgs = Array.from(new Set([...orgMatches, ...orgKeywordMatches])).slice(0, 12);

  const personMatches = Array.from(text.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g)).map(m => m[0].trim());
  const people = Array.from(new Set(personMatches))
    .filter((n) => !/^(Reuters|Bloomberg|Guardian|The Guardian|India|Indian|US|United States|UK|United Kingdom)$/.test(n))
    .slice(0, 12);

  return { people, orgs, dates };
}

export async function webSearch(query: string, maxResults: number = 10): Promise<IntelWirePayload> {
  try {
    const resp = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, maxResults }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { query, results: [], error: errText || `Intel Wire error (${resp.status})` };
    }
    let data: { results?: WebSearchResult[]; error?: unknown; warning?: unknown } = {};
    try {
      data = (await resp.json()) as { results?: WebSearchResult[]; error?: unknown; warning?: unknown };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { query, results: [], error: msg || 'Intel Wire offline' };
    }
    const resultsRaw = Array.isArray(data.results) ? data.results : [];
    const normalized = resultsRaw
      .map((r) => {
        const url = String(r.url || '');
        const domain = domainFromUrl(url);
        return {
          title: String(r.title || '').trim(),
          url,
          source: String(r.source || domain || 'web'),
          snippet: String(r.snippet || '').trim(),
          publishedDate: r.publishedDate ? String(r.publishedDate) : undefined,
          tier: rankDomainTier(domain),
        } satisfies WebSearchResult;
      })
      .filter((r) => r.url && r.title)
      .slice(0, Math.max(1, Math.min(10, maxResults)));
    const meat = extractMeat(normalized);
    return {
      query,
      results: normalized,
      meat,
      populateDesk: meat.people.length + meat.orgs.length + meat.dates.length >= 4,
      warning: data.warning ? String(data.warning) : undefined,
      error: data.error ? String(data.error) : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { query, results: [], error: msg || 'Intel Wire offline' };
  }
}

function cleanJSON(raw: string): string {
  const cleaned = stripCodeFences(raw);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.slice(firstBracket, lastBracket + 1);
  }
  return cleaned.trim();
}

export interface FactCheckResult {
  verdict: 'true' | 'false' | 'unverified' | 'partially_true' | 'misleading';
  reasoning: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  gaps: string[];
}

export async function factCheckClaim(
  claim: string,
  evidence: { name: string; description: string }[]
): Promise<FactCheckResult> {
  try {
    const evidenceText = evidence.map((e, i) => `${i + 1}. ${e.name}: ${e.description}`).join('\n');
    const raw = await groqCall(
      `Fact-check this claim using evidence. Claim: "${claim}". Evidence: ${evidenceText}. Return ONLY valid JSON: { "verdict": "<true|false|unverified|partially_true|misleading>", "reasoning": "<how you reached this>", "supportingEvidence": ["<item>"], "contradictingEvidence": ["<item>"], "gaps": ["<what needed>"] }`
    );
    return JSON.parse(cleanJSON(raw)) as FactCheckResult;
  } catch {
    return {
      verdict: 'unverified',
      reasoning: 'AI unavailable',
      supportingEvidence: [],
      contradictingEvidence: [],
      gaps: ['Manual review needed'],
    };
  }
}

export interface CommandResult {
  action: string;
  parameters: Record<string, unknown>;
  response: string;
}

const TAVILY_MISSING_MESSAGE = "Chief, TAVILY_API_KEY is missing from the environment. I'm flying blind.";

async function getIntelWireConfig(): Promise<{ tavilyConfigured: boolean; serperConfigured: boolean } | null> {
  try {
    const resp = await fetch('/api/web-search', { method: 'GET' });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tavilyConfigured?: unknown; serperConfigured?: unknown };
    return { tavilyConfigured: Boolean(data?.tavilyConfigured), serperConfigured: Boolean(data?.serperConfigured) };
  } catch {
    return null;
  }
}

export async function processTerminalCommand(
  command: string,
  context: { nodes: { name: string; type: string; stamp?: string; verificationStatus?: string }[] },
  opts?: { storyStage?: string | null; editorialPersonality?: string | null }
): Promise<CommandResult> {
  try {
    const shouldIntelWire = (() => {
      const c = command.trim();
      if (!c) return false;
      if (/^(create|filter|show|find|connect|export)\b/i.test(c)) return false;
      if (/\b(research|intel|wire|web|search|background|who is|what is|timeline)\b/i.test(c)) return true;
      if (c.length >= 18) return true;
      if (/\b(latest|news|reports|coverage|timeline|background|update)\b/i.test(c)) return true;
      return false;
    })();

    const entities =
      context.nodes
        .map(n => {
          const bits = [n.stamp ? `stamp:${n.stamp}` : '', n.verificationStatus ? `status:${n.verificationStatus}` : ''].filter(Boolean);
          const meta = bits.length ? ` — ${bits.join(' ')}` : '';
          return `- ${n.name} (${n.type})${meta}`;
        })
        .join('\n') || 'None yet';
    const stageLine = opts?.storyStage ? `Story stage: ${opts.storyStage}` : 'Story stage: unknown';
    const personalityLine = opts?.editorialPersonality ? `Editorial personality: ${opts.editorialPersonality}` : 'Editorial personality: Senior Editor';
    const wireConfig = await getIntelWireConfig();
    const tavilyConfigured = Boolean(wireConfig?.tavilyConfigured);
    const serperConfigured = Boolean(wireConfig?.serperConfigured);
    const wireStatusLine = tavilyConfigured
      ? 'Intel Wire status: ACTIVE.'
      : serperConfigured
        ? 'Intel Wire status: WEAK (SERPER only).'
        : 'Intel Wire status: OFFLINE.';
    const canUseWire = tavilyConfigured || serperConfigured;

    const tools: GroqTool[] = [
      {
        type: 'function',
        function: {
          name: 'webSearch',
          description: 'Search the web via the Intelligence Wire and return JSON results.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              maxResults: { type: 'integer', minimum: 1, maximum: 10 },
            },
            required: ['query'],
          },
        },
      },
    ];

    const userPrompt = [
      `You are a grizzled, brilliant Senior Investigative Editor at the desk.`,
      `You are NOT a chatbot.`,
      `Style: short, punchy, newsroom jargon. Address the user as "Chief" when it fits.`,
      `Be desk-aware: reference specific canvas nodes when relevant.`,
      wireStatusLine,
      `Only use the Intelligence Wire when the user clearly asks for web research, latest coverage, background, a timeline, or says "search".`,
      `If the user did NOT ask for web research, do NOT mention keys, do NOT call webSearch, and do NOT set action=search.`,
      `If the user asks for web research and the wire is offline, you MUST say exactly: "${TAVILY_MISSING_MESSAGE}" and do not hallucinate sources.`,
      `${stageLine}.`,
      `${personalityLine}.`,
      `Task: Convert the user's terminal line into a structured action + a terse editorial response.`,
      `If you perform a search, you MUST use the results to propose desk population immediately.`,
      `Rules when search results exist:`,
      `- Cite sources by outlet + URL in the response.`,
      `- Set parameters.intelWire.populateDesk=true.`,
      `- Extract and include parameters.intelWire.meat.people/orgs/dates (arrays; empty arrays allowed but try hard).`,
      `If you did NOT perform a search, set parameters.intelWire=null and do not mention keys.`,
      `Command: "${command}".`,
      `Entities on canvas:`,
      `${entities}`,
      `Available actions: filter, create, search, connect, analyze, export.`,
      `Return ONLY valid JSON: { "action": "<action>", "parameters": { "intelWire": <null or { "query": "<string>", "results": [{ "title": "<string>", "url": "<string>", "source": "<string>", "publishedDate": "<string?>", "snippet": "<string>", "tier": "<tier1|unknown>" }], "meat": { "people": ["<name>"], "orgs": ["<org>"], "dates": ["<date>"] }, "populateDesk": <boolean>, "warning": "<string?>", "error": "<string?>" }> }, "response": "<newsroom-style reply>" }`,
    ].join('\n');

    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    let intelWire: IntelWirePayload | null = null;
    if (!shouldIntelWire) {
      const single = await groqChat(messages, { tools, toolChoice: 'none', maxTokens: 2000 });
      if (!single.ok) return { action: 'unknown', parameters: {}, response: single.error };
      const raw = String(single.message?.content || '');
      return JSON.parse(cleanJSON(raw)) as CommandResult;
    }

    if (!canUseWire) {
      intelWire = { query: command, results: [], error: TAVILY_MISSING_MESSAGE };
      messages.push({
        role: 'assistant',
        content: `Intel Wire payload:\n${JSON.stringify(intelWire)}`,
      });
      const single = await groqChat(messages, { tools, toolChoice: 'none', maxTokens: 2200 });
      if (!single.ok) return { action: 'unknown', parameters: {}, response: single.error };
      const raw = String(single.message?.content || '');
      const parsed = JSON.parse(cleanJSON(raw)) as CommandResult;
      parsed.parameters = {
        ...(parsed.parameters || {}),
        intelWire,
      };
      const flyingBlind = typeof intelWire.warning === 'string' && intelWire.warning.includes('TAVILY_API_KEY')
        ? intelWire.warning
        : typeof intelWire.error === 'string' && intelWire.error.includes('TAVILY_API_KEY')
          ? intelWire.error
          : '';
      if (flyingBlind) {
        parsed.action = 'search';
        const fixLine = 'Add TAVILY_API_KEY to .env.local and restart the dev server.';
        const r = String((parsed as any).response || '').trim();
        const rLower = r.toLowerCase();
        const alreadySaysBlind =
          r.includes(TAVILY_MISSING_MESSAGE) ||
          (rLower.includes('tavily_api_key') && rLower.includes("i'm flying blind")) ||
          (rLower.includes('tavily_api_key') && rLower.includes('flying blind'));
        const alreadySaysFix = r.includes(fixLine);

        if (alreadySaysBlind) {
          (parsed as any).response = alreadySaysFix ? r : r ? `${r}\n${fixLine}` : `${flyingBlind}\n${fixLine}`;
        } else {
          (parsed as any).response = r ? `${flyingBlind}\n${fixLine}\n${r}` : `${flyingBlind}\n${fixLine}`;
        }
      }
      return parsed;
    }

    const first = await groqChat(messages, { tools, toolChoice: 'auto', maxTokens: 2000 });
    if (!first.ok) return { action: 'unknown', parameters: {}, response: first.error };

    const toolCalls = Array.isArray(first.message?.tool_calls) ? first.message?.tool_calls : [];
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call?.type !== 'function') continue;
        if (call?.function?.name !== 'webSearch') continue;
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        const query = typeof args?.query === 'string' ? args.query : command;
        const maxResults = typeof args?.maxResults === 'number' ? args.maxResults : 10;
        intelWire = await webSearch(query, maxResults);
        messages.push({
          role: 'assistant',
          tool_calls: [call],
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(intelWire),
        });
      }
    } else {
      intelWire = await webSearch(command, 10);
      messages.push({
        role: 'assistant',
        content: `Intel Wire payload:\n${JSON.stringify(intelWire)}`,
      });
    }

    const second = await groqChat(messages, { tools, toolChoice: 'none', maxTokens: 2200 });
    if (!second.ok) return { action: 'unknown', parameters: {}, response: second.error };

    const raw = String(second.message?.content || '');
    const parsed = JSON.parse(cleanJSON(raw)) as CommandResult;
    if (intelWire) {
      parsed.parameters = {
        ...(parsed.parameters || {}),
        intelWire,
      };
      const flyingBlind = typeof intelWire.warning === 'string' && intelWire.warning.includes('TAVILY_API_KEY')
        ? intelWire.warning
        : typeof intelWire.error === 'string' && intelWire.error.includes('TAVILY_API_KEY')
          ? intelWire.error
          : '';
      if (flyingBlind) {
        if (shouldIntelWire) parsed.action = 'search';
        const fixLine = 'Add TAVILY_API_KEY to .env.local and restart the dev server.';
        const r = String((parsed as any).response || '').trim();
        const rLower = r.toLowerCase();
        const alreadySaysBlind =
          r.includes(TAVILY_MISSING_MESSAGE) ||
          (rLower.includes('tavily_api_key') && rLower.includes("i'm flying blind")) ||
          (rLower.includes('tavily_api_key') && rLower.includes('flying blind'));
        const alreadySaysFix = r.includes(fixLine);

        if (alreadySaysBlind) {
          (parsed as any).response = alreadySaysFix ? r : r ? `${r}\n${fixLine}` : `${flyingBlind}\n${fixLine}`;
        } else {
          (parsed as any).response = r ? `${flyingBlind}\n${fixLine}\n${r}` : `${flyingBlind}\n${fixLine}`;
        }
      }
    }
    return parsed;
  } catch {
    return { action: 'unknown', parameters: {}, response: 'Could not process. Try: "show all sources" or "analyze story"' };
  }
}

export interface StoryAnalysis {
  suggestedActions: { action: string; priority: string; reason: string }[];
  contradictions: { description: string; entities: string[] }[];
  gaps: { description: string; suggestion: string }[];
  storyStrength: number;
}

export async function analyzeStory(
  title: string,
  stage: string,
  nodes: { name: string; type: string; description?: string }[],
  edges: { from: string; to: string; type: string }[]
): Promise<StoryAnalysis> {
  try {
    const nodeText = nodes.map(n => `- ${n.name} (${n.type}): ${n.description || ''}`).join('\n') || 'None';
    const edgeText = edges.map(e => `- ${e.from} → ${e.to} (${e.type})`).join('\n') || 'None';
    const raw = await groqCall(
      `You are a senior editor reviewing an investigative journalism story. Story: "${title}", Stage: ${stage}. Entities: ${nodeText}. Connections: ${edgeText}. Provide editorial guidance. Return ONLY valid JSON: { "suggestedActions": [{ "action": "<what>", "priority": "<high|medium|low>", "reason": "<why>" }], "contradictions": [{ "description": "<conflict>", "entities": ["<e1>"] }], "gaps": [{ "description": "<missing>", "suggestion": "<how to fill>" }], "storyStrength": <0-100> }`
    );
    return JSON.parse(cleanJSON(raw)) as StoryAnalysis;
  } catch {
    return { suggestedActions: [], contradictions: [], gaps: [], storyStrength: 0 };
  }
}
