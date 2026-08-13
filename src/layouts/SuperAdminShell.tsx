import { Outlet } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Sidebar, type NavItem } from "@/layouts/components/Sidebar";
import { TopBar } from "@/layouts/components/TopBar";

// Real nav items (Overview, Clinics, Payments, Messages, Settings) arrive in Phase 2.
const navItems: NavItem[] = [{ to: "/admin", label: "Clinics", icon: Building2 }];

export function SuperAdminShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar panelLabel="Super Admin" navItems={navItems} />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
