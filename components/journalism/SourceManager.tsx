"use client";

import { useMemo, useState } from "react";
import type { Node } from "reactflow";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useSpyglassStore } from "@/lib/store";

const MOCK_SECURITY_KEY = "SPYGLASS";

function xorBytes(input: string, key: string): Uint8Array {
  const a = new Uint8Array(input.length);
  const k = key || "0";
  for (let i = 0; i < input.length; i += 1) {
    const kc = k.charCodeAt(i % k.length);
    a[i] = (input.charCodeAt(i) ^ kc) & 0xff;
  }
  return a;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) a[i] = s.charCodeAt(i);
  return a;
}

function encryptString(plain: string, key: string): string {
  const bytes = xorBytes(plain, key);
  return bytesToBase64(bytes);
}

function decryptString(cipherB64: string, key: string): string {
  const bytes = base64ToBytes(cipherB64);
  const k = key || "0";
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const kc = k.charCodeAt(i % k.length);
    out += String.fromCharCode((bytes[i] ^ kc) & 0xff);
  }
  return out;
}

function maskValue(value: string): string {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

export default function SourceManager({ nodes }: { nodes: Node[] }) {
  const securityUnlocked = useSpyglassStore((s) => s.securityUnlocked);
  const setSecurityUnlocked = useSpyglassStore((s) => s.setSecurityUnlocked);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  const sources = useMemo(() => nodes.filter((n) => String(n.type) === "source"), [nodes]);

  const handleUnlock = () => {
    const k = String(keyInput || "").trim();
    if (k === MOCK_SECURITY_KEY) setSecurityUnlocked(true);
    else setSecurityUnlocked(false);
  };

  const updateNodePatch = (id: string, patch: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("spyglass-update-node-data", { detail: { id, patch } }));
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Source Protection Protocol</div>
          <div className="text-xs text-zinc-200">Identity vault (mock)</div>
        </div>
        <div
          className={`text-[10px] px-2 py-1 rounded border ${securityUnlocked ? "bg-emerald-900/30 text-emerald-200 border-emerald-800/60" : "bg-zinc-900/40 text-zinc-300 border-zinc-800"}`}
        >
          {securityUnlocked ? "UNLOCKED" : "LOCKED"}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 relative">
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            type={showKey ? "text" : "password"}
            placeholder="Security Key"
            className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
            title={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleUnlock}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 hover:bg-zinc-800 text-xs inline-flex items-center gap-2"
        >
          <Unlock className="w-4 h-4" />
          Unlock
        </button>
        <button
          type="button"
          onClick={() => {
            setSecurityUnlocked(false);
            setKeyInput("");
          }}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 hover:bg-zinc-800 text-xs inline-flex items-center gap-2"
        >
          <Lock className="w-4 h-4" />
          Lock
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No source nodes yet.</div>
      ) : (
        <div className="space-y-2">
          {sources.map((n) => {
            const d = (n.data as any) || {};
            const protectIdentity = d.protectIdentity === true;
            const encName = String(d.protectedName || "");
            const encContact = String(d.protectedContactInfo || "");

            const displayName = protectIdentity
              ? securityUnlocked && encName
                ? decryptString(encName, MOCK_SECURITY_KEY)
                : "REDACTED SOURCE"
              : String(d.label || "");

            const displayContact = protectIdentity
              ? securityUnlocked && encContact
                ? decryptString(encContact, MOCK_SECURITY_KEY)
                : maskValue(String(d.contactInfo || encContact || ""))
              : String(d.contactInfo || "");

            return (
              <div key={n.id} className="bg-zinc-900/40 border border-zinc-800 rounded p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-200 font-semibold truncate">{displayName || "Untitled Source"}</div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      Contact: {displayContact ? displayContact : <span className="text-zinc-600">None</span>}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-zinc-200 select-none">
                    <input
                      type="checkbox"
                      checked={protectIdentity}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (!next) {
                          if (!securityUnlocked) return;
                          const nextName = encName ? decryptString(encName, MOCK_SECURITY_KEY) : String(d.label || "");
                          const nextContact = encContact ? decryptString(encContact, MOCK_SECURITY_KEY) : String(d.contactInfo || "");
                          updateNodePatch(n.id, {
                            protectIdentity: false,
                            label: nextName || null,
                            contactInfo: nextContact || null,
                            protectedName: null,
                            protectedContactInfo: null,
                          });
                          return;
                        }

                        const rawName = String(d.label || "");
                        const rawContact = String(d.contactInfo || "");
                        updateNodePatch(n.id, {
                          protectIdentity: true,
                          protectedName: rawName ? encryptString(rawName, MOCK_SECURITY_KEY) : null,
                          protectedContactInfo: rawContact ? encryptString(rawContact, MOCK_SECURITY_KEY) : null,
                          label: rawName ? "REDACTED SOURCE" : null,
                          contactInfo: null,
                        });
                      }}
                      className="accent-yellow-300"
                    />
                    Protect Identity
                  </label>
                </div>
                {protectIdentity && !securityUnlocked && (
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Protected fields are masked until the Security Key is entered.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
