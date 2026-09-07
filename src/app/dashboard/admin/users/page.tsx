"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AdminUsersPage() {
  const { user } = useApp();
  const router = useRouter();
  // This page is ADMIN's account management (STUDENT/PROFESSOR/ADMIN) — SUPER_ADMIN's
  // own account management (SUPER_ADMIN/ADMIN) lives on /super-dashboard instead.
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  useEffect(() => {
    if (user && !isAdmin) router.replace(ROLE_ROUTES[user.role]);
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin-dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2 -my-2">
        <ArrowLeft className="w-4 h-4" />
        ย้อนกลับ
      </Link>

      <AdminUsersPanel />
      <AdminSettingsPanel />
    </div>
  );
}
