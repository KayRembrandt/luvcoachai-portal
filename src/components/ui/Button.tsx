import * as React from "react";
import { cn } from "@/lib/cn";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

  const styles =
    variant === "ghost"
      ? "border border-[var(--panel-border)] bg-transparent text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
      : "border border-[var(--btn-border)] bg-[var(--btn-bg)] text-[var(--btn-text)] hover:opacity-50";

  return <button className={cn(base, styles, className)} {...props} />;
}
