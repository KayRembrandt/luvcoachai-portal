"use client";

import { Panel } from "@/components/Panel";
import { PageShell } from "@/components/ui/PageShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

function isAllowedStaffStatus(status: unknown) {
  const s = String(status ?? "").toLowerCase();
  return s === "active" || s === "approved";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log("HANDLE SUBMIT FIRED");

    setError(null);
    setSubmitting(true);

    try {
console.log("STEP 1: submit fired");

await supabaseBrowser.auth.signOut().catch((err) => {
  console.warn("Pre-login signOut warning:", err);
});

console.log("STEP 2: calling signInWithPassword");

const { data, error: signInError } =
  await supabaseBrowser.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

console.log("STEP 3: signInWithPassword returned", { data, signInError });

if (signInError) {
  setError(signInError.message || "Something went wrong signing you in.");
  setSubmitting(false);
  return;
}

const sessionUser = data.session?.user ?? null;
console.log("STEP 4: session user", sessionUser);

if (!sessionUser) {
  setError("We couldn’t start your session. Please try again.");
  setSubmitting(false);
  return;
}

router.replace("/");
return;


// TEMPORARILY DISABLED FOR TEST
// const { data: staffRow, error: staffErr } = await supabaseBrowser
//   .from("staff")
//   .select("id, auth_user_id, role, is_active, status, first_name")
//   .eq("auth_user_id", sessionUser.id)
//   .maybeSingle();
//
// console.log("STEP 5: staff query finished", { staffRow, staffErr });
//
// if (
//   staffErr ||
//   !staffRow ||
//   staffRow.is_active === false ||
//   !isAllowedStaffStatus(staffRow.status)
// ) {
//   console.log("STEP 6: staff denied");
//   await supabaseBrowser.auth.signOut().catch(() => {});
//   setError("This account does not have staff access.");
//   setSubmitting(false);
//   return;
// }
//
// console.log("STEP 7: redirecting");
// router.replace("/");
    } catch (err: any) {
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