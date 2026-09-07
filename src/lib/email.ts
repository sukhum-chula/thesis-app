import nodemailer from "nodemailer";
import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { ROLE_LABELS } from "./utils";
import { getSignedUrl } from "./supabase";

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function getTransport() {
  // Office365 / generic SMTP takes priority when configured (e.g. suphap.m@chula.ac.th).
  // Requires "Authenticated SMTP" enabled on the mailbox — Chula IT may need to allow it.
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.office365.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false, // STARTTLS on 587
      auth: { user: smtpUser, pass: smtpPass },
    });
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

// The from address must match the authenticated account (both Gmail and Office365 enforce this)
function getFromAddress(): string {
  return `"ระบบวิทยานิพนธ์ ME CU" <${process.env.SMTP_USER || process.env.GMAIL_USER}>`;
}

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<{ error: Error | null }> {
  const transport = getTransport();
  if (!transport) {
    console.log("[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping");
    return { error: null };
  }
  try {
    await transport.sendMail({
      from: getFromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function getAppUrl(): string {
  // Strip trailing slashes — NEXTAUTH_URL with a trailing "/" produced
  // "https://host//api/auth/magic" links that mail filters flag as malformed
  const url =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}


interface StepEmailOptions {
  role: string;
  isRejection?: boolean;
  rejectionNote?: string;
  sub: {
    id: string;
    title: string;
    studentId?: string | null;
    studentFullName?: string | null;
    studentCode?: string | null;
    advisorId?: string | null;
    headCommitteeId?: string | null;
    committeeIds?: string[];
    invitedCommitteeId?: string | null;
    programChairId?: string | null;
    program?: string | null;
  };
  stepName: string;
  /** For EXAM_COMMITTEE chain-sign: send email to only this specific member instead of all */
  specificMemberId?: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
}

export async function sendStepEmail(options: StepEmailOptions): Promise<void> {
  const { role, sub, stepName, isRejection, rejectionNote } = options;

  let recipients: Recipient[] = [];

  try {
    if (role === "STUDENT" && sub.studentId) {
      const u = await prisma.user.findUnique({ where: { id: sub.studentId } });
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    } else if (role === "ADVISOR" && sub.advisorId) {
      const u = await prisma.user.findUnique({ where: { id: sub.advisorId } });
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    } else if (role === "HEAD_EXAM_COMMITTEE" && sub.headCommitteeId) {
      const u = await prisma.user.findUnique({ where: { id: sub.headCommitteeId } });
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    } else if (role === "EXAM_COMMITTEE" || role === "CO_ADVISOR") {
      if (options.specificMemberId) {
        const u = await prisma.user.findUnique({ where: { id: options.specificMemberId } });
        if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
      } else {
        // Fallback: first member only
        const ids: string[] = role === "EXAM_COMMITTEE" ? (sub.committeeIds ?? []) : ((sub as any).coAdvisorIds ?? []);
        if (ids[0]) {
          const u = await prisma.user.findUnique({ where: { id: ids[0] } });
          if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
        }
      }
    } else if (role === "INVITED_EXAM_COMMITTEE" && sub.invitedCommitteeId) {
      const u = await prisma.user.findUnique({ where: { id: sub.invitedCommitteeId } });
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    } else if (role === "PROGRAM_CHAIR") {
      // Per-submission chair (assigned by the student) with per-program admin-designated fallback
      const u = sub.programChairId
        ? await prisma.user.findUnique({ where: { id: sub.programChairId } })
        : sub.program
        ? await prisma.user.findFirst({ where: { programChairFor: sub.program as any } })
        : null;
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    } else {
      const u = await prisma.user.findFirst({ where: { roles: { has: role as any } } });
      if (u) recipients = [{ id: u.id, name: u.name, email: u.email }];
    }
  } catch (e) {
    console.error("[email/step] Error looking up recipients:", e);
    return;
  }

  if (!recipients.length) {
    console.log(`[email/step] No recipients found for role ${role}`);
    return;
  }

  const studentDisplay = sub.studentFullName ?? (sub.studentCode ? `รหัส ${sub.studentCode}` : "นิสิต");
  const roleLabel = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;

  for (const recipient of recipients) {
    const base = getAppUrl();
    const destinationPath =
      role === "ADMIN"   ? `/dashboard/admin/${sub.id}` :
      role === "STUDENT" ? `/dashboard/student/${sub.id}` :
                           `/dashboard/professor/${sub.id}`;

    // Generate a one-click magic link: auto-logs recipient in and lands on the submission.
    // Token is NOT consumed on use (SafeLinks prefetch safety) — expires after 48h.
    let magicLink = `${base}/login`; // fallback if token creation fails
    try {
      const tokenValue = randomBytes(32).toString("hex");
      await prisma.magicToken.create({
        data: {
          token:      tokenValue,
          userId:     recipient.id,
          redirectTo: destinationPath,
          expiresAt:  new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      magicLink = `${base}/api/auth/magic?t=${tokenValue}`;
    } catch (e) {
      console.error("[email/step] Failed to create magic token for", recipient.email, e);
    }

    const subject = isRejection
      ? `[ระบบจัดการวิทยานิพนธ์] คำร้องถูกปฏิเสธ — ${sub.title}`
      : `[ระบบจัดการวิทยานิพนธ์] ${stepName} — ${sub.title}`;
    const html = isRejection
      ? buildRejectedHtml(recipient.name, recipient.email, roleLabel, stepName, sub.title, studentDisplay, magicLink, rejectionNote)
      : buildHtml(recipient.name, recipient.email, roleLabel, stepName, sub.title, studentDisplay, magicLink);
    const { error } = await sendMail({
      to: recipient.email,
      subject,
      html,
    });

    if (error) {
      console.error(`[email/step] Send error (${recipient.email}):`, error.message);
      // Surface the failure in the admins' notification bell — otherwise the workflow
      // stalls silently because the recipient never learns it is their turn.
      try {
        const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
        if (admins.length) {
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              recipientId: a.id,
              message: `⚠️ ส่งอีเมลไม่สำเร็จถึง ${recipient.name} (${recipient.email})`,
              detail: `${stepName} — กรุณาแจ้งผู้เกี่ยวข้องโดยตรง`,
              submissionId: sub.id,
              type: "info",
            })),
          });
        }
      } catch (e) {
        console.error("[email/step] failed to notify admins about send failure:", e);
      }
    } else {
      console.log(`[email/step] Sent to ${recipient.email}`);
    }
  }
}

function buildHtml(
  recipientName: string,
  recipientEmail: string,
  roleLabel: string,
  stepName: string,
  thesisTitle: string,
  studentName: string,
  magicLink: string,
): string {
  const rName   = escapeHtml(recipientName);
  const rEmail  = escapeHtml(recipientEmail);
  const rLabel  = escapeHtml(roleLabel);
  const sName   = escapeHtml(stepName);
  const tTitle  = escapeHtml(thesisTitle);
  const stName  = escapeHtml(studentName);
  return `
    <div style="font-family:'Sarabun',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#1e40af,#4f46e5);border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;">ระบบจัดการวิทยานิพนธ์</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
      </div>

      <p style="color:#374151;font-size:16px;">เรียน ${rName} <span style="color:#6b7280;font-size:14px;">(${rLabel})</span></p>
      <p style="color:#374151;">ด้วยคำร้องวิทยานิพนธ์ของนิสิตตามรายละเอียดด้านล่าง ได้ดำเนินมาถึงขั้นตอนที่ต้องได้รับการพิจารณาดำเนินการจากท่าน จึงใคร่ขอความอนุเคราะห์ท่านเข้าสู่ระบบเพื่อดำเนินการในส่วนที่เกี่ยวข้อง</p>

      <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 4px;font-weight:700;color:#1e40af;font-size:13px;">ขั้นตอนที่ขอความอนุเคราะห์ดำเนินการ</p>
        <p style="margin:0;color:#1d4ed8;font-size:16px;font-weight:600;">${sName}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px;">
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">ชื่อนิสิต</td>
          <td style="padding:10px 14px;color:#111827;">${stName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;">ชื่อวิทยานิพนธ์</td>
          <td style="padding:10px 14px;color:#111827;">${tTitle}</td>
        </tr>
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;">เข้าสู่ระบบในฐานะ</td>
          <td style="padding:10px 14px;color:#111827;">${rName} (${rEmail})</td>
        </tr>
      </table>

      <p style="color:#374151;margin:24px 0;">
        ท่านสามารถเข้าสู่ระบบเพื่อดูคำร้องได้ที่ <a href="${magicLink}" style="color:#1d4ed8;word-break:break-all;">${magicLink}</a><br><br>
        <span style="color:#6b7280;font-size:13px;">เข้าสู่ระบบด้วยอีเมล ${rEmail} และรหัสเข้าใช้งานของท่าน — หากลืมรหัสเข้าใช้งาน กรุณาติดต่อเจ้าหน้าที่ภาควิชาเพื่อขอรหัสใหม่</span>
      </p>

      <p style="color:#374151;margin-top:24px;">จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการ และขอขอบพระคุณมา ณ โอกาสนี้</p>
      <p style="color:#374151;margin-top:16px;">ขอแสดงความนับถือ<br>ภาควิชาวิศวกรรมเครื่องกล<br>คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>

      <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        อีเมลฉบับนี้ส่งจากระบบจัดการวิทยานิพนธ์โดยอัตโนมัติ กรุณาอย่าตอบกลับ<br>
        หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่ภาควิชาวิศวกรรมเครื่องกล
      </p>
    </div>
  `;
}

function buildRejectedHtml(
  recipientName: string,
  recipientEmail: string,
  roleLabel: string,
  stepName: string,
  thesisTitle: string,
  studentName: string,
  magicLink: string,
  rejectionNote?: string,
): string {
  const rName  = escapeHtml(recipientName);
  const rEmail = escapeHtml(recipientEmail);
  const rLabel = escapeHtml(roleLabel);
  const sName  = escapeHtml(stepName);
  const tTitle = escapeHtml(thesisTitle);
  const stName = escapeHtml(studentName);
  const note   = rejectionNote ? escapeHtml(rejectionNote) : null;
  return `
    <div style="font-family:'Sarabun',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#b91c1c,#dc2626);border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;">ระบบจัดการวิทยานิพนธ์</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
      </div>

      <p style="color:#374151;font-size:16px;">เรียน ${rName} <span style="color:#6b7280;font-size:14px;">(${rLabel})</span></p>
      <p style="color:#374151;">ขอเรียนแจ้งให้ทราบว่า คำร้องวิทยานิพนธ์ของท่านไม่ผ่านการพิจารณาในขั้นตอน <strong>${sName}</strong> จึงใคร่ขอให้ท่านตรวจสอบและแก้ไขเอกสารตามข้อเสนอแนะด้านล่าง แล้วยื่นคำร้องใหม่ผ่านระบบอีกครั้ง</p>

      <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 4px;font-weight:700;color:#b91c1c;font-size:13px;">ขั้นตอนที่ไม่ผ่านการพิจารณา</p>
        <p style="margin:0;color:#dc2626;font-size:16px;font-weight:600;">${sName}</p>
        ${note ? `<p style="margin:8px 0 0;color:#7f1d1d;font-size:14px;">ข้อเสนอแนะ: ${note}</p>` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px;">
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">ชื่อนิสิต</td>
          <td style="padding:10px 14px;color:#111827;">${stName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;">ชื่อวิทยานิพนธ์</td>
          <td style="padding:10px 14px;color:#111827;">${tTitle}</td>
        </tr>
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;">เข้าสู่ระบบในฐานะ</td>
          <td style="padding:10px 14px;color:#111827;">${rName} (${rEmail})</td>
        </tr>
      </table>

      <p style="color:#374151;margin:24px 0;">
        ท่านสามารถเข้าสู่ระบบเพื่อดูคำร้องได้ที่ <a href="${magicLink}" style="color:#1d4ed8;word-break:break-all;">${magicLink}</a><br><br>
        <span style="color:#6b7280;font-size:13px;">เข้าสู่ระบบด้วยอีเมล ${rEmail} และรหัสเข้าใช้งานของท่าน — หากลืมรหัสเข้าใช้งาน กรุณาติดต่อเจ้าหน้าที่ภาควิชาเพื่อขอรหัสใหม่</span>
      </p>

      <p style="color:#374151;margin-top:24px;">จึงเรียนมาเพื่อโปรดทราบและดำเนินการแก้ไข</p>
      <p style="color:#374151;margin-top:16px;">ขอแสดงความนับถือ<br>ภาควิชาวิศวกรรมเครื่องกล<br>คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>

      <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบจัดการวิทยานิพนธ์ ภาควิชาวิศวกรรมเครื่องกล จุฬาฯ<br>
        กรุณาอย่าตอบกลับอีเมลนี้
      </p>
    </div>
  `;
}

// ─── Welcome email (sent when an admin creates an account) ────────────────────

export interface WelcomeEmailData {
  userId: string;
  name: string;
  email: string;
  passcode: string;
  role?: string;
}

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<{ sent: boolean }> {
  const loginLink = `${getAppUrl()}/login`;
  const { error } = await sendMail({
    to: data.email,
    subject: "[ระบบจัดการวิทยานิพนธ์] ยินดีต้อนรับ — รหัสเข้าใช้งานของท่าน",
    html: buildWelcomeHtml(data.name, data.email, data.passcode, loginLink),
  });

  if (error) {
    console.error(`[email/welcome] Send error (${data.email}):`, error.message);
    return { sent: false };
  }
  console.log(`[email/welcome] Sent to ${data.email}`);
  return { sent: true };
}

function buildWelcomeHtml(name: string, email: string, passcode: string, loginLink: string): string {
  const rName  = escapeHtml(name);
  const rEmail = escapeHtml(email);
  const rPass  = escapeHtml(passcode);
  return `
    <div style="font-family:'Sarabun',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#1e40af,#4f46e5);border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;">ระบบจัดการวิทยานิพนธ์</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
      </div>

      <p style="color:#374151;font-size:16px;">เรียน ${rName}</p>
      <p style="color:#374151;">เจ้าหน้าที่ภาควิชาได้สร้างบัญชีผู้ใช้งานสำหรับท่านเรียบร้อยแล้ว กรุณาเก็บรักษารหัสเข้าใช้งานด้านล่างไว้สำหรับการเข้าสู่ระบบในครั้งถัดไป (ท่านไม่สามารถเปลี่ยนรหัสนี้ได้ด้วยตนเอง — หากลืมหรือต้องการรหัสใหม่ กรุณาติดต่อเจ้าหน้าที่ภาควิชา)</p>

      <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px;font-weight:700;color:#166534;font-size:13px;">ข้อมูลบัญชีของท่าน</p>
        <p style="margin:0 0 6px;color:#374151;font-size:15px;"><strong>อีเมล:</strong> ${rEmail}</p>
        <p style="margin:0;color:#374151;font-size:15px;"><strong>รหัสเข้าใช้งาน:</strong> <code style="background:#e5e7eb;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:15px;letter-spacing:0.05em;">${rPass}</code></p>
      </div>

      <p style="color:#374151;margin:24px 0;">
        ท่านสามารถเข้าสู่ระบบได้ที่ <a href="${loginLink}" style="color:#1d4ed8;word-break:break-all;">${loginLink}</a><br>
        <span style="color:#6b7280;font-size:13px;">ใช้อีเมลและรหัสเข้าใช้งานด้านบนเพื่อเข้าสู่ระบบ</span>
      </p>

      <p style="color:#374151;margin-top:16px;">ขอแสดงความนับถือ<br>ภาควิชาวิศวกรรมเครื่องกล<br>คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>

      <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบจัดการวิทยานิพนธ์ ภาควิชาวิศวกรรมเครื่องกล จุฬาฯ<br>
        กรุณาอย่าตอบกลับอีเมลนี้
      </p>
    </div>
  `;
}

// ─── Passcode-reset email (sent when an admin resets a user's passcode) ───────

export interface PasscodeResetEmailData {
  userId: string;
  name: string;
  email: string;
  passcode: string;
  role: string;
}

export async function sendPasscodeResetEmail(data: PasscodeResetEmailData): Promise<void> {
  const loginLink = `${getAppUrl()}/login`;
  const { error } = await sendMail({
    to: data.email,
    subject: "[ระบบจัดการวิทยานิพนธ์] รหัสเข้าใช้งานใหม่ของคุณ",
    html: buildPasscodeResetHtml(data.name, data.email, data.passcode, loginLink),
  });

  if (error) {
    console.error(`[email/passcode-reset] Send error (${data.email}):`, error.message);
  } else {
    console.log(`[email/passcode-reset] Sent to ${data.email}`);
  }
}

function buildPasscodeResetHtml(name: string, email: string, passcode: string, loginLink: string): string {
  const rName  = escapeHtml(name);
  const rEmail = escapeHtml(email);
  const rPass  = escapeHtml(passcode);
  return `
    <div style="font-family:'Sarabun',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#1e40af,#4f46e5);border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;">ระบบจัดการวิทยานิพนธ์</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
      </div>

      <p style="color:#374151;font-size:16px;">เรียน ${rName}</p>
      <p style="color:#374151;">ผู้ดูแลระบบได้ออกรหัสเข้าใช้งานใหม่สำหรับบัญชีผู้ใช้งานระบบจัดการวิทยานิพนธ์ของท่านเรียบร้อยแล้ว ดังนี้</p>

      <div style="background:#fefce8;border-left:4px solid #eab308;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px;font-weight:700;color:#713f12;font-size:13px;">รหัสเข้าใช้งานใหม่</p>
        <p style="margin:0 0 6px;color:#374151;font-size:15px;"><strong>อีเมล:</strong> ${rEmail}</p>
        <p style="margin:0;color:#374151;font-size:15px;"><strong>รหัสเข้าใช้งานใหม่:</strong> <code style="background:#e5e7eb;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:15px;letter-spacing:0.05em;">${rPass}</code></p>
      </div>

      <p style="color:#6b7280;font-size:14px;">รหัสเข้าใช้งานเดิมของท่านใช้งานไม่ได้อีกต่อไป หากท่านไม่ได้คาดหมายว่าจะมีการออกรหัสใหม่ กรุณาติดต่อผู้ดูแลระบบทันที</p>

      <p style="color:#374151;margin:24px 0;">
        ท่านสามารถเข้าสู่ระบบได้ที่ <a href="${loginLink}" style="color:#1d4ed8;word-break:break-all;">${loginLink}</a><br>
        <span style="color:#6b7280;font-size:13px;">ใช้อีเมลและรหัสเข้าใช้งานใหม่ด้านบนเพื่อเข้าสู่ระบบ</span>
      </p>

      <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบจัดการวิทยานิพนธ์ ภาควิชาวิศวกรรมเครื่องกล จุฬาฯ<br>
        กรุณาอย่าตอบกลับอีเมลนี้
      </p>
    </div>
  `;
}

// ─── Finance email ─────────────────────────────────────────────────────────────

export interface FinanceEmailData {
  studentName: string;
  studentCode: string;
  studentEmail?: string;
  studentPhone?: string;
  program: string;
  thesisTitle: string;
  submissionId: string;
  advisorName?: string;
  headCommitteeName?: string;
  committeeNames?: string[];
  invitedProfName?: string;
  invitedProfAffiliation?: string;
  invitedProfEmail?: string;
  invitedProfPhone?: string;
  examDate?: string;
  examTime?: string;
  roomNeeded?: boolean;
  parkingNeeded?: boolean;
  carPlate?: string;
  financeAttachUrl?: string;
  financeAttachName?: string;
  emailSubject?: string;
}

export async function sendFinanceEmail(data: FinanceEmailData): Promise<void> {
  const financeEmail = process.env.FINANCE_EMAIL;
  if (!financeEmail) {
    console.warn("[email/finance] FINANCE_EMAIL env var not set — skipping");
    return;
  }
  const {
    studentName, studentCode, studentEmail, studentPhone,
    program, thesisTitle, submissionId,
    advisorName, headCommitteeName, committeeNames,
    invitedProfName, invitedProfAffiliation, invitedProfEmail, invitedProfPhone,
    examDate, examTime, roomNeeded, parkingNeeded, carPlate,
    financeAttachUrl, financeAttachName, emailSubject,
  } = data;

  // Fetch finance attachment file if available — financeAttachUrl is a storage path
  // (bucket is private), so mint a short-lived signed URL before fetching it.
  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (financeAttachUrl) {
    try {
      const signedUrl = await getSignedUrl(financeAttachUrl);
      const res = await fetch(signedUrl);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        attachments = [{ filename: financeAttachName ?? "finance_attachment.pdf", content: Buffer.from(arrayBuffer) }];
      }
    } catch (e) {
      console.warn("[email/finance] Could not fetch finance attachment:", e);
    }
  }

  const committeeRows = [
    headCommitteeName ? `<tr><td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">ประธานกรรมการสอบ</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(headCommitteeName)}</td></tr>` : "",
    ...(committeeNames ?? []).map((name, i) =>
      `<tr style="${i % 2 === 0 ? "background:#f9fafb;" : ""}"><td style="padding:10px 14px;font-weight:600;color:#6b7280;">กรรมการสอบ ${i + 1}</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(name)}</td></tr>`
    ),
    invitedProfName ? `<tr><td style="padding:10px 14px;font-weight:600;color:#6b7280;">กรรมการภายนอก</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(invitedProfName)}${invitedProfAffiliation ? ` (${escapeHtml(invitedProfAffiliation)})` : ""}${invitedProfEmail ? `<br><span style="color:#6b7280;font-size:13px;">📧 ${escapeHtml(invitedProfEmail)}</span>` : ""}${invitedProfPhone ? `<br><span style="color:#6b7280;font-size:13px;">📞 ${escapeHtml(invitedProfPhone)}</span>` : ""}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const { error } = await sendMail({
    to: financeEmail,
    subject: emailSubject ?? `[แจ้งการเงิน] นิสิตยื่นเสนอหัวข้อวิทยานิพนธ์ — ${studentName}`,
    attachments,
    html: `
      <div style="font-family:'Sarabun',sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#1e40af,#4f46e5);border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
          <h1 style="margin:0;font-size:20px;">ระบบจัดการวิทยานิพนธ์</h1>
          <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
        </div>

        <p style="color:#374151;font-size:16px;">เรียน เจ้าหน้าที่ฝ่ายการเงิน</p>
        <p style="color:#374151;">ด้วยนิสิตตามรายละเอียดด้านล่างได้ยื่นคำร้องผ่านระบบจัดการวิทยานิพนธ์ และได้รับการอนุมัติจากประธานหลักสูตรเรียบร้อยแล้ว จึงใคร่ขอความอนุเคราะห์ดำเนินการในส่วนที่เกี่ยวข้อง (เอกสารการเงินแนบกรรมการสอบตามไฟล์แนบ)</p>

        <p style="font-weight:700;color:#1e40af;font-size:14px;margin:20px 0 8px;">ข้อมูลนิสิต</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <tr style="background:#f3f4f6;">
            <td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">ชื่อ-นามสกุล</td>
            <td style="padding:10px 14px;color:#111827;">${escapeHtml(studentName)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;color:#6b7280;">รหัสนิสิต</td>
            <td style="padding:10px 14px;color:#111827;">${escapeHtml(studentCode)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:10px 14px;font-weight:600;color:#6b7280;">หลักสูตร</td>
            <td style="padding:10px 14px;color:#111827;">${escapeHtml(program)}</td>
          </tr>
          ${studentEmail ? `<tr><td style="padding:10px 14px;font-weight:600;color:#6b7280;">อีเมล</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(studentEmail)}</td></tr>` : ""}
          ${studentPhone ? `<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;color:#6b7280;">เบอร์โทร</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(studentPhone)}</td></tr>` : ""}
          <tr>
            <td style="padding:10px 14px;font-weight:600;color:#6b7280;">ชื่อวิทยานิพนธ์</td>
            <td style="padding:10px 14px;color:#111827;">${escapeHtml(thesisTitle)}</td>
          </tr>
        </table>

        <p style="font-weight:700;color:#1e40af;font-size:14px;margin:20px 0 8px;">อาจารย์ที่ปรึกษาและกรรมการสอบ</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${advisorName ? `<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">อาจารย์ที่ปรึกษา</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(advisorName)}</td></tr>` : ""}
          ${committeeRows}
        </table>

        <p style="font-weight:700;color:#1e40af;font-size:14px;margin:20px 0 8px;">ข้อมูลการสอบ</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${examDate ? `<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">วันที่สอบ</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(examDate)}${examTime ? ` เวลา ${escapeHtml(examTime)} น.` : ""}</td></tr>` : ""}
          <tr${examDate ? "" : ' style="background:#f3f4f6;"'}><td style="padding:10px 14px;font-weight:600;color:#6b7280;">ห้องประชุม</td><td style="padding:10px 14px;color:#111827;">${roomNeeded ? "✅ ต้องการห้องประชุม" : "ไม่ต้องการ"}</td></tr>
          ${parkingNeeded ? `<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;color:#6b7280;">ที่จอดรถ (ทะเบียน)</td><td style="padding:10px 14px;color:#111827;">${escapeHtml(carPlate) ?? "-"}</td></tr>` : ""}
        </table>

        <p style="color:#6b7280;font-size:12px;margin-top:8px;">รหัสคำร้อง: ${escapeHtml(submissionId)}</p>

        <p style="color:#374151;margin-top:24px;">จึงเรียนมาเพื่อโปรดทราบและดำเนินการในส่วนที่เกี่ยวข้อง</p>
        <p style="color:#374151;margin-top:16px;">ขอแสดงความนับถือ<br>ภาควิชาวิศวกรรมเครื่องกล<br>คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>

        <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
          อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบจัดการวิทยานิพนธ์ ภาควิชาวิศวกรรมเครื่องกล จุฬาฯ<br>
          กรุณาอย่าตอบกลับอีเมลนี้
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[email/finance] Send error:", error.message);
    throw new Error("Finance email failed");
  }
  console.log("[email/finance] Sent to:", financeEmail);
}

// ─── Exam reminder email (sent by cron 14 / 7 days before exam) ───────────────

export interface ExamReminderEmailData {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  submissionId: string;
  thesisTitle: string;
  studentDisplay: string;
  examDate: string;
  examTime?: string | null;
  daysUntil: 14 | 7;
  redirectTo: string;
}

export async function sendExamReminderEmail(data: ExamReminderEmailData): Promise<void> {
  const magicLink = `${getAppUrl()}${data.redirectTo}`;
  const is7 = data.daysUntil === 7;
  const subject = is7
    ? `[แจ้งเตือน] เหลือ 7 วันก่อนวันสอบ — ${data.thesisTitle}`
    : `[แจ้งเตือน] วันสอบอีก 14 วัน — ${data.thesisTitle}`;

  const { error } = await sendMail({
    to: data.recipientEmail,
    subject,
    html: buildExamReminderHtml(data, magicLink),
  });

  if (error) {
    console.error(`[email/exam-reminder] Send error (${data.recipientEmail}):`, error.message);
  } else {
    console.log(`[email/exam-reminder] Sent to ${data.recipientEmail}`);
  }
}

function buildExamReminderHtml(data: ExamReminderEmailData, magicLink: string): string {
  const is7    = data.daysUntil === 7;
  const rName  = escapeHtml(data.recipientName);
  const tTitle = escapeHtml(data.thesisTitle);
  const stName = escapeHtml(data.studentDisplay);
  const eDate  = escapeHtml(data.examDate);
  const eTime  = data.examTime ? escapeHtml(data.examTime) : null;

  const headerGrad  = is7 ? "#dc2626,#b91c1c" : "#d97706,#b45309";
  const accentColor = is7 ? "#dc2626"          : "#d97706";
  const borderColor = is7 ? "#dc2626"          : "#f59e0b";
  const bgColor     = is7 ? "#fef2f2"          : "#fffbeb";
  const mainText    = is7
    ? "เหลือเวลาอีก <strong>7 วัน</strong> ก่อนวันสอบ <strong>ทุกขั้นตอนต้องเสร็จสิ้นก่อนวันสอบ</strong> กรุณาดำเนินการให้แล้วเสร็จโดยด่วน"
    : "วันสอบของคุณ<strong>อีก 14 วัน</strong> กรุณาตรวจสอบสถานะขั้นตอนและความพร้อมก่อนวันสอบ";

  return `
    <div style="font-family:'Sarabun',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,${headerGrad});border-radius:12px;padding:24px;color:white;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;">⏰ แจ้งเตือนวันสอบ</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">ภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
      </div>

      <p style="color:#374151;font-size:16px;">เรียน ${rName},</p>
      <p style="color:#374151;">${mainText}</p>

      <div style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 4px;font-weight:700;color:${accentColor};font-size:13px;">วันที่สอบ</p>
        <p style="margin:0;color:#111827;font-size:20px;font-weight:700;">${eDate}${eTime ? ` เวลา ${eTime} น.` : ""}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px;">
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;width:40%;">ชื่อนิสิต</td>
          <td style="padding:10px 14px;color:#111827;">${stName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#6b7280;">ชื่อวิทยานิพนธ์</td>
          <td style="padding:10px 14px;color:#111827;">${tTitle}</td>
        </tr>
      </table>

      <p style="color:#374151;margin:24px 0;">
        ท่านสามารถเข้าสู่ระบบเพื่อตรวจสอบสถานะได้ที่ <a href="${magicLink}" style="color:#1d4ed8;word-break:break-all;">${magicLink}</a><br>
        <span style="color:#6b7280;font-size:13px;">เข้าสู่ระบบด้วยอีเมลและรหัสเข้าใช้งานของท่าน</span>
      </p>

      <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบจัดการวิทยานิพนธ์ ภาควิชาวิศวกรรมเครื่องกล จุฬาฯ<br>
        กรุณาอย่าตอบกลับอีเมลนี้
      </p>
    </div>
  `;
}
