import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  title?: string;
  description: string;
  type?: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (msg: Omit<ToastMessage, "id">) => void;
  success: (description: string, title?: string) => void;
  error: (description: string, title?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, type = "success" }: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, title, description, type }]);
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  const success = React.useCallback(
    (description: string, title?: string) => {
      toast({ description, title, type: "success" });
    },
    [toast]
  );

  const error = React.useCallback(
    (description: string, title?: string) => {
      toast({ description, title, type: "error" });
    },
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border border-border p-4 shadow-sm transition-all duration-200 bg-card text-card-foreground",
              t.type === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
              t.type === "success" && "border-primary/30 bg-primary/5 text-foreground"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary mt-0.5" />}
            {t.type === "error" && <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />}
            {t.type === "info" && <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />}
            <div className="flex-1 text-sm">
              {t.title && <div className="font-medium mb-0.5">{t.title}</div>}
              <div className="text-muted-foreground">{t.description}</div>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
