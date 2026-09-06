import DashboardLayout from "@/app/dashboard/layout";

// /student-dashboard lives outside src/app/dashboard/ (its URL is intentionally top-level),
// but it still needs the same sidebar/logout shell every other dashboard page gets.
export default function StudentDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
