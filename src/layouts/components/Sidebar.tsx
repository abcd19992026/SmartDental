import { NavLink } from "react-router-dom";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { InstallPwaBanner } from "@/components/InstallPwaBanner";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface SidebarProps {
  panelLabel: string;
  navItems: NavItem[];
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function Sidebar({ panelLabel, navItems, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const closeMobile = () => onMobileOpenChange?.(false);

  const navContent = (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={closeMobile}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-secondary-foreground hover:bg-accent transition-colors",
              isActive && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
      {navItems.length === 0 && (
        <p className="px-3 py-2 text-sm text-muted-foreground">Coming soon</p>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface sticky top-0 left-0 z-20">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-sm font-medium text-foreground">SmartDentist</span>
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {panelLabel}
          </span>
        </div>
        {navContent}
        <InstallPwaBanner />
      </aside>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="md:hidden">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-50"
            onClick={closeMobile}
          />

          {/* Sliding Panel */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-xl flex flex-col border-r border-border animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center">
                <span className="text-sm font-medium text-foreground">SmartDentist</span>
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {panelLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={closeMobile}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navContent}
            <InstallPwaBanner />
          </div>
        </div>
      )}
    </>
  );
}
