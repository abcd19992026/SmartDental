import { useState, useEffect } from "react";
import { LogOut, User, Sun, Moon, Laptop, Camera } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChangeAvatarModal } from "@/layouts/components/ChangeAvatarModal";

export function TopBar() {
  const { profile, session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [changePhotoOpen, setChangePhotoOpen] = useState(false);

  useEffect(() => {
    setAvatarUrl(profile?.avatar_url || null);
  }, [profile?.avatar_url]);

  const displayName = profile?.full_name || session?.user.email || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-border px-4 bg-background">
      {/* Theme Switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          title={`Theme: ${theme}`}
        >
          {theme === "light" && <Sun className="h-4 w-4 text-amber-500" />}
          {theme === "dark" && <Moon className="h-4 w-4 text-primary" />}
          {theme === "system" && <Laptop className="h-4 w-4 text-muted-foreground" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => setTheme("light")} className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Light</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")} className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" />
            <span>Dark</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")} className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-muted-foreground" />
            <span>System</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User Profile Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring">
          <Avatar className="h-7 w-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
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
            <User className="h-4 w-4 mr-2" />
            <span className="capitalize">{profile?.role}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setChangePhotoOpen(true)}>
            <Camera className="h-4 w-4 mr-2" />
            Change Photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangeAvatarModal
        open={changePhotoOpen}
        onOpenChange={setChangePhotoOpen}
        currentAvatarUrl={avatarUrl}
        displayName={displayName}
        onAvatarUpdated={(newUrl) => setAvatarUrl(newUrl)}
      />
    </header>
  );
}
