"use client";

import { useAuthWatcher } from "@/lib/useAuthWatcher";

export default function AuthWatcher() {
  useAuthWatcher();
  return null;
}