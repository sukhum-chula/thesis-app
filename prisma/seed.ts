import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PASSCODE = "password123";

const users = [
  // System accounts
  { name: "ผู้ดูแลระบบสูงสุด",            email: "superadmin@eng.chula.ac.th",  role: "SUPER_ADMIN" as const },
  { name: "พี่โบ้ (เจ้าหน้าที่ภาควิชา)",  email: "admin@eng.chula.ac.th",       role: "ADMIN" as const },
  { name: "นายอานนท์ ใจดี",               email: "student@eng.chula.ac.th",     role: "STUDENT" as const, studentId: "64100042" },
  { name: "รศ.ดร.นิพนธ์ วรรณโสภาคย์",    email: "niphon.w@eng.chula.ac.th",    role: "PROGRAM_CHAIR" as const },
  { name: "ศ.ดร.วิบูลย์ แสงวีระพันธุ์ศิริ", email: "viboon.s@eng.chula.ac.th",  role: "INVITED_EXAM_COMMITTEE" as const },
  // Advisors
  { name: "ศ.ดร.ไพโรจน์ สิงหถนัดกิจ",     email: "pairod.s@eng.chula.ac.th",    role: "ADVISOR" as const },
  { name: "รศ.ดร.อศิ บุญจิตราดุลย์",      email: "asi.b@eng.chula.ac.th",       role: "ADVISOR" as const },
  { name: "รศ.ดร.ฐิติมา จินตนาวัน",       email: "thitima.j@eng.chula.ac.th",   role: "ADVISOR" as const },
  { name: "รศ.ดร.กุณฑินี มณีรัตน์",       email: "kuntinee.m@eng.chula.ac.th",  role: "ADVISOR" as const },
  { name: "รศ.ดร.รัชทิน จันทร์เจริญ",     email: "ratchatin.c@eng.chula.ac.th", role: "ADVISOR" as const },
  { name: "รศ.ดร.จิตติน แตงเที่ยง",       email: "chittin.t@eng.chula.ac.th",   role: "ADVISOR" as const },
  { name: "รศ.ดร.อังคีร์ ศรีภคากร",       email: "angkee.s@eng.chula.ac.th",    role: "ADVISOR" as const },
  { name: "รศ.ดร.บุญชัย เลิศนุวัฒน์",     email: "boonchai.l@eng.chula.ac.th",  role: "ADVISOR" as const },
  { name: "รศ.ดร.พงศ์แสน พิทักษ์วัชระ",  email: "phongsaen.p@eng.chula.ac.th", role: "ADVISOR" as const },
  { name: "รศ.ดร.ธัญญารัตน์ สิงหนาท",     email: "thanyarat.s@eng.chula.ac.th", role: "ADVISOR" as const },
  { name: "รศ.ดร.นภดนัย อาชวาคม",         email: "nopdanai.a@eng.chula.ac.th",  role: "ADVISOR" as const },
  { name: "รศ.ดร.กฤษฎา พนมเชิง",          email: "gridsada.p@eng.chula.ac.th",  role: "ADVISOR" as const },
  // Head Exam Committee
  { name: "รศ.ดร.อลงกรณ์ พิมพ์พิณ",      email: "alongkorn.p@eng.chula.ac.th", role: "HEAD_EXAM_COMMITTEE" as const },
  { name: "รศ.ดร.ชนัตต์ รัตนสุมาวงศ์",    email: "chanat.r@eng.chula.ac.th",    role: "HEAD_EXAM_COMMITTEE" as const },
  { name: "รศ.ดร.จิรพงศ์ กสิวิทย์อำนวย",  email: "jirapong.k@eng.chula.ac.th",  role: "HEAD_EXAM_COMMITTEE" as const },
  { name: "รศ.ดร.วิทยา วัณณสุโภประสิทธิ์", email: "witaya.w@eng.chula.ac.th",    role: "HEAD_EXAM_COMMITTEE" as const },
  { name: "รศ.ดร.สมพงษ์ พุทธิวิสุทธิศักดิ์", email: "sompong.p@eng.chula.ac.th", role: "HEAD_EXAM_COMMITTEE" as const },
  // Exam Committee
  { name: "ผศ.ดร.สัณหพศ จันทรานุวัฒน์",   email: "sunhapos.c@eng.chula.ac.th",  role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ดร.วีระยุทธ ศรีธุระวานิช",   email: "werayut.s@eng.chula.ac.th",   role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ดร.นักสิทธ์ นุ่มวงษ์",       email: "nuksit.n@eng.chula.ac.th",    role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ดร.ไพรัช ตั้งพรประเสริฐ",    email: "pairat.t@eng.chula.ac.th",    role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ดร.ชัญญาพันธ์ วิรุฬห์ศรี",   email: "chanyaphan.v@eng.chula.ac.th",role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ตะวัน ปภาพจน์",              email: "tawan.p@eng.chula.ac.th",     role: "EXAM_COMMITTEE" as const },
  { name: "ผศ.ดร.สรัล ศาลากิจ",            email: "saran.s@eng.chula.ac.th",     role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.สุรัฐ ขวัญเมือง",          email: "surat.k@eng.chula.ac.th",     role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.ณัฐพล ดำรงค์พลาสิทธิ์",    email: "nattapol.d@eng.chula.ac.th",  role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.รีนา เซย์",                email: "rina.t@eng.chula.ac.th",      role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.นภัสร วงษ์เสาวศุภ",        email: "naphatsorn.v@eng.chula.ac.th",role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.สริตา โมรากุล",            email: "sarita.m@eng.chula.ac.th",    role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.อัศวิน สาลี",              email: "atsawin.s@eng.chula.ac.th",   role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.ปริญเอก ร่มไตรรัตน์",      email: "parinayek.r@eng.chula.ac.th", role: "EXAM_COMMITTEE" as const },
  { name: "อ.ดร.รอยต่อ เจริญสินโอฬาร",     email: "roitor.c@eng.chula.ac.th",    role: "EXAM_COMMITTEE" as const },
];

async function main() {
  console.log("Seeding database with real users...");
  const hash = await bcrypt.hash(PASSCODE, 12);

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passcodeHash: hash },
    });
  }

  console.log(`Seeded ${users.length} users. Default passcode: ${PASSCODE}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
