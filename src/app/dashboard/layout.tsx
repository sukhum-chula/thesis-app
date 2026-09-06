"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, formatTodayLong } from "@/lib/utils";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  LogOut, LayoutDashboard,
  Users, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, submissions, needsMyAction } = useApp();
  const router   = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  // Close the mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (!user) return null;

  const homeRoute    = ROLE_ROUTES[user.role];
  const pendingCount = submissions.filter(needsMyAction).length;
  const isStudent    = user.roles.includes("STUDENT");

  // navLinks is only used by the non-STUDENT top bar below — STUDENT gets its own simpler bar.
  const navLinks = (
    <>
      <NavLink
        href={homeRoute}
        icon={<LayoutDashboard className="w-5 h-5" />}
        label="หน้าหลัก"
        badge={pendingCount}
        active={
          pathname === homeRoute ||
          // ADMIN's home covers the submissions overview + nested detail pages
          (user.roles.includes("ADMIN") &&
            pathname.startsWith("/dashboard/admin/") &&
            !pathname.startsWith("/dashboard/admin/users"))
        }
      />

      {/* ADMIN's own account management (STUDENT/PROFESSOR/ADMIN) — SUPER_ADMIN's
          account management (SUPER_ADMIN/ADMIN) lives on /super-dashboard itself */}
      {user.roles.includes("ADMIN") && (
        <NavLink
          href="/dashboard/admin/users"
          icon={<Users className="w-5 h-5" />}
          label="ผู้ใช้งานในระบบ"
          active={pathname === "/dashboard/admin/users"}
        />
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* STUDENT gets a simpler, always-expanded top bar — no menu button, no nav links
          (those live as action cards on /student-dashboard itself). Every other role keeps
          the full bar with nav links + a mobile hamburger. */}
      {isStudent ? (
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
      ) : (
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-sm sm:text-base leading-tight truncate">ระบบจัดการวิทยานิพนธ์</p>
              <p className="text-xs sm:text-sm font-medium text-blue-600 truncate">{user.roles.map((r) => ROLE_LABELS[r]).join(" / ")}</p>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1 ml-4">
              {navLinks}
            </nav>

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <LanguageToggle />
              <NotificationBell />

              {/* Desktop user info + logout */}
              <div className="hidden lg:flex items-center gap-1 pl-2 ml-1 border-l border-gray-200">
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">{user.name}</span>
                <button
                  onClick={async () => { await logout(); router.push("/login"); }}
                  title="Logout"
                  className="flex items-center gap-1.5 p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="lg:hidden border-t border-gray-100 px-4 py-3 space-y-1">
              {navLinks}
              <div className="pt-2 mt-2 border-t border-gray-100 space-y-1">
                <div className="px-3 py-1.5">
                  <p className="font-semibold text-gray-800 truncate">{user.name}</p>
                  <p className="text-sm text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={async () => { await logout(); router.push("/login"); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-red-600 font-medium hover:bg-red-50 transition"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </header>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto p-3 sm:p-5 lg:p-8 bg-gray-50">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href, icon, label, active, badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition",
        active ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
      )}
    >
      {icon}
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
