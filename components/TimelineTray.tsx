"use client";

import { useMemo } from "react";
import type { Node } from "reactflow";

type Props = {
  open: boolean;
  nodes: Node[];
  onSelectNode?: (nodeId: string) => void;
};

export default function TimelineTray({ open, nodes, onSelectNode }: Props) {
  const items = useMemo(() => {
    const events = nodes
      .map((n) => {
        const eventDate = String((n.data as any)?.eventDate || "").trim();
        if (!eventDate) return null;
        const label = String((n.data as any)?.label || (n.data as any)?.name || "").trim();
        return { id: n.id, eventDate, label: label || "Untitled" };
      })
      .filter(Boolean) as Array<{ id: string; eventDate: string; label: string }>;

    events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return events;
  }, [nodes]);

  return (
    <div
      className={`absolute left-0 right-0 bottom-0 z-[9000] transition-transform duration-300 ${
        open ? "translate-y-0" : "translate-y-full"
      } ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <div className="border-t border-zinc-800 bg-zinc-950/90 backdrop-blur px-4 py-3">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-serif mb-2">
          Investigative Timeline
        </div>

        {items.length === 0 ? (
          <div className="text-xs text-zinc-500 font-serif">No dated leads yet.</div>
        ) : (
          <div className="relative">
            <div className="absolute left-0 right-0 top-5 h-px bg-zinc-800" />
            <div className="flex items-stretch gap-3 overflow-x-auto pb-1 pr-2">
              {items.map((it) => {
                const formatted = (() => {
                  try {
                    const d = new Date(`${it.eventDate}T00:00:00`);
                    return new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    }).format(d);
                  } catch {
                    return it.eventDate;
                  }
                })();

                return (
                  <button
                    key={it.id}
                    className="relative flex-shrink-0 w-[160px] bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-left hover:border-zinc-600 hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      if (onSelectNode) onSelectNode(it.id);
                      else window.dispatchEvent(new CustomEvent("spyglass-center-node", { detail: { id: it.id } }));
                    }}
                  >
                    <div className="absolute -top-1.5 left-3 w-3 h-3 rounded-full bg-zinc-950 border border-zinc-700" />
                    <div className="text-[10px] text-zinc-300 font-serif">{formatted}</div>
                    <div className="mt-1 text-xs text-zinc-100 truncate">{it.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

