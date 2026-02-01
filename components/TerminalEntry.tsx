import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---

export type Phase = 'AUTHENTICATION' | 'INVESTIGATOR_INTAKE' | 'CASE_ROUTER' | 'CASE_INTAKE' | 'CANVAS';

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
  canvas_state?: { nodes: unknown[]; edges: unknown[] };
}

// --- Component ---

interface TerminalEntryProps {
  currentPhase: Phase;
  onPhaseChange: (phase: Phase) => void;
  onCaseSelected: (caseId: string) => void;
  onInvestigatorUpdate: (investigator: Investigator) => void;
}

export default function TerminalEntry({ 
  currentPhase, 
  onPhaseChange, 
  onCaseSelected,
  onInvestigatorUpdate
}: TerminalEntryProps) {
  void currentPhase;
  void onPhaseChange;
  void onCaseSelected;
  void onInvestigatorUpdate;
  const [headline, setHeadline] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleEnter = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && headline.trim()) {
      setIsProcessing(true);
      try {
        try {
          const bell = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-typewriter-bell-1473.mp3');
          bell.play().catch(() => {});
        } catch {}
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('stories').insert({
            title: headline.trim(),
            user_id: user.id,
            status: 'active'
          });
          window.location.assign('/dashboard');
        } else {
            console.error("No user found");
            window.location.assign('/auth/login');
        }
      } catch (error) {
        console.error(error);
        setIsProcessing(false);
      }
    }
  };

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
        disabled={isProcessing}
        className="w-full bg-transparent text-xl md:text-2xl font-serif text-zinc-900 placeholder:text-zinc-400 border-b-2 border-zinc-300 focus:border-zinc-900 outline-none py-2 transition-colors"
      />
      <div className="mt-4 text-xs text-zinc-400 font-mono flex justify-between">
        <span>PRESS ENTER TO INITIALIZE WIRE</span>
        {isProcessing && <span className="animate-pulse">TRANSMITTING...</span>}
      </div>
    </div>
  );
}
