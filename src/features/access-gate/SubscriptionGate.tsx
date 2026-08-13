import { useState, type ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import { useClinicSubscription } from "@/features/access-gate/useClinicSubscription";
import { todayIST, daysUntilIST, formatDateIST } from "@/lib/dates";
import { FullPageSpinner } from "@/components/FullPageSpinner";
import { Button } from "@/components/ui/button";

const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE as string | undefined;
const EXPIRY_WARNING_WINDOW_DAYS = 15;

function FullPageBlockedNotice({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-medium text-foreground">Subscription Expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your SmartDentist subscription has expired. Please contact support to reactivate.
        </p>
        {SUPPORT_PHONE && (
          <p className="mt-3 text-sm">
            <a href={`tel:${SUPPORT_PHONE}`} className="font-medium text-primary underline">
              {SUPPORT_PHONE}
            </a>
          </p>
        )}
        <Button variant="outline" className="mt-5 w-full" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </div>
  );
}

function ExpiryBanner({ expiresOn, onDismiss }: { expiresOn: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
      <span>Your subscription expires on {formatDateIST(expiresOn)}.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 font-medium underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { subscription, loading } = useClinicSubscription();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (!subscription) return <FullPageSpinner />;

  const expired =
    !subscription.is_active ||
    (subscription.plan_expires_on !== null && subscription.plan_expires_on < todayIST());

  if (expired) {
    return <FullPageBlockedNotice onLogout={signOut} />;
  }

  const expiringSoon =
    subscription.plan_expires_on !== null &&
    daysUntilIST(subscription.plan_expires_on) <= EXPIRY_WARNING_WINDOW_DAYS;

  return (
    <>
      {expiringSoon && subscription.plan_expires_on && !bannerDismissed && (
        <ExpiryBanner
          expiresOn={subscription.plan_expires_on}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}
      {children}
    </>
  );
}
