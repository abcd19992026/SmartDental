import { Outlet } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Sidebar, type NavItem } from "@/layouts/components/Sidebar";
import { TopBar } from "@/layouts/components/TopBar";
import { SubscriptionGate } from "@/features/access-gate/SubscriptionGate";

// Real nav items (Today, Patients, Appointments, Messages, Settings) arrive in Phases 2-6.
// A single placeholder proves the shell and routing work end to end for Phase 1.
const navItems: NavItem[] = [{ to: "/app", label: "Today", icon: CalendarClock }];

export function ClinicShell() {
  return (
    <SubscriptionGate>
      <div className="flex min-h-screen">
        <Sidebar panelLabel="Clinic Panel" navItems={navItems} />
        <div className="flex flex-1 flex-col">
          <TopBar />
          <main className="flex-1 bg-background p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SubscriptionGate>
  );
}
