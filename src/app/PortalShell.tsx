"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser";

export type StaffRole = "staff" | "henry" | "admin";

type StaffRow = {
  id: string;
  auth_user_id: string | null;
  role: "staff" | "henry" | "admin" | null;
  is_active: boolean | null;
  status: string | null;
  first_name?: string | null;
};

type VerifiedStaff = {
  role: StaffRole;
  firstName?: string | null;
  email?: string | null;
};

const PUBLIC_ROUTES = [
  "/login",
  "/create-access",
  "/forgot-password",
  "/reset-password",
];

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "").toLowerCase().trim();
  return s === "" || s === "active" || s === "approved";
}

function normalizeRole(role: unknown): StaffRole {
  const r = String(role ?? "").toLowerCase().trim();
  if (r === "admin") return "admin";
  if (r === "henry") return "henry";
  return "staff";
}

export default function PortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  const [checking, setChecking] = React.useState(true);
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null);
  const [verifiedStaff, setVerifiedStaff] =
    React.useState<VerifiedStaff | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (isPublicRoute) {
        if (!cancelled) {
          setChecking(false);
          setBlockedReason(null);
          setVerifiedStaff(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setChecking(true);
          setBlockedReason(null);
          setVerifiedStaff(null);
        }

        const {
          data: { session },
          error: sessionErr,
        } = await supabase.auth.getSession();

        if (sessionErr) {
          console.error("PortalShell getSession error:", sessionErr);
        }

        if (!session?.user?.id) {
          if (!cancelled) {
            setChecking(false);
            router.replace("/login");
          }
          return;
        }

        const { data: staffRow, error: staffErr } = await supabase
          .from("staff")
          .select("id, auth_user_id, role, is_active, status, first_name")
          .eq("auth_user_id", session.user.id)
          .maybeSingle<StaffRow>();

        if (staffErr) {
          console.error("PortalShell staff fetch error:", staffErr);
        }

        if (!staffRow) {
          if (!cancelled) {
            setBlockedReason("No staff record found for this account.");
            setChecking(false);
          }
          return;
        }

        if (staffRow.is_active === false) {
          if (!cancelled) {
            setBlockedReason("Your staff account is not active.");
            setChecking(false);
          }
          return;
        }

        if (!isAllowedStaffStatus(staffRow.status)) {
          if (!cancelled) {
            setBlockedReason(
              `Your staff account status is "${staffRow.status}".`
            );
            setChecking(false);
          }
          return;
        }

        if (!cancelled) {
          setVerifiedStaff({
            role: normalizeRole(staffRow.role),
            firstName: staffRow.first_name ?? null,
            email: session.user.email ?? null,
          });
          setChecking(false);
        }
      } catch (err) {
        console.error("PortalShell crash:", err);

        if (!cancelled) {
          setBlockedReason("We couldn’t verify portal access right now.");
          setChecking(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, router]);

  // Public routes keep their existing page layout and access behavior.
  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="portal-access-screen">
        <section
          className="portal-access-card"
          aria-labelledby="portal-access-title"
          role="status"
          aria-live="polite"
        >
          <p className="portal-eyebrow">LuvCoachAI Portal</p>
          <h1 id="portal-access-title">Checking portal access…</h1>
          <p>Please wait while we verify your staff access.</p>
        </section>
      </div>
    );
  }

  if (blockedReason || !verifiedStaff) {
    return (
      <div className="portal-access-screen">
        <section
          className="portal-access-card"
          aria-labelledby="portal-access-title"
        >
          <p className="portal-eyebrow">LuvCoachAI Portal</p>
          <h1 id="portal-access-title">Portal access blocked</h1>
          <p role="alert">
            {blockedReason ?? "This account does not have portal access."}
          </p>
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => router.replace("/login")}
          >
            Go to login
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="portal-shell" data-portal-path={pathname}>
      <a className="portal-skip-link" href="#portal-content">
        Skip to page content
      </a>

      {/* TopNav still owns its links, role visibility and logout handler. */}
      <div className="portal-topbar">
        <TopNav
          role={verifiedStaff.role}
          firstName={verifiedStaff.firstName}
          email={verifiedStaff.email}
        />
      </div>

      {/*
        One shared width constraint for protected portal pages.
        Keep this a div: existing pages may already supply a main landmark.
        No clipping/overflow rule here, so dialogs and menus are not hidden.
      */}
      <div id="portal-content" className="portal-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
