import React, { useState, useEffect, useRef } from 'react';
import ViabilityPanel from '@/components/journalism/ViabilityPanel';

// --- Types ---

export type Phase = 'AUTHENTICATION' | 'INVESTIGATOR_INTAKE' | 'STORY_ROUTER' | 'STORY_INTAKE' | 'CANVAS';

export interface Investigator {
  id: string; // email
  email: string;
  name: string;
  age_profession: string;
  thinking_style: string;
  friction_point: string;
  goal: string;
  uncertainty_preference: string;
  intake_complete: boolean;
}

export interface Story {
  id: string;
  user_id: string;
  title: string;
  core_question: string;
  context_scope: string;
  starting_material: 'INGEST' | 'BLANK';
  evidence_maturity: string;
  desired_outcome: string;
  last_opened_at: number;
  story_stage?: 'viability_assessment' | 'background_research' | 'source_development' | 'verification' | 'writing' | 'published';
  canvas_state?: { nodes: unknown[]; edges: unknown[] };
}

// --- Component ---

interface TerminalEntryProps {
  currentPhase: Phase;
  onPhaseChange: (phase: Phase) => void;
  onStorySelected: (storyId: string) => void;
  onInvestigatorUpdate: (investigator: Investigator) => void;
}

export default function TerminalEntry({ 
  currentPhase, 
  onPhaseChange, 
  onStorySelected,
  onInvestigatorUpdate
}: TerminalEntryProps) {
  void currentPhase;
  void onPhaseChange;
  void onStorySelected;
  void onInvestigatorUpdate;
  const [headline, setHeadline] = useState('');
  const [submittedIdea, setSubmittedIdea] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (submittedIdea) return;
    inputRef.current?.focus();
  }, [submittedIdea]);

  const handleEnter = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && headline.trim()) {
      try {
        const bell = new Audio('/mixkit-typewriter-bell-1473.mp3');
        bell.play().catch(() => {});
      } catch {}
      setSubmittedIdea(headline.trim());
    }
  };

  if (submittedIdea) {
    return <ViabilityPanel storyIdea={submittedIdea} />;
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="mb-4 text-zinc-500 font-mono text-sm uppercase tracking-wider">
        New Story Entry
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder="Enter the lead for your story:"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        onKeyDown={handleEnter}
        className="w-full bg-transparent text-xl md:text-2xl font-serif text-zinc-900 placeholder:text-zinc-400 border-b-2 border-zinc-300 focus:border-zinc-900 outline-none py-2 transition-colors"
      />
      <div className="mt-4 text-xs text-zinc-400 font-mono flex justify-between">
        <span>PRESS ENTER TO INITIALIZE WIRE</span>
      </div>
    </div>
  );
}
