"use client";

import { useApp } from "@/context/AppContext";
import { formatTodayLong } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageToggle } from "@/components/LanguageToggle";

// One shared top bar for every role — always expanded, no nav links, no hamburger. Each
// role's own actions/navigation live as cards or back-links on its own pages instead (see
// AGENTS.md "Dashboard shell").
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <div className="min-w-0 shrink-0">
            <p className="font-bold text-gray-900 text-sm sm:text-base leading-tight truncate">ระบบจัดการวิทยานิพนธ์</p>
            <p className="text-xs text-gray-400 truncate">{formatTodayLong()}</p>
          </div>

          <div className="flex-1 min-w-0 text-center hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto sm:ml-0">
            <LanguageToggle />
            <NotificationBell />
            <button
              onClick={async () => { await logout(); router.push("/login"); }}
              title="Logout"
              className="flex items-center gap-1.5 p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3 sm:p-5 lg:p-8 bg-gray-50">
        {children}
      </main>
    </div>
  );
}
