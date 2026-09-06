// Account-management tiers:
//   SUPER_ADMIN account -> manageable by SUPER_ADMIN only
//   ADMIN account       -> manageable by SUPER_ADMIN or ADMIN
//   STUDENT/PROFESSOR   -> manageable by ADMIN only (SUPER_ADMIN has no access)
// SUPER_ADMIN's remit is the admin tier (itself + ADMIN); day-to-day accounts are ADMIN's job.

export type AccountTier = "SUPER_ADMIN" | "ADMIN" | "OTHER";

export function accountTier(roles: string[]): AccountTier {
  if (roles.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  if (roles.includes("ADMIN")) return "ADMIN";
  return "OTHER";
}

export function canManageAccount(callerRoles: string[], targetRoles: string[]): boolean {
  const tier = accountTier(targetRoles);
  if (tier === "SUPER_ADMIN") return callerRoles.includes("SUPER_ADMIN");
  if (tier === "ADMIN") return callerRoles.includes("SUPER_ADMIN") || callerRoles.includes("ADMIN");
  return callerRoles.includes("ADMIN");
}

export function canGrantRole(callerRoles: string[], role: string): boolean {
  if (role === "SUPER_ADMIN") return callerRoles.includes("SUPER_ADMIN");
  if (role === "ADMIN") return callerRoles.includes("SUPER_ADMIN") || callerRoles.includes("ADMIN");
  return callerRoles.includes("ADMIN"); // STUDENT / PROFESSOR
}
