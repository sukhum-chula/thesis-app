"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /super-dashboard is now SUPER_ADMIN's landing page — redirect any old bookmark/link here.
export default function SuperAdminDashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/super-dashboard"); }, [router]);
  return null;
}
