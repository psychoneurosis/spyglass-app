import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';

type User = { id: string; email?: string; name?: string } | null;
type Story = { id: string; title: string; centralQuestion?: string; status?: string } | null;
type AIInsight = { id: string; storyId: string; type: string; content: string; priority: 'low' | 'medium' | 'high' | 'critical'; dismissed: boolean; createdAt: string; targetEntityId?: string };

type AppState = {
  user: User;
  setUser: (user: User) => void;
  activeStory: Story;
  setActiveStory: (s: Story) => void;
  updateStory: (updates: Partial<NonNullable<Story>>) => void;
  storyStage: string | null;
  setStoryStage: (stage: string | null) => void;
  nodes: Node[];
  edges: Edge[];
  addNode: (node: Node) => void;
  updateNode: (id: string, data: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  insights: AIInsight[];
  addInsight: (insight: AIInsight) => void;
  dismissInsight: (id: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  terminalMode: 'intake' | 'command';
  setTerminalMode: (m: 'intake' | 'command') => void;
  canvasView: 'graph' | 'timeline' | 'map' | 'grid';
  setCanvasView: (v: 'graph' | 'timeline' | 'map' | 'grid') => void;
};

export const useSpyglassStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  activeStory: null,
  setActiveStory: (s) => set({ activeStory: s }),
  updateStory: (updates) => {
    const s = get().activeStory;
    if (!s) return;
    set({ activeStory: { ...s, ...updates } });
  },
  storyStage: null,
  setStoryStage: (stage) => set({ storyStage: stage }),
  nodes: [],
  edges: [],
  addNode: (node) => set({ nodes: [...get().nodes, node] }),
  updateNode: (id, data) => {
    const next = get().nodes.map(n => (n.id === id ? { ...n, ...data } : n));
    set({ nodes: next });
  },
  deleteNode: (id) => set({ nodes: get().nodes.filter(n => n.id !== id) }),
  addEdge: (edge) => set({ edges: [...get().edges, edge] }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  insights: [],
  addInsight: (insight) => set({ insights: [insight, ...get().insights] }),
  dismissInsight: (id) => set({ insights: get().insights.map(i => (i.id === id ? { ...i, dismissed: true } : i)) }),
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  terminalMode: 'intake',
  setTerminalMode: (m) => set({ terminalMode: m }),
  canvasView: 'graph',
  setCanvasView: (v) => set({ canvasView: v }),
}));
