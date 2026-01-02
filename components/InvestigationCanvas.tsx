"use client";

import React, { useCallback } from 'react';
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
import { PersonNode, PlaceNode, DocumentNode, ObjectNode, EventNode } from './CustomNodes';

import 'reactflow/dist/style.css';

const nodeTypes: NodeTypes = {
  person: PersonNode,
  place: PlaceNode,
  document: DocumentNode,
  object: ObjectNode,
  event: EventNode,
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
}

export default function InvestigationCanvas({ nodes, edges, onNodesChange, onEdgesChange, setEdges, setNodes, onEditNode, onEdgeClick }: InvestigationCanvasProps) {
  const [rfInstance, setRfInstance] = React.useState<any>(null);

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
  
  const onEdgeMouseEnter = useCallback((e: React.MouseEvent, edge: Edge) => {
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

  const onEdgeMouseLeave = useCallback((e: React.MouseEvent, edge: Edge) => {
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
        const next = window.prompt("Label this thread:", edge.label || '');
        if (next === null) return;
        setEdges((eds) => eds.map(x => x.id === edge.id ? { ...x, label: next } : x));
    }
  }, [setEdges, onEdgeClick]);
  
  const onNodeDoubleClick = useCallback((e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    onEditNode(node);
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

  return (
    <div
      className="w-full h-full bg-[#09090b]"
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
        <Background color="#27272a" gap={16} />
        <Controls className="bg-zinc-900 border-zinc-800 fill-white" />
        <MiniMap 
            nodeStrokeColor={(n) => {
                if (n.style?.background) return n.style.background as string;
                if (n.type === 'person') return '#991b1b';
                if (n.type === 'place') return '#fff';
                if (n.type === 'document') return '#3b82f6';
                if (n.type === 'object') return '#ffffff';
                if (n.type === 'event') return '#eab308';
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
    </div>
  );
}
