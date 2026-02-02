import { callGeminiJson } from './ai-service';

export type IndianEditorialAssessment = { verdict: 'PURSUE' | 'REFINE' | 'ABANDON'; score: number; reasoning?: string };

async function callJsonStrict(prompt: string): Promise<unknown | null> {
  try {
    return await callGeminiJson(prompt);
  } catch (err) {
    console.error("GEMINI_ERROR:", err);
    return null;
  }
}

export type StoryViabilityAssessment = {
  publicInterest: number;
  feasibility: number;
  ethics: number;
  keyRisks: string[];
  nextActions: string[];
  notes: string;
};

export async function analyzeStoryViability(input: {
  storyIdea: string;
  storyStage?: string | null;
}): Promise<StoryViabilityAssessment | null> {
  const prompt = [
    'You are a Senior Editor at a newsroom.',
    'Analyze the story idea for Public Interest, Feasibility, and Ethics.',
    'Return ONLY strict JSON with keys:',
    '{ "publicInterest": <1-10>, "feasibility": <1-10>, "ethics": <1-10>, "keyRisks": ["<risk>"], "nextActions": ["<action>"], "notes": "<brief>" }',
    'Input:',
    JSON.stringify(input),
  ].join('\n');
  const json = await callJsonStrict(prompt);
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const toScore10 = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(10, Math.round(n)));
  };
  const publicInterest = toScore10(obj['publicInterest']);
  const feasibility = toScore10(obj['feasibility']);
  const ethics = toScore10(obj['ethics']);
  const keyRisks = Array.isArray(obj['keyRisks']) ? (obj['keyRisks'] as unknown[]).map(x => String(x)).filter(Boolean) : [];
  const nextActions = Array.isArray(obj['nextActions']) ? (obj['nextActions'] as unknown[]).map(x => String(x)).filter(Boolean) : [];
  const notes = typeof obj['notes'] === 'string' ? obj['notes'] : '';
  return { publicInterest, feasibility, ethics, keyRisks, nextActions, notes };
}

export type SourceCredibilityAssessment = {
  credibility: 1 | 2 | 3 | 4 | 5;
  biasRisk: 'low' | 'medium' | 'high';
  consistencyRisk: 'low' | 'medium' | 'high';
  handlingNotes: string[];
  suggestedFollowUps: string[];
};

export async function analyzeSource(input: {
  role: string;
  anonymity: boolean;
  contactInfo?: string;
  quotes?: string[];
  claimedFacts?: string[];
}): Promise<SourceCredibilityAssessment | null> {
  const prompt = [
    'You are a Senior Editor evaluating a journalistic source.',
    'Evaluate credibility based on role, bias, and consistency.',
    'Return ONLY strict JSON with keys:',
    '{ "credibility": <1-5>, "biasRisk": "low"|"medium"|"high", "consistencyRisk": "low"|"medium"|"high", "handlingNotes": ["<note>"], "suggestedFollowUps": ["<question>"] }',
    'Input:',
    JSON.stringify(input),
  ].join('\n');
  const json = await callJsonStrict(prompt);
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const rawCred = typeof obj['credibility'] === 'number' ? obj['credibility'] : Number(obj['credibility']);
  const cred = (Number.isFinite(rawCred) ? Math.max(1, Math.min(5, Math.round(rawCred))) : 3) as 1 | 2 | 3 | 4 | 5;
  const biasRiskRaw = String(obj['biasRisk'] || '').toLowerCase();
  const consistencyRiskRaw = String(obj['consistencyRisk'] || '').toLowerCase();
  const biasRisk = (biasRiskRaw === 'low' || biasRiskRaw === 'medium' || biasRiskRaw === 'high') ? (biasRiskRaw as any) : 'medium';
  const consistencyRisk = (consistencyRiskRaw === 'low' || consistencyRiskRaw === 'medium' || consistencyRiskRaw === 'high') ? (consistencyRiskRaw as any) : 'medium';
  const handlingNotes = Array.isArray(obj['handlingNotes']) ? (obj['handlingNotes'] as unknown[]).map(x => String(x)).filter(Boolean) : [];
  const suggestedFollowUps = Array.isArray(obj['suggestedFollowUps']) ? (obj['suggestedFollowUps'] as unknown[]).map(x => String(x)).filter(Boolean) : [];
  return { credibility: cred, biasRisk, consistencyRisk, handlingNotes, suggestedFollowUps };
}

export type ClaimFactCheckAssessment = {
  verdict: 'unverified' | 'verified' | 'debunked' | 'partially_true';
  reasoning: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  gaps: string[];
  protocol: string[];
};

export async function factCheckClaimProtocol(input: {
  claim: { statement: string; factCheckNotes?: string };
  evidence: Array<{ label: string; evidenceType?: string; acquisitionMethod?: string; legalClearance?: boolean; excerpt?: string }>;
}): Promise<ClaimFactCheckAssessment | null> {
  const prompt = [
    'You are a Senior Editor running a fact-check protocol.',
    'Cross-reference the claim against the provided evidence items.',
    'Return ONLY strict JSON with keys:',
    '{ "verdict": "unverified"|"verified"|"debunked"|"partially_true", "reasoning": "<brief>", "supportingEvidence": ["<label>"], "contradictingEvidence": ["<label>"], "gaps": ["<gap>"], "protocol": ["<step>"] }',
    'Input:',
    JSON.stringify(input),
  ].join('\n');
  const json = await callJsonStrict(prompt);
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const verdictRaw = String(obj['verdict'] || '').toLowerCase();
  const verdict =
    verdictRaw === 'verified' || verdictRaw === 'debunked' || verdictRaw === 'partially_true' || verdictRaw === 'unverified'
      ? (verdictRaw as ClaimFactCheckAssessment['verdict'])
      : 'unverified';
  const reasoning = typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '';
  const supportingEvidence = Array.isArray(obj['supportingEvidence']) ? (obj['supportingEvidence'] as unknown[]).map(String).filter(Boolean) : [];
  const contradictingEvidence = Array.isArray(obj['contradictingEvidence']) ? (obj['contradictingEvidence'] as unknown[]).map(String).filter(Boolean) : [];
  const gaps = Array.isArray(obj['gaps']) ? (obj['gaps'] as unknown[]).map(String).filter(Boolean) : [];
  const protocol = Array.isArray(obj['protocol']) ? (obj['protocol'] as unknown[]).map(String).filter(Boolean) : [];
  return { verdict, reasoning, supportingEvidence, contradictingEvidence, gaps, protocol };
}

export async function assessStoryViabilityIndia(answers: {
  story_title: string;
  public_interest: string;
  initial_nodes: string;
  ethics_flag: string;
}): Promise<IndianEditorialAssessment | null> {
  const prompt = [
    'You are a Senior Editor in New Delhi.',
    'Goal: Analyze the story headline and provide a "Tactical Roadmap".',
    'Focus on:',
    '- RTI Act 2005: Determine RTI filing routes (State vs Central) and draft queries.',
    '- PCI guidelines: Apply Press Council of India ethical standards for sourcing and verification.',
    '- IPC 499/500: Provide guardrails on defamation risk and phrasing.',
    'Never discourage a story; provide legal guardrails only.',
    'Analyze these 4 inputs: [Story, Public Interest, Evidence, Ethics].',
    'Return strict JSON with keys:',
    '{ "viability_score": <1-10 number>, "verdict": "PURSUE" | "REFINE" | "ABANDON", "reasoning": "<brief>" }',
    'Inputs:',
    JSON.stringify(answers),
  ].join('\n');
  const json = await callJsonStrict(prompt);
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const verdictRaw = String(obj['verdict'] || '').toUpperCase();
    const scoreRaw = obj['viability_score'];
    const reasoning = typeof obj['reasoning'] === 'string' ? String(obj['reasoning']) : undefined;
    const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
    if ((verdictRaw === 'PURSUE' || verdictRaw === 'REFINE' || verdictRaw === 'ABANDON') && !Number.isNaN(score)) {
      return { verdict: verdictRaw as IndianEditorialAssessment['verdict'], score: Math.max(1, Math.min(10, Math.round(score))), reasoning };
    }
  }
  return null;
}

export type LegalPreflightResult = {
  allowExport: boolean;
  blockers: string[];
  warnings: string[];
  requiredRedactions: string[];
};

export async function legalPreflight(input: {
  storyTitle?: string;
  claims: Array<{
    id: string;
    statement: string;
    stamp?: string | null;
    verificationStatus?: string | null;
    evidenceLinks: number;
    hasSources: boolean;
    rightToReplyContacted: boolean;
  }>;
  anonymousSources: Array<{
    id: string;
    nameHint?: string;
    hasPlainContactInfo: boolean;
  }>;
  potentialLeaks: string[];
}): Promise<LegalPreflightResult | null> {
  const prompt = [
    "You are the newsroom Legal & Standards desk.",
    "Task: Run a Legal Pre-flight before export.",
    "Rules:",
    "- Flag high-risk allegations lacking corroboration (no evidence links and no sources).",
    "- Ensure no anonymous/protected source contact info leaks into export (treat any potential leak as a blocker).",
    "- Keep guidance practical: specify what to fix or redact.",
    "Return ONLY strict JSON with keys:",
    '{ "allowExport": <true|false>, "blockers": ["<blocker>"], "warnings": ["<warning>"], "requiredRedactions": ["<redaction>"] }',
    "Input:",
    JSON.stringify(input),
  ].join("\n");
  const json = await callJsonStrict(prompt);
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const allowExport = Boolean(obj["allowExport"]);
  const blockers = Array.isArray(obj["blockers"]) ? (obj["blockers"] as unknown[]).map(String).filter(Boolean) : [];
  const warnings = Array.isArray(obj["warnings"]) ? (obj["warnings"] as unknown[]).map(String).filter(Boolean) : [];
  const requiredRedactions = Array.isArray(obj["requiredRedactions"])
    ? (obj["requiredRedactions"] as unknown[]).map(String).filter(Boolean)
    : [];
  return { allowExport, blockers, warnings, requiredRedactions };
}
