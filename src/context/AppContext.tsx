"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  MockUser, MockSubmission, MockNotification, MockExternalRequest, Role, FormType, ProgramType, NameTitle,
} from "@/types";

export interface SubmissionFormData {
  title: string;
  submissionType?: string;
  sourceProposalId?: string;
  advisorId?: string;
  studentFullName?: string;
  studentCode?: string;
  program?: string;
  studentEmail?: string;
  studentPhone?: string;
  headCommitteeId?: string;
  committeeIds?: string[];
  coAdvisorIds?: string[];
  invitedCommitteeIds?: string[];
  people?: { name: string; email: string; role: string; phone?: string }[];
  examDate?: string;
  examTime?: string;
  roomNeeded?: boolean;
  parkingNeeded?: boolean;
  carPlate?: string;
}

// Keep DEMO_USER_IDS for the quick-login panel (demo mode)
export const DEMO_USER_IDS = [
  "superadmin@eng.chula.ac.th",
  "admin@eng.chula.ac.th",
  "student@eng.chula.ac.th",
  "niphon.w@eng.chula.ac.th",
  "angkee.s@eng.chula.ac.th",
  "alongkorn.p@eng.chula.ac.th",
  "sunhapos.c@eng.chula.ac.th",
  "viboon.s@eng.chula.ac.th",
];

interface AppContextType {
  user: MockUser | null;
  users: MockUser[];
  submissions: MockSubmission[];
  notifications: MockNotification[];
  externalRequests: MockExternalRequest[];
  unreadCount: number;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  createSubmission: (data: SubmissionFormData) => Promise<MockSubmission>;
  approveCurrentStep: (submissionId: string, notes?: string) => Promise<void>;
  rejectCurrentStep: (submissionId: string, notes: string) => Promise<void>;
  returnToPrevStep: (submissionId: string, notes?: string) => Promise<void>;
  addUpload: (submissionId: string, formType: FormType, fileName: string, fileSize: number, fileContent?: string) => void;
  getPendingCount: (role: string) => number;
  studentResubmit: (submissionId: string) => Promise<void>;
  requestCancelSubmission: (submissionId: string) => Promise<void>;
  adminAcceptCancel: (submissionId: string) => Promise<void>;
  adminDeclineCancel: (submissionId: string) => Promise<void>;
  continueDraft: (submissionId: string) => Promise<void>;
  getOrCreateDefenseDraft: () => Promise<MockSubmission>;
  saveDefenseDraft: (
    submissionId: string,
    data: {
      title: string;
      people: { name: string; email: string; role: string; phone?: string }[];
      examDate: string;
      examTime: string;
      roomNeeded: boolean;
      parkingNeeded: boolean;
      carPlate?: string;
    },
    confirm: boolean
  ) => Promise<MockSubmission>;
  getOrCreateProposalDraft: () => Promise<MockSubmission>;
  saveProposalDraft: (
    submissionId: string,
    data: {
      title: string;
      program: string;
      studentPhone?: string;
      people: { name: string; email: string; role: string; phone?: string }[];
      examDate: string;
      examTime: string;
      roomNeeded: boolean;
      parkingNeeded: boolean;
      carPlate?: string;
    },
    confirm: boolean
  ) => Promise<MockSubmission>;
  committeeSign: (submissionId: string, decision: "APPROVED" | "REJECTED", notes?: string) => Promise<void>;
  needsMyAction: (sub: MockSubmission) => boolean;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  adminSetNote: (submissionId: string, note: string) => Promise<void>;
  adminUpdateSubmission: (id: string, updates: Record<string, unknown>) => Promise<void>;
  adminDeleteSubmission: (id: string) => Promise<void>;
  adminResetSubmission: (id: string) => Promise<void>;
  adminOverrideStep: (submissionId: string, stepOrder: number, action: "APPROVED" | "REJECTED", notes?: string) => Promise<void>;
  superAdminUpdateUserRole: (userId: string, newRole: Role) => Promise<void>;
  superAdminDeleteUser: (userId: string) => Promise<void>;
  superAdminAddUser: (userData: Omit<MockUser, "id"> & {
    passcode?: string;
    // Set when this account creation is approving a student's ExternalCommitteeRequest —
    // links the two records server-side and notifies the requesting student.
    externalRequestId?: string;
  }) => Promise<{ emailSent: boolean }>;
  superAdminResetPasscode: (userId: string, passcode?: string) => Promise<{ emailSent: boolean }>;
  adminUpdateUserInfo: (userId: string, updates: { title?: NameTitle | null; name?: string; studentId?: string; email?: string }) => Promise<{ emailChangeNoticesSent?: boolean }>;
  // Persists a full drag-and-drop reorder of one role group (ADMIN/PROFESSOR/EXTERNAL/STUDENT) —
  // orderedIds must be exactly that group's current members, in the new order. Recomputes every
  // affected user's rank code (A001/B002/...) server-side; see "add some string to rank the user"
  // feature in AdminUsersPanel.
  adminReorderUsers: (role: Role, orderedIds: string[]) => Promise<void>;
  adminSetProgramChair: (program: ProgramType, userId: string | null) => Promise<void>;
  adminSetFinanceContact: (userId: string | null) => Promise<void>;
  submitExternalRequest: (data: { title?: NameTitle | null; name: string; email: string; affiliation?: string; phone?: string }) => Promise<void>;
  rejectExternalRequest: (id: string, reviewNote?: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [submissions,   setSubmissions]   = useState<MockSubmission[]>([]);
  const [notifications, setNotifications] = useState<MockNotification[]>([]);
  const [users,         setUsers]         = useState<MockUser[]>([]);
  const [externalRequests, setExternalRequests] = useState<MockExternalRequest[]>([]);
  const [loading,       setLoading]       = useState(true);

  const user: MockUser | null = session?.user
    ? {
        id: session.user.id,
        title: (session.user as any).title ?? null,
        name: session.user.name,
        email: session.user.email,
        roles: ((session.user as any).roles ?? [session.user.role as string]) as Role[],
        role: (((session.user as any).roles as string[])?.[0] ?? session.user.role) as Role,
        studentId: session.user.studentId,
        programChairFor: ((session.user as any).programChairFor ?? []) as ProgramType[],
      }
    : null;

  const unreadCount = notifications.filter((n) => !n.isRead && n.recipientId === user?.id).length;

  async function refresh() {
    if (status !== "authenticated") return;
    const [subs, notifs, usrs, extReqs] = await Promise.all([
      api<MockSubmission[]>("/api/submissions"),
      api<MockNotification[]>("/api/notifications"),
      api<MockUser[]>("/api/users"),
      api<MockExternalRequest[]>("/api/external-requests"),
    ]);
    setSubmissions(subs);
    setNotifications(notifs);
    setUsers(usrs);
    setExternalRequests(extReqs);
  }

  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      refresh().finally(() => setLoading(false));
    } else if (status === "unauthenticated") {
      setSubmissions([]);
      setNotifications([]);
      setUsers([]);
      setExternalRequests([]);
      setLoading(false);
    }
  }, [status]);

  // Keep data fresh: silent refetch every 60s and whenever the tab regains focus,
  // so pending lists and the notification bell update without a manual reload.
  useEffect(() => {
    if (status !== "authenticated") return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try { await refresh(); } catch { /* keep last good data */ } finally { busy = false; }
    };
    const interval = setInterval(tick, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status]);

  async function logout() {
    await signOut({ redirect: false });
  }

  async function createSubmission(data: SubmissionFormData): Promise<MockSubmission> {
    const sub = await api<MockSubmission>("/api/submissions", "POST", data);
    setSubmissions((prev) => [sub, ...prev]);
    return sub;
  }

  async function approveCurrentStep(submissionId: string, notes?: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "approve", notes });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refreshNotifications();
  }

  async function rejectCurrentStep(submissionId: string, notes: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "reject", notes });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refreshNotifications();
  }

  // For now, addUpload uses the existing file store for backward compatibility
  // Real uploads go through /api/upload
  function addUpload(submissionId: string, formType: FormType, fileName: string, fileSize: number) {
    const id = `up-${Date.now()}`;
    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id !== submissionId) return sub;
        return {
          ...sub,
          uploads: [...sub.uploads, { id, formType, fileName, fileSize, fileUrl: "", uploadedAt: new Date().toISOString() }],
        };
      })
    );
  }

  async function returnToPrevStep(submissionId: string, notes?: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "return_to_prev", notes });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refreshNotifications();
  }

  async function studentResubmit(submissionId: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "resubmit" });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
  }

  async function requestCancelSubmission(submissionId: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "request_cancel" });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refreshNotifications();
  }

  async function adminAcceptCancel(submissionId: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "accept_cancel" });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refresh();
  }

  async function adminDeclineCancel(submissionId: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "decline_cancel" });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
  }

  async function continueDraft(submissionId: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "continue_draft" });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
  }

  async function getOrCreateDefenseDraft(): Promise<MockSubmission> {
    const sub = await api<MockSubmission>("/api/submissions/auto-draft-defense", "POST");
    setSubmissions((prev) => (prev.some((s) => s.id === sub.id) ? prev.map((s) => (s.id === sub.id ? sub : s)) : [sub, ...prev]));
    return sub;
  }

  async function saveDefenseDraft(
    submissionId: string,
    data: Parameters<AppContextType["saveDefenseDraft"]>[1],
    confirm: boolean
  ): Promise<MockSubmission> {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", {
      action: "save_defense_draft",
      ...data,
      confirm,
    });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    return sub;
  }

  async function getOrCreateProposalDraft(): Promise<MockSubmission> {
    const sub = await api<MockSubmission>("/api/submissions/auto-draft-proposal", "POST");
    setSubmissions((prev) => (prev.some((s) => s.id === sub.id) ? prev.map((s) => (s.id === sub.id ? sub : s)) : [sub, ...prev]));
    return sub;
  }

  async function saveProposalDraft(
    submissionId: string,
    data: Parameters<AppContextType["saveProposalDraft"]>[1],
    confirm: boolean
  ): Promise<MockSubmission> {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", {
      action: "save_proposal_draft",
      ...data,
      confirm,
    });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    return sub;
  }

  async function committeeSign(submissionId: string, decision: "APPROVED" | "REJECTED", notes?: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}/sign`, "POST", { decision, notes });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
    await refreshNotifications();
  }

  function needsMyAction(sub: MockSubmission): boolean {
    if (!user) return false;
    const step = sub.workflowSteps.find((s) => s.status === "PENDING");
    if (!step) return false;
    switch (step.role) {
      case "STUDENT":               return sub.studentId === user.id;
      case "ADVISOR":               return (sub as any).advisorId === user.id;
      case "HEAD_EXAM_COMMITTEE":   return (sub as any).headCommitteeId === user.id;
      case "PROGRAM_CHAIR":
        return (sub as any).programChairId ? (sub as any).programChairId === user.id : (!!sub.program && (user.programChairFor ?? []).includes(sub.program));
      case "CO_ADVISOR":
      case "EXAM_COMMITTEE":
      case "INVITED_EXAM_COMMITTEE": {
        if (!step.committeeMembers?.includes(user.id)) return false;
        if ((step.committeeActions ?? []).some((a) => a.userId === user.id)) return false;
        // Only the next unsigned member can act (sequential)
        const members = step.committeeMembers ?? [];
        const idx = members.indexOf(user.id);
        const prevUnsigned = members.slice(0, idx).some(
          (mid) => !(step.committeeActions ?? []).some((a) => a.userId === mid && a.decision === "APPROVED")
        );
        return !prevUnsigned;
      }
      default:
        return user.roles.includes(step.role as Role);
    }
  }

  function getPendingCount(role: string): number {
    return submissions.filter((sub) => {
      const step = sub.workflowSteps.find((s) => s.status === "PENDING");
      if (step?.role !== role) return false;
      if (!user) return false;
      switch (role) {
        case "STUDENT":               return sub.studentId === user.id;
        case "ADVISOR":               return (sub as any).advisorId === user.id;
        case "HEAD_EXAM_COMMITTEE":   return (sub as any).headCommitteeId === user.id;
        case "PROGRAM_CHAIR":
          return (sub as any).programChairId ? (sub as any).programChairId === user.id : (!!sub.program && (user.programChairFor ?? []).includes(sub.program));
        case "CO_ADVISOR":
        case "EXAM_COMMITTEE":
        case "INVITED_EXAM_COMMITTEE": {
          if (!step.committeeMembers?.includes(user.id)) return false;
          if ((step.committeeActions ?? []).some((a) => a.userId === user.id)) return false;
          const members = step.committeeMembers ?? [];
          const idx = members.indexOf(user.id);
          const prevUnsigned = members.slice(0, idx).some(
            (mid) => !(step.committeeActions ?? []).some((a) => a.userId === mid && a.decision === "APPROVED")
          );
          return !prevUnsigned;
        }
        default:
          return user.roles.includes(role as any);
      }
    }).length;
  }

  async function refreshNotifications() {
    const notifs = await api<MockNotification[]>("/api/notifications");
    setNotifications(notifs);
  }

  async function markNotificationRead(id: string) {
    await api(`/api/notifications/${id}`, "PATCH");
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function markAllNotificationsRead() {
    await api("/api/notifications", "PATCH");
    setNotifications((prev) => prev.map((n) => (n.recipientId === user?.id ? { ...n, isRead: true } : n)));
  }

  async function adminSetNote(submissionId: string, note: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "admin_set_note", note });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
  }

  async function adminUpdateSubmission(id: string, updates: Record<string, unknown>) {
    const sub = await api<MockSubmission>(`/api/submissions/${id}`, "PATCH", { action: "admin_update", ...updates });
    setSubmissions((prev) => prev.map((s) => (s.id === id ? sub : s)));
  }

  async function adminDeleteSubmission(id: string) {
    await api(`/api/submissions/${id}`, "DELETE");
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  async function adminResetSubmission(id: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${id}`, "PATCH", { action: "admin_reset" });
    setSubmissions((prev) => prev.map((s) => (s.id === id ? sub : s)));
  }

  async function adminOverrideStep(submissionId: string, stepOrder: number, action: "APPROVED" | "REJECTED", notes?: string) {
    const sub = await api<MockSubmission>(`/api/submissions/${submissionId}`, "PATCH", { action: "admin_override_step", stepOrder, decision: action, notes });
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? sub : s)));
  }

  async function superAdminUpdateUserRole(userId: string, newRole: Role) {
    const updated = await api<MockUser>(`/api/users/${userId}`, "PATCH", { role: newRole });
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
  }

  async function superAdminDeleteUser(userId: string) {
    await api(`/api/users/${userId}`, "DELETE");
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  async function superAdminAddUser(userData: Parameters<AppContextType["superAdminAddUser"]>[0]) {
    const newUser = await api<MockUser & { emailSent: boolean }>("/api/users", "POST", userData);
    setUsers((prev) => [...prev, newUser]);
    // Approving a request updates its status server-side — refetch so the review queue drops it.
    if (userData.externalRequestId) {
      const reqs = await api<MockExternalRequest[]>("/api/external-requests");
      setExternalRequests(reqs);
    }
    return { emailSent: newUser.emailSent };
  }

  async function superAdminResetPasscode(userId: string, passcode?: string) {
    const updated = await api<MockUser & { passcodeEmailSent?: boolean }>(`/api/users/${userId}`, "PATCH", { resetPasscode: true, passcode });
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    return { emailSent: updated.passcodeEmailSent ?? false };
  }

  async function adminUpdateUserInfo(userId: string, updates: { title?: NameTitle | null; name?: string; studentId?: string; email?: string }) {
    const updated = await api<MockUser & { emailChangeNoticesSent?: boolean }>(`/api/users/${userId}`, "PATCH", updates);
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    return { emailChangeNoticesSent: updated.emailChangeNoticesSent };
  }

  async function adminReorderUsers(role: Role, orderedIds: string[]) {
    await api("/api/admin/users/reorder", "POST", { role, orderedIds });
    await refresh(); // recomputes every user's rank code (A001/B002/...) in that group
  }

  async function adminSetProgramChair(program: ProgramType, userId: string | null) {
    await api("/api/admin/program-chairs", "POST", { program, userId });
    await refresh(); // clears the previous holder + sets the new one across the user list
  }

  async function adminSetFinanceContact(userId: string | null) {
    await api("/api/admin/finance-contact", "POST", { userId });
    await refresh(); // clears the previous holder + sets the new one across the user list
  }

  async function submitExternalRequest(data: { title?: NameTitle | null; name: string; email: string; affiliation?: string; phone?: string }) {
    const req = await api<MockExternalRequest>("/api/external-requests", "POST", data);
    setExternalRequests((prev) => [req, ...prev]);
  }

  async function rejectExternalRequest(id: string, reviewNote?: string) {
    const req = await api<MockExternalRequest>(`/api/external-requests/${id}`, "PATCH", { action: "reject", reviewNote });
    setExternalRequests((prev) => prev.map((r) => (r.id === id ? req : r)));
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      user, users, submissions, notifications, externalRequests, unreadCount, loading,
      logout, refresh,
      createSubmission, approveCurrentStep, rejectCurrentStep, returnToPrevStep,
      addUpload, getPendingCount, studentResubmit, requestCancelSubmission, adminAcceptCancel, adminDeclineCancel, continueDraft,
      getOrCreateDefenseDraft, saveDefenseDraft,
      getOrCreateProposalDraft, saveProposalDraft,
      committeeSign, needsMyAction,
      markNotificationRead, markAllNotificationsRead,
      adminSetNote, adminUpdateSubmission, adminDeleteSubmission,
      adminResetSubmission, adminOverrideStep,
      superAdminUpdateUserRole, superAdminDeleteUser, superAdminAddUser, superAdminResetPasscode,
      adminUpdateUserInfo, adminReorderUsers, adminSetProgramChair, adminSetFinanceContact,
      submitExternalRequest, rejectExternalRequest,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
