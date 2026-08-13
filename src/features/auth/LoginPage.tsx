import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SmartDentist</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {notice && (
              <Alert variant="destructive">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
