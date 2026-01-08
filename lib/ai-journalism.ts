import { geminiPro } from './ai-service';

export type IndianEditorialAssessment = { verdict: 'PURSUE' | 'REFINE' | 'ABANDON'; score: number; reasoning?: string };

async function callJsonStrict(prompt: string): Promise<unknown | null> {
  if (!geminiPro) return null;
  const resp = await geminiPro.generateContent(prompt);
  const txt = await resp.response.text();
  try {
    return JSON.parse(txt);
  } catch {
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
    'You are a Senior Editor in a major Indian Newsroom.',
    'Your goal is to protect the truth and the reporter.',
    'Use RTI Act 2005 and Indian Penal Code context.',
    'Never discourage a story; provide a Legal & Tactical Roadmap for Indian compliance.',
    'Use Indian legal and ethical guardrails:',
    '- Reference the Right to Information (RTI) Act, 2005 instead of FOIA.',
    '- Assess Ethical Risks considering IPC Sections 499/500 (Criminal Defamation).',
    '- Follow Press Council of India (PCI) guidelines on journalistic conduct.',
    '- Consider Contempt of Court risks for sub-judice matters.',
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
