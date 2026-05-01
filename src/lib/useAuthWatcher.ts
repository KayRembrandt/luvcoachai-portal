"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export function useAuthWatcher() {
  const router = useRouter();

  useEffect(() => {
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session) {
          try {
            await supabaseBrowser.auth.signOut();
          } catch {}

          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith("sb-"))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}

          router.replace("/login");
        }
      }
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [router]);
}