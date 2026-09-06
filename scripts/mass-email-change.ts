// One-off script: change every PROFESSOR/STUDENT account's email to a unique
// plus-tagged address under ai.ta01@cp.eng.chula.ac.th, so all mail lands in
// one inbox while every row keeps a distinct, unique email. Backs up the
// original {id, email, name, roles, studentId} for every touched row first.
//
// Usage:
//   npx tsx scripts/mass-email-change.ts --dry-run   (default — no writes)
//   npx tsx scripts/mass-email-change.ts --apply      (performs the update)
//   npx tsx scripts/mass-email-change.ts --revert <backup-file.json>

import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "..", ".env.local") });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, readFileSync } from "fs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TARGET_DOMAIN_USER = "ai.ta01";
const TARGET_DOMAIN = "cp.eng.chula.ac.th";
const BACKUP_DIR =
  "C:\\Users\\ASUS\\AppData\\Local\\Temp\\claude\\C--Users-ASUS-Desktop-Grad-Tracking-System-thesis-app\\adc80350-54c2-4eef-8cd3-5be962d3414d\\scratchpad\\email-migration";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const revertIdx = args.indexOf("--revert");

  if (revertIdx !== -1) {
    const file = args[revertIdx + 1];
    if (!file) throw new Error("Usage: --revert <backup-file.json>");
    const backup: { id: string; email: string }[] = JSON.parse(readFileSync(file, "utf-8"));
    console.log(`Reverting ${backup.length} users from ${file}...`);
    for (const u of backup) {
      await prisma.user.update({ where: { id: u.id }, data: { email: u.email } });
      console.log(`  reverted ${u.id} -> ${u.email}`);
    }
    console.log("Revert complete.");
    return;
  }

  const users = await prisma.user.findMany({
    where: { roles: { hasSome: ["PROFESSOR", "STUDENT"] } },
    select: { id: true, email: true, name: true, roles: true, studentId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${users.length} PROFESSOR/STUDENT accounts.`);

  let profCount = 0;
  let stuCount = 0;
  const plan = users.map((u) => {
    const isStudent = u.roles.includes("STUDENT" as never);
    const tag = isStudent ? `stu${String(++stuCount).padStart(3, "0")}` : `prof${String(++profCount).padStart(3, "0")}`;
    const newEmail = `${TARGET_DOMAIN_USER}+${tag}@${TARGET_DOMAIN}`;
    return { ...u, newEmail };
  });

  console.log("\nPlan (old -> new):");
  for (const p of plan) {
    console.log(`  ${p.roles.join("/")} ${p.name}: ${p.email} -> ${p.newEmail}`);
  }

  if (!apply) {
    console.log("\nDry run only — pass --apply to actually write these changes.");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `email-backup-${timestamp}.json`);
  writeFileSync(backupPath, JSON.stringify(users, null, 2), "utf-8");
  console.log(`\nBacked up original emails to: ${backupPath}`);

  for (const p of plan) {
    await prisma.user.update({ where: { id: p.id }, data: { email: p.newEmail } });
    console.log(`  updated ${p.id} -> ${p.newEmail}`);
  }

  console.log(`\nDone. ${plan.length} accounts updated. Backup at: ${backupPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
