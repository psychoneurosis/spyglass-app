"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpyglassStore } from '@/lib/store';
import { processTerminalCommand } from '@/lib/ai-service';
import { AlertTriangle, CheckCircle, Loader2, Search as SearchIcon, Satellite } from 'lucide-react';

export default function AIAssistant() {
  const nodes = useSpyglassStore(s => s.nodes);
  const storyStage = useSpyglassStore(s => s.storyStage);
  const activeStory = useSpyglassStore(s => s.activeStory);
  const setAssistantMessages = useSpyglassStore(s => s.setAssistantMessages);
  const setIntelWire = useSpyglassStore(s => s.setIntelWire);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const requestSeq = useRef(0);
  const timeoutIdRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const prevStoryIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const lastAssistantCountRef = useRef(0);
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deskOfflineMessage = 'DESK OFFLINE: If this persists, check your Groq key/network.';
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [searchStatus, setSearchStatus] = useState<'unknown' | 'active' | 'weak' | 'offline'>('unknown');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const resp = await fetch('/api/web-search', { method: 'GET' });
        if (!resp.ok) {
          if (!cancelled) setSearchStatus('unknown');
          return;
        }
        const data = (await resp.json()) as { tavilyConfigured?: unknown; serperConfigured?: unknown };
        const tavily = Boolean(data?.tavilyConfigured);
        const serper = Boolean(data?.serperConfigured);
        if (cancelled) return;
        setSearchStatus(tavily ? 'active' : serper ? 'weak' : 'offline');
      } catch {
        if (!cancelled) setSearchStatus('unknown');
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, []);

  const editorialPersonality = useMemo(() => {
    const stage = String(storyStage || '').trim();
    if (stage === 'background_research' || stage === 'source_development') return 'Researcher';
    if (stage === 'verification') return 'Fact-Checker';
    if (stage === 'writing') return 'Copy Editor';
    if (stage === 'published') return 'Post-Publication Editor';
    if (stage === 'viability_assessment') return 'Assignment Editor';
    return 'Senior Editor';
  }, [storyStage]);

  const suggestedActions = useMemo(() => {
    const stage = String(storyStage || '').trim();
    const actions: Array<{ label: string; key: string }> = [];
    const claimNodes = nodes.filter(n => String(n.type) === 'claim');
    const evidenceNodes = nodes.filter(n => String(n.type) === 'evidence');

    if (stage === 'background_research' || stage === 'source_development') {
      actions.push(
        { key: 'foia', label: 'Draft FOIA/RTI request for key records related to this story.' },
        { key: 'public-record', label: 'Run a public-record search (corporate registry, court filings, tenders).' },
        { key: 'source-map', label: 'List 5 sources to contact and define outreach questions.' },
      );
    } else if (stage === 'verification') {
      const highRisk =
        claimNodes.find(n => (n.data as any)?.stamp === 'high_risk') ||
        claimNodes.find(n => Array.isArray((n.data as any)?.conflicts) && ((n.data as any)?.conflicts as any[]).length > 0) ||
        claimNodes[0];
      if (highRisk) {
        const label = String((highRisk.data as any)?.statement || (highRisk.data as any)?.label || 'a claim');
        actions.push({ key: 'corroborate', label: `Corroborate the high-risk claim: "${label}".` });
      }
      if (evidenceNodes.length === 0) {
        actions.push({ key: 'evidence-gap', label: 'Attach primary evidence items to the most important claims.' });
      } else {
        actions.push({ key: 'chain', label: 'Check chain-of-custody and legal clearance for each evidence item.' });
      }
    } else if (stage === 'writing') {
      const unAttributed = claimNodes.filter(n => {
        const d = (n.data as any) || {};
        const sources = Array.isArray(d.sources) ? d.sources : [];
        const single = String(d.source || '').trim();
        return sources.length === 0 && single.length === 0;
      });
      if (unAttributed.length > 0) {
        actions.push({ key: 'attrib', label: `Run attribution check: ${unAttributed.length} claim(s) lack sources.` });
      } else {
        actions.push({ key: 'attrib-ok', label: 'Run attribution check: ensure every claim cites a source.' });
      }
      actions.push({ key: 'defam', label: 'Scan for defamation risk: verify naming, allegations, and right of reply.' });
    } else {
      actions.push({ key: 'stage', label: 'Set the Story Stage to get targeted editorial guidance.' });
    }

    return actions.slice(0, 4);
  }, [nodes, storyStage]);

  const storageKey = useMemo(() => {
    const id = activeStory?.id ? String(activeStory.id) : 'global';
    return `spyglass_terminal_history_${id}`;
  }, [activeStory?.id]);

  const playTone = (opts: { type: OscillatorType; freq: number; durationMs: number; gain: number }) => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = opts.type;
      o.frequency.value = opts.freq;
      g.gain.value = 0;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(opts.gain, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + opts.durationMs / 1000);
      o.start(now);
      o.stop(now + opts.durationMs / 1000 + 0.02);
    } catch {}
  };

  const playSendClick = () => playTone({ type: 'square', freq: 1200, durationMs: 28, gain: 0.06 });
  const playReceiveDing = () => playTone({ type: 'sine', freq: 2400, durationMs: 65, gain: 0.05 });
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

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const prevKey = prevStoryIdRef.current ? `spyglass_terminal_history_${prevStoryIdRef.current}` : null;
    if (prevKey && prevKey !== storageKey) {
      try {
        localStorage.setItem(prevKey, JSON.stringify(messages.slice(-50)));
      } catch {}
    }
    prevStoryIdRef.current = String(activeStory?.id || 'global');
    hydratedRef.current = false;
    lastAssistantCountRef.current = 0;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-50));
          hydratedRef.current = true;
          lastAssistantCountRef.current = parsed.filter((m: any) => m?.role === 'assistant').length;
          return;
        }
      }
    } catch {}
    setMessages([]);
    hydratedRef.current = true;
  }, [storageKey, activeStory?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages, storageKey]);

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
    setMessages([]);
    (window.location as any).reload(true);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, suggestedActions.length]);

  useEffect(() => {
    setAssistantMessages(messages);
  }, [messages, setAssistantMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/web-search', { method: 'GET' });
        if (!resp.ok) {
          setSearchStatus('offline');
          return;
        }
        const data = (await resp.json()) as { tavilyConfigured?: unknown; serperConfigured?: unknown };
        const tavilyConfigured = Boolean(data?.tavilyConfigured);
        const serperConfigured = Boolean(data?.serperConfigured);
        if (tavilyConfigured) setSearchStatus('active');
        else if (serperConfigured) setSearchStatus('weak');
        else setSearchStatus('offline');
      } catch {
        setSearchStatus('offline');
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;
    if (assistantCount > lastAssistantCountRef.current) {
      playReceiveDing();
    }
    lastAssistantCountRef.current = assistantCount;
  }, [messages]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const next = new Set(nodes.map(n => String(n.id)));
    const prev = prevNodeIdsRef.current;
    const added: string[] = [];
    next.forEach(id => {
      if (!prev.has(id)) added.push(id);
    });
    prevNodeIdsRef.current = next;
    if (added.length === 0) return;
    const newest = nodes.find(n => String(n.id) === added[added.length - 1]);
    if (!newest) return;
    const label = String((newest.data as any)?.label || (newest.data as any)?.name || '').trim();
    const t = String(newest.type || '').toLowerCase();
    const headline = label ? `"${label}"` : 'a new node';
    const note =
      t === 'claim'
        ? `New claim ${headline}. Tag sources, then corroborate.`
        : t === 'evidence'
          ? `New evidence ${headline}. Chain-of-custody and clearance—now.`
          : t === 'source'
            ? `New source ${headline}. Handle with care—verify the angle.`
            : `New lead ${headline}. Log it, connect it, verify it.`;
    setMessages(prevMsgs => [...prevMsgs, { id: `asst-watch-${Date.now()}`, role: 'assistant' as const, content: note }].slice(-50));
  }, [nodes]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q) return;
    const requestId = (requestSeq.current += 1);
    playSendClick();
    setLoading(true);
    setError(null);
    setTimedOut(false);
    const shouldSearch = /\b(research|intel|wire|search|latest|news|reports|coverage|background|timeline|who is|what is)\b/i.test(q);
    setSearching(shouldSearch);
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
    }
    const now = new Date().toISOString();
    setMessages(prev => [...prev, { id: `user-${now}`, role: 'user', content: q }]);
    setInput('');
    timeoutIdRef.current = window.setTimeout(() => {
      if (requestSeq.current !== requestId) return;
      setTimedOut(true);
      setError('STATION OFFLINE');
      setLoading(false);
    }, 10_000);
    try {
      const res = await processTerminalCommand(q, {
        nodes: nodes.map(n => ({
          name: String((n.data as any)?.label || ''),
          type: String(n.type || ''),
          stamp: (n.data as any)?.stamp ? String((n.data as any)?.stamp) : undefined,
          verificationStatus: (n.data as any)?.verificationStatus ? String((n.data as any)?.verificationStatus) : undefined,
        })),
      }, { storyStage, editorialPersonality });
      if (requestSeq.current !== requestId) return;
      const intelWire = (res as any)?.parameters?.intelWire;
      if (intelWire && typeof intelWire === 'object') {
        setIntelWire(intelWire as any);
      }
      const safeResponse = safeString((res as any)?.response);
      const safeAction = safeString((res as any)?.action);
      const replyText = [safeResponse, safeAction ? `Action: ${safeAction}` : ''].filter(Boolean).join('\n');
      setMessages(prev => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: replyText || 'No response.' }]);
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
      setSearching(false);
    }
  };

  return (
    <div
      id="spyglass-terminal"
      className={`fixed bottom-4 right-4 z-[9999] w-[400px] h-[300px] bg-zinc-950 border border-zinc-800 shadow-2xl rounded flex flex-col font-mono transition-shadow ${loading ? 'shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse' : ''}`}
    >
      <div className="px-3 py-2 border-b border-brand-green/40 bg-brand-green flex items-center justify-between">
        <div>
          <div className="text-white text-xs tracking-wider">NEWSROOM TERMINAL</div>
          <div className="text-amber-50/80 text-[10px]">{editorialPersonality}</div>
        </div>
        <div className="flex items-center gap-2">
          <Satellite
            className={`w-4 h-4 ${searching ? 'text-emerald-200 drop-shadow-[0_0_10px_rgba(34,197,94,0.85)]' : 'text-white/70'}`}
          />
          <SearchIcon className={`w-4 h-4 ${searchStatus === 'active' ? 'text-emerald-200' : searchStatus === 'weak' ? 'text-amber-200' : searchStatus === 'offline' ? 'text-red-200' : 'text-white/70'}`} />
          <div className={`text-[10px] tracking-wider ${searchStatus === 'active' ? 'text-emerald-100' : searchStatus === 'weak' ? 'text-amber-100' : searchStatus === 'offline' ? 'text-red-100' : 'text-white/70'}`}>
            {searchStatus === 'active' ? 'SEARCH ACTIVE' : searchStatus === 'weak' ? 'SIGNAL WEAK' : searchStatus === 'offline' ? 'SEARCH OFFLINE' : 'SEARCH UNKNOWN'}
          </div>
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
          <style>{`
            @keyframes spyglassDot {
              0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
              40% { transform: translateY(-3px); opacity: 1; }
            }
          `}</style>
          {suggestedActions.length > 0 && (
            <div className="border border-zinc-800 rounded p-2 bg-black/30">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2">Suggested Actions</div>
              <div className="space-y-1">
                {suggestedActions.map(a => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setInput(a.label)}
                    className="w-full text-left text-xs text-zinc-200 hover:text-white bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(m => (
            <div
              key={m.id}
              className={`border border-zinc-800 rounded p-2 ${m.role === 'user' ? 'bg-zinc-900/40' : 'bg-zinc-950'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-zinc-200">
                  {m.role === 'assistant' ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-zinc-500" />
                  )}
                  <span className="text-[10px] uppercase tracking-wider">{m.role === 'assistant' ? 'Senior Editor' : 'You'}</span>
                </div>
              </div>
              <div className="text-zinc-300 text-xs whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="border border-zinc-800 rounded p-2 bg-zinc-950">
              <div className="flex items-center gap-2 text-zinc-200 mb-1">
                <Loader2 className="w-4 h-4 animate-spin text-green-400" />
                <span className="text-[10px] uppercase tracking-wider">Senior Editor is typing</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-green-400" style={{ animation: 'spyglassDot 1.1s infinite', animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-green-400" style={{ animation: 'spyglassDot 1.1s infinite', animationDelay: '160ms' }} />
                  <span className="w-1 h-1 rounded-full bg-green-400" style={{ animation: 'spyglassDot 1.1s infinite', animationDelay: '320ms' }} />
                </span>
              </div>
              <div className="text-zinc-500 text-xs">Hold.</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="p-2 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            className="flex-1 resize-none bg-black/40 border border-zinc-800 rounded px-2 py-2 text-zinc-200 placeholder:text-zinc-600 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="Ask a question..."
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-3 py-2 bg-brand-green border border-brand-green/60 rounded text-white hover:opacity-90 disabled:opacity-50 text-xs font-mono"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}
