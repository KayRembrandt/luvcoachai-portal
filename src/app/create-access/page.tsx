"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { Panel } from "@/components/Panel";

type Status = "idle" | "submitting" | "success" | "error";

export default function CreateAccessPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");

  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (password.length < 8) {
      setError("Please choose a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch("/api/staff/create-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          preferred_name: preferredName.trim(),
          phone: phone.trim(),
          address_1: address1.trim(),
          address_2: address2.trim(),
          city: city.trim(),
          state: stateRegion.trim(),
          postal_code: postalCode.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          json?.error ||
            "We couldn’t create your access yet. Please check your information or contact admin."
        );
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch (err) {
      console.error("CREATE ACCESS ERROR:", err);
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <PageShell
      label="Staff"
      emoji="🛡️"
      title="Create Your Access"
      subtitle="This portal is for approved LuvCoachAI staff members only."
      centeredHeader
      wide
    >
      <Panel className="mx-auto max-w-[760px]">
        {status === "success" ? (
          <div className="py-8 text-center">
            <h2 className="text-xl font-semibold text-[#0F1B33]">
              Access created 💛
            </h2>
            <p className="mt-2 text-sm text-[#4A5878]">
              Your portal access has been created. You can now continue to staff
              login.
            </p>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="lc-button mt-6"
            >
              Go to staff login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-sm text-[#9B2C2C]">
                {error}
              </div>
            )}

            <div className="rounded-2xl bg-[#F7F9FF] px-4 py-3 text-sm text-[#4A5878]">
              Use the email address you were approved with. Creating access does
              not grant employment by itself. Only pre-approved staff records
              can activate portal access.
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                  placeholder="At least 8 characters"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                  placeholder="Re-enter your password"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  First name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Last name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Preferred name
                </label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Phone number
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                  placeholder="(555) 555-5555"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Address line 1
                </label>
                <input
                  type="text"
                  required
                  autoComplete="address-line1"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-[#1A202C]">
                  Address line 2
                </label>
                <input
                  type="text"
                  autoComplete="address-line2"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  City
                </label>
                <input
                  type="text"
                  required
                  autoComplete="address-level2"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A202C]">
                  State
                </label>
                <input
                  type="text"
                  required
                  autoComplete="address-level1"
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                  placeholder="WA"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-[#1A202C]">
                  ZIP / Postal code
                </label>
                <input
                  type="text"
                  required
                  autoComplete="postal-code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded-2xl border border-[#CBD5F5] bg-white px-3 py-2 text-[#0F1B33] outline-none focus:ring-2 focus:ring-[#7F9DFF]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full lc-button disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "submitting" ? "Creating access…" : "Create access"}
            </button>

            <p className="text-center text-xs text-[#718096]">
              Already created your staff access?{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-[#5B7CFA] underline hover:text-[#3F5FE0]"
              >
                Go to login
              </button>
            </p>
          </form>
        )}
      </Panel>
    </PageShell>
  );
}