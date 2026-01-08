import { useMemo } from 'react';
import { Edge } from 'reactflow';

function score(edges: Edge[]) {
  let total = 0;
  edges.forEach(e => {
    const label = String(e.label || '').toLowerCase();
    if (label.includes('confirmed')) total += 3;
    else if (label.includes('suggested') || label.includes('suspected')) total += 1;
    else total += 2;
  });
  return Math.max(0, Math.min(100, Math.round((total / Math.max(1, edges.length * 3)) * 100)));
}

export function useCaseStrength(edges: Edge[]) {
  const strength = useMemo(() => score(edges), [edges]);
  const breakdown = useMemo(() => {
    const confirmed = edges.filter(e => String(e.label || '').toLowerCase().includes('confirmed')).length;
    const suspected = edges.filter(e => String(e.label || '').toLowerCase().includes('suspected') || String(e.label || '').toLowerCase().includes('suggested')).length;
    const other = edges.length - confirmed - suspected;
    return { confirmed, suspected, other };
  }, [edges]);
  return { strength, breakdown };
}
