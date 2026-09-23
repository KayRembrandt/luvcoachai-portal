// src/app/page.tsx
import Link from "next/link";

// Four shortcuts to existing sections in the visible staff navigation.
// Jobs and Mira remain hidden until those tools are implemented.
// This list does not grant access; each destination must enforce its own permissions.
const workAreas = [
  {
    title: "User Search",
    description: "Look up a user by real first name, last name, or email.",
    href: "/users/search",
  },
  {
    title: "Photo Review",
    description: "Open the photo review queue and review member photos.",
    href: "/photo-review",
  },
  {
    title: "Henry Desk",
    description: "Staff support guidance and Henry-created work context.",
    href: "/henry",
  },
  {
    title: "Library Review",
    description: "Organize Journey categories and edit lesson material.",
    href: "/library-review",
  },
] as const;

export default function DashboardPage() {
  // No outer Panel: Linen remains visible between the separate cream surfaces.
  return (
    <div className="portal-dashboard">
      <section
        className="portal-dashboard-intro"
        aria-labelledby="dashboard-title"
      >
        <div className="portal-dashboard-welcome">
          <p className="portal-eyebrow">Dashboard</p>
          <h1 id="dashboard-title">Welcome to the Staff Portal</h1>
          <span className="portal-brand-rule" aria-hidden="true" />
          <p className="portal-dashboard-lead">
            This is a focused workspace for support, review, and operations.
            Choose a section above to begin.
          </p>
        </div>

        <aside
          className="portal-welcome-note"
          aria-labelledby="welcome-note-title"
        >
          <h2 id="welcome-note-title">Glad you’re here. 👋</h2>
          <p>
            Today is a new favorite day to help you support our users and keep
            LuvCoachAI and MiraLuna running smoothly.
          </p>
          <p>
            If you need anything, just ask Henry! If he can’t help you, you can
            always reach out to me.
          </p>
        </aside>
      </section>

      <section
        className="portal-work-areas"
        aria-labelledby="work-areas-title"
      >
        <div className="portal-section-heading">
          <h2 id="work-areas-title">Your workspace</h2>
          <p>Choose the area you need for the task in front of you.</p>
        </div>

        <div className="portal-work-grid">
          {workAreas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              prefetch={false}
              className="portal-work-card"
            >
              <h3>{area.title}</h3>
              <p>{area.description}</p>
              <span className="portal-work-card-action">
                Open {area.title}
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
