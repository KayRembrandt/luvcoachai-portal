import * as React from "react";
import { cn } from "@/lib/cn";

export function FormActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 pt-2",
        className
      )}
    >
      {children}
    </div>
  );
}
