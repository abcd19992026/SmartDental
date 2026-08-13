import { LogOut, User } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const { profile, session, signOut } = useAuth();
  const displayName = profile?.full_name || session?.user.email || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b border-border px-4">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start leading-tight">
            <span className="font-medium text-foreground">{displayName}</span>
            {session?.user.email && (
              <span className="text-xs text-muted-foreground">{session.user.email}</span>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>
            <User className="h-4 w-4" />
            {profile?.role}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
