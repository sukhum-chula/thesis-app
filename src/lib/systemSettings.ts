import { prisma } from "./prisma";

// Shared helpers for the admin-designated single-user assignments stored in SystemSetting —
// see the model's comment in prisma/schema.prisma. Centralized here so every route/lib that
// needs "who is program chair for X" or "who is the finance contact" goes through one place
// instead of re-deriving the key format.

const PROGRAM_CHAIR_PREFIX = "programChair:";
const FINANCE_CONTACT_KEY = "financeContact";
const DEPARTMENT_CHAIR_KEY = "departmentChair";

const programChairKey = (program: string) => `${PROGRAM_CHAIR_PREFIX}${program}`;

export async function getProgramChairUserId(program: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: programChairKey(program) } });
  return row?.userId ?? null;
}

export async function getProgramChairUser(program: string) {
  const userId = await getProgramChairUserId(program);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

// Every program a given user currently chairs — one professor may chair several programs at
// once (setProgramChair() below places no restriction across keys), so this can return more
// than one entry.
export async function getProgramChairsOfUser(userId: string): Promise<string[]> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: PROGRAM_CHAIR_PREFIX }, userId },
  });
  return rows.map((r) => r.key.slice(PROGRAM_CHAIR_PREFIX.length));
}

// Every program → chair userId currently assigned (rows that exist but hold userId: null, i.e.
// no one currently assigned, are excluded).
export async function getAllProgramChairs(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: PROGRAM_CHAIR_PREFIX } } });
  return Object.fromEntries(
    rows.filter((r) => r.userId).map((r) => [r.key.slice(PROGRAM_CHAIR_PREFIX.length), r.userId as string])
  );
}

// Each program still has at most one chair (the key itself is single-valued), but a user may be
// assigned as chair of any number of programs — assigning them to one program no longer clears
// any other program they hold. The row for `program` is never deleted — clearing it
// (userId: null) just upserts a null value, so the key stays present.
export async function setProgramChair(program: string, userId: string | null): Promise<void> {
  const key = programChairKey(program);
  await prisma.systemSetting.upsert({ where: { key }, update: { userId }, create: { key, userId } });
}

// หัวหน้าภาควิชา — one PROFESSOR for the whole department (unlike programChair:<program>,
// which is per-program). Purely an admin-designated record at this point: nothing in the
// workflow reads it yet, so assigning it changes no step routing or email recipient.
export async function getDepartmentChairUserId(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: DEPARTMENT_CHAIR_KEY } });
  return row?.userId ?? null;
}

export async function getDepartmentChairUser() {
  const userId = await getDepartmentChairUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

// The row is never deleted — clearing (userId: null) just upserts a null value.
export async function setDepartmentChair(userId: string | null): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: DEPARTMENT_CHAIR_KEY },
    update: { userId },
    create: { key: DEPARTMENT_CHAIR_KEY, userId },
  });
}

export async function getFinanceContactUserId(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: FINANCE_CONTACT_KEY } });
  return row?.userId ?? null;
}

export async function getFinanceContactUser() {
  const userId = await getFinanceContactUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

// The row is never deleted — clearing (userId: null) just upserts a null value.
export async function setFinanceContact(userId: string | null): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: FINANCE_CONTACT_KEY },
    update: { userId },
    create: { key: FINANCE_CONTACT_KEY, userId },
  });
}

// Called when a User account is deleted (DELETE /api/users/[id]) — rather than leaving a
// dangling userId or deleting the setting row, every SystemSetting row that pointed at this
// user has its value reset to null. The key itself stays in the table.
export async function clearUserFromSystemSettings(userId: string): Promise<void> {
  await prisma.systemSetting.updateMany({ where: { userId }, data: { userId: null } });
}

// Decorates already-fetched users with the computed programChairFor/isFinanceContact/
// isDepartmentChair fields the
// rest of the app (client-side MockUser objects, session/JWT) expects — sourced from
// SystemSetting instead of a column. Used by GET /api/users and auth.ts.
// programChairFor is an array since one professor may chair several programs at once.
export async function attachSystemSettings<T extends { id: string }>(
  users: T[]
): Promise<(T & { programChairFor: string[]; isFinanceContact: boolean; isDepartmentChair: boolean })[]> {
  const [chairs, financeContactUserId, departmentChairUserId] = await Promise.all([
    getAllProgramChairs(),
    getFinanceContactUserId(),
    getDepartmentChairUserId(),
  ]);
  const chairsByUserId = new Map<string, string[]>();
  for (const [program, userId] of Object.entries(chairs)) {
    const list = chairsByUserId.get(userId);
    if (list) list.push(program);
    else chairsByUserId.set(userId, [program]);
  }
  return users.map((u) => ({
    ...u,
    programChairFor: chairsByUserId.get(u.id) ?? [],
    isFinanceContact: u.id === financeContactUserId,
    isDepartmentChair: u.id === departmentChairUserId,
  }));
}
