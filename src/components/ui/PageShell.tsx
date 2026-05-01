import * as React from "react";
import { cn } from "@/lib/cn";

export function PageShell({
  title,
  label,
  emoji,
  subtitle,
  children,
  className,
  centeredHeader,
  wide,
  
}: {
  title?: string;
  label?: string;
  emoji?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  centeredHeader?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-h-screen bg-[var(--background)] text-[var(--foreground)]", className)}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        {(title || subtitle) && (
          <div className="mb-6">
            {title && <h1 className="text-2xl font-semibold">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm opacity-70">{subtitle}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
