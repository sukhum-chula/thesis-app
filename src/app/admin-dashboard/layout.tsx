import DashboardLayout from "@/app/dashboard/layout";

// /admin-dashboard lives outside src/app/dashboard/ (its URL is intentionally top-level),
// but it still needs the same sidebar/logout shell every other dashboard page gets.
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
