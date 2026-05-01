"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function PortalAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      // allow login page itself
      if (
  pathname?.startsWith("/login") ||
  pathname?.startsWith("/apply") ||
  pathname?.startsWith("/forgot-password") ||
  pathname?.startsWith("/reset-password")
) {
  return;
}

      try {
        const res = await fetch("/api/staff/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));

        if (!alive) return;

        const isStaff = res.ok && json?.is_staff === true;

        if (!isStaff) {
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith("sb-"))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}

          router.replace("/login");
        }
      } catch {
        if (!alive) return;
        router.replace("/login");
      }
    }

    void checkAuth();

    return () => {
      alive = false;
    };
  }, [pathname, router]);

  return null;
}