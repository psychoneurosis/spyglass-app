"use client";
import { Search, Folder, Sparkles, Plus, MapPin, User as UserIcon, Trash2, LayoutGrid, FileDown, FileText, Briefcase, Database, Shield } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Node, Edge } from "reactflow";
import { useSpyglassStore } from "@/lib/store";
import { supabase, updateStory as updateStoryInDb } from "@/lib/supabase";
import SourceManager from "@/components/journalism/SourceManager";
import EthicsChecklist from "@/components/journalism/EthicsChecklist";
type NodeData = { label?: string; timestamp?: string; note?: string; [key: string]: unknown };
const SHADOW_LEDGER = "At 02:15 AM, a suspect known as 'The Ghost' was seen disabling security at The Sapphire Vault. 'The Ghost' was carrying a specialized EMP Device. Moments later, 'The Ghost' met with an insider known as 'Leo' inside the vault. Leo was spotted at the Vault around 02:00 AM.";

export type EntityType = 'person' | 'place' | 'document' | 'object' | 'event';

export interface SuggestedEntity {
  id: string;
  type: EntityType;
  label: string;
  source: string;
  timestamp?: string;
  fileType?: string;
  previewUrl?: string;
  textPreview?: string;
  fullText?: string;
  relations?: { targetLabel: string; verb: string; sourceSentence?: string }[];
  originSentence?: string;
  sourceFile?: string;
  conflicts?: {
     type: 'timestamp' | 'location' | 'other';
     source: string;
     value: string;
     sentence: string;
  }[];
}

interface SidebarProps {
  onAddEntity: (entity: SuggestedEntity) => void;
  onLaunchDiscovery?: (entities: SuggestedEntity[]) => void;
  onClear: () => void;
  onOrganize: () => void;
  onExport: () => void;
  storyInfo?: {
    name: string;
    persona: 'THE PROTECTOR' | 'THE MUCKRAKER' | 'THE ENFORCER' | 'THE VIGILANTE';
    objective?: string;
  };
  existingLabels?: string[];
  onDraftBriefing?: () => void;
  onToggleTimeline?: () => void;
  onUndo?: () => void;
  nodes?: Node[];
  edges?: Edge[];
  investigatorName?: string;
  sources?: { id: string; name: string; content: string; type: string }[];
  onUpdateSources?: (sources: { id: string; name: string; content: string; type: string }[]) => void;
  onSwitchStory?: () => void;
  onLogout?: () => void;
  defaultOpenIngest?: boolean;
}

export default function Sidebar({ onAddEntity, onLaunchDiscovery, onClear, onOrganize, onExport, storyInfo, existingLabels = [], onDraftBriefing, onToggleTimeline, onUndo, nodes = [], edges = [], investigatorName, sources = [], onUpdateSources, onSwitchStory: onSwitchStoryProp, onLogout, defaultOpenIngest = true }: SidebarProps) {
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<'discovery' | 'sources' | 'ethics' | 'intel'>(defaultOpenIngest ? 'discovery' : 'intel');
  const [suggestions, setSuggestions] = useState<SuggestedEntity[]>([]);
  const [references, setReferences] = useState<{ id: string; name: string; type: string; url?: string; textPreview?: string; fullText?: string }[]>([]);
  const [isCrawling, setIsCrawling] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const resetStore = useSpyglassStore(s => s.resetStore);
  const clearStoryState = useSpyglassStore(s => s.clearStoryState);
  const isRedacted = useSpyglassStore(s => s.isRedacted);
  const setIsRedacted = useSpyglassStore(s => s.setIsRedacted);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const updateActiveStory = useSpyglassStore(s => s.updateStory);
  const storyStage = useSpyglassStore(s => s.storyStage);
  const setStoryStage = useSpyglassStore(s => s.setStoryStage);

  void onSwitchStoryProp;
  void onLogout;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    resetStore();
    window.location.href = '/auth/login';
  };

  const handleSwitchStory = () => {
    clearStoryState();
    window.location.href = '/dashboard';
  };

  const handleUploadSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const content = String(reader.result || '');
        const newSource = {
            id: `src-${Date.now()}`,
            name: file.name,
            content: content,
            type: file.type
        };
        if (onUpdateSources) {
            onUpdateSources([...sources, newSource]);
        }
    };
    reader.readAsText(file); // Assume text for now, even for PDF we might need a parser later
    e.target.value = '';
  };

  const handleDeleteSource = (id: string) => {
      if (onUpdateSources) {
          onUpdateSources(sources.filter(s => s.id !== id));
      }
  };

  const handleAnalyzeClick = () => {
    if (!inputText.trim()) return;
    setIsCrawling(true);

    const textsToAnalyze: { content: string; sourceName: string; sourceFile?: string }[] = [];
    
    // Check uploaded sources first
    if (sources.length > 0) {
        sources.forEach(s => {
            textsToAnalyze.push({ content: s.content, sourceName: s.name, sourceFile: s.name });
        });
    }

    // Check mock data
    if (/neon|vault/i.test(inputText)) {
        textsToAnalyze.push({ content: SHADOW_LEDGER, sourceName: 'Shadow Ledger (Mock)' });
    }
    
    // Always include input text if it's not just a keyword trigger
    if (!/neon|vault/i.test(inputText) || inputText.length > 20) {
         textsToAnalyze.push({ content: inputText, sourceName: 'Manual Input' });
    }

    const foundEntities: SuggestedEntity[] = [];
    const objectTokens = ["Briefcase", "Evidence", "File", "Weapon", "Phone", "Notebook", "Device", "EMP"];
    const placeTokens = ["Gala", "Station", "Office", "Street", "Park", "Avenue", "Road", "Lane", "Blvd", "Plaza", "House", "City", "Home", "Vault"];
    const eventTokens = ["Gala", "Meeting", "Heist", "Abduction", "Party", "Incident"];
    const blacklist = /^(He|She|They|It|The|Then|There|That|This|Who|What|Where|When|Why|How|PM|AM|Witness|A|An|In|On|At|To|For|Of|With|By|From|And|But|Or|So|Yet|Nor)$/i;

    textsToAnalyze.forEach(sourceObj => {
        const text = sourceObj.content;
        const sourceName = sourceObj.sourceName;
        const sourceFile = sourceObj.sourceFile;
        const words = text.split(/\s+/);
        
        let i = 0;
        while (i < words.length) {
            const word = words[i].replace(/[.,!?]/g, '');
            if (blacklist.test(word)) { i++; continue; }
            
            if (/^[A-Z]/.test(word)) {
                const phraseIndices = [i];
                let j = i + 1;
                while (j < words.length) {
                    const nextWord = words[j].replace(/[.,!?]/g, '');
                    if (blacklist.test(nextWord)) break;
                    if (/^[A-Z]/.test(nextWord)) {
                        phraseIndices.push(j);
                        j++;
                    } else {
                        break;
                    }
                }
                const label = phraseIndices.map(idx => words[idx].replace(/[.,!?]/g, '')).join(' ');
                const lowerLabel = label.toLowerCase();
                const matchesObject = objectTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
                const matchesEvent = eventTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
                const matchesPlace = placeTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
                const type: EntityType = matchesObject ? 'object' : matchesEvent ? 'event' : matchesPlace ? 'place' : 'person';
                
                const isStartOfSentence = i === 0 || /[.!?]$/.test(words[i - 1]);
                let isValid = true;
                if (type === 'person' && isStartOfSentence && phraseIndices.length === 1) isValid = false;
                if (blacklist.test(label)) isValid = false;

                if (isValid) {
                    // Extract sentence context
                    // Find the sentence boundary before
                    let start = phraseIndices[0];
                    while (start > 0 && !/[.!?]/.test(words[start - 1])) start--;
                    // Find sentence boundary after
                    let end = phraseIndices[phraseIndices.length - 1];
                    while (end < words.length - 1 && !/[.!?]/.test(words[end])) end++;
                    const sentence = words.slice(start, end + 1).join(' ');

                    foundEntities.push({
                        id: `sugg-${Date.now()}-${Math.random()}`,
                        type: type,
                        label: label,
                        source: sourceName,
                        originSentence: sentence,
                        sourceFile: sourceFile
                    });
                }
                i = j;
            } else {
                i++;
            }
        }
        
        // Quotes
        const quoted = Array.from(text.matchAll(/'([^']+)'/g)).map(m => ({ label: m[1], index: m.index }));
        quoted.forEach(q => {
             if (!q.label) return;
             const label = q.label.trim();
             const lowerLabel = label.toLowerCase();
             const matchesObject = objectTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
             const matchesPlace = placeTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
             const matchesEvent = eventTokens.some(tok => lowerLabel.includes(tok.toLowerCase()));
             const type: EntityType = matchesObject ? 'object' : matchesPlace ? 'place' : matchesEvent ? 'event' : 'person';
             
             // Simple sentence extraction for quote
             const start = Math.max(0, (q.index || 0) - 50);
             const end = Math.min(text.length, (q.index || 0) + label.length + 50);
             const sentence = "..." + text.substring(start, end) + "...";

             foundEntities.push({
                id: `sugg-${Date.now()}-${Math.random()}`,
                type,
                label,
                source: sourceName,
                originSentence: sentence,
                sourceFile: sourceFile
              });
        });
    });

    // 2. Enhance entities with context (Timestamps & Relations) PER SOURCE
    textsToAnalyze.forEach(sourceObj => {
        const text = sourceObj.content;
        const sentences = text.split(/(?<=[.!?])\s+/);
        const verbs = ["carrying","meeting","discussing","seen","spotted","located","found","met","stole","abducted","attended","disabling security","met with","spotted at"];
        
        // Entities found IN THIS SOURCE
        const entitiesInSource = foundEntities.filter(e => e.source === sourceObj.sourceName);
        const labelSet = new Set(entitiesInSource.map(e => e.label));

        sentences.forEach(s => {
             const lower = s.toLowerCase();
             const timeMatch = s.match(/\b(?:(?:at|around)\s+)?((?:\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)|\b\d{2}:\d{2}\b|noon|midnight))\b/i);
             
             // Find entities mentioned in this sentence
             const presentLabels = Array.from(labelSet).filter(lbl => lower.includes(lbl.toLowerCase()));
             
             if (presentLabels.length > 0) {
                 presentLabels.forEach(lbl => {
                     const matches = entitiesInSource.filter(e => e.label === lbl);
                     matches.forEach(m => {
                         if (timeMatch) m.timestamp = timeMatch[1] || timeMatch[0];
                         m.originSentence = s.trim(); 
                     });
                 });
             }

             // Relations
             if (presentLabels.length >= 2) {
                const ordered = presentLabels
                  .map(lbl => ({ lbl, idx: lower.indexOf(lbl.toLowerCase()) }))
                  .sort((a, b) => a.idx - b.idx)
                  .map(x => x.lbl);
                const verb = verbs.find(v => lower.includes(v));
                if (verb) {
                  for (let k = 0; k < ordered.length - 1; k++) {
                    const src = ordered[k];
                    const tgt = ordered[k + 1];
                    const srcEntities = entitiesInSource.filter(e => e.label === src);
                    srcEntities.forEach(e => {
                        e.relations = e.relations || [];
                        if (!e.relations.some(r => r.targetLabel === tgt && r.verb === verb)) {
                             e.relations.push({ targetLabel: tgt, verb, sourceSentence: s.trim() });
                        }
                    });
                  }
                }
             }
        });
    });

    // 3. Conflict Detection & Merging
    const uniqueEntities: SuggestedEntity[] = [];
    const groups: Record<string, SuggestedEntity[]> = {};
    
    foundEntities.forEach(e => {
        const key = e.label.trim().toLowerCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
    });

    Object.entries(groups).forEach(([, group]) => {
        const primary = group[0];
        const conflicts: NonNullable<SuggestedEntity['conflicts']> = [];

        // Check Timestamps
        const timestamps = group.filter(e => e.timestamp).map(e => ({ val: e.timestamp!, src: e.source, sentence: e.originSentence || '' }));
        const uniqueTimes = Array.from(new Set(timestamps.map(t => t.val)));
        if (uniqueTimes.length > 1) {
            timestamps.forEach(t => {
                conflicts.push({
                    type: 'timestamp',
                    source: t.src,
                    value: t.val,
                    sentence: t.sentence
                });
            });
        }

        // Check Relations (Locations)
        const relations = group.flatMap(e => (e.relations || []).map(r => ({ ...r, src: e.source, sentence: e.originSentence || '' })));
        const locRelations = relations.filter(r => /at|in|near|spotted at|located/i.test(r.verb));
        
        if (locRelations.length > 1) {
             const targets = new Set(locRelations.map(r => r.targetLabel.toLowerCase()));
             if (targets.size > 1) {
                 locRelations.forEach(r => {
                     conflicts.push({
                         type: 'location',
                         source: r.src,
                         value: `${r.verb} ${r.targetLabel}`,
                         sentence: r.sentence
                     });
                 });
             }
        }

        // Merge info
        const merged = { ...primary };
        if (conflicts.length > 0) {
            merged.conflicts = conflicts;
        }
        
        // Merge relations
        const allRels = group.flatMap(e => e.relations || []);
        const uniqueRels: any[] = [];
        const seenRels = new Set();
        allRels.forEach(r => {
            const k = `${r.verb}-${r.targetLabel}`;
            if (!seenRels.has(k)) {
                seenRels.add(k);
                uniqueRels.push(r);
            }
        });
        merged.relations = uniqueRels;

        uniqueEntities.push(merged);
    });

    if (onLaunchDiscovery) {
      onLaunchDiscovery(uniqueEntities);
    } else {
      const existingSet = new Set(existingLabels.map(l => l.trim().toLowerCase()));
      const filtered = uniqueEntities.filter(e => !existingSet.has(e.label.trim().toLowerCase()));
      setSuggestions(filtered);
    }
    setInputText("");
    setTimeout(() => setIsCrawling(false), 300);
  };

  const idCounter = useRef(0);

  // Classified Intel: Investigator profile intentionally not exposed in UI

  const handleAdd = (entity: SuggestedEntity) => {
    const exactExists = existingLabels.some(l => l.trim().toLowerCase() === entity.label.trim().toLowerCase());
    if (exactExists) {
      window.dispatchEvent(new CustomEvent('spyglass-highlight-node', { detail: { label: entity.label } }));
      setSuggestions(prev => prev.filter(e => e.id !== entity.id));
      return;
    }

    const similar = existingLabels.find(l => {
        const a = l.trim().toLowerCase();
        const b = entity.label.trim().toLowerCase();
        return (a.length > 3 && b.length > 3) && (a.includes(b) || b.includes(a));
    });

    if (similar) {
         if (window.confirm(`Possible Duplicate: "${entity.label}" is similar to existing "${similar}". Merge Intel?`)) {
             window.dispatchEvent(new CustomEvent('spyglass-highlight-node', { detail: { label: similar } }));
             setSuggestions(prev => prev.filter(e => e.id !== entity.id));
             return;
         }
    }

    onAddEntity(entity);
    setSuggestions(prev => prev.filter(e => e.id !== entity.id));
  };

  const handleUploadReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    idCounter.current += 1;
    const type = file.type || '';
    const id = `ref-${idCounter.current}`;
    if (type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setReferences(prev => [{ id, name: file.name, type, url }, ...prev]);
    } else if (type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = () => {
        const fullText = String(reader.result || '');
        const textPreview = fullText.slice(0, 20);
        setReferences(prev => [{ id, name: file.name, type, textPreview, fullText }, ...prev]);
      };
      reader.readAsText(file);
    } else if (type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setReferences(prev => [{ id, name: file.name, type, url }, ...prev]);
    } else {
      const url = URL.createObjectURL(file);
      setReferences(prev => [{ id, name: file.name, type, url }, ...prev]);
    }
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };

  const spawnDocumentNode = (ref: { id: string; name: string; type: string; url?: string; textPreview?: string; fullText?: string }) => {
    onAddEntity({
      id: `doc-${++idCounter.current}`,
      type: 'document',
      label: ref.name,
      source: `Evidence: ${ref.name}`,
      fileType: ref.type,
      previewUrl: ref.url,
      textPreview: ref.textPreview,
      fullText: ref.fullText,
    });
    setReferences(prev => prev.filter(r => r.id !== ref.id));
  };

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  const callsign =
    isMounted
      ? (storyInfo?.persona === 'THE PROTECTOR' ? 'STAKEOUT LOG' :
         storyInfo?.persona === 'THE MUCKRAKER' ? 'THE LEAD SHEET' :
         storyInfo?.persona === 'THE ENFORCER' ? 'EVIDENCE REGISTER' :
         storyInfo?.persona === 'THE VIGILANTE' ? 'WAR ROOM' :
         'WAR ROOM')
      : 'WAR ROOM';

  // SOP Generation
  const sopTasks: { id: string; label: string; priority: 'high' | 'medium' | 'low' }[] = [];
  
  // 1. Check for Conflicts
  const conflictNodes = nodes.filter(n => (n.data as any)?.conflicts?.length > 0);
  conflictNodes.forEach(n => {
      sopTasks.push({
          id: `conflict-${n.id}`,
          label: `Verify ${(n.data as any).label}'s data (Conflict Detected)`,
          priority: 'high'
      });
  });

  // 2. Check for Missing Links (Isolated Persons)
  const personNodes = nodes.filter(n => n.type === 'person');
  personNodes.forEach(n => {
      const degree = edges.filter(e => e.source === n.id || e.target === n.id).length;
      if (degree === 0) {
          sopTasks.push({
              id: `missing-${n.id}`,
              label: `Connect ${(n.data as any).label} to the network (Missing Link)`,
              priority: 'medium'
          });
      }
  });

  // 3. Unresolved Events
  const eventNodes = nodes.filter(n => n.type === 'event');
  eventNodes.forEach(n => {
      const degree = edges.filter(e => e.source === n.id || e.target === n.id).length;
      if (degree < 2) {
           sopTasks.push({
              id: `event-${n.id}`,
              label: `Investigate ${(n.data as any).label} (Unresolved Event)`,
              priority: 'medium'
           });
      }
  });

  return (
    <div id="spyglass-sidebar" className="w-[260px] h-screen flex flex-col overflow-hidden bg-brand-parchment border-r border-zinc-200 text-zinc-900 shadow-xl flex-shrink-0">
      <div className="px-4 py-3 bg-brand-green border-b border-brand-green/40 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {!logoFailed ? (
              <img
                src="/spyglass-white.png"
                alt="Spyglass"
                className="h-5 w-auto"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="text-sm font-black tracking-[0.28em]">SPYGLASS</div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-amber-50/90 font-mono truncate">The Reporter&apos;s Desk</div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 border-b border-zinc-200">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-mono">Privacy Mode</div>
            <button
              type="button"
              aria-pressed={isRedacted}
              onClick={() => setIsRedacted(!isRedacted)}
              className={`relative w-10 h-5 rounded-full border transition-colors ${isRedacted ? 'bg-black border-black' : 'bg-amber-100 border-amber-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${isRedacted ? 'bg-white translate-x-5' : 'bg-zinc-900/70 translate-x-0'}`}
              />
            </button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Story Objective</div>
            <div className="text-sm text-white font-mono">{
              (storyInfo?.objective && storyInfo.objective.trim())
                ? storyInfo.objective
                : ''
            }</div>
          </div>
          
          <div className="flex gap-2 mt-2">
            <button 
                onClick={handleSwitchStory}
                className="flex-1 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-[10px] uppercase text-zinc-400 hover:text-white py-1 rounded transition-all"
            >
                All Stories
            </button>
            <button 
                onClick={handleLogout}
                className="flex-1 bg-zinc-900 border border-zinc-700 hover:border-red-900 text-[10px] uppercase text-zinc-400 hover:text-red-400 py-1 rounded transition-all"
            >
                Log Out
            </button>
          </div>

          {sopTasks.length > 0 && (
            <div className="mt-2 bg-zinc-900/50 border border-[#991b1b]/30 rounded p-2">
                <div className="text-[10px] uppercase tracking-wider text-[#991b1b] font-bold mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Next Logical Steps
                </div>
                <div className="space-y-1">
                    {sopTasks.slice(0, 3).map(task => (
                        <div key={task.id} className="text-xs text-zinc-300 flex items-start gap-1">
                            <span className="text-[#991b1b] mt-0.5">›</span>
                            <span>{task.label}</span>
                        </div>
                    ))}
                </div>
            </div>
          )}

          {conflictNodes.length > 0 && (
             <div className="mt-2 bg-yellow-900/20 border border-yellow-600/30 rounded p-2 animate-pulse">
                <div className="text-[10px] uppercase tracking-wider text-yellow-500 font-bold mb-1">
                    Conflicts Detected
                </div>
                <div className="space-y-1">
                    {conflictNodes.map(n => (
                        <div key={n.id} className="text-xs text-yellow-200/80">
                           ⚠ {(n.data as any).label}
                        </div>
                    ))}
                </div>
             </div>
          )}
        </div>
        {isMounted && investigatorName && (
           <div className="text-[10px] font-bold tracking-widest text-zinc-600 mb-1 font-serif">COMMANDER: {investigatorName.toUpperCase()}</div>
        )}
        <h1 className="text-xl font-bold tracking-wider text-zinc-900 font-serif">{isMounted ? callsign : 'WAR ROOM'}</h1>
        {isMounted && storyInfo?.name && (
          <div className="mt-3 text-sm text-zinc-300">
            <div className="font-semibold">Active Story</div>
            <div className="truncate">{storyInfo.name}</div>
            <div className="text-[11px] text-zinc-500">
              Persona: {storyInfo.persona}{storyInfo.objective ? ` • Objective: ${storyInfo.objective}` : ''}
            </div>
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Story Stage</div>
              <select
                value={storyStage || ''}
                onChange={(e) => {
                  const v = String(e.target.value || '');
                  if (!v) {
                    setStoryStage(null);
                    return;
                  }
                  setStoryStage(v as any);
                  if (activeStory?.id) {
                    updateActiveStory({ story_stage: v as any });
                    void updateStoryInDb(activeStory.id, { story_stage: v as any }).catch(() => {});
                  }
                }}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20"
              >
                <option value="">Select stage…</option>
                <option value="viability_assessment">Viability Assessment</option>
                <option value="background_research">Background Research</option>
                <option value="source_development">Source Development</option>
                <option value="verification">Verification</option>
                <option value="writing">Writing</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 py-2 flex flex-col min-h-0 overflow-hidden">
        <nav className="flex items-center gap-1 px-4 mb-6 border-b border-zinc-800 pb-2">
          <button 
            onClick={() => setActiveTab('discovery')}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-t-lg transition-colors text-xs font-medium ${activeTab === 'discovery' ? 'bg-brand-green text-white border-b-2 border-brand-green' : 'text-zinc-600 hover:text-zinc-900 hover:bg-brand-green/10'}`}
          >
            <Search className="w-3 h-3" />
            Discovery
          </button>
          
          <button 
            onClick={() => setActiveTab('sources')}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-t-lg transition-colors text-xs font-medium ${activeTab === 'sources' ? 'bg-brand-green text-white border-b-2 border-brand-green' : 'text-zinc-600 hover:text-zinc-900 hover:bg-brand-green/10'}`}
          >
            <Database className="w-3 h-3" />
            Shadow Ledger
          </button>

          <button 
            onClick={() => setActiveTab('ethics')}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-t-lg transition-colors text-xs font-medium ${activeTab === 'ethics' ? 'bg-brand-green text-white border-b-2 border-brand-green' : 'text-zinc-600 hover:text-zinc-900 hover:bg-brand-green/10'}`}
          >
            <Shield className="w-3 h-3" />
            Ethics
          </button>
          
          <button 
            onClick={() => setActiveTab('intel')}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-t-lg transition-colors text-xs font-medium ${activeTab === 'intel' ? 'bg-brand-green text-white border-b-2 border-brand-green' : 'text-zinc-600 hover:text-zinc-900 hover:bg-brand-green/10'}`}
          >
            <Folder className="w-3 h-3" />
            Intel
          </button>
        </nav>

        <div className="flex-grow min-h-0 overflow-y-auto">
          {activeTab === 'intel' && (
            <div className="px-4">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Evidence Locker</div>
              <label className="w-full flex items-center justify-center gap-2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-colors text-sm cursor-pointer">
                <FileText className="w-4 h-4" />
                Upload Image/PDF
                <input type="file" accept=".pdf,.txt,image/*" className="hidden" onChange={handleUploadReference} />
              </label>

              <div className="mt-3 pr-1 space-y-2 max-h-[180px] overflow-y-auto">
                {references.length === 0 ? (
                  <div className="text-zinc-500 text-sm italic text-center py-4">No evidence on file.</div>
                ) : (
                  references.map(ref => (
                    <button
                      key={ref.id}
                      onClick={() => spawnDocumentNode(ref)}
                      className="w-full flex items-center justify-between p-2 bg-zinc-900 border border-zinc-800 rounded text-sm hover:bg-zinc-800 transition-colors"
                      title="Spawn Document Node"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span className="truncate text-zinc-300">{ref.name}</span>
                      </div>
                      <Plus className="w-4 h-4 text-zinc-400" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'ethics' && (
            <div className="px-4">
              <EthicsChecklist nodes={nodes} />
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="px-4">
              <div className="mb-4">
                <SourceManager nodes={nodes} />
              </div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Source Files</div>
              <label className="w-full flex items-center justify-center gap-2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-colors text-sm cursor-pointer">
                <FileText className="w-4 h-4" />
                Upload Source (.txt, .pdf)
                <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleUploadSource} />
              </label>

              <div className="mt-3 pr-1 space-y-2">
                {sources.length === 0 ? (
                  <div className="text-zinc-500 text-sm italic text-center py-4">No active sources.<br/>Using mock data.</div>
                ) : (
                  sources.map(s => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('application/spyglass-sourcefile', JSON.stringify({ id: s.id, name: s.name }));
                        e.dataTransfer.setData('text/plain', String(s.name));
                      }}
                      className="flex items-center justify-between p-2 bg-zinc-900 border border-zinc-800 rounded text-sm cursor-grab active:cursor-grabbing"
                      title="Drag onto a node to attach"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <span className="truncate text-zinc-300">{s.name}</span>
                      </div>
                      <button onClick={() => handleDeleteSource(s.id)} className="text-zinc-500 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'discovery' && (
            <div>
              <div className="px-4">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Discovery Hub</div>
                <div className="space-y-3">
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="What is the focus of today's inquiry?"
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-red-900 transition-colors"
                  />
                  <button
                    onClick={handleAnalyzeClick}
                    disabled={!inputText.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-brand-green hover:opacity-90 text-white py-2 rounded-lg font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(0,0,0,0.12)] hover:scale-[1.02]"
                  >
                    <Sparkles className="w-4 h-4" />
                    Launch Discovery
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-[180px] overflow-y-auto">
                {suggestions.length > 0 && (
                  <div className="px-4 mb-6">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Suggested Entities</div>
                    <div className="space-y-2 pr-1">
                      {suggestions.map(entity => (
                        <div key={entity.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2 rounded text-sm">
                          <div className="flex items-center gap-2 overflow-hidden">
                            {entity.type === 'person' && <UserIcon className="w-4 h-4 text-red-500 flex-shrink-0" />}
                            {entity.type === 'place' && <MapPin className="w-4 h-4 text-white flex-shrink-0" />}
                            {entity.type === 'object' && <Briefcase className="w-4 h-4 text-white flex-shrink-0" />}
                            {entity.type === 'event' && <Sparkles className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                            <span className="truncate text-zinc-300">
                              {(storyInfo?.persona === 'THE ENFORCER') ? (entity.type === 'place' ? 'Location: ' : 'Subject: ') :
                               (storyInfo?.persona === 'THE PROTECTOR') ? (entity.type === 'place' ? 'Meet-up Point: ' : 'Suspect: ') : ''}
                              {entity.label}
                            </span>
                          </div>
                          <button
                            onClick={() => handleAdd(entity)}
                            className="p-1 hover:bg-[#991b1b] rounded transition-colors text-zinc-400 hover:text-white"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 mb-6">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Intelligence Gaps</div>
                  {nodes.length === 0 ? (
                    <div className="text-zinc-500 text-sm">No entities yet.</div>
                  ) : (
                    <>
                      <div className="mb-3">
                        {nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length === 0 ? (
                          <div className="text-zinc-500 text-sm">No orphaned nodes.</div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).map(n => {
                              const d = n.data as NodeData;
                              return (
                                <div key={n.id} className="flex items-center gap-2 bg-zinc-900/50 p-1.5 rounded border border-zinc-800/50 overflow-hidden">
                                  {n.type === 'person' && <UserIcon className="w-3 h-3 text-red-500 flex-shrink-0" />}
                                  {n.type === 'place' && <MapPin className="w-3 h-3 text-white flex-shrink-0" />}
                                  {n.type === 'object' && <Briefcase className="w-3 h-3 text-white flex-shrink-0" />}
                                  {n.type === 'event' && <Sparkles className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                                  {n.type === 'document' && <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                                  <span className="truncate text-xs text-zinc-400">{String(d?.label || '')}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const orphans = nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id));
                          if (orphans.length >= 2) {
                            const a = String((orphans[0].data as NodeData)?.label || '');
                            const b = String((orphans[1].data as NodeData)?.label || '');
                            window.dispatchEvent(new CustomEvent('spyglass-highlight-node', { detail: { label: a } }));
                            window.dispatchEvent(new CustomEvent('spyglass-highlight-node', { detail: { label: b } }));
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-all duration-300 text-sm hover:shadow-[0_0_15px_rgba(0,255,255,0.4)] hover:scale-[1.02] hover:text-cyan-400 hover:border-cyan-900"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        Investigate Story Connection
                      </button>
                    </>
                  )}
                </div>

                <div className="px-4 mb-6">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-serif">Editorial Desk Actions</div>
                  {nodes.length === 0 ? (
                    <div className="text-zinc-500 text-sm">No recommendations available.</div>
                  ) : (
                    <div className="space-y-1">
                      {nodes
                        .filter(n => !edges.some(e => e.source === n.id || e.target === n.id))
                        .map(n => {
                          const d = n.data as NodeData;
                          const lbl = String(d?.label || '');
                          const obj = String(storyInfo?.objective || '').trim();
                          const msg = obj ? `Investigate ${lbl}'s connection to ${obj}.` : `Investigate ${lbl}'s connections.`;
                          return (
                            <div key={n.id} className="text-zinc-300 text-sm">{msg}</div>
                          );
                        })}
                      {nodes.filter(n => !edges.some(e => e.source === n.id || e.target === n.id)).length === 0 && (
                        <div className="text-zinc-500 text-sm">All entities have connections.</div>
                      )}
                    </div>
                  )}
                </div>

                {isCrawling && (
                  <div className="px-4 mb-3">
                    <div className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs text-white">
                      CRAWLING SHADOW FILES...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-zinc-200/50 space-y-2">
        <button
          onClick={onOrganize}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          Organize Board
        </button>
        <button
          onClick={onToggleTimeline}
          className="w-full flex items-center justify-center gap-2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-colors text-sm"
        >
          <LayoutGrid className="w-4 h-4" />
          Show Timeline
        </button>
        <button
          onClick={onUndo}
          className="w-full flex items-center justify-center gap-2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-colors text-sm"
        >
          <LayoutGrid className="w-4 h-4" />
          Undo
        </button>
        
        <button
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 bg-brand-green hover:opacity-90 text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Export Briefing
        </button>
        <button
          onClick={onDraftBriefing}
          className="w-full flex items-center justify-center gap-2 bg-brand-green hover:opacity-90 text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Draft Briefing
        </button>

        <button
          onClick={onClear}
          className="w-full flex items-center justify-center gap-2 p-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 rounded border border-red-900/50 transition-colors text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Clear Canvas
        </button>

      </div>
    </div>
  );
}
