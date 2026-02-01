"use client";

import StoryCanvas from "@/components/InvestigationCanvas";
import Sidebar, { SuggestedEntity } from "@/components/Sidebar";
import AIAssistant from "@/components/ai/AIAssistant";
import { useNodesState, useEdgesState } from "reactflow";
import { useParams } from "next/navigation";
import { useSpyglassStore } from "@/lib/store";

export default function CasePage() {
  const params = useParams();
  const caseId = (params as any)?.id as string | undefined;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const activeStory = useSpyglassStore(s => s.activeStory);
  
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
    <main className="flex h-screen w-screen overflow-hidden bg-[#f9f8f4]">
      <Sidebar 
        onAddEntity={handleAddEntity}
        onClear={handleClear}
        onOrganize={handleOrganize}
        onExport={handleExport}
        caseInfo={activeStory ? {
          name: activeStory.title,
          persona: 'THE ENFORCER',
          objective: activeStory.title
        } : undefined}
        existingLabels={nodes.map(n => String((n as any).data?.label || '').trim())}
        nodes={nodes as any}
        edges={edges as any}
        investigatorName={'Investigator'}
        sources={[]}
        onUpdateSources={() => {}}
      />
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
      </div>
      <AIAssistant />
    </main>
  );
}
