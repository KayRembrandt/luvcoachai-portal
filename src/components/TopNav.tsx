"use client";

import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type StaffRole = "staff" | "henry" | "admin";
type NavItem = { href: string; label: string };

const row1: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/users/search", label: "User Search" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/photo-review", label: "Photo Review" },
  { href: "/library-review", label: "Library Review" },
  { href: "/jobs", label: "Jobs" },
  { href: "/safety/blocks", label: "User Blocked" },
  { href: "/henry", label: "Henry Desk" },
  { href: "/mira", label: "Mira" },
];

const row2AdminOnly: NavItem[] = [
  { href: "/staff", label: "Staff List" },
  { href: "/safety", label: "Safety" },
  { href: "/system", label: "System" },
  { href: "/admin/profiles-db", label: "Profiles DB" },
  { href: "/admin/library", label: "Library" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/photo-review/all-photos-pending", label: "All Photo" },
];

function NavRow({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

type TopNavProps = {
  role: StaffRole;
  firstName?: string | null;
  email?: string | null;
};

export default function TopNav({ role, firstName, email }: TopNavProps) {
  const showAdminRow = role === "admin";

  const handleLogout = async () => {
    try {
      const sb: any =
        typeof supabaseBrowser === "function"
          ? (supabaseBrowser as any)()
          : (supabaseBrowser as any);

      await sb.auth.signOut();
    } catch (e) {
      console.error("TopNav logout signOut failed:", e);
    }

    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error("TopNav logout localStorage clear failed:", e);
    }

    window.location.assign("/login");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-slate-100/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/luvcoachai-logo HeartOnly.png"
              alt="LuvCoachAI"
              width={56}
              height={56}
              className="h-12 w-auto rounded-md"
            />

            <div>
              <div className="text-sm font-semibold text-slate-900">
                LuvCoachAI Portal
              </div>
              <div className="text-xs text-slate-600">
                Staff Console • Role:{" "}
                <span className="font-medium text-slate-800">{role}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-700">
              Hello, {firstName?.trim() || email?.trim() || "staff"}
              <span className="ml-2 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
                {role}
              </span>
            </div>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              Local Dev
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>

        <div className="mt-3">
          <NavRow items={row1} />
        </div>

        {showAdminRow && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <NavRow items={row2AdminOnly} />
          </div>
        )}
      </div>
    </header>
  );
}