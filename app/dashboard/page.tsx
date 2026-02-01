"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, supabase } from "@/lib/supabase";
import TerminalEntry, { Phase } from "@/components/TerminalEntry";
import { Plus, LogOut } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Array<{ id: string; title: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [phase, setPhase] = useState<Phase>("CASE_INTAKE");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Session protection - verify user exists before fetching
        const session = await getUser();
        const uid = session?.data?.user?.id;
        
        if (!uid) {
          console.error("DASHBOARD_FETCH_ERROR: No user ID found in session");
          router.push("/auth/login");
          return;
        }
        
        // Fetch stories with only columns we're sure exist
        const { data, error: fetchError } = await supabase
          .from("stories")
          .select("id,title,status,story_stage,fact_check_status")
          .eq("user_id", uid);
        
        if (fetchError) {
          const errorMsg = fetchError.message || String(fetchError);
          console.error("DASHBOARD_FETCH_ERROR:", fetchError);
          setError(errorMsg);
          setStories([]);
        } else {
          setStories((data || []).map(s => ({ 
            id: s.id as string, 
            title: (s as any).title || "Untitled", 
            fact_check_status: (s as any).fact_check_status || null 
          } as any)));
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        console.error("DASHBOARD_FETCH_ERROR:", err);
        setError(errorMsg);
        setStories([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleStartNewStory = () => {
    setPhase("CASE_INTAKE");
    setShowIntake(true);
  };

  if (loading) {
    return (
      <main className="min-h-screen w-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-300">Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-screen bg-zinc-50">
      <div className="w-full border-b border-zinc-300 bg-zinc-100">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-zinc-900 font-serif tracking-wider">SPYGLASS: THE REPORTER&apos;S DESK</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartNewStory}
              className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-50 text-zinc-950 hover:bg-white border border-zinc-300"
            >
              <Plus className="w-4 h-4" />
              Start New Story
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-900 text-white border border-zinc-900 hover:opacity-90"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {error ? (
          <div className="h-[70vh] flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="text-xl text-red-600 mb-4 font-serif">Database Error</div>
              <div className="text-sm text-zinc-700 mb-4 font-mono bg-zinc-100 p-4 rounded border border-zinc-300">
                {error}
              </div>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded bg-zinc-50 text-zinc-950 hover:bg-white border border-zinc-300"
              >
                Retry
              </button>
            </div>
          </div>
        ) : stories.length === 0 ? (
          <div className="h-[70vh] flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl text-zinc-900 mb-4 font-serif">Good Morning, Reporter. The wire is active.</div>
              <button
                onClick={handleStartNewStory}
                className="inline-flex items-center gap-2 px-5 py-3 rounded bg-zinc-50 text-zinc-950 hover:bg-white border border-zinc-300"
              >
                <Plus className="w-5 h-5" />
                Create Story
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {stories.map(s => (
              <a
                key={s.id}
                href={`/case/${s.id}`}
                className="block p-4 rounded border border-amber-200 bg-amber-50 text-zinc-900 hover:border-amber-300 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-amber-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-serif">{(s as any).title}</span>
                  {((s as any).fact_check_status) ? (
                    (() => {
                      const raw = String((s as any).fact_check_status || '');
                      const verdictWord = raw.split(' ')[0].toUpperCase();
                      const colorClass = verdictWord === 'PURSUE' ? 'bg-emerald-600 text-white'
                        : verdictWord === 'REFINE' ? 'bg-amber-500 text-black'
                        : 'bg-zinc-500 text-white';
                      const label = verdictWord === 'PURSUE' ? 'Editorial Verdict: Pursue'
                        : verdictWord === 'REFINE' ? 'Editorial Verdict: Refine'
                        : 'Editorial Verdict: Abandon';
                      return <span className={`px-3 py-1 rounded-sm text-[10px] uppercase tracking-wider font-bold opacity-80 border border-zinc-700 ${colorClass} transform rotate-[-6deg] shadow-[0_0_0_1px_rgba(0,0,0,0.2)]`}>{label}</span>;
                    })()
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
      {showIntake && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl bg-zinc-100 border border-zinc-300 rounded">
            <TerminalEntry
              currentPhase={phase}
              onPhaseChange={setPhase}
              onCaseSelected={() => {}}
              onInvestigatorUpdate={() => {}}
            />
          </div>
        </div>
      )}
    </main>
  );
}
