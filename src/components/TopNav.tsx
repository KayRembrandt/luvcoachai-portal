"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import CoachingNavLink from "@/components/coaching/CoachingNavLink";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PortalIcon, type PortalIconName } from "@/components/portal/PortalIcon";
import styles from "@/components/portal/navigation.module.css";

type StaffRole = "staff" | "henry" | "admin";

type NavItem = { href: string; label: string; };
const row1: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/users/search", label: "User Search" },
  //{ href: "/onboarding", label: "Onboarding" },
  { href: "/photo-review", label: "Photo Review" },
  { href: "/library-review", label: "Library Review" },
  { href: "/session-talks", label: "Session Talks" },
 // { href: "/jobs", label: "Jobs" },
  { href: "/safety/blocks", label: "User Blocked" },
  { href: "/henry", label: "Henry Desk" },
  //{ href: "/mira", label: "Mira" },
];
const row2AdminOnly: NavItem[] = [
  { href: "/staff-applications", label: "Staff Application" },
  { href: "/admin/staff-access", label: "Staff Access" },
  { href: "/staff", label: "Staff List" },
  { href: "/admin/photo-review/team", label: "Photo Review Team" },
  //{ href: "/safety", label: "Safety" },
  //{ href: "/system", label: "System" },
  //{ href: "/admin/profiles-db", label: "Profiles DB" },
 // { href: "/admin/library", label: "Library" },
 // { href: "/admin/audit", label: "Audit Log" },
  //{ href: "/photo-review/all-photos-pending", label: "All Photo" },
];
const navigationIcons: Record<string, PortalIconName> = {
  "/": "home",
  "/users/search": "search",
  "/onboarding": "clipboard",
  "/photo-review": "photo",
  "/library-review": "book",
  "/session-talks": "calendar",
  "/jobs": "clipboard",
  "/safety/blocks": "shield",
  "/henry": "chat",
  "/mira": "heart",
  "/staff-applications": "clipboard",
  "/admin/staff-access": "lock",
  "/staff": "people",
  "/admin/photo-review/team": "people",
  "/safety": "shield",
  "/system": "settings",
  "/admin/profiles-db": "database",
  "/admin/library": "book",
  "/admin/audit": "clipboard",
  "/photo-review/all-photos-pending": "photo",
};

function NavRow({ items, activeHref, label, children }: {
  items: NavItem[];
  activeHref: string | null;
  label: string;
  children?: ReactNode;
}) {
  return (
    <nav className={styles.navRow} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.navLink}
          aria-current={activeHref === item.href ? "page" : undefined}
        >
          <PortalIcon name={navigationIcons[item.href] ?? "clipboard"} />
          <span>
            {item.label}
          </span>
        </Link>
      ))}
      {children}
    </nav>
  );
}

type TopNavProps = { role: StaffRole; firstName?: string | null; email?: string | null; };

export default function TopNav({ role, firstName, email }: TopNavProps) {
  const pathname = usePathname();
  const showAdminRow = role === "admin";
  const availableItems = showAdminRow ? [...row1, ...row2AdminOnly] : row1;
  const activeHref = pathname?.startsWith("/users/")
    ? "/users/search"
    : [...availableItems].sort((a, b) => b.href.length - a.href.length).find((item) => (
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname?.startsWith(`${item.href}/`)
    ))?.href ?? null;
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
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.identityRow}>
          <div className={styles.identity}>
            <Image
              src="/branding/luvcoachai-logo.png"
              alt="LuvCoachAI"
              width={600}
              height={529}
              className={styles.logo}
            />
            <div className={styles.brandCopy}>
              <div className={styles.portalTitle}>Staff Portal</div>
              <p>LuvCoachAI · MiraLuna</p>
              <p>Staff Console • Role: <span>
                {role}
              </span></p>
            </div>
          </div>
          <div className={styles.account}>
            <span>Hello, {firstName?.trim() || email?.trim() || "staff"}</span>
            <span className={styles.role}>
              {role}
            </span>
            <span className={styles.environment}>Local Dev</span>
            <button
              type="button"
              onClick={handleLogout}
              className={styles.logout}
            ><PortalIcon name="logout" />Log out</button>
          </div>
        </div>
        <div className={styles.primaryNav}>
          <NavRow
            items={row1}
            activeHref={activeHref}
            label="Staff workspace"
          >
            <div className={pathname?.startsWith("/coaching") ? styles.coachingSelected : styles.coaching}>
              <CoachingNavLink />
            </div>
          </NavRow>
        </div>
        {showAdminRow && <div className={styles.adminNav}>
          <NavRow
            items={row2AdminOnly}
            activeHref={activeHref}
            label="Administration"
          />
        </div>}
      </div>
    </header>
  );
}
