export type ExtractEntity = { type: 'person' | 'location' | 'event' | 'evidence' | 'theory'; name: string; metadata?: unknown };
export type Relationship = { from: string; to: string; type: string };
export type AnalyzeTextResult = { entities: ExtractEntity[]; dates: string[]; locations: string[]; relationships: Relationship[] };

export type SuggestedAction = { label: string; priority: 'low' | 'medium' | 'high' | 'critical' };
export type Pattern = { description: string; confidence: number };
export type Contradiction = { description: string; involved: string[] };
export type Gap = { description: string; suggestedNextStep: string };
export type AnalyzeCaseResult = { suggestedActions: SuggestedAction[]; detectedPatterns: Pattern[]; contradictions: Contradiction[]; missingInfo: Gap[]; caseStrength: number };

export type ProcessCommandResult = { action: 'filter' | 'create' | 'search' | 'export' | 'analyze'; parameters: Record<string, unknown> };

export type ConnectionSuggestion = { targetNode: string; type: string; confidence: number };

const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY;
const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

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

export async function analyzeCaseState(caseData: unknown): Promise<AnalyzeCaseResult> {
  const prompt = `Given this case JSON, analyze and return strict JSON keys: suggestedActions[{label,priority}], detectedPatterns[{description,confidence}], contradictions[{description,involved}], missingInfo[{description,suggestedNextStep}], caseStrength.\nCase:\n${JSON.stringify(caseData)}`;
  const json = await callGeminiJson(prompt);
  if (json) {
    const obj = json as Record<string, unknown>;
    const suggestedActionsRaw = obj['suggestedActions'];
    const detectedPatternsRaw = obj['detectedPatterns'];
    const contradictionsRaw = obj['contradictions'];
    const missingInfoRaw = obj['missingInfo'];
    const caseStrengthRaw = obj['caseStrength'];
    return {
      suggestedActions: Array.isArray(suggestedActionsRaw) ? (suggestedActionsRaw as SuggestedAction[]) : [],
      detectedPatterns: Array.isArray(detectedPatternsRaw) ? (detectedPatternsRaw as Pattern[]) : [],
      contradictions: Array.isArray(contradictionsRaw) ? (contradictionsRaw as Contradiction[]) : [],
      missingInfo: Array.isArray(missingInfoRaw) ? (missingInfoRaw as Gap[]) : [],
      caseStrength: typeof caseStrengthRaw === 'number' ? (caseStrengthRaw as number) : 0,
    };
  }
  return { suggestedActions: [], detectedPatterns: [], contradictions: [], missingInfo: [], caseStrength: 0 };
}

export async function processCommand(command: string, caseContext: unknown): Promise<ProcessCommandResult> {
  const prompt = `Parse the command for this investigation. Return strict JSON with keys: action in ["filter","create","search","export","analyze"] and parameters(object). Command: "${command}". Context:\n${JSON.stringify(caseContext)}`;
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

export async function assessStoryViability(answers: {
  story_title: string;
  public_interest: string;
  initial_nodes: string;
  ethics_flag: string;
}): Promise<EditorialVerdict | null> {
  const prompt = [
    'You are a Pulitzer-winning Investigative Editor.',
    'Analyze these 4 inputs: [Story, Public Interest, Evidence, Ethics].',
    'Provide a JSON response with keys:',
    '{ "viability_score": <1-10 number>, "verdict": "PURSUE" | "REFINE" | "ABANDON", "reasoning": "<brief>" }',
    'Inputs:',
    JSON.stringify(answers),
  ].join('\n');
  const json = await callGeminiJson(prompt);
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const verdictRaw = String(obj['verdict'] || '').toUpperCase();
    const scoreRaw = obj['viability_score'];
    const reasoning = typeof obj['reasoning'] === 'string' ? String(obj['reasoning']) : undefined;
    const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
    if ((verdictRaw === 'PURSUE' || verdictRaw === 'REFINE' || verdictRaw === 'ABANDON') && !Number.isNaN(score)) {
      return { verdict: verdictRaw as EditorialVerdict['verdict'], score: Math.max(1, Math.min(10, Math.round(score))), reasoning };
    }
  }
  return null;
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

export async function processTerminalCommand(
  command: string,
  context: { nodes: { name: string; type: string }[] }
): Promise<CommandResult> {
  try {
    const entities = context.nodes.map(n => `- ${n.name} (${n.type})`).join('\n') || 'None yet';
    const raw = await groqCall(
      `You are the AI inside Spyglass journalism tool. Convert this command to a structured action. Command: "${command}". Entities on canvas: ${entities}. Available actions: filter, create, search, connect, analyze, export. Return ONLY valid JSON: { "action": "<action>", "parameters": {}, "response": "<friendly confirmation>" }`
    );
    return JSON.parse(cleanJSON(raw)) as CommandResult;
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
