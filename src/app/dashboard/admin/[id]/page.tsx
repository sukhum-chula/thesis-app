"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { AdminSubmissionPanel } from "@/components/AdminSubmissionPanel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AdminSubmissionDetail() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const { user, submissions } = useApp();

  // Submission workflow is ADMIN's exclusive responsibility — SUPER_ADMIN is account/user management only
  useEffect(() => {
    if (user && !user.roles.includes("ADMIN")) router.replace(ROLE_ROUTES[user.role] ?? "/login");
  }, [user, router]);

  if (user && !user.roles.includes("ADMIN")) return null;

  if (!submissions.find((s) => s.id === id)) {
    return (
      <div className="text-center py-20 space-y-3 text-gray-400">
        <p className="text-lg">ไม่พบข้อมูลคำร้อง</p>
        <Link href="/admin-dashboard" className="text-blue-500 hover:underline">กลับหน้าหลัก</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* Back */}
      <Link href="/admin-dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium py-2 -my-2">
        <ArrowLeft className="w-5 h-5" />
        ย้อนกลับรายการ
      </Link>

      <AdminSubmissionPanel submissionId={id} onDeleted={() => router.push("/admin-dashboard")} />
    </div>
  );
}
