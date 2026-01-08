import { GoogleGenerativeAI } from '@google/generative-ai';

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

const provider = process.env.NEXT_PUBLIC_AI_PROVIDER || 'gemini';
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

export const genAI = provider === 'gemini' && apiKey ? new GoogleGenerativeAI(apiKey) : null;
export const geminiPro = genAI ? genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }) : null;

async function callJson(prompt: string): Promise<unknown | null> {
  if (!geminiPro) return null;
  const resp = await geminiPro.generateContent(prompt);
  const txt = await resp.response.text();
  try {
    return JSON.parse(txt);
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
  const json = await callJson(prompt);
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
  const json = await callJson(prompt);
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
  const json = await callJson(prompt);
  if (json) {
    const obj = json as Record<string, unknown>;
    const action = obj['action'];
    const parameters = obj['parameters'];
    if (typeof action === 'string') {
      return { action, parameters: (parameters as Record<string, unknown>) || {} };
    }
  }
  if (/create/i.test(command)) return { action: 'create', parameters: {} };
  if (/filter|find|show/i.test(command)) return { action: 'filter', parameters: {} };
  if (/search/i.test(command)) return { action: 'search', parameters: {} };
  if (/export|report/i.test(command)) return { action: 'export', parameters: {} };
  return { action: 'analyze', parameters: {} };
}

export async function suggestConnections(newNode: { name?: string }, existingNodes: Array<{ id: string; name?: string }>): Promise<ConnectionSuggestion[]> {
  const prompt = `Suggest connections for a new node based on existing nodes. Return strict JSON array of {targetNode,type,confidence}. New:\n${JSON.stringify(newNode)}\nExisting:\n${JSON.stringify(existingNodes)}`;
  const json = await callJson(prompt);
  if (Array.isArray(json)) return json as ConnectionSuggestion[];
  return [];
}

export async function testGeminiConnection() {
  try {
    if (!geminiPro) return { ok: false, message: 'Gemini not configured' };
    const r = await geminiPro.generateContent('ping');
    const t = await r.response.text();
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
  const json = await callJson(prompt);
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
