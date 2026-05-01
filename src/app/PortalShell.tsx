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

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Checking portal access…
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please wait while we verify your staff access.
          </p>
        </div>
      </div>
    );
  }

  if (blockedReason || !verifiedStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Portal access blocked</h1>
          <p className="mt-2 text-sm text-slate-700">
            {blockedReason ?? "This account does not have portal access."}
          </p>
          <button
            type="button"
            className="mt-5 rounded-full bg-slate-900 px-5 py-2 text-sm text-white"
            onClick={() => router.replace("/login")}
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopNav
        role={verifiedStaff.role}
        firstName={verifiedStaff.firstName}
        email={verifiedStaff.email}
      />
      {children}
    </>
  );
}