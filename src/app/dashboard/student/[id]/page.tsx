"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudentSubmissionActions } from "@/components/StudentSubmissionActions";

export default function StudentSubmissionDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/student-dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium py-2 -my-2">
        <ArrowLeft className="w-5 h-5" />
        ย้อนกลับรายการ
      </Link>

      <StudentSubmissionActions submissionId={id} />
    </div>
  );
}
