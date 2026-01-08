import React, { useState, useEffect, useRef } from 'react';
import { useSpyglassStore } from '@/lib/store';
import { processCommand } from '@/lib/ai-service';
import { assessStoryViabilityIndia } from '@/lib/ai-journalism';
import { ArrowLeftRight } from 'lucide-react';
import { createStory, getUser, updateStory, supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [tempData, setTempData] = useState<Record<string, unknown>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const terminalMode = useSpyglassStore(s => s.terminalMode);
  const setTerminalMode = useSpyglassStore(s => s.setTerminalMode);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const user = useSpyglassStore(s => s.user);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [histIndex, setHistIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const keySoundRef = useRef<HTMLAudioElement | null>(null);
  const enterSoundRef = useRef<HTMLAudioElement | null>(null);
  const CASE_QUESTIONS = [
    'What story are you investigating?',
    'What is the central public interest angle?',
    'What initial evidence or sources do you have?',
    'What is the primary ethical risk?',
  ];
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user'; text: string }>>([]);
  const [pendingKey, setPendingKey] = useState<'public_interest' | 'initial_nodes' | 'ethics_flag' | null>(null);
  const [createdStoryId, setCreatedStoryId] = useState<string | null>(null);
  const playClick = () => {
    try {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3').play().catch(() => {});
    } catch {}
  };

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  // Focus input on mount and phase change
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentPhase, step]);

  useEffect(() => {
    try {
      const keyAudio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-typewriter-hit-2298.mp3');
      keyAudio.preload = 'auto';
      keyAudio.volume = 0.2;
      keySoundRef.current = keyAudio;
    } catch {}
    try {
      const enterAudio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-typewriter-bell-1473.mp3');
      enterAudio.preload = 'auto';
      enterAudio.volume = 0.25;
      enterSoundRef.current = enterAudio;
    } catch {}
  }, []);

  // --- Phase 1: Authentication ---
  useEffect(() => {
    if (currentPhase === 'AUTHENTICATION' && step === 0) {
      setTimeout(() => {
        setOutput(['Before we begin, I’ll need to set up your account so your work is saved.', 'What email should I use?']);
        setStep(1);
      }, 0);
    }
  }, [currentPhase, step]);

  const handleAuth = (value: string) => {
    if (!value.includes('@')) {
      setOutput(prev => [...prev, `> ${value}`, 'Please enter a valid email address.']);
      return;
    }
    
    // Simulate Magic Link / Auth
    const email = value.trim();
    setOutput(prev => [...prev, `> ${email}`, 'Verifying...', 'Authenticated.']);
    
    // Check if user exists
    try {
      const usersRaw = localStorage.getItem('spyglass_users');
      const users = usersRaw ? JSON.parse(usersRaw) : {};
      let user = users[email];
      
      if (!user) {
        user = {
          id: email,
          email: email,
          name: '',
          age_profession: '',
          thinking_style: '',
          friction_point: '',
          goal: '',
          uncertainty_preference: '',
          intake_complete: false
        };
        users[email] = user;
        localStorage.setItem('spyglass_users', JSON.stringify(users));
      }
      
      // Save current user ID
      localStorage.setItem('spyglass_current_user_id', email);
      onInvestigatorUpdate(user);

      setTimeout(() => {
        if (!user.intake_complete) {
            onPhaseChange('INVESTIGATOR_INTAKE');
        } else {
            onPhaseChange('CASE_ROUTER');
        }
        setStep(0);
        setOutput([]);
      }, 1000);
    } catch (e) {
      console.error(e);
      setOutput(prev => [...prev, 'System Error: Could not save user data.']);
    }
  };

  // --- Phase 2: Investigator Intake ---
  useEffect(() => {
    if (currentPhase === 'INVESTIGATOR_INTAKE') {
        if (step === 0) {
            setTimeout(() => {
              setOutput([
                  'Before we begin, I need a quick read on who’s on this case. This helps me work with you properly.', 
                  'Answer briefly — or skip anything.',
                  'What should I call you?'
              ]);
              setStep(1);
            }, 0);
        }
    }
  }, [currentPhase, step]);

  const handleInvestigatorIntake = (value: string) => {
    const currentOutput = [...output, `> ${value}`];
    
    // Steps map to questions
    // 1: Name -> 2: Age/Prof
    // 2: Age/Prof -> 3: Thinking
    // 3: Thinking -> 4: Friction
    // 4: Friction -> 5: Goal
    // 5: Goal -> 6: Uncertainty
    // 6: Uncertainty -> Finish

    const newData = { ...tempData };

    if (step === 1) {
        newData.name = value;
        setOutput([...currentOutput, 'How old are you, and what do you do?']);
        setStep(2);
    } else if (step === 2) {
        newData.age_profession = value;
        setOutput([...currentOutput, 'When you’re trying to make sense of something complex, what do you usually do first?']);
        setStep(3);
    } else if (step === 3) {
        newData.thinking_style = value;
        setOutput([...currentOutput, 'What tends to break down for you when information gets messy?']);
        setStep(4);
    } else if (step === 4) {
        newData.friction_point = value;
        setOutput([...currentOutput, 'When you’re deep into figuring something out, what are you really trying to do?']);
        setStep(5);
    } else if (step === 5) {
        newData.goal = value;
        setOutput([...currentOutput, 'When things are uncertain, how should I handle it — flag it cautiously, explore it anyway, or wait for confirmation?']);
        setStep(6);
    } else if (step === 6) {
        newData.uncertainty_preference = value;
        const name = newData.name || 'Journalist';
        setOutput([...currentOutput, `Understood, ${name}. I’ll work with that in mind.`]);
        
        // Save
        const userId = localStorage.getItem('spyglass_current_user_id');
        if (userId) {
            const users = JSON.parse(localStorage.getItem('spyglass_users') || '{}');
            users[userId] = { ...users[userId], ...newData, intake_complete: true };
            localStorage.setItem('spyglass_users', JSON.stringify(users));
            onInvestigatorUpdate(users[userId]);
        }
        
        setTimeout(() => {
            onPhaseChange('CASE_ROUTER');
            setStep(0);
            setOutput([]);
            setTempData({});
        }, 1500);
    }
    setTempData(newData);
  };

  // --- Phase: Case Router (Returning User) ---
  useEffect(() => {
    if (currentPhase === 'CASE_ROUTER' && step === 0) {
        const userId = localStorage.getItem('spyglass_current_user_id');
        const users = JSON.parse(localStorage.getItem('spyglass_users') || '{}');
        const user = users[userId || ''];
        const name = user?.name || 'Reporter';
        
        // Load cases
        const allCasesRaw = localStorage.getItem('spyglass_cases');
        const allCases: Record<string, Story> = allCasesRaw ? JSON.parse(allCasesRaw) : {};
        const userCases = Object.values(allCases)
            .filter((c: Story) => c.user_id === userId)
            .sort((a, b) => b.last_opened_at - a.last_opened_at);
        
        setTimeout(() => setTempData({ userCases }), 0);

        if (userCases.length === 0) {
            setTimeout(() => {
              setOutput([`Welcome back, ${name}.`, 'Ready to start your first story? (Y/N)']);
              setStep(1);
            }, 0);
        } else if (userCases.length === 1) {
            const c = userCases[0];
            setTimeout(() => {
              setOutput([`Welcome back, ${name}.`, `Continue "${c.title}" or start a new story? (Type 'Continue' or 'New')`]);
              setStep(2);
            }, 0);
        } else {
            const list = userCases.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
            setTimeout(() => {
              setOutput([`Welcome back, ${name}.`, 'Which story would you like to open — or should we start a new one?', list, `Type the number or "New".`]);
              setStep(3);
            }, 0);
        }
    }
  }, [currentPhase, step]);

  const handleCaseRouter = (value: string) => {
    const v = value.trim().toLowerCase();
    const currentOutput = [...output, `> ${value}`];
    
    if (step === 1) { // No cases, start first?
        if (v === 'y' || v === 'yes') {
            onPhaseChange('CASE_INTAKE');
            setStep(0);
            setOutput([]);
        } else {
             // Logout? Or just sit there?
             // Prompt says "Ready to start your first investigation?". Implicitly expects yes.
             // If no, maybe switch user.
             if (v === 'switch' || v === 'logout') {
                 localStorage.removeItem('spyglass_current_user_id');
                 onPhaseChange('AUTHENTICATION');
                 setStep(0);
                 setOutput([]);
             } else {
                setOutput([...currentOutput, 'Okay. Type "Y" when ready, or "Switch" to change user.']);
             }
        }
    } else if (step === 2) { // Single case
        if (v === 'continue' || v === 'c') {
            const c = tempData.userCases[0];
            onCaseSelected(c.id);
        } else if (v === 'new' || v === 'n') {
            onPhaseChange('CASE_INTAKE');
            setStep(0);
            setOutput([]);
        } else if (v === 'switch') {
             localStorage.removeItem('spyglass_current_user_id');
             onPhaseChange('AUTHENTICATION');
             setStep(0);
             setOutput([]);
        } else {
            setOutput([...currentOutput, 'Please type "Continue" or "New".']);
        }
    } else if (step === 3) { // Multi case
        if (v === 'new' || v === 'n') {
            onPhaseChange('CASE_INTAKE');
            setStep(0);
            setOutput([]);
        } else if (v === 'switch') {
             localStorage.removeItem('spyglass_current_user_id');
             onPhaseChange('AUTHENTICATION');
             setStep(0);
             setOutput([]);
        } else {
            const index = parseInt(v) - 1;
            if (!isNaN(index) && index >= 0 && index < tempData.userCases.length) {
                onCaseSelected(tempData.userCases[index].id);
            } else {
                setOutput([...currentOutput, 'Invalid selection. Type the number or "New".']);
            }
        }
    }
  };

  // --- Phase 3: Case Intake (Simplified - Only Headline) ---
  useEffect(() => {
    if (currentPhase === 'CASE_INTAKE' && step === 0) {
        setTimeout(() => {
          setMessages([{ role: 'ai', text: 'What is the headline for this story?' }]);
        }, 0);
    }
  }, [currentPhase, step]);

  const handleCaseIntakeMessage = async (value: string) => {
    if (!value.trim()) {
      setMessages(prev => [...prev, { role: 'user', text: value }, { role: 'ai', text: 'Please enter a headline.' }]);
      return;
    }
    
    setMessages(prev => [...prev, { role: 'user', text: value }]);
    
    // Play bell sound
    try {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play().catch(() => {});
    } catch {}
    
    try {
      const supaUser = user?.id ? { user: { id: user.id } } : (await getUser()).data;
      const userId = supaUser?.user?.id || '';
      if (!userId) {
        window.location.assign('/auth/login');
        return;
      }
      setIsProcessing(true);
      try {
        const { data, error } = await supabase.from('stories').insert({
          user_id: userId,
          title: value.trim(),
          status: 'active',
        }).select().single();
        
        if (error) throw error;
        
        setIsProcessing(false);
        window.location.assign('/dashboard');
      } catch (error: any) {
        console.error(error?.message || error);
        setIsProcessing(false);
        setMessages(prev => [...prev, { role: 'ai', text: 'System Error: Could not create story.' }]);
      }
    } catch (error: any) {
      console.error(error?.message || error);
      setMessages(prev => [...prev, { role: 'ai', text: 'System Error: Session invalid.' }]);
    }
  };

  const handleInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    playClick();
    if (e.key === 'Enter') {
        const val = input;
        setInput('');
        
        if (terminalMode === 'command') {
          const ctx = activeStory || {};
          processCommand(val, ctx).then(res => {
            setOutput(prev => [...prev, `> ${val}`, JSON.stringify(res)]);
            setHistory(prev => [val, ...prev].slice(0, 50));
            setHistIndex(null);
            setSuggestions([]);
          }).catch(() => {
            setOutput(prev => [...prev, `> ${val}`, 'Command failed']);
          });
        } else {
          if (currentPhase === 'AUTHENTICATION') handleAuth(val);
          else if (currentPhase === 'INVESTIGATOR_INTAKE') handleInvestigatorIntake(val);
          else if (currentPhase === 'CASE_ROUTER') handleCaseRouter(val);
          else if (currentPhase === 'CASE_INTAKE') handleCaseIntakeMessage(val);
        }
    }
    try {
      if (keySoundRef.current && e.key.length === 1) {
        keySoundRef.current.currentTime = 0;
        void keySoundRef.current.play();
      }
    } catch {}
    if (e.key === 'ArrowUp') {
      const idx = histIndex === null ? 0 : Math.min(history.length - 1, histIndex + 1);
      const val = history[idx] || '';
      setHistIndex(idx);
      setInput(val);
    }
    if (e.key === 'ArrowDown') {
      const idx = histIndex === null ? null : histIndex - 1;
      if (idx === null || idx < 0) {
        setHistIndex(null);
        setInput('');
      } else {
        const val = history[idx] || '';
        setHistIndex(idx);
        setInput(val);
      }
    }
  };

  useEffect(() => {
    if (terminalMode === 'command') {
      const base = ['create node', 'filter', 'search', 'export report', 'analyze story'];
      const v = input.trim().toLowerCase();
      setTimeout(() => {
        setSuggestions(v ? base.filter(x => x.startsWith(v)).slice(0, 5) : base.slice(0, 5));
      }, 0);
    } else {
      setTimeout(() => setSuggestions([]), 0);
    }
  }, [input, terminalMode]);

  return (
    <div className="fixed inset-0 z-[100] bg-amber-50 text-zinc-900 font-serif p-8 overflow-y-auto" onClick={() => inputRef.current?.focus()}>
      <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end">
        <div className="flex items-center justify-between mb-4">
          <div className="text-zinc-700 text-xs font-serif">THE REPORTER'S DESK</div>
          <button
            onClick={() => setTerminalMode(terminalMode === 'intake' ? 'command' : 'intake')}
            className="px-2 py-1 bg-zinc-100 border border-zinc-300 rounded text-zinc-900 hover:bg-white flex items-center gap-2"
          >
            <ArrowLeftRight className="w-4 h-4" />
            {terminalMode === 'intake' ? 'Intake' : 'Command'}
          </button>
        </div>
        <div className="space-y-4 mb-4">
          {terminalMode === 'intake' && currentPhase === 'CASE_INTAKE' ? (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-zinc-500' : 'text-zinc-900'}>
                {m.role === 'user' ? `> ${m.text}` : m.text}
              </div>
            ))
          ) : (
            output.map((line, i) => (
              <div key={i} className={line.startsWith('>') ? 'text-zinc-500' : 'text-zinc-900'}>
                {line}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 text-zinc-700 border-t border-zinc-300 pt-4">
            {isProcessing ? (
              <div className="flex-1 text-zinc-700 font-serif animate-pulse">...SENDING TO EDITORIAL DESK...</div>
            ) : (
              <>
                <span>&gt;</span>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInput}
                    className="flex-1 bg-transparent outline-none text-zinc-900 caret-zinc-900"
                    autoFocus
                    spellCheck={false}
                />
              </>
            )}
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 text-[12px] text-zinc-600">
            {suggestions.join('  •  ')}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
