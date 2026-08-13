import { Outlet } from "react-router-dom";
import { LayoutDashboard, Building2, CreditCard, MessageSquare } from "lucide-react";
import { Sidebar, type NavItem } from "@/layouts/components/Sidebar";
import { TopBar } from "@/layouts/components/TopBar";
import { ToastProvider } from "@/components/ui/toast";

const navItems: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/clinics", label: "Clinics", icon: Building2 },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/messages", label: "Messages", icon: MessageSquare },
];

export function SuperAdminShell() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar panelLabel="Super Admin" navItems={navItems} />
        <div className="flex flex-1 flex-col overflow-x-hidden">
          <TopBar />
          <main className="flex-1 bg-background p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
