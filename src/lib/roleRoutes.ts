import { Role } from "@/types";

export const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: "/super-dashboard",
  ADMIN:       "/admin-dashboard",
  STUDENT:     "/dashboard/student",
  PROFESSOR:   "/dashboard/professor",
};
