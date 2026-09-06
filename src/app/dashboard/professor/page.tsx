"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /professor-dashboard is now PROFESSOR's landing page — redirect any old bookmark/link here.
export default function ProfessorDashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/professor-dashboard"); }, [router]);
  return null;
}
