import * as React from "react";
import { cn } from "@/lib/cn";

export function FormRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-3", className)}>{children}</div>
  );
}
