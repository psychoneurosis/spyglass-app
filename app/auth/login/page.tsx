"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome } from "lucide-react";
import { signInWithGoogle } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [method, setMethod] = useState<"google" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // no-op
  }, []);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(String(e?.message || "Google sign-in failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-6">
        <div className="mb-6 text-center">
          <div className="text-2xl font-serif text-zinc-100 tracking-widest">SPYGLASS</div>
          <div className="text-zinc-400 text-sm font-serif">THE REPORTER'S DESK</div>
        </div>

        <div className="flex mb-4 border-b border-zinc-800">
          <button
            className={`flex-1 py-2 text-sm ${authMode === "signin" ? "text-white border-b-2 border-white" : "text-zinc-400"}`}
            onClick={() => setAuthMode("signin")}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2 text-sm ${authMode === "signup" ? "text-white border-b-2 border-white" : "text-zinc-400"}`}
            onClick={() => setAuthMode("signup")}
            disabled={loading}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setMethod("google");
              handleGoogleAuth();
            }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 rounded px-4 py-2 hover:bg-zinc-200 transition-colors"
          >
            <Chrome className="w-4 h-4" />
            Continue with Google
          </button>
        </div>

        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
        {success && <div className="mt-3 text-sm text-emerald-500">{success}</div>}
      </div>
    </div>
  );
}
