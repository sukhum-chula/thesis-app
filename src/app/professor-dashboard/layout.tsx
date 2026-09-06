import DashboardLayout from "@/app/dashboard/layout";

// /professor-dashboard lives outside src/app/dashboard/ (its URL is intentionally top-level),
// but it still needs the same top-bar/logout shell every other dashboard page gets.
export default function ProfessorDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
