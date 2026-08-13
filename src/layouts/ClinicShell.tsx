import { Outlet } from "react-router-dom";
import { CalendarClock, Users } from "lucide-react";
import { Sidebar, type NavItem } from "@/layouts/components/Sidebar";
import { TopBar } from "@/layouts/components/TopBar";
import { SubscriptionGate } from "@/features/access-gate/SubscriptionGate";
import { ToastProvider } from "@/components/ui/toast";

const navItems: NavItem[] = [
  { to: "/app", label: "Today", icon: CalendarClock, end: true },
  { to: "/app/patients", label: "Patients", icon: Users },
];

export function ClinicShell() {
  return (
    <SubscriptionGate>
      <ToastProvider>
        <div className="flex min-h-screen">
          <Sidebar panelLabel="Clinic Panel" navItems={navItems} />
          <div className="flex flex-1 flex-col overflow-x-hidden">
            <TopBar />
            <main className="flex-1 bg-background p-4 sm:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </ToastProvider>
    </SubscriptionGate>
  );
}
