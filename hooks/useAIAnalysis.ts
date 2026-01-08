import { useEffect, useState } from 'react';
import { useSpyglassStore } from '@/lib/store';
import { analyzeCaseState, SuggestedAction } from '@/lib/ai-service';

export function useAIAnalysis() {
  const nodes = useSpyglassStore(s => s.nodes);
  const edges = useSpyglassStore(s => s.edges);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const addInsight = useSpyglassStore(s => s.addInsight);
  const [loading, setLoading] = useState(false);
  const [insights, setLocalInsights] = useState<SuggestedAction[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const caseData = { ...activeStory, nodes, edges };
      setLoading(true);
      const res = await analyzeCaseState(caseData);
      setLocalInsights(res.suggestedActions || []);
      const now = new Date().toISOString();
      (res.detectedPatterns || []).forEach((p, i) => {
        addInsight({ id: `pat-${now}-${i}`, storyId: activeStory?.id || '', type: 'pattern', content: p.description, priority: 'medium', dismissed: false, createdAt: now });
      });
      setLoading(false);
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, activeStory, addInsight]);
  return { insights, loading };
}
