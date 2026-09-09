import { PROGRAM_LABELS, formatUserName } from "@/lib/utils";
import { User, Users, CalendarDays } from "lucide-react";
import type { MockSubmission, MockUser } from "@/types";

function InfoField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <p className="text-xs text-gray-400 w-24 sm:w-32 shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-800 flex-1 break-all">{value}</p>
    </div>
  );
}

/** Read-only student / committee / exam-schedule info — shared by the submission detail page
    and the student dashboard's per-tab current-progress section. */
export function SubmissionInfoPanel({
  submission: sub,
  users,
}: {
  submission: MockSubmission;
  users: MockUser[];
}) {
  const advisor = users.find((u) => u.id === sub.advisorId);

  const hasAnyInfo =
    sub.studentFullName || sub.examDate || sub.program || sub.headCommitteeId || sub.advisorId ||
    (sub.committeeIds?.length ?? 0) > 0 || (sub.coAdvisorIds?.length ?? 0) > 0 || (sub.invitedCommitteeIds?.length ?? 0) > 0;
  if (!hasAnyInfo) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      {/* ข้อมูลนิสิต */}
      {(sub.studentFullName || sub.studentCode || sub.program || sub.studentEmail || sub.studentPhone) && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><User className="w-3.5 h-3.5" />ข้อมูลนิสิต</div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {sub.studentFullName && <InfoField label="ชื่อ-นามสกุล" value={sub.studentFullName} />}
            {sub.studentCode && <InfoField label="รหัสนิสิต" value={sub.studentCode} />}
            {sub.program && <InfoField label="หลักสูตร" value={PROGRAM_LABELS[sub.program] ?? sub.program} wide />}
            {sub.studentEmail && <InfoField label="อีเมล" value={sub.studentEmail} />}
            {sub.studentPhone && <InfoField label="เบอร์โทร" value={sub.studentPhone} />}
          </div>
        </div>
      )}

      {/* คณะกรรมการ */}
      {(advisor || sub.headCommitteeId || (sub.coAdvisorIds?.length ?? 0) > 0 || (sub.committeeIds?.length ?? 0) > 0 || (sub.invitedCommitteeIds?.length ?? 0) > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><Users className="w-3.5 h-3.5" />คณะกรรมการ</div>
          <div className="space-y-2">
            {advisor && (
              <InfoRow label="อาจารย์ที่ปรึกษา" value={formatUserName(advisor)} />
            )}
            {sub.headCommitteeId && (
              <InfoRow label="ประธานกรรมการสอบ" value={(() => { const u = users.find((u) => u.id === sub.headCommitteeId); return u ? formatUserName(u) : sub.headCommitteeId!; })()} />
            )}
            {(sub.coAdvisorIds?.length ?? 0) > 0 && (
              <InfoRow
                label="อาจารย์ที่ปรึกษาร่วม"
                value={(sub.coAdvisorIds ?? []).map((uid) => { const u = users.find((u) => u.id === uid); return u ? formatUserName(u) : uid; }).join(", ")}
              />
            )}
            {(sub.committeeIds?.length ?? 0) > 0 && (
              <div className="flex gap-4">
                <p className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">กรรมการสอบ</p>
                <div className="flex flex-wrap gap-1.5">
                  {(sub.committeeIds ?? []).map((uid) => {
                    const u = users.find((u) => u.id === uid);
                    return (
                      <span key={uid} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg">
                        {u ? formatUserName(u) : uid}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {(sub.invitedCommitteeIds?.length ?? 0) > 0 && (
              <InfoRow
                label="กรรมการภายนอก"
                value={(sub.invitedCommitteeIds ?? []).map((uid) => { const u = users.find((u) => u.id === uid); return u ? formatUserName(u) : uid; }).join(", ")}
              />
            )}
          </div>
        </div>
      )}

      {/* กำหนดการสอบ */}
      {(sub.examDate || sub.roomNeeded || (sub.parkingNeeded && sub.carPlate)) && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-400"><CalendarDays className="w-3.5 h-3.5" />กำหนดการสอบ</div>
          <div className="space-y-2">
            {sub.examDate && (
              <InfoRow
                label="วันที่สอบ"
                value={`${sub.examDate}${sub.examTime ? ` เวลา ${sub.examTime} น.` : ""}`}
              />
            )}
            {sub.roomNeeded && <InfoRow label="ห้องประชุม" value="ต้องการ" />}
            {sub.parkingNeeded && sub.carPlate && <InfoRow label="ทะเบียนรถ" value={sub.carPlate} />}
          </div>
        </div>
      )}
    </div>
  );
}
