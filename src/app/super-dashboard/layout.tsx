import DashboardLayout from "@/app/dashboard/layout";

// /super-dashboard lives outside src/app/dashboard/ (its URL is intentionally top-level),
// but it still needs the same sidebar/logout shell every other dashboard page gets.
export default function SuperDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
