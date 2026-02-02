import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';

type User = { id: string; email?: string; name?: string } | null;
const STORY_STAGES = ['viability_assessment', 'background_research', 'source_development', 'verification', 'writing', 'published'] as const;
type StoryStage = (typeof STORY_STAGES)[number];
type Story = { id: string; title: string; centralQuestion?: string; status?: string; story_stage?: StoryStage } | null;
type AIInsight = { id: string; storyId: string; type: string; content: string; priority: 'low' | 'medium' | 'high' | 'critical'; dismissed: boolean; createdAt: string; targetEntityId?: string };
type AssistantMessage = { id?: string; role: 'user' | 'assistant'; content: string };
type IntelWireResult = { title: string; url: string; source: string; snippet: string; publishedDate?: string; tier?: 'tier1' | 'unknown' };
type IntelWirePayload = { query: string; results: IntelWireResult[]; meat?: { people: string[]; orgs: string[]; dates: string[] }; populateDesk?: boolean; warning?: string; error?: string; createdAt: string };

type AppState = {
  user: User;
  setUser: (user: User) => void;
  resetStore: () => void;
  clearStoryState: () => void;
  activeStory: Story;
  setActiveStory: (s: Story) => void;
  updateStory: (updates: Partial<NonNullable<Story>>) => void;
  storyStage: StoryStage | null;
  setStoryStage: (stage: StoryStage | null) => void;
  isRedacted: boolean;
  setIsRedacted: (v: boolean) => void;
  securityUnlocked: boolean;
  setSecurityUnlocked: (v: boolean) => void;
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
  assistantMessages: AssistantMessage[];
  setAssistantMessages: (messages: AssistantMessage[]) => void;
  intelWire: IntelWirePayload | null;
  setIntelWire: (payload: Omit<IntelWirePayload, 'createdAt'> | null) => void;
};

export const useSpyglassStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  resetStore: () =>
    set({
      user: null,
      activeStory: null,
      storyStage: null,
      isRedacted: false,
      securityUnlocked: false,
      nodes: [],
      edges: [],
      insights: [],
      sidebarOpen: true,
      terminalMode: 'intake',
      canvasView: 'graph',
      assistantMessages: [],
      intelWire: null,
    }),
  clearStoryState: () =>
    set({
      activeStory: null,
      storyStage: null,
      nodes: [],
      edges: [],
      insights: [],
      terminalMode: 'intake',
      canvasView: 'graph',
      assistantMessages: [],
      intelWire: null,
      securityUnlocked: false,
    }),
  activeStory: null,
  setActiveStory: (s) => set({ activeStory: s }),
  updateStory: (updates) => {
    const s = get().activeStory;
    if (!s) return;
    set({ activeStory: { ...s, ...updates } });
  },
  storyStage: null,
  setStoryStage: (stage) => {
    if (!stage) {
      set({ storyStage: null });
      return;
    }
    const next = typeof stage === 'string' && (STORY_STAGES as readonly string[]).includes(stage) ? (stage as StoryStage) : null;
    set({ storyStage: next });
  },
  isRedacted: false,
  setIsRedacted: (v) => set({ isRedacted: v }),
  securityUnlocked: false,
  setSecurityUnlocked: (v) => set({ securityUnlocked: v }),
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
  assistantMessages: [],
  setAssistantMessages: (messages) => set({ assistantMessages: messages.slice(-50) }),
  intelWire: null,
  setIntelWire: (payload) =>
    set({
      intelWire: payload
        ? {
            ...payload,
            createdAt: new Date().toISOString(),
          }
        : null,
    }),
}));
