"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useRouter } from "next/navigation";
import { LogIn, Zap, CheckCircle2, Users } from "lucide-react";

interface DemoUser {
  email: string;
  name: string;
  roleLabel: string;
  dashboard: string;
  color: string;
  emoji: string;
}

const GROUPS: { title: string; users: DemoUser[] }[] = [
  {
    title: "ผู้ดูแลระบบ",
    users: [
      { email: "superadmin@eng.chula.ac.th", name: "ผู้ดูแลระบบสูงสุด",           roleLabel: "Super Admin",       dashboard: "/super-dashboard",               color: "from-yellow-400 to-amber-500",   emoji: "👑" },
      { email: "admin@eng.chula.ac.th",      name: "พี่โบ้ (เจ้าหน้าที่ภาควิชา)", roleLabel: "Admin",             dashboard: "/admin-dashboard",               color: "from-slate-600 to-gray-800",     emoji: "🛡️" },
      { email: "suphap.m@chula.ac.th",       name: "สุภาพ หมุดอุบล",              roleLabel: "Admin",             dashboard: "/admin-dashboard",               color: "from-slate-600 to-gray-800",     emoji: "🛡️" },
    ],
  },
  {
    title: "นิสิต",
    users: [
      { email: "student@eng.chula.ac.th",            name: "นายอานนท์ ใจดี",       roleLabel: "นิสิต (mock)",       dashboard: "/student-dashboard",            color: "from-blue-500 to-indigo-600",    emoji: "🎓" },
      { email: "6733100421@student.chula.ac.th",     name: "ธนากร โถรัตน์",        roleLabel: "นิสิต",             dashboard: "/student-dashboard",            color: "from-blue-500 to-indigo-600",    emoji: "🎓" },
      { email: "outanagon2549@gmail.com",            name: "นายพันธวิศ มะสัน",     roleLabel: "นิสิต",             dashboard: "/student-dashboard",            color: "from-blue-500 to-indigo-600",    emoji: "🎓" },
    ],
  },
  {
    title: "ประธานหลักสูตร",
    users: [
      { email: "niphon.w@eng.chula.ac.th", name: "รศ.ดร.นิพนธ์ วรรณโสภาคย์", roleLabel: "ประธานหลักสูตร", dashboard: "/dashboard/program-chair", color: "from-violet-500 to-purple-600", emoji: "👨‍🏫" },
    ],
  },
  {
    title: "อาจารย์ที่ปรึกษา",
    users: [
      { email: "angkee.s@eng.chula.ac.th",    name: "รศ.ดร.อังคีร์ ศรีภคากร",    roleLabel: "Advisor", dashboard: "/dashboard/advisor", color: "from-violet-500 to-purple-600", emoji: "👨‍🏫" },
      { email: "ratchatin.c@eng.chula.ac.th", name: "รศ.ดร.รัชทิน จันทร์เจริญ",  roleLabel: "Advisor", dashboard: "/dashboard/advisor", color: "from-violet-500 to-purple-600", emoji: "👨‍🏫" },
      { email: "pairod.s@eng.chula.ac.th",    name: "ศ.ดร.ไพโรจน์ สิงหถนัดกิจ", roleLabel: "Advisor", dashboard: "/dashboard/advisor", color: "from-violet-500 to-purple-600", emoji: "👨‍🏫" },
    ],
  },
  {
    title: "ประธานกรรมการสอบ",
    users: [
      { email: "alongkorn.p@eng.chula.ac.th", name: "รศ.ดร.อลงกรณ์ พิมพ์พิณ",      roleLabel: "Head Exam Committee", dashboard: "/dashboard/head-exam-committee", color: "from-rose-500 to-pink-600",    emoji: "🔬" },
      { email: "chanat.r@eng.chula.ac.th",    name: "รศ.ดร.ชนัตต์ รัตนสุมาวงศ์",   roleLabel: "Head Exam Committee", dashboard: "/dashboard/head-exam-committee", color: "from-rose-500 to-pink-600",    emoji: "🔬" },
    ],
  },
  {
    title: "กรรมการสอบ",
    users: [
      { email: "sunhapos.c@eng.chula.ac.th", name: "ผศ.ดร.สัณหพศ จันทรานุวัฒน์",   roleLabel: "Exam Committee", dashboard: "/dashboard/exam-committee", color: "from-teal-500 to-cyan-600",    emoji: "📋" },
      { email: "werayut.s@eng.chula.ac.th",  name: "ผศ.ดร.วีระยุทธ ศรีธุระวานิช",   roleLabel: "Exam Committee", dashboard: "/dashboard/exam-committee", color: "from-teal-500 to-cyan-600",    emoji: "📋" },
      { email: "nuksit.n@eng.chula.ac.th",   name: "ผศ.ดร.นักสิทธ์ นุ่มวงษ์",       roleLabel: "Exam Committee", dashboard: "/dashboard/exam-committee", color: "from-teal-500 to-cyan-600",    emoji: "📋" },
      { email: "pairat.t@eng.chula.ac.th",   name: "ผศ.ดร.ไพรัช ตั้งพรประเสริฐ",   roleLabel: "Exam Committee", dashboard: "/dashboard/exam-committee", color: "from-teal-500 to-cyan-600",    emoji: "📋" },
    ],
  },
  {
    title: "กรรมการภายนอก",
    users: [
      { email: "viboon.s@eng.chula.ac.th", name: "ศ.ดร.วิบูลย์ แสงวีระพันธุ์ศิริ", roleLabel: "Invited Exam Committee", dashboard: "/dashboard/invited-exam-committee", color: "from-orange-500 to-amber-600", emoji: "🌐" },
    ],
  },
];

export default function DemoPage() {
  const { user } = useApp();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function login(u: DemoUser) {
    setLoading(u.email);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email }),
      });
      if (res.ok) {
        window.location.href = u.dashboard;
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950 px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-sm font-semibold px-4 py-1.5 rounded-full">
            <Zap className="w-4 h-4" />
            DEMO MODE
          </div>
          <h1 className="text-3xl font-bold text-white">ระบบจัดการวิทยานิพนธ์</h1>
          <p className="text-gray-400">คลิกที่ผู้ใช้เพื่อเข้าสู่ระบบทันที — ไม่ต้องใส่รหัสเข้าใช้งาน</p>
        </div>

        {/* Current session */}
        {user && (
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-2xl px-5 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-green-300 font-semibold text-sm">กำลังใช้งานในฐานะ: {user.name}</p>
              <p className="text-green-500/70 text-xs">{user.email}</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="ml-auto text-xs bg-green-500/20 hover:bg-green-500/30 text-green-300 px-3 py-1.5 rounded-lg transition font-medium"
            >
              ไปที่ Dashboard →
            </button>
          </div>
        )}

        {/* Role groups */}
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">{group.title}</h2>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.users.map((u) => {
                const isActive = user?.email === u.email;
                const isLoading = loading === u.email;
                return (
                  <button
                    key={u.email}
                    onClick={() => login(u)}
                    disabled={!!loading}
                    className={`group relative flex items-center gap-3 p-4 rounded-2xl border transition text-left w-full
                      ${isActive
                        ? "bg-white/10 border-white/20"
                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      } disabled:opacity-60`}
                  >
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${u.color} flex items-center justify-center text-xl shrink-0 shadow-lg`}>
                      {isLoading
                        ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                        : u.emoji}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{u.name}</p>
                      <p className="text-gray-400 text-xs truncate">{u.email}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{u.roleLabel}</p>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {isActive
                        ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                        : <LogIn className="w-4 h-4 text-gray-600 group-hover:text-white transition" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-center text-gray-600 text-xs pb-4">
          Demo page · ใช้สำหรับการทดสอบเท่านั้น · ไม่ส่งอีเมลใดๆ
        </p>
      </div>
    </div>
  );
}
