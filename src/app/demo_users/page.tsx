import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/utils";

export default async function DemoUsersPage() {
  // Local-testing convenience only — never renders in a production build.
  if (process.env.NODE_ENV === "production") notFound();

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">
        รายชื่อผู้ใช้งานทั้งหมด (สำหรับทดสอบ local เท่านั้น)
      </h1>
      <p className="text-sm text-gray-400">
        ใช้อีเมลด้านล่างเพื่อ login ที่หน้า{" "}
        <a href="/login" className="text-blue-600 underline">/login</a> ตามปกติ
      </p>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">อีเมล</th>
              <th className="px-3 py-2">บทบาท</th>
              <th className="px-3 py-2">รหัสนิสิต</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-800">{u.name}</td>
                <td className="px-3 py-2 text-gray-600">{u.email}</td>
                <td className="px-3 py-2 text-gray-600">
                  {(u.roles ?? []).map((r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r).join(" / ")}
                </td>
                <td className="px-3 py-2 text-gray-400">{u.studentId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
