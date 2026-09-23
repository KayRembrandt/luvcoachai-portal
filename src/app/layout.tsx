// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PortalShell from "./PortalShell";

export const metadata: Metadata = {
  title: "LuvCoachAI Portal",
  description: "Staff portal for LuvCoachAI operations",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="portal-body">
        {/* Keep the existing access flow. Do not add a second auth guard. */}
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
