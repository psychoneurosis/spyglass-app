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
