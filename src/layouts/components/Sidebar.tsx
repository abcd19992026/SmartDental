import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function Sidebar({ panelLabel, navItems }: { panelLabel: string; navItems: NavItem[] }) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-medium text-foreground">SmartDentist</span>
        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {panelLabel}
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-secondary-foreground hover:bg-accent",
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
    </aside>
  );
}
