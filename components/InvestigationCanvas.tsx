"use client";

import React, { useCallback, useMemo, useState } from 'react';
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
import { getStory, getStoryGraph, upsertEdges, upsertNodes, type NodeRecord, type EdgeRecord } from '@/lib/supabase';
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
  storyId?: string;
}

export default function StoryCanvas({ nodes, edges, onNodesChange, onEdgesChange, setEdges, setNodes, onEditNode, onEdgeClick, storyId: storyIdProp }: InvestigationCanvasProps) {
  const [rfInstance, setRfInstance] = React.useState<any>(null);
  const [menuNode, setMenuNode] = useState<Node | null>(null);
  const [stampMenu, setStampMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const nodesRef = React.useRef<Node[]>([]);
  const lastAutoSeedQueryRef = React.useRef<string>('');
  const params = useParams();
  const storeSetNodes = useSpyglassStore(s => s.setNodes);
  const storeSetEdges = useSpyglassStore(s => s.setEdges);
  const setActiveStory = useSpyglassStore(s => s.setActiveStory);
  const setStoryStage = useSpyglassStore(s => s.setStoryStage);
  const intelWire = useSpyglassStore(s => s.intelWire);
  const setIntelWire = useSpyglassStore(s => s.setIntelWire);
  useAIAnalysis();

  const storyId = useMemo(() => {
    const resolvedId = storyIdProp || (params && (params as any).id);
    return resolvedId ? String(resolvedId) : '';
  }, [storyIdProp, params]);

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

  const persistNodes = useCallback(async (nextNodes: Node[]) => {
    if (!storyId) return;
    const toSerializable = (value: unknown) => {
      try {
        return JSON.parse(
          JSON.stringify(value, (_k, v) => {
            if (typeof v === 'function') return undefined;
            return v;
          }),
        );
      } catch {
        return {};
      }
    };
    const mapFlowTypeToDbType = (t: string | undefined) => {
      if (t === 'source') return 'person';
      if (t === 'evidence') return 'evidence';
      if (t === 'publication') return 'event';
      return 'theory';
    };
    const rows: NodeRecord[] = nextNodes.map(n => {
      const raw = (toSerializable(n.data) || {}) as Record<string, unknown>;
      const data: Record<string, unknown> = { ...raw };
      if (!data.name) data.name = String(raw.label || '');
      delete data.label;
      delete data.onInspect;
      delete data.highlight;
      const candidateDbType = typeof raw.__dbType === 'string' ? raw.__dbType : '';
      delete data.__dbType;
      return {
        id: n.id,
        storyId,
        type: (candidateDbType || mapFlowTypeToDbType(String(n.type || ''))) as any,
        position: n.position as any,
        data: data as any,
      };
    });
    await upsertNodes(rows);
  }, [storyId]);

  const persistEdges = useCallback(async (nextEdges: Edge[]) => {
    if (!storyId) return;
    const now = new Date().toISOString();
    const rows: EdgeRecord[] = nextEdges.map((e) => ({
      id: e.id,
      storyId,
      source: String(e.source),
      target: String(e.target),
      type: 'suspected',
      strength: 'weak',
      label: String((e as any).label || ''),
      evidence: [],
      createdAt: now,
    }));
    await upsertEdges(rows);
  }, [storyId]);

  const seedCanvasFromSearch = useCallback(async (payload: { query: string; results: Array<{ title: string; url: string; source: string; snippet: string; publishedDate?: string; tier?: 'tier1' | 'unknown' }>; meat?: { people: string[]; orgs: string[]; dates: string[] } }) => {
    const makeId = () => {
      try {
        return crypto.randomUUID();
      } catch {
        return `seed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    };

    const existingLabels = new Set(nodes.map(n => String((n.data as any)?.label || '').trim().toLowerCase()).filter(Boolean));
    const center = rfInstance?.getViewport ? rfInstance.getViewport() : null;
    const baseX = typeof center?.x === 'number' ? -center.x + 260 : 260;
    const baseY = typeof center?.y === 'number' ? -center.y + 160 : 160;

    const tier1Outlets = new Set(['reuters.com', 'bloomberg.com', 'theguardian.com', 'reuters', 'bloomberg', 'the guardian']);
    const outletLabel = (s: string) => String(s || '').trim();
    const outletKey = (s: string) => outletLabel(s).toLowerCase();

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const outletNodeIdByKey = new Map<string, string>();
    const personNodeIdByKey = new Map<string, string>();
    const orgNodeIdByKey = new Map<string, string>();

    const ensureOutletNode = (source: string, tier?: 'tier1' | 'unknown') => {
      const key = outletKey(source);
      if (!key) return null;
      if (outletNodeIdByKey.has(key)) return outletNodeIdByKey.get(key)!;
      const label = outletLabel(source);
      if (existingLabels.has(label.toLowerCase())) return null;
      const id = makeId();
      outletNodeIdByKey.set(key, id);
      existingLabels.add(label.toLowerCase());
      newNodes.push({
        id,
        type: 'source',
        position: { x: baseX - 420, y: baseY + outletNodeIdByKey.size * 110 },
        data: {
          label,
          __dbType: 'person',
          role: 'Newsroom',
          credibility: tier === 'tier1' || tier1Outlets.has(key) ? 5 : 4,
          anonymity: false,
          contactInfo: '',
          quotes: [],
        },
      });
      return id;
    };

    const ensureEntityNode = (kind: 'person' | 'org', name: string) => {
      const clean = String(name || '').trim();
      if (!clean) return null;
      const key = clean.toLowerCase();
      const map = kind === 'person' ? personNodeIdByKey : orgNodeIdByKey;
      if (map.has(key)) return map.get(key)!;
      if (existingLabels.has(key)) return null;
      const id = makeId();
      map.set(key, id);
      existingLabels.add(key);
      newNodes.push({
        id,
        type: 'source',
        position: {
          x: baseX + (kind === 'person' ? 420 : 620),
          y: baseY + (map.size - 1) * 110,
        },
        data: {
          label: clean,
          __dbType: 'person',
          role: kind === 'person' ? 'Person of interest' : 'Organization',
          credibility: 3,
          anonymity: false,
          contactInfo: '',
          quotes: [],
        },
      });
      return id;
    };

    const people = Array.isArray(payload.meat?.people) ? payload.meat!.people : [];
    const orgs = Array.isArray(payload.meat?.orgs) ? payload.meat!.orgs : [];
    const dates = Array.isArray(payload.meat?.dates) ? payload.meat!.dates : [];

    people.slice(0, 10).forEach((p) => ensureEntityNode('person', p));
    orgs.slice(0, 10).forEach((o) => ensureEntityNode('org', o));

    dates.slice(0, 4).forEach((d, idx) => {
      const label = `Event: ${String(d).trim()}`;
      if (!label.trim()) return;
      const key = label.toLowerCase();
      if (existingLabels.has(key)) return;
      existingLabels.add(key);
      newNodes.push({
        id: makeId(),
        type: 'publication',
        position: { x: baseX, y: baseY - 160 - idx * 110 },
        data: { label, __dbType: 'event', eventDate: String(d).trim() },
      });
    });

    payload.results.slice(0, 10).forEach((r, idx) => {
      const label = String(r.title || '').trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (existingLabels.has(key)) return;
      existingLabels.add(key);

      const id = makeId();
      const outletId = ensureOutletNode(r.source, r.tier);
      const verified = r.tier === 'tier1';

      newNodes.push({
        id,
        type: 'evidence',
        position: { x: baseX, y: baseY + idx * 110 },
        data: {
          label,
          __dbType: 'evidence',
          evidenceType: 'document',
          acquisitionMethod: 'public_record',
          legalClearance: false,
          stamp: verified ? 'verified' : undefined,
          source: r.url,
          sourceFile: r.url,
          originSentence: r.snippet,
          fileType: 'text/plain',
          fullText: `${r.title}\n\n${r.snippet}\n\n${r.url}`,
          metadata: {
            source_url: r.url,
            outlet: r.source,
            publishedDate: r.publishedDate || null,
            query: payload.query,
          },
        },
      });

      if (outletId) {
        newEdges.push({
          id: makeId(),
          source: outletId,
          target: id,
          type: 'smoothstep',
          animated: false,
          label: 'reported',
          style: { stroke: '#6b7280', strokeWidth: 2 },
        } as any);
      }
    });

    const nextNodes = [...nodes, ...newNodes];
    const nextEdges = [...edges, ...newEdges];
    setNodes(() => nextNodes);
    setEdges(() => nextEdges);
    await persistNodes(newNodes);
    await persistEdges(newEdges);
  }, [nodes, edges, setNodes, setEdges, persistNodes, persistEdges, rfInstance, setIntelWire]);

  React.useEffect(() => {
    if (!intelWire) return;
    if (!intelWire.query) return;
    if (!Array.isArray(intelWire.results) || intelWire.results.length === 0) return;
    if (lastAutoSeedQueryRef.current === intelWire.query) return;
    lastAutoSeedQueryRef.current = intelWire.query;
    void seedCanvasFromSearch(intelWire);
  }, [intelWire, seedCanvasFromSearch]);

  const applyStamp = useCallback(async (opts: { nodeId?: string; stamp?: 'verified' | 'corroborated' | 'high_risk' | null; clearAll?: boolean }) => {
    const { nodeId, stamp, clearAll } = opts;
    const nextNodes = clearAll
      ? nodes.map(n => {
          const d = { ...(n.data as any) };
          delete d.stamp;
          return { ...n, data: d };
        })
      : nodes.map(n => {
          if (!nodeId || n.id !== nodeId) return n;
          const d = { ...(n.data as any) };
          if (stamp === null) delete d.stamp;
          else d.stamp = stamp;
          return { ...n, data: d };
        });
    setNodes(() => nextNodes);
    const persistList = clearAll ? nextNodes : nextNodes.filter(n => n.id === nodeId);
    await persistNodes(persistList);
  }, [nodes, persistNodes, setNodes]);
  
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
    nodesRef.current = nodes;
  }, [nodes]);

  React.useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as any)?.isContentEditable) return;
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

    const updateNodeDataHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; patch?: Record<string, unknown> };
      if (!detail?.id || !detail?.patch) return;
      setNodes((nds) => {
        const next = nds.map(n => {
          if (n.id !== detail.id) return n;
          const d = { ...(n.data as any) } as Record<string, unknown>;
          Object.entries(detail.patch || {}).forEach(([k, v]) => {
            if (v === null || v === undefined || v === '') delete d[k];
            else d[k] = v;
          });
          const updated = { ...n, data: d };
          void persistNodes([updated]);
          return updated;
        });
        return next;
      });
    };

    const centerNodeHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      if (!detail?.id) return;
      const n = nodesRef.current.find(x => x.id === detail.id);
      if (!n || !rfInstance) return;
      try {
        rfInstance.fitView({ nodes: [n], padding: 0.35, duration: 650 });
      } catch {
        try {
          rfInstance.setCenter(n.position.x, n.position.y, { zoom: 1.2, duration: 650 });
        } catch {}
      }
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('spyglass-delete-node', deleteEventHandler as EventListener);
    window.addEventListener('spyglass-highlight-node', highlightEventHandler as EventListener);
    window.addEventListener('spyglass-fit-view', fitViewHandler);
    window.addEventListener('spyglass-update-node-data', updateNodeDataHandler as EventListener);
    window.addEventListener('spyglass-center-node', centerNodeHandler as EventListener);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('spyglass-delete-node', deleteEventHandler as EventListener);
      window.removeEventListener('spyglass-highlight-node', highlightEventHandler as EventListener);
      window.removeEventListener('spyglass-fit-view', fitViewHandler);
      window.removeEventListener('spyglass-update-node-data', updateNodeDataHandler as EventListener);
      window.removeEventListener('spyglass-center-node', centerNodeHandler as EventListener);
    };
  }, [handleDeleteSelected, persistNodes, setNodes, setEdges, rfInstance]);

  React.useEffect(() => {
    if (!stampMenu) return;
    const handleDown = () => setStampMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStampMenu(null);
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [stampMenu]);
  
  React.useEffect(() => {
    storeSetNodes(nodes);
  }, [nodes, storeSetNodes]);
  
  React.useEffect(() => {
    storeSetEdges(edges);
  }, [edges, storeSetEdges]);
  
  React.useEffect(() => {
    let cancelled = false;
    if (!storyId || storyId === 'undefined' || storyId.length < 36) {
      console.warn('Aborting hydration: Invalid Story ID format');
      return;
    }
    const allowedStages = new Set(['viability_assessment', 'background_research', 'source_development', 'verification', 'writing', 'published']);
    const safeString = (v: unknown) => {
      if (typeof v === 'string') return v;
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    };
    const describeError = (err: unknown) => {
      if (err instanceof Error) return err.message || 'Unknown error';
      if (err && typeof err === 'object') {
        const anyErr = err as any;
        if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
        const details = typeof anyErr.details === 'string' ? anyErr.details.trim() : '';
        const hint = typeof anyErr.hint === 'string' ? anyErr.hint.trim() : '';
        const code = typeof anyErr.code === 'string' ? anyErr.code.trim() : '';
        const parts = [details, hint, code].filter(Boolean);
        if (parts.length) return parts.join(' | ');
        try {
          const j = JSON.stringify(err);
          if (j && j !== '{}' && j !== 'null') return j;
        } catch {}
      }
      const s = String(err || '').trim();
      return s || 'Unknown error';
    };
    const normalizeStage = (v: unknown) => {
      if (typeof v !== 'string') return null;
      return allowedStages.has(v) ? v : null;
    };
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
      let stage: string | null = null;
      try {
        const c = await getStory(storyId);
        const title = safeString((c as any)?.title || 'Story').trim() || 'Story';
        const stageRaw = (c as any)?.story_stage;
        stage = normalizeStage(stageRaw);
        setActiveStory({
          id: safeString((c as any)?.id || storyId),
          title,
          centralQuestion: safeString((c as any)?.centralQuestion || title),
          status: safeString((c as any)?.status || 'active'),
          story_stage: (stage as any) || undefined,
        });
        setStoryStage((stage as any) || null);
      } catch (err) {
        if (cancelled) return;
        const msg = describeError(err);
        console.warn('Story hydrate: story fetch failed', { storyId, error: msg });
        setActiveStory({
          id: storyId,
          title: 'Story',
          centralQuestion: 'Story',
          status: 'active',
        } as any);
        setStoryStage('background_research' as any);
      }

      try {
        const graph = await getStoryGraph(storyId);
        const flowNodes: Node[] = (graph.nodes as NodeRecord[]).map(n => ({
          id: n.id,
          type: mapNodeType(String(n.type)),
          position: n.position || { x: 200, y: 200 },
          data: { label: n.data?.name || '', source: n.data?.source, __dbType: n.type, ...n.data },
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
      } catch (err) {
        if (cancelled) return;
        const msg = describeError(err);
        console.warn('Story hydrate: graph fetch failed', { storyId, error: msg });
        setNodes(() => []);
        setEdges(() => []);
        storeSetNodes([]);
        storeSetEdges([]);
        if (stage) setStoryStage((stage as any) || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, setNodes, setEdges, storeSetNodes, storeSetEdges, setActiveStory, setStoryStage, rfInstance]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0 relative"
      style={{ backgroundColor: '#f9f8f4' }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const raw =
          e.dataTransfer.getData('application/spyglass-sourcefile') ||
          e.dataTransfer.getData('text/plain') ||
          '';
        let fileName = '';
        try {
          const parsed = JSON.parse(raw);
          fileName = String(parsed?.name || parsed?.id || '');
        } catch {
          fileName = String(raw || '');
        }
        fileName = fileName.trim();
        if (!fileName) return;

        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const nodeEl = el?.closest?.('.react-flow__node') as HTMLElement | null;
        const nodeId = nodeEl?.getAttribute?.('data-id') || '';
        if (!nodeId) return;

        const nextNodes = nodes.map(n => {
          if (n.id !== nodeId) return n;
          const d = { ...(n.data as any) };
          const existing = Array.isArray(d.sources) ? (d.sources as unknown[]) : [];
          const next = existing.map(x => String(x)).filter(Boolean);
          if (!next.includes(fileName)) next.push(fileName);
          d.sources = next;
          return { ...n, data: d };
        });
        setNodes(() => nextNodes);
        void persistNodes(nextNodes.filter(n => n.id === nodeId));
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setStampMenu(null);
      }}
    >
      {intelWire && intelWire.results.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[10001] w-[520px] max-w-[92vw] bg-zinc-950 border border-zinc-800 rounded shadow-2xl p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-zinc-200 text-xs tracking-wider">INTELLIGENCE WIRE</div>
              <div className="text-zinc-400 text-xs mt-1 line-clamp-2">{intelWire.query}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 bg-emerald-900/30 border border-emerald-700/60 rounded text-emerald-200 hover:bg-emerald-900/40 text-xs tracking-wider"
                onClick={() => {
                  void seedCanvasFromSearch(intelWire).finally(() => setIntelWire(null));
                }}
              >
                POPULATE THE DESK
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 hover:bg-zinc-800 text-xs tracking-wider"
                onClick={() => setIntelWire(null)}
              >
                DISMISS
              </button>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            {intelWire.meat?.people?.length || intelWire.meat?.orgs?.length || intelWire.meat?.dates?.length ? (
              <>
                {(intelWire.meat?.people?.length || 0) > 0 ? `${intelWire.meat?.people?.length} names` : null}
                {(intelWire.meat?.orgs?.length || 0) > 0 ? `${(intelWire.meat?.people?.length || 0) > 0 ? ' • ' : ''}${intelWire.meat?.orgs?.length} orgs` : null}
                {(intelWire.meat?.dates?.length || 0) > 0 ? `${((intelWire.meat?.people?.length || 0) + (intelWire.meat?.orgs?.length || 0)) > 0 ? ' • ' : ''}${intelWire.meat?.dates?.length} dates` : null}
              </>
            ) : (
              <>Found {intelWire.results.length} links</>
            )}
          </div>
        </div>
      )}
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
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = containerRef.current?.getBoundingClientRect();
          const x = rect ? e.clientX - rect.left : e.clientX;
          const y = rect ? e.clientY - rect.top : e.clientY;
          setStampMenu({ x, y, nodeId: node.id });
        }}
        nodeTypes={nodeTypes}
        onSelectionChange={onSelectionChange}
        onInit={setRfInstance}
        onPaneClick={() => setStampMenu(null)}
        fitView
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls className="bg-amber-50 border-amber-200 fill-zinc-900 font-serif" />
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
      {stampMenu && (
        <div
          className="absolute z-[10000] min-w-[210px] bg-zinc-950 border border-zinc-800 rounded shadow-2xl overflow-hidden"
          style={{ left: stampMenu.x, top: stampMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
            onClick={() => {
              applyStamp({ nodeId: stampMenu.nodeId, stamp: 'verified' });
              setStampMenu(null);
            }}
          >
            Stamp: Verified
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
            onClick={() => {
              applyStamp({ nodeId: stampMenu.nodeId, stamp: 'corroborated' });
              setStampMenu(null);
            }}
          >
            Stamp: Corroborated
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
            onClick={() => {
              applyStamp({ nodeId: stampMenu.nodeId, stamp: 'high_risk' });
              setStampMenu(null);
            }}
          >
            Stamp: High Risk
          </button>
          <div className="h-px bg-zinc-800" />
          <button
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
            onClick={() => {
              applyStamp({ clearAll: true });
              setStampMenu(null);
            }}
          >
            Clear Stamps
          </button>
        </div>
      )}
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
