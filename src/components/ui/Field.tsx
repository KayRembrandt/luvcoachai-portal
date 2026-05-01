import * as React from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="text-sm font-medium opacity-90">{label}</div>
      {children}
      {hint && <div className="text-xs opacity-70">{hint}</div>}
    </div>
  );
}
