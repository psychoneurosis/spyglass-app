import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Search as SearchIcon, FileText, Clock, User as UserIcon, Calendar, Lightbulb, Paperclip, Star } from 'lucide-react';
import { Colors } from '@/lib/constants';
import { useSpyglassStore } from '@/lib/store';

type DocData = {
  label: string;
  role?: string;
  credibility?: 1 | 2 | 3 | 4 | 5;
  anonymity?: boolean;
  contactInfo?: string;
  quotes?: string[];
  protectIdentity?: boolean;
  protectedName?: string;
  protectedContactInfo?: string;
  statement?: string;
  verificationStatus?: 'unverified' | 'verified' | 'debunked' | 'partially_true';
  factCheckNotes?: string;
  evidenceType?: 'document' | 'photo' | 'data';
  acquisitionMethod?: 'FOIA' | 'leak' | 'public_record';
  legalClearance?: boolean;
  stamp?: 'verified' | 'corroborated' | 'high_risk';
  eventDate?: string;
  sources?: string[];
  source?: string;
  fileType?: string;
  previewUrl?: string;
  textPreview?: string;
  fullText?: string;
  originSentence?: string;
  sourceFile?: string;
  conflicts?: any[];
  onInspect?: (payload: { type: string; url?: string; text?: string; label: string; originSentence?: string; sourceFile?: string; conflicts?: any[] }) => void;
};

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MOCK_SECURITY_KEY = 'SPYGLASS';

function decryptProtected(cipherB64: string): string {
  try {
    if (typeof window === 'undefined') return '';
    const bytesStr = atob(cipherB64);
    const k = MOCK_SECURITY_KEY || '0';
    let out = '';
    for (let i = 0; i < bytesStr.length; i += 1) {
      const kc = k.charCodeAt(i % k.length);
      out += String.fromCharCode((bytesStr.charCodeAt(i) ^ kc) & 0xff);
    }
    return out;
  } catch {
    return '';
  }
}

const BaseNode = ({ id, data, style, typeLabel, selected }: NodeProps<DocData> & { style: string, typeLabel: string }) => {
  const showDelete = useMemo(() => !!selected, [selected]);
  const flash = !!(data as any)?.highlight;
  const isRedacted = useSpyglassStore(s => s.isRedacted);
  const securityUnlocked = useSpyglassStore(s => s.securityUnlocked);
  const protectIdentity = (data as any)?.protectIdentity === true;
  const shouldRedactName =
    isRedacted ||
    (typeLabel === 'SOURCE' && ((data as any)?.anonymity === true || (protectIdentity && !securityUnlocked)));
  const color = typeLabel === 'SOURCE' ? Colors.node.source
    : typeLabel === 'EVIDENCE' ? Colors.node.evidence
    : typeLabel === 'CLAIM' ? Colors.node.claim
    : typeLabel === 'PUBLICATION' ? Colors.node.publication
    : Colors.border.default;
  const bgColor = hexToRgba(color, 0.2);
  const IconEl = typeLabel === 'SOURCE' ? <UserIcon className="w-4 h-4 text-white" />
    : typeLabel === 'EVIDENCE' ? <FileText className="w-4 h-4 text-white" />
    : typeLabel === 'CLAIM' ? <Lightbulb className="w-4 h-4 text-white" />
    : typeLabel === 'PUBLICATION' ? <Calendar className="w-4 h-4 text-white" />
    : null;
  const vStatus = (data as any)?.verificationStatus;
  const borderStyleClass = vStatus === 'unverified' ? 'border-dashed' : 'border-solid';
  const glowClass = vStatus === 'verified' ? 'shadow-[0_0_10px_rgba(16,185,129,0.5)]' : '';
  const badge =
    vStatus === 'verified'
      ? { text: 'VERIFIED', className: 'bg-emerald-400 text-zinc-950 border-emerald-300' }
      : vStatus === 'debunked'
        ? { text: 'DEBUNKED', className: 'bg-red-400 text-zinc-950 border-red-300' }
        : vStatus === 'partially_true'
          ? { text: 'PARTIALLY TRUE', className: 'bg-amber-300 text-zinc-950 border-amber-200' }
          : vStatus === 'unverified'
            ? { text: 'UNVERIFIED', className: 'bg-zinc-950 text-white border-white/20' }
            : null;
  const stamp = (data as any)?.stamp as DocData['stamp'] | undefined;
  const attachedSources = (Array.isArray((data as any)?.sources) ? ((data as any).sources as unknown[]) : [])
    .map(x => String(x))
    .filter(Boolean);
  const eventDate = String((data as any)?.eventDate || '');
  const credibility = useMemo(() => {
    const raw = Number((data as any)?.credibility);
    if (!Number.isFinite(raw)) return 3 as const;
    if (raw <= 1) return 1 as const;
    if (raw === 2) return 2 as const;
    if (raw === 3) return 3 as const;
    if (raw === 4) return 4 as const;
    return 5 as const;
  }, [data]);
  const stampConfig =
    stamp === 'verified'
      ? { text: 'VERIFIED', color: '#dc2626' }
      : stamp === 'corroborated'
        ? { text: 'CORROBORATED', color: '#2563eb' }
        : stamp === 'high_risk'
          ? { text: 'CAUTION / RISK', color: '#facc15' }
          : null;
  const protectedName = String((data as any)?.protectedName || '');
  const labelText = String(data.label || '');
  const displayLabel = useMemo(() => {
    if (typeLabel !== 'SOURCE') return labelText;
    if (!protectIdentity) return labelText;
    if (!securityUnlocked) return 'REDACTED SOURCE';
    const dec = protectedName ? decryptProtected(protectedName) : '';
    return dec || 'REDACTED SOURCE';
  }, [labelText, protectIdentity, securityUnlocked, protectedName, typeLabel]);
  return (
    <>
    <style>{`
      @keyframes fadeSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes glitch {
        0% { clip-path: inset(50% 0 30% 0); transform: translate(-5px,0); }
        20% { clip-path: inset(20% 0 60% 0); transform: translate(5px,0); }
        40% { clip-path: inset(40% 0 40% 0); transform: translate(-5px,0); }
        60% { clip-path: inset(80% 0 5% 0); transform: translate(5px,0); }
        80% { clip-path: inset(10% 0 70% 0); transform: translate(-5px,0); }
        100% { clip-path: inset(30% 0 50% 0); transform: translate(0,0); }
      }
      .spyglass-stamp {
        position: absolute;
        top: 8px;
        right: 8px;
        transform: rotate(-15deg);
        padding: 6px 8px;
        border: 2px solid currentColor;
        border-radius: 4px;
        font-weight: 900;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        opacity: 0.78;
        pointer-events: none;
        mix-blend-mode: multiply;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.25),
          1px 1px 0 rgba(255,255,255,0.06);
        background:
          repeating-linear-gradient(
            135deg,
            rgba(255,255,255,0.05) 0px,
            rgba(255,255,255,0.05) 2px,
            rgba(0,0,0,0) 2px,
            rgba(0,0,0,0) 5px
          );
        text-shadow: 0 0 1px rgba(0,0,0,0.2);
      }
      .spyglass-stamp::before {
        content: "";
        position: absolute;
        inset: -3px;
        border: 1px dashed currentColor;
        opacity: 0.28;
        transform: rotate(1deg);
      }
    `}</style>
    <div 
      className={`px-4 py-2 shadow-md rounded-md min-w-[150px] relative group ${style} ${borderStyleClass} ${glowClass} ${flash ? 'shadow-[0_0_14px_rgba(220,38,38,0.5)]' : ''} ${(data as any)?.conflicts?.length ? 'after:content-[""] after:absolute after:inset-0 after:bg-yellow-500/10 after:animate-[glitch_2s_infinite]' : ''}`}
      style={{ animation: 'fadeSlideUp 0.4s ease-out forwards', backgroundColor: bgColor, borderColor: color }}
    >
      {selected && (
        <div className="absolute inset-0 rounded-md ring-2 ring-brand-green/60 shadow-[0_0_15px_rgba(107,112,66,0.28)] animate-pulse pointer-events-none z-50" />
      )}
      {(data as any)?.conflicts?.length > 0 && (
         <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded uppercase tracking-wider animate-pulse z-50">
            CONFLICT
         </div>
      )}
      {(data as any)?.timestamp && (
        <div className="absolute top-1 left-1 flex items-center gap-1 px-2 py-[2px] rounded bg-zinc-800 border border-zinc-700 text-[10px] text-yellow-300">
          <Clock className="w-3 h-3" />
          <span className={isRedacted ? 'bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-yellow-300 group-hover:blur-none' : ''}>
            {String((data as any)?.timestamp)}
          </span>
        </div>
      )}
      {typeLabel === 'CLAIM' && badge && (
        <div className={`absolute top-1 right-1 px-2 py-[2px] rounded border text-[9px] font-black tracking-widest ${badge.className}`}>
          {badge.text}
        </div>
      )}
      {attachedSources.length > 0 && (
        <div className="absolute top-1 right-1 z-50 group/sources pointer-events-auto">
          <div className="w-6 h-6 rounded bg-zinc-900/80 border border-zinc-700 flex items-center justify-center">
            <Paperclip className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <div className="hidden group-hover/sources:block absolute right-0 top-7 w-[220px] bg-zinc-950 border border-zinc-800 rounded shadow-2xl p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Attached Sources</div>
            <div className="space-y-1 max-h-[140px] overflow-y-auto">
              {attachedSources.map((s, idx) => (
                <div key={`${s}-${idx}`} className="text-xs text-zinc-200 truncate">
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {stampConfig && (
        <div className="spyglass-stamp" style={{ color: stampConfig.color, top: attachedSources.length > 0 ? 30 : 8 }}>
          {stampConfig.text}
        </div>
      )}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('spyglass-delete-node', { detail: { id } }))}
        className={`absolute -top-2 -right-2 bg-red-900/70 text-white rounded-full w-6 h-6 flex items-center justify-center border border-red-800 opacity-0 group-hover:opacity-100 transition-opacity ${showDelete ? 'opacity-100' : ''}`}
        title="Delete node"
      >
        ✕
      </button>
      <Handle type="target" position={Position.Top} className="w-16 !bg-zinc-500" />
      
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <div className={isRedacted ? 'text-[10px] uppercase tracking-widest opacity-60 bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-white group-hover:blur-none' : 'text-[10px] uppercase tracking-widest opacity-60 text-white'}>
            {typeLabel}
          </div>
          {IconEl}
        </div>
        <div className={shouldRedactName ? 'text-sm font-bold mb-2 bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-white group-hover:blur-none' : 'text-sm font-bold text-white mb-2'}>
          {typeLabel === 'CLAIM' ? String((data as any)?.statement || data.label) : displayLabel}
        </div>
        {typeLabel === 'SOURCE' && (
          <div
            className="flex items-center gap-1 mb-2"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {([1, 2, 3, 4, 5] as const).map((n) => {
              const active = n <= credibility;
              return (
                <button
                  key={n}
                  type="button"
                  className="leading-none"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('spyglass-update-node-data', { detail: { id, patch: { credibility: n } } }));
                  }}
                  aria-label={`Set credibility ${n} of 5`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${active ? 'text-yellow-300' : 'text-zinc-600'}`}
                    style={{ fill: active ? '#facc15' : 'transparent' }}
                  />
                </button>
              );
            })}
          </div>
        )}
        <div
          className="mb-2"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="date"
            value={eventDate}
            onChange={(e) => {
              const next = e.target.value || '';
              window.dispatchEvent(new CustomEvent('spyglass-update-node-data', { detail: { id, patch: { eventDate: next || null } } }));
            }}
            className="w-[140px] bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 font-serif focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        {typeLabel === 'DOCUMENT' && (
          <div className="mb-2">
            {data.fileType?.startsWith('image/') && data.previewUrl && (
              <div className="bg-white p-1 rounded border border-white inline-block">
                <img
                  src={data.previewUrl}
                  alt={data.label}
                  className="w-[120px] h-[80px] object-cover filter grayscale"
                />
              </div>
            )}
            {data.fileType === 'text/plain' && (
              <div className="flex items-center gap-2 text-zinc-300 text-xs">
                <FileText className="w-4 h-4" />
                <span className={isRedacted ? 'truncate max-w-[140px] bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-zinc-300 group-hover:blur-none' : 'truncate max-w-[140px]'}>
                  {(data.textPreview || '').slice(0, 20)}
                </span>
              </div>
            )}
            {data.fileType === 'application/pdf' && (
              <div className="flex items-center gap-2 text-zinc-300 text-xs">
                <FileText className="w-4 h-4" />
                <span className={isRedacted ? 'truncate max-w-[140px] bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-zinc-300 group-hover:blur-none' : 'truncate max-w-[140px]'}>
                  PDF Document
                </span>
              </div>
            )}
          </div>
        )}
        {data.source && (
          <div className={isRedacted ? 'text-[10px] border-t border-zinc-800 pt-1 mt-1 truncate max-w-[140px] bg-black text-transparent blur-md rounded-sm px-1 group-hover:bg-transparent group-hover:text-zinc-500 group-hover:blur-none' : 'text-[10px] text-zinc-500 border-t border-zinc-800 pt-1 mt-1 truncate max-w-[140px]'}>
            Src: {data.source}
          </div>
        )}
        {(typeLabel === 'DOCUMENT' || data.originSentence || data.sourceFile) && (
          <div className="mt-2">
            <button
              onClick={() => data.onInspect?.({ 
                type: data.fileType || '', 
                url: data.previewUrl, 
                text: data.fullText, 
                label: data.label,
                originSentence: data.originSentence,
                sourceFile: data.sourceFile,
                conflicts: data.conflicts
              })}
              className={isRedacted ? 'flex items-center gap-1 text-xs bg-black text-transparent blur-md rounded-sm px-1 py-0.5 group-hover:bg-transparent group-hover:text-zinc-300 group-hover:blur-none hover:group-hover:text-white' : 'flex items-center gap-1 text-xs text-zinc-300 hover:text-white'}
              title="Open File Intel"
            >
              <SearchIcon className="w-4 h-4" />
              Inspect
            </button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-16 !bg-zinc-500" />
    </div>
    </>
  );
};

export const SourceNode = memo((props: NodeProps) => {
  return <BaseNode {...props} style="border" typeLabel="SOURCE" />;
});
SourceNode.displayName = 'SourceNode';

export const EvidenceNode = memo((props: NodeProps) => {
  return <BaseNode {...props} style="border" typeLabel="EVIDENCE" />;
});
EvidenceNode.displayName = 'EvidenceNode';

export const ClaimNode = memo((props: NodeProps) => {
  return <BaseNode {...props} style="border" typeLabel="CLAIM" />;
});
ClaimNode.displayName = 'ClaimNode';

export const PublicationNode = memo((props: NodeProps) => {
  return <BaseNode {...props} style="border" typeLabel="PUBLICATION" />;
});
PublicationNode.displayName = 'PublicationNode';
