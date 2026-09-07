import Link from "next/link";
import { GraduationCap, Mail } from "lucide-react";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-gray-50 to-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">

        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-200">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ระบบจัดการวิทยานิพนธ์</h1>
            <p className="text-gray-500 mt-1 text-sm">คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 mx-auto">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="font-bold text-gray-800 text-xl">ไม่สามารถสร้างบัญชีได้ด้วยตนเอง</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            ระบบไม่รองรับการลงทะเบียนด้วยตนเองอีกต่อไป กรุณาติดต่อเจ้าหน้าที่ภาควิชาเพื่อขอให้สร้างบัญชีผู้ใช้งานให้ท่าน
            เมื่อสร้างบัญชีเรียบร้อยแล้ว ระบบจะส่งรหัสเข้าใช้งานไปยังอีเมลของท่านโดยอัตโนมัติ
          </p>
          <Link
            href="/login"
            className="inline-block mt-2 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition text-sm shadow-sm"
          >
            ไปยังหน้าเข้าสู่ระบบ →
          </Link>
        </div>

      </div>
    </div>
  );
}
