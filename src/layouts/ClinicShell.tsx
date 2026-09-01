import { useState } from "react";
import { Outlet } from "react-router-dom";
import { CalendarClock, Users, Settings, MessageSquare } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Sidebar, type NavItem } from "@/layouts/components/Sidebar";
import { TopBar } from "@/layouts/components/TopBar";
import { ImpersonationBanner } from "@/layouts/components/ImpersonationBanner";
import { SubscriptionGate } from "@/features/access-gate/SubscriptionGate";
import { ToastProvider } from "@/components/ui/toast";

export function ClinicShell() {
  const { profile } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isOwner = profile?.role === "owner";

  const navItems: NavItem[] = [
    { to: "/app", label: "Today", icon: CalendarClock, end: true },
    { to: "/app/patients", label: "Patients", icon: Users },
    { to: "/app/messages", label: "Messages", icon: MessageSquare },
    ...(isOwner ? [{ to: "/app/settings", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <SubscriptionGate>
      <ToastProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar
            panelLabel="Clinic Panel"
            navItems={navItems}
            mobileOpen={mobileNavOpen}
            onMobileOpenChange={setMobileNavOpen}
          />
          <div className="flex flex-1 flex-col h-screen overflow-hidden">
            <ImpersonationBanner />
            <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </ToastProvider>
    </SubscriptionGate>
  );
}
