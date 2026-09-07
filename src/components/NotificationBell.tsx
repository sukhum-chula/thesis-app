"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Bell, Clock, CheckCircle2, XCircle, Info, AlertTriangle, X, CheckCheck } from "lucide-react";
import { NotificationType, Role } from "@/types";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import type { MockNotification } from "@/types";

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "เมื่อกี้";
  if (mins  < 60) return `${mins} นาทีที่แล้ว`;
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  if (days  < 30) return `${days} วันที่แล้ว`;
  return `${Math.floor(days / 30)} เดือนที่แล้ว`;
}

const TYPE_STYLE: Record<NotificationType, { accent: string; icon: React.ReactNode }> = {
  pending:  { accent: "border-l-orange-400", icon: <Clock         className="w-5 h-5 text-orange-500" /> },
  approved: { accent: "border-l-green-500",  icon: <CheckCircle2  className="w-5 h-5 text-green-600" /> },
  rejected: { accent: "border-l-red-500",    icon: <XCircle       className="w-5 h-5 text-red-500"   /> },
  info:     { accent: "border-l-blue-400",   icon: <Info          className="w-5 h-5 text-blue-500"  /> },
  warning:  { accent: "border-l-amber-500",  icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
};

export function NotificationBell() {
  const { user, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useApp();
  const router  = useRouter();
  const btnRef  = useRef<HTMLButtonElement>(null);
  const [open,    setOpen]    = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const mine = notifications.filter((n) => n.recipientId === user?.id).slice(0, 30);

  function toggle() {
    if (!open && btnRef.current) {
      setPanelTop(btnRef.current.getBoundingClientRect().bottom + 6);
    }
    setOpen((v) => !v);
  }

  // ADMIN, STUDENT and PROFESSOR each have a landing page (/admin-dashboard, /student-dashboard,
  // /professor-dashboard) split from where individual submissions actually live
  // (/dashboard/admin/[id], /dashboard/student/[id], /dashboard/professor/[id]).
  const DETAIL_BASE: Partial<Record<Role, string>> = {
    ADMIN:     "/dashboard/admin",
    STUDENT:   "/dashboard/student",
    PROFESSOR: "/dashboard/professor",
    // EXTERNAL (กรรมการภายนอก) shares PROFESSOR's generic, committee-membership-driven detail route.
    EXTERNAL:  "/dashboard/professor",
  };

  function handleClick(notif: MockNotification) {
    markNotificationRead(notif.id);
    setOpen(false);
    if (!user) return;
    const base = ROLE_ROUTES[user.role as Role] ?? "/dashboard/student";
    if (notif.submissionId) router.push(`${DETAIL_BASE[user.role as Role] ?? base}/${notif.submissionId}`);
    else router.push(base);
  }

  const isMobile = mounted && window.innerWidth < 640;

  return (
    <>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={toggle}
        className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition"
        aria-label="การแจ้งเตือน"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted && open && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[90] bg-black/25"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className="fixed z-[100] bg-white shadow-2xl flex flex-col"
            style={
              isMobile
                ? { top: panelTop, left: 0, right: 0, bottom: 0, borderRadius: "16px 16px 0 0" }
                : { top: panelTop, right: 12, width: 380, borderRadius: 16, maxHeight: "80vh" }
            }
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">การแจ้งเตือน</p>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllNotificationsRead()}
                    className="flex items-center gap-1 text-xs text-blue-600 font-medium px-3 py-1.5 rounded-xl hover:bg-blue-50 transition"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    อ่านทั้งหมด
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {mine.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
                  <Bell className="w-12 h-12" />
                  <p className="text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</p>
                </div>
              ) : (
                mine.map((notif) => {
                  const s = TYPE_STYLE[notif.type];
                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={`w-full text-left flex items-start gap-3 px-5 py-4 border-l-4 transition active:bg-gray-50 ${
                        notif.isRead ? "bg-white border-l-transparent hover:bg-gray-50" : `bg-blue-50/40 ${s.accent} hover:bg-blue-50/70`
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">{s.icon}</div>
                      <div className="flex-1 min-w-0 space-y-0.5 text-left">
                        <p className={`text-sm leading-snug ${notif.isRead ? "text-gray-600" : "font-semibold text-gray-900"}`}>
                          {notif.message}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{notif.detail}</p>
                        <p className="text-xs text-gray-400">{timeAgo(notif.createdAt)}</p>
                      </div>
                      {!notif.isRead && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
