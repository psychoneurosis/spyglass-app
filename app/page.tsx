"use client";

import Sidebar, { SuggestedEntity } from "@/components/Sidebar";
import StoryCanvas from "@/components/InvestigationCanvas";
import TerminalEntry, { Phase, Investigator, Story } from "@/components/TerminalEntry";
import { useNodesState, useEdgesState } from "reactflow";
import { useEffect, useState, useRef } from "react";
import { X, AlertTriangle, Shield } from "lucide-react";
import { signInWithGoogle, getUser } from "@/lib/supabase";
import { useSpyglassStore } from "@/lib/store";
import { generateExecutiveBriefingMarkdown, getExecutiveBriefingFilename } from "@/lib/export-service";
import { legalPreflight } from "@/lib/ai-journalism";

const initialNodes: any[] = [];
const initialEdges: any[] = [];

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const assistantMessages = useSpyglassStore(s => s.assistantMessages);
  const storyStage = useSpyglassStore(s => s.storyStage);
  const setStoryStage = useSpyglassStore(s => s.setStoryStage);
  const saveReadyRef = useRef(false);
  const historyRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const isRestoringRef = useRef(false);
  const initializedRef = useRef(false);

  // --- State Machine ---
  const [phase, setPhase] = useState<Phase>('AUTHENTICATION');
  const [investigator, setInvestigator] = useState<Investigator | null>(null);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [appStatus, setAppStatus] = useState<'landing' | 'onboarding' | 'active'>('landing');
  const [showLogin, setShowLogin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showRescueButton, setShowRescueButton] = useState(false);
  const authLoadingRef = useRef(true);

  // --- Initialization Effect ---
  useEffect(() => {
    (async () => {
      setAuthLoading(true);
      setAuthError(null);
      const timeoutId = window.setTimeout(() => {
        if (authLoadingRef.current) {
          window.location.reload();
        }
      }, 10_000);
      try {
        const session = await getUser();
        window.clearTimeout(timeoutId);
        if (session?.data?.user) {
          window.location.assign('/dashboard');
          return;
        }
        setAuthLoading(false);
      } catch (e: unknown) {
        window.clearTimeout(timeoutId);
        const err = e as { name?: string; message?: string };
        const name = String(err?.name || '');
        const message = String(err?.message || '');
        if (name === 'AuthRetryableFetchError' || message.includes('AuthRetryableFetchError')) {
          setAuthError('Connection to Newsroom Backend failed. Check your internet or ad-blocker.');
        } else {
          console.error('AUTH_INIT_ERROR:', e);
        }
        setAuthLoading(false);
      }
    })();
    
    try {
        const userId = localStorage.getItem('spyglass_current_user_id');
        let nextPhase: Phase = 'AUTHENTICATION';
        let nextInvestigator: Investigator | null = null;
        if (userId) {
            const users = JSON.parse(localStorage.getItem('spyglass_users') || '{}');
            const user = users[userId] as Investigator | undefined;
            if (user) {
                nextInvestigator = user;
                nextPhase = user.intake_complete ? 'STORY_ROUTER' : 'INVESTIGATOR_INTAKE';
            }
        }
        window.setTimeout(() => {
          setInvestigator(nextInvestigator);
          setPhase(nextPhase);
        }, 0);
    } catch (e) {
        console.error("Initialization failed", e);
        window.setTimeout(() => {
          setInvestigator(null);
          setPhase('AUTHENTICATION');
        }, 0);
    }
  }, []);
  
  useEffect(() => {
    authLoadingRef.current = authLoading;
  }, [authLoading]);
  
  useEffect(() => {
    window.setTimeout(() => setShowRescueButton(false), 0);
    if (!authLoading) return;
    const id = window.setTimeout(() => setShowRescueButton(true), 5000);
    return () => window.clearTimeout(id);
  }, [authLoading]);

  // --- Story Loading Effect ---
  useEffect(() => {
    if (currentStory && currentStory.canvas_state) {
        window.setTimeout(() => {
          setNodes((currentStory.canvas_state?.nodes as any) || []);
          setEdges((currentStory.canvas_state?.edges as any) || []);
          setPhase('CANVAS');
        }, 0);
        
        // Mark as ready to save after load
        setTimeout(() => {
            saveReadyRef.current = true;
            initializedRef.current = true;
        }, 500);
    }
  }, [currentStory, setNodes, setEdges]);

  useEffect(() => {
    if (!currentStory) return;
    const stage = currentStory.story_stage;
    if (stage && stage !== storyStage) {
      setStoryStage(stage as any);
    }
  }, [currentStory, setStoryStage, storyStage]);

  useEffect(() => {
    if (!currentStory) return;
    if (!storyStage) return;
    if (currentStory.story_stage === storyStage) return;
    const updated = { ...currentStory, story_stage: storyStage as any };
    window.setTimeout(() => setCurrentStory(updated), 0);
    const allStories = JSON.parse(localStorage.getItem('spyglass_stories') || '{}');
    if (allStories[currentStory.id]) {
      allStories[currentStory.id].story_stage = storyStage;
      localStorage.setItem('spyglass_stories', JSON.stringify(allStories));
    }
  }, [currentStory, storyStage]);

  useEffect(() => {
    if (appStatus === 'onboarding' && phase === 'STORY_ROUTER') {
      window.setTimeout(() => setAppStatus('active'), 0);
    }
  }, [phase, appStatus]);

  // --- Persistence Effect (Canvas Phase) ---
  useEffect(() => {
    if (phase === 'CANVAS' && saveReadyRef.current && initializedRef.current && currentStory) {
        const allStories = JSON.parse(localStorage.getItem('spyglass_stories') || '{}');
        if (allStories[currentStory.id]) {
            allStories[currentStory.id].canvas_state = { nodes, edges };
            localStorage.setItem('spyglass_stories', JSON.stringify(allStories));
            
            // Also update local state to match (optional but good for consistency)
            // setCurrentStory(prev => prev ? ({ ...prev, canvas_state: { nodes, edges } }) : null);
        }
    }
  }, [nodes, edges, phase, currentStory]);

  // Handle Sources Persistence (Legacy but useful for now)
  const [sources, setSources] = useState<{ id: string; name: string; content: string; type: string }[]>([]);

  // Gatekeeper terminal supersedes legacy overlay
  const [fileIntel, setFileIntel] = useState<{ type: string; url?: string; text?: string; label: string; originSentence?: string; sourceFile?: string } | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [editNode, setEditNode] = useState<{ id: string; label: string; timestamp?: string; note?: string } | null>(null);

  const handleAddEntity = (entity: SuggestedEntity) => {
    const mapType = (t: string) => {
      if (t === 'person') return 'source';
      if (t === 'place' || t === 'location') return 'source';
      if (t === 'document' || t === 'evidence') return 'evidence';
      if (t === 'object') return 'claim';
      if (t === 'event') return 'publication';
      return 'claim';
    };
    const deriveEvidenceType = (fileType?: string) => {
      const ft = String(fileType || '').toLowerCase();
      if (ft.startsWith('image/')) return 'photo' as const;
      if (ft === 'text/plain' || ft === 'application/pdf') return 'document' as const;
      return 'data' as const;
    };
    const newNode = {
      id: `node-${Date.now()}`,
      type: mapType(entity.type as any),
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: { 
        label: entity.label, 
        source: entity.source,
        timestamp: entity.timestamp,
        fileType: entity.fileType,
        previewUrl: entity.previewUrl,
        textPreview: entity.textPreview,
        fullText: entity.fullText,
        ...(mapType(entity.type as any) === 'source'
          ? { role: '', credibility: 3 as const, anonymity: false, contactInfo: '', quotes: [] as string[] }
          : {}),
        ...(mapType(entity.type as any) === 'claim'
          ? { statement: entity.label, verificationStatus: 'unverified' as const, factCheckNotes: '' }
          : {}),
        ...(mapType(entity.type as any) === 'evidence'
          ? { evidenceType: deriveEvidenceType(entity.fileType), acquisitionMethod: 'public_record' as const, legalClearance: false }
          : {}),
        onInspect: (payload: { type: string; url?: string; text?: string; label: string }) => {
          setFileIntel(payload);
        }
      },
    };

    setNodes((nds) => [...nds, newNode]);
    
    if (entity.relations && entity.relations.length > 0) {
      entity.relations.forEach(rel => {
        const target = nodes.find(n => String((n.data as any)?.label || '').trim().toLowerCase() === rel.targetLabel.trim().toLowerCase());
        if (target) {
          const edgeId = `edge-${Date.now()}-${Math.random()}`;
          const edge = {
            id: edgeId,
            source: newNode.id,
            target: target.id,
            animated: false,
            label: rel.verb,
            labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
            labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
            style: { stroke: '#991b1b', strokeWidth: 2 },
          } as any;
          setEdges((eds) => [...eds, edge]);
        }
      });
    }
  };
  
  const handleLaunchDiscovery = (entities: SuggestedEntity[]) => {
    // Build map of existing labels -> node
    const existingMap: Record<string, any> = {};
    nodes.forEach(n => {
      const lbl = String((n.data as any)?.label || '').trim().toLowerCase();
      if (lbl) existingMap[lbl] = n;
    });
    // Prepare new nodes and label->id map
    const newNodes: any[] = [];
    const labelToId: Record<string, string> = {};
    const deriveEvidenceType = (fileType?: string) => {
      const ft = String(fileType || '').toLowerCase();
      if (ft.startsWith('image/')) return 'photo' as const;
      if (ft === 'text/plain' || ft === 'application/pdf') return 'document' as const;
      return 'data' as const;
    };
    // Start with existing nodes
    Object.entries(existingMap).forEach(([lbl, n]) => {
      labelToId[lbl] = n.id;
    });
    // Create nodes for entities not already present; update timestamps/conflicts for existing ones
    entities.forEach((entity, idx) => {
      const key = entity.label.trim().toLowerCase();
      if (existingMap[key]) {
        // Update timestamp/conflicts if discovered
        const updates: any = {};
        if (entity.timestamp) updates.timestamp = entity.timestamp;
        if (entity.conflicts) updates.conflicts = entity.conflicts;
        
        if (Object.keys(updates).length > 0) {
          setNodes(nds => nds.map(n => n.id === existingMap[key].id ? { ...n, data: { ...(n.data as any), ...updates } } : n));
        }
        labelToId[key] = existingMap[key].id;
      } else {
        const id = `node-${Date.now()}-${idx}`;
        labelToId[key] = id;
        const mapType2 = (t: string) => {
          if (t === 'person') return 'source';
          if (t === 'place' || t === 'location') return 'source';
          if (t === 'document' || t === 'evidence') return 'evidence';
          if (t === 'object') return 'claim';
          if (t === 'event') return 'publication';
          return 'claim';
        };
        const nodeType = mapType2(entity.type as any);
        newNodes.push({
          id,
          type: nodeType,
          position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
          data: {
            label: entity.label,
            source: entity.source,
            timestamp: entity.timestamp,
            fileType: entity.fileType,
            previewUrl: entity.previewUrl,
            textPreview: entity.textPreview,
            fullText: entity.fullText,
            conflicts: entity.conflicts,
            ...(nodeType === 'source'
              ? { role: '', credibility: 3 as const, anonymity: false, contactInfo: '', quotes: [] as string[] }
              : {}),
            ...(nodeType === 'claim'
              ? { statement: entity.label, verificationStatus: 'unverified' as const, factCheckNotes: '' }
              : {}),
            ...(nodeType === 'evidence'
              ? { evidenceType: deriveEvidenceType(entity.fileType), acquisitionMethod: 'public_record' as const, legalClearance: false }
              : {}),
            onInspect: (payload: { type: string; url?: string; text?: string; label: string }) => {
              setFileIntel(payload);
            }
          }
        });
      }
    });
    // Add all new nodes at once
    if (newNodes.length > 0) {
      setNodes(nds => [...nds, ...newNodes]);
    }
    // Build edges among entities based on relations
    const newEdges: any[] = [];
    entities.forEach(entity => {
      if (entity.relations && entity.relations.length > 0) {
        const srcId = labelToId[entity.label.trim().toLowerCase()];
        entity.relations.forEach(rel => {
          const tgtId = labelToId[rel.targetLabel.trim().toLowerCase()];
          if (srcId && tgtId) {
            // Check conflict
            const isConflicting = entity.conflicts?.some(c => 
                 c.type === 'location' && c.value.includes(rel.targetLabel)
            );

            newEdges.push({
              id: `edge-${Date.now()}-${Math.random()}`,
              source: srcId,
              target: tgtId,
              type: 'smoothstep',
              animated: true,
              label: rel.verb,
              data: { sourceSentence: rel.sourceSentence },
              labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
              labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
              style: isConflicting 
                  ? { stroke: '#eab308', strokeWidth: 2, strokeDasharray: '5,5' }
                  : { stroke: '#991b1b', strokeWidth: 2 },
            });
          }
        });
      }
    });
    if (newEdges.length > 0) {
      setEdges(eds => [...eds, ...newEdges]);
      // Stop animation after 5 seconds
      setTimeout(() => {
        setEdges(eds => eds.map(e => {
            if (newEdges.some(ne => ne.id === e.id)) {
                return { ...e, animated: false };
            }
            return e;
        }));
      }, 5000);
    }
  };
  
  const handleEditNode = (node: any) => {
    const d = node.data || {};
    setEditNode({
      id: node.id,
      label: String(d.label || ''),
      timestamp: d.timestamp,
      note: d.note,
    });
  };

  const handleClear = () => {
    setNodes([]);
    setEdges([]);
    // Update current story state to blank
    if (currentStory) {
        const allStories = JSON.parse(localStorage.getItem('spyglass_stories') || '{}');
        if (allStories[currentStory.id]) {
            allStories[currentStory.id].canvas_state = { nodes: [], edges: [] };
            localStorage.setItem('spyglass_stories', JSON.stringify(allStories));
        }
    }
  };

  const handleOrganize = () => {
    setNodes((currentNodes) => {
      const groups = {
        source: currentNodes.filter(n => n.type === 'source'),
        evidence: currentNodes.filter(n => n.type === 'evidence'),
        claim: currentNodes.filter(n => n.type === 'claim'),
        publication: currentNodes.filter(n => n.type === 'publication'),
      };

      const Y_START = 100;
      const Y_GAP = 180; // Increased gap for better separation
      let currentY = Y_START;
      
      const organizedNodes: any[] = [];
      const knownIds = new Set<string>();
      
      // Order: Source -> Evidence -> Claim -> Publication
      const order = ['source', 'evidence', 'claim', 'publication'];
      
      order.forEach(type => {
        const group = groups[type as keyof typeof groups];
        if (group.length > 0) {
           group.forEach((node, index) => {
             organizedNodes.push({
               ...node,
               position: { x: index * 280 + 50, y: currentY } // Wider horizontal spacing
             });
             knownIds.add(node.id);
           });
           currentY += Y_GAP;
        }
      });
      
      // Handle any unknown types
      const others = currentNodes.filter(n => !knownIds.has(n.id)).map((node, index) => ({
          ...node,
          position: { x: index * 280 + 50, y: currentY }
      }));
      
      return [...organizedNodes, ...others];
    });
    
    // Trigger center view command
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('spyglass-fit-view'));
    }, 100);
  };
  
  const handleDraftBriefing = () => {
    const list = nodes.slice();
    const timeNodes = list.filter(n => (n.data as any)?.timestamp);
    const sorted = timeNodes.sort((a, b) => {
      const ta = String((a.data as any)?.timestamp || '');
      const tb = String((b.data as any)?.timestamp || '');
      return ta.localeCompare(tb);
    });
    const lines: string[] = [];
    sorted.forEach(n => {
      const t = String((n.data as any)?.timestamp || '');
      const lbl = String((n.data as any)?.label || '');
      const type = n.type || '';
      let subject = '';
      if (type === 'person') subject = `Subject ${lbl}`;
      else if (type === 'place') subject = `Location ${lbl}`;
      else if (type === 'object') subject = `Object (${lbl})`;
      else if (type === 'event') subject = `Event ${lbl}`;
      else subject = lbl;
      const rels = edges.filter(e => e.source === n.id || e.target === n.id);
      const relText = rels.map(e => {
        const otherId = e.source === n.id ? e.target : e.source;
        const other = nodes.find(x => x.id === otherId);
        const otherLbl = other ? String((other.data as any)?.label || '') : '';
        const el = e.label ? ` (${e.label})` : '';
        return `${otherLbl}${el}`;
      }).filter(Boolean).join(', ');
      const line = relText ? `At ${t}, ${subject} connected to ${relText}.` : `At ${t}, ${subject}.`;
      lines.push(line);
    });
    if (lines.length === 0) {
      lines.push(`No timestamps found. Current ledger includes ${nodes.length} entities and ${edges.length} connections.`);
    }
    setBriefing(lines.join('\n'));
  };
  
  const handleUndo = () => {
    const history = historyRef.current;
    if (history.length < 2) return;
    // Remove current state snapshot
    history.pop();
    // Restore previous
    const snapshot = history[history.length - 1];
    isRestoringRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  };

  const handleExport = async () => {
    const title = currentStory?.title || "Story";
    const potentialLeaks: string[] = [];

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const evidenceLinkedToClaim = (claimId: string) => {
      const linkedIds = new Set<string>();
      edges.forEach((e: any) => {
        const a = String(e.source || "");
        const b = String(e.target || "");
        if (a === claimId) linkedIds.add(b);
        if (b === claimId) linkedIds.add(a);
      });
      let count = 0;
      linkedIds.forEach((id) => {
        const n = byId.get(id);
        if (n && String((n as any).type) === "evidence") count += 1;
      });
      return count;
    };

    const claims = nodes
      .filter((n) => String(n.type) === "claim")
      .map((n) => {
        const d = (n.data as any) || {};
        const sources = [
          ...(Array.isArray(d.sources) ? d.sources : []),
          d.source,
        ]
          .map((x: any) => String(x || "").trim())
          .filter(Boolean);
        return {
          id: String(n.id),
          statement: String(d.statement || d.label || ""),
          stamp: d.stamp ? String(d.stamp) : null,
          verificationStatus: d.verificationStatus ? String(d.verificationStatus) : null,
          evidenceLinks: evidenceLinkedToClaim(String(n.id)),
          hasSources: sources.length > 0,
          rightToReplyContacted: d.rightToReplyContacted === true,
        };
      });

    const anonymousSources = nodes
      .filter((n) => String(n.type) === "source")
      .map((n) => {
        const d = (n.data as any) || {};
        const protectedOrAnon = d.anonymity === true || d.protectIdentity === true;
        if (!protectedOrAnon) return null;
        const contact = String(d.contactInfo || "").trim();
        return {
          id: String(n.id),
          nameHint: String(d.label || ""),
          hasPlainContactInfo: Boolean(contact),
        };
      })
      .filter(Boolean) as Array<{ id: string; nameHint?: string; hasPlainContactInfo: boolean }>;

    const mdPreview = generateExecutiveBriefingMarkdown({
      storyTitle: title,
      nodes: nodes as any,
      edges: edges as any,
      messages: assistantMessages as any,
    });
    const emailsInExport = mdPreview.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) || [];
    const phonesInExport = mdPreview.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g) || [];
    [...emailsInExport, ...phonesInExport].forEach((x) => potentialLeaks.push(String(x)));

    const ai = await legalPreflight({ storyTitle: title, claims, anonymousSources, potentialLeaks: Array.from(new Set(potentialLeaks)).slice(0, 25) });
    const deterministicBlockers: string[] = [];
    claims.forEach((c) => {
      if (String(c.stamp || "").toLowerCase() === "high_risk" && c.evidenceLinks === 0 && !c.hasSources) {
        deterministicBlockers.push(`High-risk claim lacks corroboration: "${c.statement || c.id}"`);
      }
    });
    anonymousSources.forEach((s) => {
      if (s.hasPlainContactInfo) deterministicBlockers.push("Anonymous/protected source has plaintext contact info in graph.");
    });
    if (new Set(potentialLeaks).size > 0) {
      deterministicBlockers.push("Potential contact info detected in export text.");
    }

    const blockers = [...new Set([...(ai?.blockers || []), ...deterministicBlockers])];
    const warnings = ai?.warnings || [];
    const requiredRedactions = ai?.requiredRedactions || [];
    const allowExport = ai ? ai.allowExport && blockers.length === 0 : blockers.length === 0;

    if (!allowExport) {
      const msg = [
        "LEGAL PRE-FLIGHT: EXPORT BLOCKED",
        blockers.length ? `\nBlockers:\n- ${blockers.join("\n- ")}` : "",
        requiredRedactions.length ? `\nRequired redactions:\n- ${requiredRedactions.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      window.alert(msg);
      return;
    }

    if (warnings.length) {
      const ok = window.confirm(`LEGAL PRE-FLIGHT WARNINGS:\n- ${warnings.join("\n- ")}\n\nProceed with export?`);
      if (!ok) return;
    }

    const blob = new Blob([mdPreview], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getExecutiveBriefingFilename(title);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEdgeClick = (event: React.MouseEvent, edge: any) => {
    event.stopPropagation();
    const d = edge.data || {};
    if (d.sourceSentence) {
        // Find node labels for context
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        const sourceLabel = (sourceNode?.data as any)?.label || 'Unknown';
        const targetLabel = (targetNode?.data as any)?.label || 'Unknown';
        
        setFileIntel({
            type: 'evidence',
            label: `CONNECTION: ${sourceLabel} -> ${targetLabel}`,
            text: `"${d.sourceSentence}"`,
            originSentence: d.sourceSentence,
            sourceFile: 'Evidence Log'
        });
    }
  };

  const handleStorySelected = (storyId: string) => {
      const allStories = JSON.parse(localStorage.getItem('spyglass_stories') || '{}');
      const selected = allStories[storyId];
      if (selected) {
          // Update last opened
          selected.last_opened_at = Date.now();
          allStories[storyId] = selected;
          localStorage.setItem('spyglass_stories', JSON.stringify(allStories));
          
          setCurrentStory(selected);
          setStoryStage((selected as any).story_stage || null);
          setAppStatus('active');
      }
  };

  const handleSwitchStory = () => {
      setPhase('STORY_ROUTER');
      setCurrentStory(null);
      setNodes([]);
      setEdges([]);
      setStoryStage(null);
  };

  const handleLogout = () => {
      if (window.confirm("Are you sure you want to log out? This will wipe your local session.")) {
        localStorage.clear();
        setInvestigator(null);
        setCurrentStory(null);
        setNodes([]);
        setEdges([]);
        setPhase('AUTHENTICATION');
        setAppStatus('landing');
        setStoryStage(null);
      }
  };

  const handleOpenLogin = () => {
    setShowLogin(true);
  };

  const handleCloseLogin = () => {
    setShowLogin(false);
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      const name = String(err?.name || '');
      const message = String(err?.message || '');
      if (name === 'AuthRetryableFetchError' || message.includes('AuthRetryableFetchError')) {
        setAuthError('Connection to Newsroom Backend failed. Check your internet or ad-blocker.');
      }
    }
  };

  

  // Check loading state at the top
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center px-6">
          <div className="text-zinc-900 font-serif text-lg">AUTHENTICATING...</div>
          {authError ? (
            <div className="mt-3 text-sm text-zinc-700 font-serif">
              {authError}
            </div>
          ) : null}
          {showRescueButton ? (
            <button
              className="mt-5 px-4 py-2 rounded bg-zinc-900 text-white font-serif text-xs tracking-wider hover:opacity-90"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              STUCK? CLICK TO REFRESH THE DESK
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (appStatus === 'landing') {
    return (
      <main className="flex h-screen w-screen overflow-hidden bg-zinc-50">
        <div className="flex-1 flex items-center justify-center relative">
          <>
              <div className="max-w-md w-full px-6 py-8 bg-zinc-100 border border-zinc-300 rounded">
                <div className="text-center mb-6">
                  <img src="/spyglass.png" alt="Spyglass" className="h-5 w-auto mx-auto" />
                  <div className="text-zinc-700 text-xs mt-1 font-serif">Secure workspace for the Indian Press Corps.</div>
                </div>
                {authError ? (
                  <div className="mb-4 text-sm text-zinc-700 font-serif text-center">
                    {authError}
                  </div>
                ) : null}
                <div className="space-y-3">
                  <button
                    className="w-full bg-zinc-50 border border-zinc-300 text-zinc-900 hover:bg-white px-4 py-2 rounded flex items-center justify-center gap-2"
                    onClick={handleOpenLogin}
                  >
                    <Shield className="w-4 h-4 text-zinc-900" />
                    SECURE AUTH
                  </button>
                </div>
              </div>
              {showLogin && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/20">
                  <div className="w-full max-w-md bg-zinc-100 border border-zinc-300 rounded p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-zinc-900 font-serif text-sm">SECURE AUTH</div>
                      <button className="text-zinc-700 hover:text-zinc-900" onClick={handleCloseLogin}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <button
                        className="w-full bg-zinc-50 border border-zinc-300 text-zinc-900 hover:bg-white px-4 py-2 rounded flex items-center justify-center gap-2"
                        onClick={handleGoogleLogin}
                      >
                        <Shield className="w-4 h-4 text-zinc-900" />
                        SECURE AUTH
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </>
        </div>
      </main>
    );
  }

  if (appStatus === 'onboarding') {
    return (
      <TerminalEntry 
          currentPhase={phase}
          onPhaseChange={setPhase}
          onStorySelected={handleStorySelected}
          onInvestigatorUpdate={setInvestigator}
      />
    );
  }

  if (appStatus === 'active' && phase !== 'CANVAS') {
      return (
          <TerminalEntry 
              currentPhase={phase}
              onPhaseChange={setPhase}
              onStorySelected={handleStorySelected}
              onInvestigatorUpdate={setInvestigator}
          />
      );
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-black">
      <Sidebar 
        onAddEntity={handleAddEntity} 
        onLaunchDiscovery={handleLaunchDiscovery}
        onClear={handleClear}
        onOrganize={handleOrganize}
        onExport={handleExport}
        storyInfo={currentStory ? {
            name: currentStory.title,
            persona: 'THE ENFORCER', // Default or derive from user profile
            objective: currentStory.core_question
        } : undefined}
        existingLabels={nodes.map(n => String((n.data as any)?.label || '').trim())}
        onDraftBriefing={handleDraftBriefing}
        onToggleTimeline={() => setShowTimeline(v => !v)}
        onUndo={handleUndo}
        nodes={nodes}
        edges={edges}
        investigatorName={investigator?.name || 'Journalist'}
        sources={sources}
        onUpdateSources={setSources}
        onSwitchStory={handleSwitchStory}
        onLogout={handleLogout}
        defaultOpenIngest={currentStory?.starting_material === 'INGEST'}
      />
      <div className="flex-1 h-full">
        <StoryCanvas 
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          setEdges={setEdges}
          setNodes={setNodes}
          onEditNode={handleEditNode}
          onEdgeClick={handleEdgeClick}
        />
        {fileIntel && (
          <div className="absolute right-0 top-0 h-full w-[420px] bg-zinc-950 border-l border-[#991b1b]/50 shadow-xl p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
              <div className="text-white font-mono text-sm">File Intel</div>
              <button
                onClick={() => setFileIntel(null)}
                className="text-zinc-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-zinc-300 text-sm mb-3 truncate">{fileIntel.label}</div>
            
            {(fileIntel as any).conflicts && (fileIntel as any).conflicts.length > 0 && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded animate-pulse">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Conflict Detected
                    </div>
                    <div className="space-y-2">
                        {(fileIntel as any).conflicts.map((c: any, i: number) => (
                            <div key={i} className="text-xs bg-black/40 p-2 rounded border border-red-500/30">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-yellow-500 font-mono">{c.source}</span>
                                    <span className="text-zinc-500 uppercase text-[10px]">{c.type}</span>
                                </div>
                                    <div className="text-white font-medium mb-1">&quot;{c.value}&quot;</div>
                                    <div className="text-zinc-400 italic">&quot;{c.sentence}&quot;</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(fileIntel.sourceFile || fileIntel.originSentence) && (
                <div className="mb-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Source Context</div>
                    <div className="bg-zinc-900 p-3 rounded text-zinc-300 text-sm border-l-2 border-cyan-500 italic">
                        &quot;{fileIntel.originSentence || 'No sentence context available.'}&quot;
                    </div>
                    <div className="text-right mt-1 text-xs text-zinc-600">{fileIntel.sourceFile || 'Unknown Source'}</div>
                </div>
            )}

            {fileIntel.type === 'image' && fileIntel.url && (
              <img src={fileIntel.url} alt="Evidence" className="w-full rounded border border-zinc-800" />
            )}
            {fileIntel.type === 'text' && (
              <div className="whitespace-pre-wrap text-zinc-400 text-sm font-mono">
                {fileIntel.text}
              </div>
            )}
             {fileIntel.type === 'pdf' && (
              <div className="whitespace-pre-wrap text-zinc-400 text-sm font-mono">
                [PDF Content Extracted]: {fileIntel.text}
              </div>
            )}
            {fileIntel.type === 'evidence' && (
                <div className="text-zinc-400 text-sm">
                    Evidence linked to this connection.
                </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
