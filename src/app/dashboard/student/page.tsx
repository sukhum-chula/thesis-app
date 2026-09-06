"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /student-dashboard is now STUDENT's landing page — redirect any old bookmark/link here.
export default function StudentDashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/student-dashboard"); }, [router]);
  return null;
}
