"use client";

import { useState } from 'react';
import { useSpyglassStore } from '@/lib/store';
import { Colors } from '@/lib/constants';
import { processCommand } from '@/lib/ai-service';
import { Sparkles, AlertTriangle, CircleSlash, Link, HelpCircle, X } from 'lucide-react';

function typeIcon(t: string) {
  if (t === 'suggestion') return <Sparkles className="w-4 h-4" />;
  if (t === 'contradiction') return <CircleSlash className="w-4 h-4" />;
  if (t === 'pattern') return <Link className="w-4 h-4" />;
  if (t === 'gap') return <HelpCircle className="w-4 h-4" />;
  return <AlertTriangle className="w-4 h-4" />;
}

export default function AIAssistant() {
  const insights = useSpyglassStore(s => s.insights);
  const dismissInsight = useSpyglassStore(s => s.dismissInsight);
  const addInsight = useSpyglassStore(s => s.addInsight);
  const nodes = useSpyglassStore(s => s.nodes);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  type NodeData = { label?: string };

  const handleAsk = async () => {
    const q = input.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await processCommand(q, activeStory || {});
      const now = new Date().toISOString();
      addInsight({
        id: `chat-${now}`,
        storyId: activeStory?.id || '',
        type: 'suggestion',
        content: JSON.stringify(res),
        priority: 'low',
        dismissed: false,
        createdAt: now,
      });
      setInput('');
    } finally {
      setLoading(false);
    }
  };

  const actionColor = (p: string) => {
    if (p === 'critical') return Colors.priority.critical;
    if (p === 'high') return Colors.priority.high;
    if (p === 'medium') return Colors.priority.medium;
    return Colors.priority.low;
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-zinc-900 border-l border-zinc-700 shadow-xl flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-700">
        <div className="text-zinc-200 text-sm">AI Assistant</div>
        <div className="text-zinc-500 text-xs">Real-time guidance</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {insights.filter(i => !i.dismissed).map(i => {
          const color = actionColor(i.priority);
          const targetId = i.targetEntityId as string | undefined;
          return (
            <div
              key={i.id}
              className="bg-zinc-900 border border-zinc-700 rounded p-3"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-zinc-200">
                  {typeIcon(i.type)}
                  <span className="text-xs uppercase">{i.type}</span>
                </div>
                <button
                  onClick={() => dismissInsight(i.id)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-zinc-300 text-sm whitespace-pre-wrap">{i.content}</div>
              {targetId && (
                <div className="mt-2">
                  <button
                    className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:text-white"
                    onClick={() => {
                      const n = nodes.find(n => n.id === targetId);
                      const label = n ? String(((n.data as NodeData)?.label || '')) : '';
                      const detail = label ? { label } : { label: '' };
                      window.dispatchEvent(new CustomEvent('spyglass-highlight-node', { detail }));
                    }}
                  >
                    Act on Suggestion
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t border-zinc-700">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white placeholder:text-zinc-500"
            placeholder="Ask a question..."
            spellCheck={false}
          />
          <button
            onClick={handleAsk}
            disabled={loading}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
