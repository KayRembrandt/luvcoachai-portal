"use client";

import { Panel } from "@/components/Panel";
import { PageShell } from "@/components/ui/PageShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type StaffRow = {
  id: string;
  auth_user_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  status?: string | null;
  first_name?: string | null;
};

const STAFF_SELECT = "id, auth_user_id, role, is_active, status, first_name";

const clean = (value: unknown) => String(value ?? "").trim().toLowerCase();

function isAllowedStaffStatus(status: unknown) {
  const s = clean(status);

  // If status is blank/null but is_active is true, do not block the person.
  if (!s) return true;

  return ["active", "approved", "hired", "enabled"].includes(s);
}

function isAllowedStaffRole(role: unknown) {
  const r = clean(role);

  // The staff table itself is the access gate. A blank role should not block
  // a valid active staff record.
  if (!r) return true;

  return [
    "owner",
    "admin",
    "staff",
    "support",
    "moderator",
    "reviewer",
    "content_manager",
    "photo_reviewer",
    "library_reviewer",
    "developer",
  ].includes(r);
}

async function getStaffRow(authUserId: string) {
  const { data, error } = await supabaseBrowser
    .from("staff")
    .select(STAFF_SELECT)
    .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
    .maybeSingle();

  return { staffRow: (data as StaffRow | null) ?? null, error };
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const loginEmail = email.trim().toLowerCase();

    setError(null);
    setSubmitting(true);

    try {
      await supabaseBrowser.auth.signOut().catch((err) => {
        console.warn("Pre-login signOut warning:", err);
      });

      const { data, error: signInError } =
        await supabaseBrowser.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

      if (signInError) {
        setError(signInError.message || "Something went wrong signing you in.");
        setSubmitting(false);
        return;
      }

      const sessionUser = data.session?.user ?? null;

      if (!sessionUser) {
        setError("We couldn’t start your session. Please try again.");
        setSubmitting(false);
        return;
      }

      const { staffRow, error: staffError } = await getStaffRow(sessionUser.id);

      if (staffError) {
        console.error("Staff lookup failed:", staffError);
        await supabaseBrowser.auth.signOut().catch(() => {});
        setError("Staff access check failed. Please try again.");
        setSubmitting(false);
        return;
      }

      if (!staffRow) {
        await supabaseBrowser.auth.signOut().catch(() => {});
        setError("This account does not have staff access.");
        setSubmitting(false);
        return;
      }

      if (staffRow.is_active === false) {
        await supabaseBrowser.auth.signOut().catch(() => {});
        setError("This staff account is inactive.");
        setSubmitting(false);
        return;
      }

      if (!isAllowedStaffStatus(staffRow.status)) {
        await supabaseBrowser.auth.signOut().catch(() => {});
        setError("This staff account is not approved yet.");
        setSubmitting(false);
        return;
      }

      if (!isAllowedStaffRole(staffRow.role)) {
        await supabaseBrowser.auth.signOut().catch(() => {});
        setError("This staff role does not have portal access.");
        setSubmitting(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error("LOGIN CRASH:", err);
      setError("Login was interrupted. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Staff Portal 🛡️"
      subtitle="Staff access only."
      centeredHeader
      wide
    >
      <Panel className="mx-auto max-w-[480px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/luvcoachai-logo.png"
            alt="LuvCoachAI logo"
            width={220}
            height={220}
            className="mb-3 rounded-2xl"
          />

          <h2 className="text-lg font-semibold text-[#0F1B33]">
            Welcome back. 👋
          </h2>

          <p className="mt-1 max-w-xs text-sm text-[#4A5878]">
            Sign in to the staff console to review pending photos, check
            onboarding status, and handle support jobs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-sm text-[#9B2C2C]">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-lg font-medium text-[#1A202C]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-2 py-1 text-lg text-[#0F1B33] outline-none focus:border-[#7F9DFF] focus:ring-2 focus:ring-[#7F9DFF]"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#1A202C]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-2 py-1 text-lg text-[#0F1B33] outline-none focus:border-[#7F9DFF] focus:ring-2 focus:ring-[#7F9DFF]"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-[#4A5878]">
            <a href="/forgot-password" className="text-blue-600 underline">
              Forgot your password?
            </a>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="lc-button mt-2 w-full text-center disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Logging you in…" : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#718096]">
          Staff access is private.
          <br />
          If you’ve already been hired,{" "}
          <button
            type="button"
            onClick={() => router.push("/create-access")}
            className="text-[#5B7CFA] underline hover:text-[#3F5FE0]"
          >
            create your access here.
          </button>
        </p>
      </Panel>
    </PageShell>
  );
}
