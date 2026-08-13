import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { RoleRedirect } from "@/features/auth/RoleRedirect";
import { ClinicShell } from "@/layouts/ClinicShell";
import { SuperAdminShell } from "@/layouts/SuperAdminShell";

import { OverviewPage } from "@/features/super-admin/OverviewPage";
import { ClinicsListPage } from "@/features/super-admin/ClinicsListPage";
import { AddClinicWizardPage } from "@/features/super-admin/AddClinicWizardPage";
import { ClinicDetailPage } from "@/features/super-admin/ClinicDetailPage";
import { PaymentsPage } from "@/features/super-admin/PaymentsPage";
import { MessagesPage } from "@/features/super-admin/MessagesPage";

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">This screen is coming in a later phase.</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute allowedRoles={["owner", "receptionist"]}>
                <ClinicShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<ComingSoon title="Today" />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SuperAdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="clinics" element={<ClinicsListPage />} />
            <Route path="clinics/new" element={<AddClinicWizardPage />} />
            <Route path="clinics/:id" element={<ClinicDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="messages" element={<MessagesPage />} />
          </Route>

          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
