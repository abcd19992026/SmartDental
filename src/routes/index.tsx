import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
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

import { TodayPage } from "@/features/clinic/TodayPage";
import { PatientsPage } from "@/features/clinic/PatientsPage";
import { ClinicMessagesPage } from "@/features/clinic/ClinicMessagesPage";
import { SettingsPage } from "@/features/clinic/settings/SettingsPage";
import { PrescriptionPrintPage } from "@/features/clinic/prescriptions/PrescriptionPrintPage";

export function AppRoutes() {
  return (
    <ThemeProvider>
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
              <Route index element={<TodayPage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="messages" element={<ClinicMessagesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/:tab" element={<SettingsPage />} />
            </Route>

            {/* Standalone print route -- deliberately outside ClinicShell so it renders with no
               sidebar/topbar chrome. Still behind its own ProtectedRoute, so RLS applies via the
               normal authenticated session; a receptionist may open it to reprint a slip. */}
            <Route
              path="/app/prescriptions/:id/print"
              element={
                <ProtectedRoute allowedRoles={["owner", "receptionist"]}>
                  <PrescriptionPrintPage />
                </ProtectedRoute>
              }
            />

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
    </ThemeProvider>
  );
}
