"use client";

import { useEffect, useMemo, useState } from 'react';
import { assessStoryViability, type StoryViabilityResult } from '@/lib/ai-service';
import { useSpyglassStore as useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  storyIdea: string;
};

function verdictBadgeClass(verdict: StoryViabilityResult['verdict']) {
  if (verdict === 'PURSUE') return 'bg-emerald-500';
  if (verdict === 'REFINE') return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreColor(score: number) {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

function clampScore(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

function LoadingSpinner() {
  return (
    <div className="w-full max-w-3xl mx-auto p-6">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 text-zinc-400">
        <div className="mt-2 flex items-center gap-3 text-zinc-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Senior Editor is reviewing...</span>
        </div>
      </div>
    </div>
  );
}

export default function ViabilityPanel({ storyIdea }: Props) {
  const router = useRouter();
  const activeStory = useStore(s => s.activeStory);
  const setActiveStory = useStore(s => s.setActiveStory);
  const updateStory = useStore(s => s.updateStory);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StoryViabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<string>('');

  useEffect(() => {
    if (!activeStory) {
      setActiveStory({ id: '', title: storyIdea, centralQuestion: storyIdea, status: 'active' });
    }
  }, [activeStory, setActiveStory, storyIdea]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await assessStoryViability(storyIdea);
        if (cancelled) return;
        if (!res) {
          setResult(null);
          setError('Could not generate assessment. Try again.');
          setLoading(false);
          return;
        }
        setResult(res);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setResult(null);
        setError(msg);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyIdea]);

  const angles = useMemo(() => {
    const list = Array.isArray(result?.suggestedAngles) ? result?.suggestedAngles : [];
    return list.map(String).filter(x => x.trim().length > 0).slice(0, 6);
  }, [result]);
  const activeAngle = selectedAngle || angles[0] || '';

  const verdictIcon = useMemo(() => {
    const v = result?.verdict;
    if (!v) return null;
    if (v === 'PURSUE') return <CheckCircle className="w-4 h-4 text-white" />;
    if (v === 'REFINE') return <AlertTriangle className="w-4 h-4 text-white" />;
    return <XCircle className="w-4 h-4 text-white" />;
  }, [result?.verdict]);

  const handleStartInvestigation = async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) {
      router.push('/auth/login');
      return;
    }

    const centralQuestion = activeAngle || activeStory?.centralQuestion || storyIdea;
    const { data: inserted, error } = await supabase
      .from('stories')
      .insert({
        title: storyIdea,
        user_id: uid,
        status: 'active',
        metadata: { centralQuestion, viability: result },
      })
      .select('id,title,status')
      .single();
    if (error) throw error;

    setActiveStory({
      id: String((inserted as any)?.id || ''),
      title: String((inserted as any)?.title || storyIdea),
      centralQuestion,
      status: String((inserted as any)?.status || 'active'),
    });

    router.push(`/story/${String((inserted as any)?.id || '')}`);
  };

  const handleChangeStoryIdea = () => {
    window.location.assign('/');
  };

  const publicInterest = clampScore(result?.publicInterest ?? 0);
  const feasibility = clampScore(result?.feasibility ?? 0);

  if (loading && !result) return <LoadingSpinner />;

  return (
    <div className="w-full max-w-3xl mx-auto p-6">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 text-zinc-400">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-zinc-50 text-lg font-semibold">Viability Assessment</div>
            <div className="text-zinc-400 text-sm mt-1">{storyIdea}</div>
          </div>

          {result?.verdict && (
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded font-mono text-xs text-white ${verdictBadgeClass(result.verdict)}`}>
              {verdictIcon}
              <span>{result.verdict}</span>
            </div>
          )}
        </div>

        {result ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-black/30 border border-zinc-800 rounded-lg p-4">
                <div className="text-zinc-50 text-sm font-semibold mb-2">Public Interest</div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-zinc-400">Score</span>
                  <span className="text-zinc-50">{publicInterest}/10</span>
                </div>
                <div className="h-2 w-full rounded bg-zinc-700 overflow-hidden">
                  <div className={`h-2 ${scoreColor(publicInterest)}`} style={{ width: `${(publicInterest / 10) * 100}%` }} />
                </div>
              </div>

              <div className="bg-black/30 border border-zinc-800 rounded-lg p-4">
                <div className="text-zinc-50 text-sm font-semibold mb-2">Feasibility</div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-zinc-400">Score</span>
                  <span className="text-zinc-50">{feasibility}/10</span>
                </div>
                <div className="h-2 w-full rounded bg-zinc-700 overflow-hidden">
                  <div className={`h-2 ${scoreColor(feasibility)}`} style={{ width: `${(feasibility / 10) * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-black/30 border border-zinc-800 rounded-lg p-4">
              <div className="text-zinc-50 text-sm font-semibold mb-3">Ethical Concerns</div>
              {(Array.isArray(result.ethicalConcerns) ? result.ethicalConcerns : []).length > 0 ? (
                <div className="space-y-2">
                  {(Array.isArray(result.ethicalConcerns) ? result.ethicalConcerns : []).map((c, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-amber-300 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <div>{String(c)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No concerns flagged</div>
              )}
            </div>

            <div className="bg-black/30 border border-zinc-800 rounded-lg p-4">
              <div className="text-zinc-50 text-sm font-semibold mb-3">Suggested Angles</div>
              {angles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {angles.map((a, idx) => {
                    const selected = a === activeAngle;
                    return (
                      <button
                        key={`${idx}-${a}`}
                        onClick={() => {
                          setSelectedAngle(a);
                          updateStory({ centralQuestion: a });
                        }}
                        className={`text-left rounded-lg border px-3 py-3 text-sm transition-colors ${
                          selected ? 'border-zinc-500 bg-zinc-800 text-zinc-50' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="text-xs text-zinc-400 mb-1">{idx + 1}</div>
                        <div className="text-sm">{a}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No angles generated</div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={handleStartInvestigation}
                className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-50 font-semibold"
              >
                Start Investigation
              </button>
              <button
                onClick={handleChangeStoryIdea}
                className="flex-1 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-50"
              >
                Change Story Idea
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="mt-6 text-sm text-zinc-400">{error}</div>
        ) : (
          <div className="mt-6 text-sm text-zinc-400">Could not generate assessment. Try again.</div>
        )}
      </div>
    </div>
  );
}
