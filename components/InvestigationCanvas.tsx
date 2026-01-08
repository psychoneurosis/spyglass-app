"use client";

import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  NodeTypes,
} from 'reactflow';
import { SourceNode, EvidenceNode, ClaimNode, PublicationNode } from './CustomNodes';
import { suggestConnections } from '@/lib/ai-service';
import { useParams } from 'next/navigation';
import { getStory, getStoryGraph, type NodeRecord, type EdgeRecord } from '@/lib/supabase';
import { useSpyglassStore } from '@/lib/store';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';

import 'reactflow/dist/style.css';

const nodeTypes: NodeTypes = {
  source: SourceNode,
  evidence: EvidenceNode,
  claim: ClaimNode,
  publication: PublicationNode,
};

interface InvestigationCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onEditNode: (node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  caseId?: string;
}

export default function StoryCanvas({ nodes, edges, onNodesChange, onEdgesChange, setEdges, setNodes, onEditNode, onEdgeClick, caseId }: InvestigationCanvasProps) {
  const [rfInstance, setRfInstance] = React.useState<any>(null);
  const [menuNode, setMenuNode] = useState<Node | null>(null);
  const params = useParams();
  const storeSetNodes = useSpyglassStore(s => s.setNodes);
  const storeSetEdges = useSpyglassStore(s => s.setEdges);
  const setActiveStory = useSpyglassStore(s => s.setActiveStory);
  useAIAnalysis();

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const relationship = window.prompt("What is the relationship? (e.g., 'Met at', 'Works for')");
      
      const newEdge = {
        ...params,
        type: 'smoothstep',
        animated: false,
        label: relationship || '',
        labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
        style: { stroke: '#991b1b', strokeWidth: 2 },
      };
      
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );
  
  const onEdgeMouseEnter = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setEdges((eds) => eds.map(x => {
        if (x.id === edge.id) {
            return {
                ...x,
                style: { ...x.style, stroke: '#fff', strokeWidth: 3, filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.6))' },
                labelStyle: { ...x.labelStyle, fill: '#fff', textShadow: '0 0 5px #fff' },
                zIndex: 999
            };
        }
        return x;
    }));
  }, [setEdges]);

  const onEdgeMouseLeave = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setEdges((eds) => eds.map(x => {
        if (x.id === edge.id) {
            return {
                ...x,
                style: { stroke: '#991b1b', strokeWidth: 2 },
                labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
                zIndex: 0
            };
        }
        return x;
    }));
  }, [setEdges]);
  
  const onEdgeClickInternal = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.stopPropagation();
    if (onEdgeClick) {
        onEdgeClick(e, edge);
    } else {
        const next = window.prompt("Label this thread:", String(edge.label ?? ''));
        if (next === null) return;
        setEdges((eds) => eds.map(x => x.id === edge.id ? { ...x, label: next } : x));
    }
  }, [setEdges, onEdgeClick]);
  
  const onNodeDoubleClick = useCallback((e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    onEditNode(node);
    setMenuNode(node);
  }, [onEditNode]);
  
  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[]; edges: Edge[] }) => {
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    (window as any).__spyglass_selected_ids__ = selectedIds;
  }, []);
  
  const handleDeleteSelected = useCallback(() => {
    const selectedIds: Set<string> = (window as any).__spyglass_selected_ids__ || new Set<string>();
    if (!selectedIds.size) return;
    setNodes((nds) => nds.filter(n => !selectedIds.has(n.id)));
    setEdges((eds) => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
  }, [setNodes, setEdges]);
  
  React.useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    const deleteEventHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      if (!detail?.id) return;
      const id = detail.id;
      setNodes((nds) => nds.filter(n => n.id !== id));
      setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
    };
    const highlightEventHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { label: string };
      if (!detail?.label) return;
      const targetLabel = detail.label.toLowerCase();
      setNodes((nds) => nds.map(n => {
        const lbl = String((n.data as any)?.label || '').toLowerCase();
        if (lbl === targetLabel) {
          return { ...n, data: { ...(n.data as any), highlight: true } };
        }
        return n;
      }));
      setTimeout(() => {
        setNodes((nds) => nds.map(n => {
          if ((n.data as any)?.highlight) {
            const d = { ...(n.data as any) };
            delete d.highlight;
            return { ...n, data: d };
          }
          return n;
        }));
      }, 900);
    };
    
    const fitViewHandler = () => {
      if (rfInstance) {
        rfInstance.fitView({ padding: 0.2, duration: 800 });
      }
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('spyglass-delete-node', deleteEventHandler as EventListener);
    window.addEventListener('spyglass-highlight-node', highlightEventHandler as EventListener);
    window.addEventListener('spyglass-fit-view', fitViewHandler);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('spyglass-delete-node', deleteEventHandler as EventListener);
      window.removeEventListener('spyglass-highlight-node', highlightEventHandler as EventListener);
      window.removeEventListener('spyglass-fit-view', fitViewHandler);
    };
  }, [handleDeleteSelected, setNodes, setEdges, rfInstance]);
  
  React.useEffect(() => {
    storeSetNodes(nodes);
  }, [nodes, storeSetNodes]);
  
  React.useEffect(() => {
    storeSetEdges(edges);
  }, [edges, storeSetEdges]);
  
  React.useEffect(() => {
    const resolvedId = caseId || (params && (params as any).id);
    if (!resolvedId) return;
    let cancelled = false;
    const mapNodeType = (t: string) => {
      if (t === 'person') return 'source';
      if (t === 'location' || t === 'place') return 'source';
      if (t === 'event') return 'publication';
      if (t === 'evidence' || t === 'document') return 'evidence';
      if (t === 'object') return 'claim';
      return 'claim';
    };
    const mapEdgeStyle = (t: string) => {
      if (t === 'confirmed') return { stroke: '#10b981', strokeWidth: 2 };
      if (t === 'contradicts') return { stroke: '#ef4444', strokeWidth: 2 };
      return { stroke: '#6b7280', strokeWidth: 2 };
    };
    (async () => {
      try {
        const c = await getStory(String(resolvedId));
        setActiveStory({ id: c.id, title: c.title, centralQuestion: c.centralQuestion, status: c.status });
        const graph = await getStoryGraph(String(resolvedId));
        const flowNodes: Node[] = (graph.nodes as NodeRecord[]).map(n => ({
          id: n.id,
          type: mapNodeType(String(n.type)),
          position: n.position || { x: 200, y: 200 },
          data: { label: n.data?.name || '', source: n.data?.source, ...n.data },
        }));
        const flowEdges: Edge[] = (graph.edges as EdgeRecord[]).map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          animated: false,
          label: e.label || '',
          style: mapEdgeStyle(String(e.type)),
        } as any));
        if (cancelled) return;
        setNodes(() => flowNodes);
        setEdges(() => flowEdges);
        storeSetNodes(flowNodes);
        storeSetEdges(flowEdges);
        if (rfInstance) {
          rfInstance.fitView({ padding: 0.2, duration: 800 });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, params, setNodes, setEdges, storeSetNodes, storeSetEdges, setActiveStory, rfInstance]);

  return (
    <div
      className="w-full h-full bg-zinc-950"
      onContextMenu={(e) => {
        e.preventDefault();
        handleDeleteSelected();
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
         <div className="w-full h-[2px] bg-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-scan" />
      </div>
      <style>{`
         @keyframes scan {
             0% { transform: translateY(-10vh); opacity: 0; }
             10% { opacity: 1; }
             90% { opacity: 1; }
             100% { transform: translateY(110vh); opacity: 0; }
         }
         .animate-scan {
             animation: scan 8s linear infinite;
         }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClickInternal}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        onSelectionChange={onSelectionChange}
        onInit={setRfInstance}
        fitView
      >
        <Background color="#e4e4e7" gap={16} />
        <Controls className="bg-zinc-100 border-zinc-300 fill-zinc-900" />
        <MiniMap 
            nodeStrokeColor={(n) => {
                if (n.style?.background) return n.style.background as string;
                if (n.type === 'source') return '#3b82f6';
                if (n.type === 'evidence') return '#10b981';
                if (n.type === 'claim') return '#f59e0b';
                if (n.type === 'publication') return '#ec4899';
                return '#eee';
            }}
            nodeColor={(n) => {
                if (n.style?.background) return n.style.background as string;
                return '#18181b';
            }}
            maskColor="rgba(9, 9, 11, 0.8)"
            className="bg-zinc-950 border border-zinc-800"
        />
      </ReactFlow>
      {menuNode && (
        <div className="absolute bottom-4 right-4 bg-zinc-900 border border-zinc-700 rounded p-3 shadow-xl">
          <div className="text-zinc-200 text-sm mb-2">Node Menu</div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:text-white"
              onClick={async () => {
                const name = String((menuNode.data as any)?.label || '');
                const existing = nodes.map(n => ({ id: n.id, name: String((n.data as any)?.label || '') }));
                const suggestions = await suggestConnections({ name }, existing);
                const newEdges: Edge[] = [];
                suggestions.forEach(s => {
                  const target = nodes.find(n => n.id === s.targetNode || String((n.data as any)?.label || '') === s.targetNode);
                  if (target) {
                    newEdges.push({
                      id: `suggest-${Date.now()}-${Math.random()}`,
                      source: menuNode.id,
                      target: target.id,
                      type: 'smoothstep',
                      animated: false,
                      label: 'suggested',
                      style: { stroke: '#6b7280', strokeWidth: 2, strokeDasharray: '6,4' },
                    } as any);
                  }
                });
                if (newEdges.length > 0) setEdges(eds => [...eds, ...newEdges]);
                setMenuNode(null);
              }}
            >
              Suggest Connections
            </button>
            <button
              className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:text-white"
              onClick={() => setMenuNode(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
