"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        window.location.href = data.user ? "/dashboard" : "/";
      } catch {
        window.location.href = "/";
      }
    })();
  }, []);

  return (
    <main className="min-h-screen w-screen bg-white flex items-center justify-center">
      <div className="text-zinc-900 font-serif text-sm tracking-wider">
        AUTH CALLBACK...
      </div>
    </main>
  );
}

