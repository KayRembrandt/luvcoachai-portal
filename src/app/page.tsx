import { Panel } from "@/components/Panel"
import Image from "next/image";
// app/page.tsx

export default function DashboardPage() {
  return (
    <Panel>
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Dashboard
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Welcome to the Staff Portal
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          This is a focused workspace for support, review, and operations. Choose a
          section above to begin.
        </p>
      </div>
      
  <div className="flex flex-col items-center text-center mb-12">
          {/* 🔹 Update this src to your new logo path */}
          <img
            src="/luvcoachai-logo.png"
            alt="LuvCoachAI logo"
            width={160}
            height={160}
            className="mb-3 rounded-2xl"
          />
          <h2 className="text-lg font-semibold text-[#0F1B33]">
              Glad you're here. 👋
            </h2>
            <p className="mt-2 text-[15px]] text-[#4A5878] max-w-xs">
                Today is a new favorite day to help you support our users and keep LuvCoachAI running smoothly. 
                If you need anything, just ask Henry! If he can't help you, you can always reach out to me.
        </p>

        </div>
        
      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            title: "User Search",
            desc: "Look up a user by real first name, last name, or email.",
          },
          {
            title: "Jobs",
            desc: "Work queue for reviews, escalations, and resolutions.",
          },
          {
            title: "Henry Desk",
            desc: "Staff support guidance and Henry-created work context.",
          },
          {
            title: "Mira",
            desc: "Quality review and misuse detection (read-heavy, action-light).",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-lg font-semibold">{c.title}</div>
            <div className="mt-1 text-sm text-slate-600">{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
    </Panel>
  );
}
