import * as React from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-6",
        "bg-[var(--panel-bg)] border-[var(--panel-border)]",
        className
      )}
      {...props}
    />
  );
}
