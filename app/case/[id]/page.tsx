"use client";

import StoryCanvas from "@/components/InvestigationCanvas";
import Sidebar, { SuggestedEntity } from "@/components/Sidebar";
import AIAssistant from "@/components/ai/AIAssistant";
import { useNodesState, useEdgesState } from "reactflow";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSpyglassStore } from "@/lib/store";

export default function CasePage() {
  const params = useParams();
  const caseId = (params as any)?.id as string | undefined;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const [showAI, setShowAI] = useState(true);
  
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    setShowAI(!isMobile);
  }, []);
  
  const handleAddEntity = (entity: SuggestedEntity) => {
    const id = `node-${Date.now()}-${Math.random()}`;
    const mapType = (t: string) => {
      if (t === 'person') return 'source';
      if (t === 'place' || t === 'location') return 'source';
      if (t === 'document' || t === 'evidence') return 'evidence';
      if (t === 'object') return 'claim';
      if (t === 'event') return 'publication';
      return 'claim';
    };
    setNodes(nds => [...nds, {
      id,
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
        conflicts: entity.conflicts,
        onInspect: () => {}
      }
    } as any]);
  };
  
  const handleClear = () => {
    setNodes([]);
    setEdges([]);
  };
  
  const handleOrganize = () => {
    window.dispatchEvent(new CustomEvent('spyglass-fit-view'));
  };
  
  const handleExport = () => {};
  return (
    <main className="flex h-screen w-screen overflow-hidden bg-zinc-50">
      <div className="h-full w-[240px] border-r border-zinc-300 bg-zinc-100">
        <Sidebar 
          onAddEntity={handleAddEntity}
          onClear={handleClear}
          onOrganize={handleOrganize}
          onExport={handleExport}
          caseInfo={activeStory ? {
            name: activeStory.title,
            persona: 'THE ENFORCER',
            objective: activeStory.centralQuestion
          } : undefined}
          existingLabels={nodes.map(n => String((n as any).data?.label || '').trim())}
          nodes={nodes as any}
          edges={edges as any}
          investigatorName={'Investigator'}
          sources={[]}
          onUpdateSources={() => {}}
        />
      </div>
      <div className="flex-1 h-full relative">
        <StoryCanvas
          caseId={caseId}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          setNodes={setNodes}
          setEdges={setEdges}
          onEditNode={() => {}}
        />
        <button
          onClick={() => setShowAI(v => !v)}
          className="absolute top-3 right-3 z-50 px-3 py-2 bg-zinc-900 border border-zinc-900 rounded text-white md:hidden"
        >
          {showAI ? 'Hide AI' : 'Show AI'}
        </button>
      </div>
      <div className={`h-full ${showAI ? 'w-[360px]' : 'w-0'} border-l border-zinc-300 bg-zinc-100 hidden md:block`} />
      {showAI && <AIAssistant />}
    </main>
  );
}
