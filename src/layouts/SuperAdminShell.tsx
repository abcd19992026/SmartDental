import { useState } from "react";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          panelLabel="Super Admin"
          navItems={navItems}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <div className="flex flex-1 flex-col h-screen overflow-hidden">
          <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
