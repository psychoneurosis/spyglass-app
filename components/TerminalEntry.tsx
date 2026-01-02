import React, { useState, useEffect, useRef } from 'react';

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

export interface Case {
  id: string;
  user_id: string;
  title: string;
  core_question: string;
  context_scope: string;
  starting_material: 'INGEST' | 'BLANK';
  evidence_maturity: string;
  desired_outcome: string;
  last_opened_at: number;
  canvas_state?: { nodes: any[]; edges: any[] };
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
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [tempData, setTempData] = useState<any>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  // Focus input on mount and phase change
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentPhase, step]);

  // --- Phase 1: Authentication ---
  useEffect(() => {
    if (currentPhase === 'AUTHENTICATION' && step === 0) {
      setOutput(['Before we begin, I’ll need to set up your account so your work is saved.', 'What email should I use?']);
      setStep(1);
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
            setOutput([
                'Before we begin, I need a quick read on who’s on this case. This helps me work with you properly.', 
                'Answer briefly — or skip anything.',
                'What should I call you?'
            ]);
            setStep(1);
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
        const name = newData.name || 'Investigator';
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
        const name = user?.name || 'Investigator';
        
        // Load cases
        const allCasesRaw = localStorage.getItem('spyglass_cases');
        const allCases: Record<string, Case> = allCasesRaw ? JSON.parse(allCasesRaw) : {};
        const userCases = Object.values(allCases)
            .filter((c: Case) => c.user_id === userId)
            .sort((a, b) => b.last_opened_at - a.last_opened_at);
        
        setTempData({ userCases });

        if (userCases.length === 0) {
            setOutput([`Welcome back, ${name}.`, 'Ready to start your first investigation? (Y/N)']);
            setStep(1); // 1 = Confirm New
        } else if (userCases.length === 1) {
            const c = userCases[0];
            setOutput([`Welcome back, ${name}.`, `Continue "${c.title}" or start a new investigation? (Type 'Continue' or 'New')`]);
            setStep(2); // 2 = Single Case Decision
        } else {
            const list = userCases.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
            setOutput([`Welcome back, ${name}.`, 'Which investigation would you like to open — or should we start a new one?', list, `Type the number or "New".`]);
            setStep(3); // 3 = Multi Case Decision
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

  // --- Phase 3: Case Intake ---
  useEffect(() => {
    if (currentPhase === 'CASE_INTAKE' && step === 0) {
        setOutput(['Before we open the board, I need to understand what this investigation is about.', 'What should we call this investigation? (Default: "Untitled Investigation")']);
        setStep(1);
    }
  }, [currentPhase, step]);

  const handleCaseIntake = (value: string) => {
    const currentOutput = [...output, `> ${value}`];
    const newData = { ...tempData };

    if (step === 1) {
        newData.title = value.trim() || 'Untitled Investigation';
        setOutput([...currentOutput, 'What are you trying to figure out?']);
        setStep(2);
    } else if (step === 2) {
        newData.core_question = value;
        setOutput([...currentOutput, 'What kind of information are you working with right now?']);
        setStep(3);
    } else if (step === 3) {
        newData.context_scope = value;
        setOutput([...currentOutput, 'Do you already have material to start with, or are we beginning from scratch? (Ingest/Blank)']);
        setStep(4);
    } else if (step === 4) {
        const v = value.toLowerCase();
        if (v.includes('ingest') || v.includes('start') || v.includes('material')) {
            newData.starting_material = 'INGEST';
        } else {
            newData.starting_material = 'BLANK';
        }
        setOutput([...currentOutput, 'How solid is what you already know?']);
        setStep(5);
    } else if (step === 5) {
        newData.evidence_maturity = value;
        setOutput([...currentOutput, 'At the end of this, what would count as a good outcome for you?']);
        setStep(6);
    } else if (step === 6) {
        newData.desired_outcome = value;
        setOutput([...currentOutput, 'Understood. Let’s lay everything out.']);
        
        // Create Case
        const userId = localStorage.getItem('spyglass_current_user_id');
        const caseId = `case-${Date.now()}`;
        const newCase: Case = {
            id: caseId,
            user_id: userId!,
            title: newData.title,
            core_question: newData.core_question,
            context_scope: newData.context_scope,
            starting_material: newData.starting_material,
            evidence_maturity: newData.evidence_maturity,
            desired_outcome: newData.desired_outcome,
            last_opened_at: Date.now(),
            canvas_state: { nodes: [], edges: [] }
        };
        
        const allCases = JSON.parse(localStorage.getItem('spyglass_cases') || '{}');
        allCases[caseId] = newCase;
        localStorage.setItem('spyglass_cases', JSON.stringify(allCases));
        
        setTimeout(() => {
            onCaseSelected(caseId);
            setStep(0);
            setOutput([]);
            setTempData({});
        }, 1500);
    }
    setTempData(newData);
  };

  const handleInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        const val = input; // Allow empty strings for skipping if needed, logic handles it
        setInput('');
        
        if (currentPhase === 'AUTHENTICATION') handleAuth(val);
        else if (currentPhase === 'INVESTIGATOR_INTAKE') handleInvestigatorIntake(val);
        else if (currentPhase === 'CASE_ROUTER') handleCaseRouter(val);
        else if (currentPhase === 'CASE_INTAKE') handleCaseIntake(val);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-white font-mono p-8 overflow-y-auto" onClick={() => inputRef.current?.focus()}>
      <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end">
        <div className="space-y-4 mb-4">
            {output.map((line, i) => (
                <div key={i} className={line.startsWith('>') ? 'text-zinc-400' : 'text-zinc-100'}>
                    {line}
                </div>
            ))}
        </div>
        <div className="flex items-center gap-2 text-zinc-400 border-t border-zinc-800 pt-4">
            <span>&gt;</span>
            <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInput}
                className="flex-1 bg-transparent outline-none text-white caret-cyan-500"
                autoFocus
                spellCheck={false}
            />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
