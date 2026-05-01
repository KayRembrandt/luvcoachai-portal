import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
        "bg-[var(--input-bg)] text-[var(--input-text)] border-[var(--input-border)]",
        "placeholder:text-[var(--input-placeholder)]",
        "focus:ring-2 focus:ring-blue-500/40",
        className
      )}
      {...props}
    />
  );
}
