"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { coachingRequest } from "@/lib/coaching/client";
import type { Capabilities } from "@/lib/coaching/types";

export default function CoachingNavLink() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  useEffect(
    () => {
      let live = true;
      void coachingRequest<Capabilities>().then(c => {
        if (live) setAllowed(c.author);
      }).catch(
        () => {
          if (live) setAllowed(false);
        }
      );
      return () => {
        live = false;
      };
    },
    [pathname]
  );
  if (!allowed) return null;
  return (
    <Link
      href="/coaching"
      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
    >
      Coaching
    </Link>
  );
}
