"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { SubmissionType } from "@/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProposalForm, DefenseForm } from "@/components/SubmissionForms";

export default function NewSubmissionPage() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type");
  const submissionType: SubmissionType =
    rawType === "defense" ? "THESIS_DEFENSE" : "PROPOSAL";

  const router = useRouter();
  const { submissions, user } = useApp();
  const mine = submissions.filter((s) => s.studentId === user?.id);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/student-dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2 -my-2">
        <ArrowLeft className="w-4 h-4" />
        ย้อนกลับ
      </Link>

      {submissionType === "PROPOSAL"
        ? <ProposalForm mine={mine} onCreated={(sub) => router.push(`/dashboard/student/${sub.id}`)} />
        : <DefenseForm mine={mine} onCreated={(sub) => router.push(`/dashboard/student/${sub.id}`)} />}
    </div>
  );
}
