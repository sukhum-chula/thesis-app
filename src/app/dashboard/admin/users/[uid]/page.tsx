"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { UserDetailPanel } from "@/components/UserDetailPanel";
import { UserProfileHeader } from "@/components/UserProfileHeader";
import { ArrowLeft } from "lucide-react";

export default function AdminUserProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const { user: viewer } = useApp();
  const router = useRouter();

  // ADMIN's account management only — SUPER_ADMIN's own account management lives on /super-dashboard
  const isAdmin = viewer?.roles.includes("ADMIN") ?? false;

  useEffect(() => {
    if (viewer && !isAdmin) router.replace(ROLE_ROUTES[viewer.role]);
  }, [viewer, isAdmin, router]);

  if (!viewer || !isAdmin) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/dashboard/admin/users"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium"
      >
        <ArrowLeft className="w-5 h-5" />
        ย้อนกลับรายชื่อผู้ใช้
      </Link>

      <UserProfileHeader uid={uid} onDeleted={() => router.replace("/dashboard/admin/users")} />
      <UserDetailPanel uid={uid} />
    </div>
  );
}
