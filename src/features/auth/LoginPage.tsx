import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, CalendarClock, CalendarCheck, MessageSquare, Building2, History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginPage() {
  const { session, profile, loading, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Covers the case where signInWithPassword succeeded but AuthProvider then signed the user
  // back out on its own (no profile row, deactivated account, timeout) -- without this,
  // `submitting` would stay stuck true and the button would look permanently disabled even
  // though a `notice` explaining why is right there above it. Hooks must run unconditionally,
  // so this sits above the early-return below, not after it.
  useEffect(() => {
    if (!loading && !session) {
      setSubmitting(false);
    }
  }, [loading, session]);

  // AuthProvider resolves the session/profile asynchronously after signInWithPassword succeeds
  // (via its onAuthStateChange listener), not as a direct result of this call -- the /login
  // route itself is otherwise not gated by ProtectedRoute, so nothing else sends an
  // already-authenticated user onward. Without this, a successful sign-in leaves the user
  // stranded here with the submit button's spinner stuck on forever, since the form never
  // unmounts to reset `submitting`.
  if (!loading && session && profile) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    clearNotice();

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Invalid email or password.");
      setSubmitting(false);
      return;
    }
    // Sign-in succeeded; leave `submitting` true until AuthProvider resolves the session and
    // the redirect above fires. Resetting it here would let the user re-click Sign in and fire
    // a second request while the first is still being picked up.
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-background font-sans text-foreground antialiased">
      {/* Left Panel: Branded Dark Content (~58% width on desktop) */}
      <div className="hidden lg:flex lg:col-span-7 xl:col-span-7 flex-col justify-between p-12 lg:p-20 relative overflow-hidden bg-gradient-to-br from-[#064e3b]/90 via-[#0f172a] to-[#022c22] text-slate-100 select-none border-r border-border">
        {/* Soft Ambient Glows */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Top spacer */}
        <div className="relative z-10" />

        {/* Core Hero Message & 4 Feature Bullets */}
        <div className="relative z-10 max-w-lg my-auto space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight text-white leading-tight">
              Never lose a patient to a missed follow-up.
            </h2>
            <p className="text-base text-slate-300 font-normal leading-relaxed">
              Automatic recall reminders for dental clinics — so no patient falls through the cracks.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3.5 text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 border border-teal-500/25 text-teal-300">
                <CalendarCheck className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium">Automatic recall dates calculated from treatment type</span>
            </div>

            <div className="flex items-center gap-3.5 text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 border border-teal-500/25 text-teal-300">
                <MessageSquare className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium">WhatsApp reminders sent on schedule</span>
            </div>

            <div className="flex items-center gap-3.5 text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 border border-teal-500/25 text-teal-300">
                <Building2 className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium">Multi-branch clinics with role-based staff access</span>
            </div>

            <div className="flex items-center gap-3.5 text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 border border-teal-500/25 text-teal-300">
                <History className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium">Full visit history and recall tracking per patient</span>
            </div>
          </div>
        </div>

        {/* Bottom spacer providing generous bottom padding */}
        <div className="relative z-10" />
      </div>

      {/* Right Panel: Form Side (~42% width on desktop) */}
      <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-background">
        {/* Brand Wordmark (Top-Left on right panel) */}
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <CalendarClock className="h-4 w-4" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">SmartDentist</span>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-sm mx-auto my-auto py-8 space-y-6">
          <div className="space-y-1.5 text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Sign in
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your clinic dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {notice && (
              <Alert variant="destructive" className="py-2.5 px-3">
                <AlertDescription className="text-xs">{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="py-2.5 px-3">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm border-border bg-background transition-colors focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 text-sm border-border bg-background transition-colors focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-10 mt-2 font-medium text-sm transition-all cursor-pointer shadow-none active:scale-[0.99]"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign in
            </Button>
          </form>
        </div>

        {/* Empty layout bottom balance */}
        <div className="hidden lg:block" />
      </div>
    </div>
  );
}
