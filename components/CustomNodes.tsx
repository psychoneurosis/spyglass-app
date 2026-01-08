import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Search as SearchIcon, FileText, Clock, User as UserIcon, MapPin, Calendar, Lightbulb } from 'lucide-react';
import { Colors } from '@/lib/constants';

type DocData = {
  label: string;
  source?: string;
  fileType?: string;
  previewUrl?: string;
  textPreview?: string;
  fullText?: string;
  conflicts?: any[];
  onInspect?: (payload: { type: string; url?: string; text?: string; label: string; conflicts?: any[] }) => void;
};

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const BaseNode = ({ id, data, style, typeLabel, selected }: NodeProps<DocData> & { style: string, typeLabel: string }) => {
  const showDelete = useMemo(() => !!selected, [selected]);
  const flash = !!(data as any)?.highlight;
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
    `}</style>
    <div 
      className={`px-4 py-2 shadow-md rounded-md min-w-[150px] relative group ${style} ${borderStyleClass} ${glowClass} ${flash ? 'shadow-[0_0_14px_rgba(220,38,38,0.5)]' : ''} ${(data as any)?.conflicts?.length ? 'after:content-[""] after:absolute after:inset-0 after:bg-yellow-500/10 after:animate-[glitch_2s_infinite]' : ''}`}
      style={{ animation: 'fadeSlideUp 0.4s ease-out forwards', backgroundColor: bgColor, borderColor: color }}
    >
      {selected && (
        <div className="absolute inset-0 rounded-md ring-2 ring-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)] animate-pulse pointer-events-none z-50" />
      )}
      {(data as any)?.conflicts?.length > 0 && (
         <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded uppercase tracking-wider animate-pulse z-50">
            CONFLICT
         </div>
      )}
      {(data as any)?.timestamp && (
        <div className="absolute top-1 left-1 flex items-center gap-1 px-2 py-[2px] rounded bg-zinc-800 border border-zinc-700 text-[10px] text-yellow-300">
          <Clock className="w-3 h-3" />
          <span>{String((data as any)?.timestamp)}</span>
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
          <div className="text-[10px] uppercase tracking-widest opacity-60">{typeLabel}</div>
          {IconEl}
        </div>
        <div className="text-sm font-bold text-white mb-2">{data.label}</div>
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
                <span className="truncate max-w-[140px]">{(data.textPreview || '').slice(0, 20)}</span>
              </div>
            )}
            {data.fileType === 'application/pdf' && (
              <div className="flex items-center gap-2 text-zinc-300 text-xs">
                <FileText className="w-4 h-4" />
                <span className="truncate max-w-[140px]">PDF Document</span>
              </div>
            )}
          </div>
        )}
        {data.source && (
            <div className="text-[10px] text-zinc-500 border-t border-zinc-800 pt-1 mt-1 truncate max-w-[140px]">
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
              className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
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
