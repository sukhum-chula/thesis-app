"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useApp } from "@/context/AppContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, GraduationCap } from "lucide-react";

export default function LoginPage() {
  const { user } = useApp();
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [passcode, setPasscode]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(ROLE_ROUTES[user.role]);
  }, [user, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !passcode.trim()) { setError("กรุณาใส่อีเมลและรหัสเข้าใช้งาน"); return; }
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", { email: email.trim().toLowerCase(), passcode, redirect: false });
    setSubmitting(false);
    if (result?.error) { setError("อีเมลหรือรหัสเข้าใช้งานไม่ถูกต้อง"); return; }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-7">

        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-200">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">ระบบจัดการวิทยานิพนธ์</h1>
            <p className="text-gray-500 mt-1.5">คณะวิศวกรรมศาสตร์ · ยื่น ติดตาม และลงนามเอกสารออนไลน์</p>
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-5">
          <h2 className="font-bold text-gray-800 text-xl">เข้าสู่ระบบ</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block font-medium text-gray-700 mb-1.5 text-sm">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1.5 text-sm">รหัสเข้าใช้งาน</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={passcode}
                  onChange={(e) => { setPasscode(e.target.value); setError(null); }}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                  placeholder="รหัสเข้าใช้งาน"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition text-base shadow-sm disabled:opacity-60">
              <LogIn className="w-5 h-5" />
              {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center">
            ยังไม่มีบัญชี หรือลืมรหัสเข้าใช้งาน? ติดต่อเจ้าหน้าที่ภาควิชาเพื่อขอความช่วยเหลือ
          </p>
        </div>

      </div>
    </div>
  );
}
