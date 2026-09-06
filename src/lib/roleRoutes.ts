import { Role } from "@/types";

export const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: "/super-dashboard",
  ADMIN:       "/admin-dashboard",
  STUDENT:     "/student-dashboard",
  PROFESSOR:   "/professor-dashboard",
};
