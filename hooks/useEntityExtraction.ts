import { useEffect, useState } from 'react';
import { analyzeText, ExtractEntity } from '@/lib/ai-service';

export function useEntityExtraction(text: string) {
  const [entities, setEntities] = useState<ExtractEntity[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!text || text.length < 3) return;
      setLoading(true);
      const res = await analyzeText(text);
      setEntities(res.entities || []);
      setLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, [text]);
  return { entities, loading };
}
