import { createClient } from '@supabase/supabase-js';

export type StoryRecord = {
  id: string;
  title: string;
  centralQuestion: string;
  status: 'active' | 'cold' | 'solved';
  createdAt: string;
  updatedAt: string;
  user_id: string;
  storyStrength?: number;
  public_interest_score?: number;
  ethical_concerns?: string;
  story_stage?: 'viability_assessment' | 'background_research' | 'source_development' | 'verification' | 'writing' | 'published' | 'follow_up';
  fact_check_status?: string;
  metadata?: unknown;
};

export type Position = { x: number; y: number };

export type NodeRecord = {
  id: string;
  storyId: string;
  type: 'person' | 'location' | 'event' | 'evidence' | 'theory';
  position: Position;
  data: {
    name: string;
    description?: string;
    metadata?: unknown;
    confidence?: number;
    verified?: boolean;
    source?: string;
    createdAt?: string;
    aiExtracted?: boolean;
    attachments?: unknown[];
  };
};

export type EdgeRecord = {
  id: string;
  storyId: string;
  source: string;
  target: string;
  type: 'confirmed' | 'suspected' | 'contradicts';
  strength: 'weak' | 'medium' | 'strong';
  label: string;
  evidence: string[];
  createdAt: string;
};

export type TimelineEventRecord = {
  id: string;
  storyId: string;
  timestamp: string;
  description: string;
  entities: string[];
  verified: boolean;
};

export type AIInsightRecord = {
  id: string;
  storyId: string;
  type: 'suggestion' | 'contradiction' | 'pattern' | 'gap' | 'warning';
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dismissed: boolean;
  createdAt: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export async function signInWithEmailOtp(email: string) {
  return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
  });
}

export async function signInWithPhone(phone: string) {
  return supabase.auth.signInWithOtp({
    phone,
  });
}

export async function verifyPhoneOTP(phone: string, token: string) {
  return supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getUser() {
  return supabase.auth.getUser();
}

export async function createStory(userId: string, payload: Partial<StoryRecord>) {
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    title: payload.title || 'Untitled Story',
    centralQuestion: payload.centralQuestion || '',
    status: payload.status || 'active',
    createdAt: now,
    updatedAt: now,
    storyStrength: payload.storyStrength ?? 0,
    public_interest_score: payload.public_interest_score ?? 0,
    ethical_concerns: payload.ethical_concerns ?? '',
    story_stage: payload.story_stage || 'background_research',
    fact_check_status: payload.fact_check_status ?? 'PENDING EDITORIAL REVIEW',
    metadata: payload.metadata ?? null,
  };
  const { data, error } = await supabase.from('stories').insert(row).select().single();
  if (error) throw error;
  return data as StoryRecord;
}

export async function listStoriesByUser(userId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('id,title,status,user_id,story_stage,fact_check_status,metadata')
    .eq('user_id', userId)
    .order('updatedAt', { ascending: false });
  if (error) throw error;
  return data as StoryRecord[];
}

export async function getStoryById(id: string) {
  const { data, error } = await supabase.from('stories').select('*').eq('id', id).single();
  if (error) throw error;
  return data as StoryRecord;
}

export async function getStory(id: string) {
  return getStoryById(id);
}

export async function updateStory(id: string, changes: Partial<StoryRecord>) {
  const row = { ...changes, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase.from('stories').update(row).eq('id', id).select().single();
  if (error) throw error;
  return data as StoryRecord;
}

export async function deleteStory(id: string) {
  const { error } = await supabase.from('stories').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertNodes(nodes: NodeRecord[]) {
  const { data, error } = await supabase.from('nodes').upsert(nodes).select('*');
  if (error) throw error;
  return data as NodeRecord[];
}

export async function upsertEdges(edges: EdgeRecord[]) {
  const { data, error } = await supabase.from('edges').upsert(edges).select('*');
  if (error) throw error;
  return data as EdgeRecord[];
}

export async function upsertTimelineEvents(events: TimelineEventRecord[]) {
  const { data, error } = await supabase.from('timeline_events').upsert(events).select('*');
  if (error) throw error;
  return data as TimelineEventRecord[];
}

export async function saveInsights(insights: AIInsightRecord[]) {
  const { data, error } = await supabase.from('ai_insights').upsert(insights).select('*');
  if (error) throw error;
  return data as AIInsightRecord[];
}

export async function getStoryGraph(storyId: string) {
  const { data: nodes, error: nErr } = await supabase.from('nodes').select('*').eq('storyId', storyId);
  if (nErr) throw nErr;
  const { data: edges, error: eErr } = await supabase.from('edges').select('*').eq('storyId', storyId);
  if (eErr) throw eErr;
  return { nodes: nodes as NodeRecord[], edges: edges as EdgeRecord[] };
}

export async function updateStoryStrength(id: string, score: number) {
  const { data, error } = await supabase
    .from('stories')
    .update({ storyStrength: score, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as StoryRecord;
}

export async function testSupabaseConnection() {
  try {
    const { error } = await supabase.from('stories').select('id', { head: true }).limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const msg = typeof e === 'object' && e && 'message' in (e as Record<string, unknown>) ? String((e as Record<string, unknown>).message) : String(e);
    return { ok: false, message: msg };
  }
}
