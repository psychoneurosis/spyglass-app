"use client";

import { useEffect, useRef, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const requestSeq = useRef(0);
  const timeoutIdRef = useRef<number | null>(null);
  type NodeData = { label?: string };
  const deskOfflineMessage = 'DESK OFFLINE: If this persists, check your Quota on Google AI Studio.';

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  const handleReset = () => {
    requestSeq.current += 1;
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    setTimedOut(false);
    setError(null);
    setLoading(false);
    setInput('');
    insights
      .filter(i => typeof i.id === 'string' && i.id.startsWith('chat-'))
      .forEach(i => dismissInsight(i.id));
    (window.location as any).reload(true);
  };

  const handleAsk = async () => {
    const q = input.trim();
    if (!q) return;
    const requestId = (requestSeq.current += 1);
    setLoading(true);
    setError(null);
    setTimedOut(false);
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
    }
    timeoutIdRef.current = window.setTimeout(() => {
      if (requestSeq.current !== requestId) return;
      setTimedOut(true);
      setError('STATION OFFLINE');
      setLoading(false);
    }, 10_000);
    try {
      const res = await processCommand(q, activeStory || {});
      if (requestSeq.current !== requestId) return;
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
    } catch (err: any) {
      if (requestSeq.current !== requestId) return;
      console.error("AI_ASSISTANT_ERROR:", err);
      setError(deskOfflineMessage);
    } finally {
      if (requestSeq.current !== requestId) return;
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
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
    <div className="fixed bottom-4 right-4 z-[9999] w-[400px] h-[300px] bg-zinc-950 border border-zinc-800 shadow-2xl rounded flex flex-col font-mono">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="text-zinc-200 text-xs tracking-wider">NEWSROOM TERMINAL</div>
          <div className="text-zinc-500 text-[10px]">AI Assistant</div>
        </div>
      </div>
      {timedOut ? (
        <div className="flex-1 overflow-y-auto p-3 flex items-center justify-center">
          <div className="w-full text-center">
            <div className="text-red-200 text-xs tracking-wider mb-3">STATION OFFLINE</div>
            <button
              onClick={handleReset}
              className="w-full px-3 py-3 bg-red-900/30 border border-red-900/60 rounded text-red-200 hover:bg-red-900/40 text-xs tracking-wider"
            >
              RELOAD BUREAU
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 overflow-y-auto p-3 flex items-center justify-center">
          <div className="text-center">
            <div className="text-zinc-300 text-xs mb-3">Newsroom Assistant Offline</div>
            <div className="text-zinc-400 text-xs mb-4 bg-black/40 p-3 rounded border border-zinc-800">
              {error}
            </div>
            <div className="space-y-2">
              <button
                onClick={handleReset}
                className="w-full px-3 py-3 bg-red-900/30 border border-red-900/60 rounded text-red-200 hover:bg-red-900/40 text-xs tracking-wider"
              >
                RELOAD BUREAU
              </button>
              <button
                onClick={() => (window.location as any).reload(true)}
                className="w-full px-3 py-3 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 hover:bg-zinc-800 text-xs tracking-wider"
              >
                HARD RESET
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {insights.filter(i => !i.dismissed).map(i => {
          const color = actionColor(i.priority);
          const targetId = i.targetEntityId as string | undefined;
          return (
            <div
              key={i.id}
              className="bg-zinc-950 border border-zinc-800 rounded p-2"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-zinc-200">
                  {typeIcon(i.type)}
                  <span className="text-[10px] uppercase tracking-wider">{i.type}</span>
                </div>
                <button
                  onClick={() => dismissInsight(i.id)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-zinc-300 text-xs whitespace-pre-wrap">{i.content}</div>
              {targetId && (
                <div className="mt-2">
                  <button
                    className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 hover:text-white text-[10px] tracking-wider"
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
      )}
      <div className="p-2 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-black/40 border border-zinc-800 rounded px-2 py-2 text-zinc-200 placeholder:text-zinc-600 text-xs"
            placeholder="Ask a question..."
            spellCheck={false}
          />
          <button
            onClick={handleAsk}
            disabled={loading}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 hover:text-white disabled:opacity-50 text-xs"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
