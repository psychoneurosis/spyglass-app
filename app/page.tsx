"use client";

import Sidebar, { SuggestedEntity } from "@/components/Sidebar";
import InvestigationCanvas from "@/components/InvestigationCanvas";
import TerminalEntry, { Phase, Investigator, Case } from "@/components/TerminalEntry";
import { useNodesState, useEdgesState } from "reactflow";
import { useEffect, useState, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";

const initialNodes: any[] = [];
const initialEdges: any[] = [];

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const saveReadyRef = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const historyRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const isRestoringRef = useRef(false);
  const initializedRef = useRef(false);

  // --- State Machine ---
  const [phase, setPhase] = useState<Phase>('AUTHENTICATION');
  const [investigator, setInvestigator] = useState<Investigator | null>(null);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);

  // --- Initialization Effect ---
  useEffect(() => {
    setIsMounted(true);
    
    // Check if user is logged in
    try {
        const userId = localStorage.getItem('spyglass_current_user_id');
        if (userId) {
            const users = JSON.parse(localStorage.getItem('spyglass_users') || '{}');
            const user = users[userId];
            if (user) {
                setInvestigator(user);
                if (!user.intake_complete) {
                    setPhase('INVESTIGATOR_INTAKE');
                } else {
                    setPhase('CASE_ROUTER');
                }
            } else {
                setPhase('AUTHENTICATION');
            }
        } else {
            setPhase('AUTHENTICATION');
        }
    } catch (e) {
        console.error("Initialization failed", e);
        setPhase('AUTHENTICATION');
    }
  }, []);

  // --- Case Loading Effect ---
  useEffect(() => {
    if (currentCase && currentCase.canvas_state) {
        setNodes(currentCase.canvas_state.nodes || []);
        setEdges(currentCase.canvas_state.edges || []);
        setPhase('CANVAS');
        
        // Mark as ready to save after load
        setTimeout(() => {
            saveReadyRef.current = true;
            initializedRef.current = true;
        }, 500);
    }
  }, [currentCase, setNodes, setEdges]);

  // --- Persistence Effect (Canvas Phase) ---
  useEffect(() => {
    if (phase === 'CANVAS' && saveReadyRef.current && initializedRef.current && currentCase) {
        // Save to currentCase object in localStorage
        const allCases = JSON.parse(localStorage.getItem('spyglass_cases') || '{}');
        if (allCases[currentCase.id]) {
            allCases[currentCase.id].canvas_state = { nodes, edges };
            localStorage.setItem('spyglass_cases', JSON.stringify(allCases));
            
            // Also update local state to match (optional but good for consistency)
            // setCurrentCase(prev => prev ? ({ ...prev, canvas_state: { nodes, edges } }) : null);
        }
    }
  }, [nodes, edges, phase, currentCase]);

  // Handle Sources Persistence (Legacy but useful for now)
  const [sources, setSources] = useState<{ id: string; name: string; content: string; type: string }[]>([]);

  // Gatekeeper terminal supersedes legacy overlay
  const [fileIntel, setFileIntel] = useState<{ type: string; url?: string; text?: string; label: string; originSentence?: string; sourceFile?: string } | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [editNode, setEditNode] = useState<{ id: string; label: string; timestamp?: string; note?: string } | null>(null);

  const handleAddEntity = (entity: SuggestedEntity) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: entity.type,
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: { 
        label: entity.label, 
        source: entity.source,
        timestamp: entity.timestamp,
        fileType: entity.fileType,
        previewUrl: entity.previewUrl,
        textPreview: entity.textPreview,
        fullText: entity.fullText,
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
        newNodes.push({
          id,
          type: entity.type,
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
    // Update current case state to blank
    if (currentCase) {
        const allCases = JSON.parse(localStorage.getItem('spyglass_cases') || '{}');
        if (allCases[currentCase.id]) {
            allCases[currentCase.id].canvas_state = { nodes: [], edges: [] };
            localStorage.setItem('spyglass_cases', JSON.stringify(allCases));
        }
    }
  };

  const handleOrganize = () => {
    setNodes((currentNodes) => {
      const groups = {
        person: currentNodes.filter(n => n.type === 'person'),
        event: currentNodes.filter(n => n.type === 'event'),
        document: currentNodes.filter(n => n.type === 'document'),
        place: currentNodes.filter(n => n.type === 'place'),
        object: currentNodes.filter(n => n.type === 'object'),
      };

      const Y_START = 100;
      const Y_GAP = 180; // Increased gap for better separation
      let currentY = Y_START;
      
      const organizedNodes: any[] = [];
      const knownIds = new Set<string>();
      
      // Order: Person -> Event -> Document -> Place -> Object
      const order = ['person', 'event', 'document', 'place', 'object'];
      
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
    let lines: string[] = [];
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

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let mdContent = `# Spyglass Investigation Report\nGenerated: ${new Date().toLocaleString()}\n\n`;
    
    if (currentCase) {
      mdContent += `## Active Case\n- Name: **${currentCase.title}**\n- Core Question: **${currentCase.core_question}**\n`;
      if (currentCase.desired_outcome) mdContent += `- Desired Outcome: _${currentCase.desired_outcome}_\n`;
      mdContent += `\n`;
    }

    mdContent += `## Entities (${nodes.length})\n\n`;
    
    // Group by type
    const persons = nodes.filter(n => n.type === 'person');
    if (persons.length > 0) {
      mdContent += `### Persons\n`;
      persons.forEach(p => {
        mdContent += `- **${p.data.label}**\n  - Source: _"${p.data.source}"_\n`;
      });
      mdContent += `\n`;
    }
    
    const places = nodes.filter(n => n.type === 'place');
    if (places.length > 0) {
      mdContent += `### Places\n`;
      places.forEach(p => {
        mdContent += `- **${p.data.label}**\n  - Source: _"${p.data.source}"_\n`;
      });
      mdContent += `\n`;
    }
    
    const documents = nodes.filter(n => n.type === 'document');
    if (documents.length > 0) {
      mdContent += `### Documents\n`;
      documents.forEach(d => {
        mdContent += `- **${d.data.label}**\n  - Source: _"${d.data.source}"_\n`;
      });
      mdContent += `\n`;
    }
    
    mdContent += `## Connections (${edges.length})\n\n`;
    edges.forEach(e => {
      const sourceNode = nodes.find(n => n.id === e.source);
      const targetNode = nodes.find(n => n.id === e.target);
      if (sourceNode && targetNode) {
        mdContent += `- **${sourceNode.data.label}** --[${e.label || 'related to'}]--> **${targetNode.data.label}**\n`;
      }
    });
    
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation-report-${timestamp}.md`;
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

  const handleCaseSelected = (caseId: string) => {
      const allCases = JSON.parse(localStorage.getItem('spyglass_cases') || '{}');
      const selected = allCases[caseId];
      if (selected) {
          // Update last opened
          selected.last_opened_at = Date.now();
          allCases[caseId] = selected;
          localStorage.setItem('spyglass_cases', JSON.stringify(allCases));
          
          setCurrentCase(selected);
          // Phase change happens in useEffect when currentCase is set
      }
  };

  const handleSwitchCase = () => {
      setPhase('CASE_ROUTER');
      setCurrentCase(null);
      setNodes([]);
      setEdges([]);
  };

  const handleLogout = () => {
      if (window.confirm("Are you sure you want to log out? This will wipe your local session.")) {
        localStorage.clear();
        setInvestigator(null);
        setCurrentCase(null);
        setNodes([]);
        setEdges([]);
        setPhase('AUTHENTICATION');
      }
  };

  // Render Terminal if not in Canvas phase
  if (phase !== 'CANVAS') {
      return (
          <TerminalEntry 
              currentPhase={phase}
              onPhaseChange={setPhase}
              onCaseSelected={handleCaseSelected}
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
        caseInfo={currentCase ? {
            name: currentCase.title,
            persona: 'THE ENFORCER', // Default or derive from user profile
            objective: currentCase.core_question
        } : undefined}
        existingLabels={nodes.map(n => String((n.data as any)?.label || '').trim())}
        onDraftBriefing={handleDraftBriefing}
        onToggleTimeline={() => setShowTimeline(v => !v)}
        onUndo={handleUndo}
        nodes={nodes}
        edges={edges}
        investigatorName={investigator?.name || 'Investigator'}
        sources={sources}
        onUpdateSources={setSources}
        onSwitchCase={handleSwitchCase}
        onLogout={handleLogout}
        defaultOpenIngest={currentCase?.starting_material === 'INGEST'}
      />
      <div className="flex-1 h-full">
        <InvestigationCanvas 
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
                                <div className="text-white font-medium mb-1">"{c.value}"</div>
                                <div className="text-zinc-400 italic">"{c.sentence}"</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(fileIntel.sourceFile || fileIntel.originSentence) && (
                <div className="mb-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Source Context</div>
                    <div className="bg-zinc-900 p-3 rounded text-zinc-300 text-sm border-l-2 border-cyan-500 italic">
                        "{fileIntel.originSentence || 'No sentence context available.'}"
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
