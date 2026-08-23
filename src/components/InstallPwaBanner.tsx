import { useState, useEffect } from "react";
import { Download, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes("android-app://");
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // Check if user agent is iOS
    const ua = window.navigator.userAgent;
    const isIosDevice = /iPhone|iPad|iPod/i.test(ua) && !("MSStream" in window);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Do not show if already in standalone app, installed, or user dismissed for this session
  if (isStandalone || isInstalled || dismissed) {
    return null;
  }

  // Handle Android / Windows / Chromium native install prompt
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  // Chromium / Android / Desktop prompt available
  if (deferredPrompt) {
    return (
      <div className="mx-2 mb-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 font-medium text-primary">
            <Download className="h-4 w-4 shrink-0" />
            <span>Install SmartDentist</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-muted-foreground text-[11px] mb-2 leading-relaxed">
          Install as a desktop or mobile app for quick access and full-screen view.
        </p>
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Install App
        </button>
      </div>
    );
  }

  // iOS Safari specific guide
  if (isIOS) {
    return (
      <div className="mx-2 mb-2 p-2.5 rounded-lg border border-border bg-muted/40 text-xs text-foreground">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Smartphone className="h-4 w-4 shrink-0 text-primary" />
            <span>Install App</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {showIOSGuide ? (
          <div className="space-y-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border mt-1.5">
            <p className="leading-tight">
              1. Tap the <strong className="text-foreground">Share (⎋)</strong> button in Safari.
            </p>
            <p className="leading-tight">
              2. Scroll down & select <strong className="text-foreground">Add to Home Screen</strong>.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1 mt-1 cursor-pointer"
          >
            <span>iPhone / iPad instructions</span>
          </button>
        )}
      </div>
    );
  }

  return null;
}
