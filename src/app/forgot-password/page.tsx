"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PageShell } from "@/components/ui/PageShell";
import { Panel } from "@/components/Panel";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <PageShell
      title="Reset your password 🔐"
      subtitle="We’ll email you a link to set a new password."
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
            Forgot your password?
          </h2>

          <p className="mt-1 max-w-xs text-sm text-[#4A5878]">
            Enter your email and we’ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl bg-[#E6F6EC] px-4 py-3 text-sm text-[#25614B]">
            Check your email for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-sm text-[#9B2C2C]">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#1A202C]"
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
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-base text-[#0F1B33] outline-none focus:border-[#7F9DFF] focus:ring-2 focus:ring-[#7F9DFF]"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="lc-button mt-2 w-full text-center disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </Panel>
    </PageShell>
  );
}