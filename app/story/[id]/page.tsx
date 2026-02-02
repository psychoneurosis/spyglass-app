"use client";

import StoryCanvas from "@/components/InvestigationCanvas";
import Sidebar, { SuggestedEntity } from "@/components/Sidebar";
import AIAssistant from "@/components/ai/AIAssistant";
import TimelineTray from "@/components/TimelineTray";
import { useNodesState, useEdgesState } from "reactflow";
import { useParams } from "next/navigation";
import { useSpyglassStore } from "@/lib/store";
import { useRef, useState } from "react";
import { generateExecutiveBriefingMarkdown, getExecutiveBriefingFilename } from "@/lib/export-service";
import { legalPreflight } from "@/lib/ai-journalism";

export default function StoryPage() {
  const params = useParams();
  const storyId = (params as any)?.id as string | undefined;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const storyStage = useSpyglassStore(s => s.storyStage);
  const assistantMessages = useSpyglassStore(s => s.assistantMessages);
  const [showTimeline, setShowTimeline] = useState(false);
  const debugLoggedRef = useRef<true | null>(null);
  if (debugLoggedRef.current == null) {
    console.log("DEBUG: Data type of storyId", typeof storyId);
    console.log("DEBUG: Data type of activeStory", typeof activeStory);
    console.log("DEBUG: Data type of activeStory.story_stage", typeof (activeStory as any)?.story_stage);
    console.log("DEBUG: Data type of storyStage", typeof storyStage);
    console.log("DEBUG: Data type of nodes", typeof nodes);
    console.log("DEBUG: Data type of edges", typeof edges);
    console.log("DEBUG: Data type of assistantMessages", typeof assistantMessages);
    debugLoggedRef.current = true;
  }

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

  const handleExport = async () => {
    const md = generateExecutiveBriefingMarkdown({
      storyTitle: activeStory?.title || "Story",
      nodes: nodes as any,
      edges: edges as any,
      messages: assistantMessages as any,
    });
    const title = activeStory?.title || "Story";
    const potentialLeaks: string[] = [];
    const emailsInExport = md.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) || [];
    const phonesInExport = md.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g) || [];
    [...emailsInExport, ...phonesInExport].forEach((x) => potentialLeaks.push(String(x)));

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
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getExecutiveBriefingFilename(activeStory?.title || "Story");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[#f9f8f4]">
      <Sidebar
        onAddEntity={handleAddEntity}
        onClear={handleClear}
        onOrganize={handleOrganize}
        onExport={handleExport}
        storyInfo={activeStory ? {
          name: activeStory?.title || '',
          persona: 'THE ENFORCER',
          objective: activeStory?.title || ''
        } : undefined}
        existingLabels={nodes.map(n => String((n as any).data?.label || '').trim())}
        nodes={nodes as any}
        edges={edges as any}
        investigatorName={'Investigator'}
        sources={[]}
        onUpdateSources={() => {}}
        onToggleTimeline={() => setShowTimeline(v => !v)}
      />
      <div className="flex-1 h-full relative">
        <StoryCanvas
          storyId={storyId}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          setNodes={setNodes}
          setEdges={setEdges}
          onEditNode={() => {}}
        />
        <TimelineTray open={showTimeline} nodes={nodes as any} />
      </div>
      <AIAssistant />
    </main>
  );
}
