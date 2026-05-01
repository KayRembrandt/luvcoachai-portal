"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { error } = await supabaseBrowser.auth.updateUser({
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/login");
  };

  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl border p-6 shadow">
      <h1 className="text-xl font-semibold mb-4">Set New Password</h1>

      <form onSubmit={handleUpdate} className="space-y-4">
        <input
          type="password"
          placeholder="New password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <button
          type="submit"
          className="w-full rounded bg-slate-900 text-white py-2"
        >
          Update Password
        </button>
      </form>
    </div>
  );
}