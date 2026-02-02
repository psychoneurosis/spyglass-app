"use client";

import { useMemo } from "react";
import type { Node } from "reactflow";
import { AlertTriangle } from "lucide-react";

export default function EthicsChecklist({ nodes }: { nodes: Node[] }) {
  const claims = useMemo(() => nodes.filter((n) => String(n.type) === "claim"), [nodes]);

  const updateNodePatch = (id: string, patch: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("spyglass-update-node-data", { detail: { id, patch } }));
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
      <div className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">Ethics Checklist</div>
        <div className="text-xs text-zinc-200">Right-to-reply tracker</div>
      </div>

      {claims.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No claim nodes yet.</div>
      ) : (
        <div className="space-y-3">
          {claims.map((n) => {
            const d = (n.data as any) || {};
            const statement = String(d.statement || d.label || "").trim() || "Untitled claim";
            const contacted = d.rightToReplyContacted === true;
            const deadline = String(d.rightToReplyDeadline || "");
            const response = String(d.rightToReplyResponse || "");
            const stamp = String(d.stamp || "").toLowerCase();
            const vStatus = String(d.verificationStatus || "").toLowerCase();
            const isVerified = stamp === "verified" || vStatus === "verified";
            const showWarning = isVerified && !contacted;

            return (
              <div key={n.id} className="bg-zinc-900/40 border border-zinc-800 rounded p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      {showWarning ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-300 flex-shrink-0 mt-[2px]" />
                      ) : null}
                      <div className="text-xs text-zinc-200 font-semibold">
                        {statement}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-200 select-none">
                    <input
                      type="checkbox"
                      checked={contacted}
                      onChange={(e) => {
                        updateNodePatch(n.id, { rightToReplyContacted: e.target.checked });
                      }}
                      className="accent-emerald-400"
                    />
                    Subject contacted for comment?
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Deadline Given</div>
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => updateNodePatch(n.id, { rightToReplyDeadline: e.target.value || null })}
                        className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Response Received</div>
                      <input
                        value={response}
                        onChange={(e) => updateNodePatch(n.id, { rightToReplyResponse: e.target.value || null })}
                        placeholder="Yes / No / Notes"
                        className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </div>
                  </div>

                  {showWarning ? (
                    <div className="text-[11px] text-yellow-200 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1">
                      Verified claim missing right-to-reply log.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

