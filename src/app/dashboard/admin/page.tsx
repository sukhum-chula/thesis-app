"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /admin-dashboard is now ADMIN's landing page — redirect any old bookmark/link here.
export default function AdminDashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin-dashboard"); }, [router]);
  return null;
}
