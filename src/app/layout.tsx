// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import PortalShell from "./PortalShell";
import AuthWatcher from "@/components/AuthWatcher";
import PortalAuthGuard from "@/components/PortalAuthGuard";

export const metadata: Metadata = {
  title: "LuvCoachAI Portal",
  description: "Staff portal for LuvCoachAI operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
    
       
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}