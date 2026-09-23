import type { ReactNode } from "react";
import { PortalIcon, type PortalIconName } from "./PortalIcon";
import styles from "./review.module.css";

/** Shared visual pieces only: no queries, permissions, or member data fetching. */

export function ReviewHeader({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: ReactNode;
  icon: PortalIconName;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.headingGroup}>
        <span className={styles.headingIcon}>
          <PortalIcon name={icon} />
        </span>
        <div className={styles.headingCopy}>
          <h1>
            {title}
          </h1>
          <p>
            {description}
          </p>
        </div>
      </div>
      <div className={styles.headerAside}>
        <span className={styles.brandNote}>
          <PortalIcon name="heart" />
          Building Better Relationships
        </span>
        {action}
      </div>
    </header>
  );
}

export function InitialsBadge({ name }: { name: string; }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = name === "—" ? "?" : parts.slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase() || "?";
  return <span className={styles.initials} aria-hidden="true">
    {letters}
  </span>;
}

/** A badge describes a stored status. It does not grant access or verify anyone. */

export function StatusBadge({ value }: { value: unknown; }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  const key = text.toLowerCase().trim();
  const tone = ["active", "approved"].includes(key)
    ? "success"
    : ["pending", "needs_attention", "needs_admin_review"].includes(key)
      ? "attention"
      : ["rejected", "inactive", "disabled", "expired"].includes(key)
        ? "muted"
        : "neutral";
  return <span className={styles.statusBadge} data-tone={tone}>
    {text.replace(/_/g, " ")}
  </span>;
}

export function EmptyState({ title, children, icon = "search" }: {
  title: string;
  children: ReactNode;
  icon?: PortalIconName;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <PortalIcon name={icon} />
      </span>
      <div>
        <h3>
          {title}
        </h3>
        <p>
          {children}
        </p>
      </div>
    </div>
  );
}
