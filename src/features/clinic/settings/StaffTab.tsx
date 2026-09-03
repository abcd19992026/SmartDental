import { useEffect, useState, type FormEvent } from "react";
import { Plus, KeyRound, AlertCircle, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { createStaffUser, resetUserPassword, setUserActive } from "@/lib/clinic-api";
import { formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type BranchRow = Database["public"]["Tables"]["branches"]["Row"];

interface JoinedProfile extends ProfileRow {
  branch?: BranchRow | null;
}

export function StaffTab() {
  const { profile, session } = useAuth();
  const { success, error: toastError } = useToast();

  const [staffList, setStaffList] = useState<JoinedProfile[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [includedReceptionists, setIncludedReceptionists] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Staff Modal State
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    role: "receptionist" as "owner" | "receptionist",
    branch_id: "",
  });
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Temp Password Dialog State (for Add Staff and Reset Password)
  const [tempPasswordDialog, setTempPasswordDialog] = useState<{
    open: boolean;
    email: string;
    password: string;
  }>({ open: false, email: "", password: "" });
  const [copied, setCopied] = useState(false);

  // Confirmation Dialog State
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", description: "", action: async () => {} });

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const [pRes, bRes, cRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*, branch:branches(*)")
        .eq("clinic_id", profile.clinic_id)
        .order("created_at"),
      supabase.from("branches").select("*").eq("clinic_id", profile.clinic_id).eq("is_active", true),
      supabase.from("clinics").select("included_receptionists").eq("id", profile.clinic_id).single(),
    ]);

    if (pRes.error) {
      setErrorMsg(pRes.error.message);
      setLoading(false);
      return;
    }

    setStaffList((pRes.data as JoinedProfile[]) || []);
    if (bRes.data) {
      setBranches(bRes.data);
      if (bRes.data.length > 0 && !staffForm.branch_id) {
        setStaffForm((prev) => ({ ...prev, branch_id: bRes.data[0].id }));
      }
    }
    if (cRes.data && cRes.data.included_receptionists != null) {
      setIncludedReceptionists(cRes.data.included_receptionists);
    }

    setLoading(false);
  }

  // Count active receptionists only (owners and deactivated profiles do not count)
  const activeReceptionistCount = staffList.filter(
    (s) => s.role === "receptionist" && s.is_active
  ).length;

  const isSeatLimitReached = activeReceptionistCount >= includedReceptionists;

  function openAddStaff() {
    setModalError(null);
    setStaffForm({
      full_name: "",
      email: "",
      // If seat limit is reached for receptionists, default selection to owner
      role: isSeatLimitReached ? "owner" : "receptionist",
      branch_id: branches[0]?.id || "",
    });
    setAddStaffOpen(true);
  }

  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    setModalError(null);

    if (!staffForm.full_name.trim()) {
      setModalError("Full Name is required.");
      return;
    }
    if (!staffForm.email.trim() || !staffForm.email.includes("@")) {
      setModalError("A valid Email is required.");
      return;
    }
    if (staffForm.role === "receptionist" && !staffForm.branch_id) {
      setModalError("Assigned Branch is required for a receptionist.");
      return;
    }

    // Defensive check before sending
    if (staffForm.role === "receptionist" && isSeatLimitReached) {
      setModalError(`Receptionist seat limit reached (${activeReceptionistCount} of ${includedReceptionists} used). Contact SmartDentist to add more seats.`);
      return;
    }

    setSubmittingStaff(true);

    const res = await createStaffUser({
      email: staffForm.email.trim(),
      full_name: staffForm.full_name.trim(),
      role: staffForm.role,
      branch_id: staffForm.role === "receptionist" ? staffForm.branch_id : undefined,
    });

    if (res.ok === false) {
      // Keep modal open, surface server error (including 403 seat limit error) as-is
      setModalError(res.error);
      setSubmittingStaff(false);
      return;
    }

    setSubmittingStaff(false);
    setAddStaffOpen(false);

    // Show temporary password dialog
    setTempPasswordDialog({
      open: true,
      email: res.data.email,
      password: res.data.temporary_password,
    });
    setCopied(false);

    success("Staff account provisioned successfully.");
    loadStaff();
  }

  // Action: Reset Password
  function handleResetPassword(u: JoinedProfile) {
    setConfirmAction({
      open: true,
      title: "Reset Password",
      description: `Generate a new temporary password for ${u.full_name || u.id}? The user's current password will be invalidated immediately.`,
      action: async () => {
        const res = await resetUserPassword(u.id);
        if (res.ok === false) {
          toastError(res.error, "Password Reset Failed");
          return;
        }
        setTempPasswordDialog({
          open: true,
          email: u.phone || u.id,
          password: res.data.temporary_password,
        });
        setCopied(false);
        success("Password reset successfully.");
      },
    });
  }

  // Action: Toggle Active Status (with Enforced Guardrails)
  function handleToggleActive(u: JoinedProfile) {
    const isDeactivating = u.is_active;

    if (isDeactivating) {
      // Guardrail 1: Self-deactivation check
      if (u.id === session?.user.id) {
        toastError("You cannot deactivate your own account.", "Action Blocked");
        return;
      }

      // Guardrail 2: Retain at least 1 active owner
      if (u.role === "owner") {
        const activeOwners = staffList.filter((s) => s.role === "owner" && s.is_active);
        if (activeOwners.length <= 1) {
          toastError(
            "Cannot deactivate owner account. A clinic must retain at least one active owner.",
            "Action Blocked"
          );
          return;
        }
      }
    }

    setConfirmAction({
      open: true,
      title: isDeactivating ? "Deactivate User" : "Activate User",
      description: isDeactivating
        ? `Are you sure you want to deactivate ${u.full_name || "this user"}? They will be signed out on their next request.`
        : `Are you sure you want to activate ${u.full_name || "this user"}?`,
      action: async () => {
        const res = await setUserActive(u.id, !u.is_active);
        if (res.ok === false) {
          toastError(res.error, "Action Failed");
          return;
        }
        success(`User ${u.full_name || ""} ${isDeactivating ? "deactivated" : "activated"}.`);
        loadStaff();
      },
    });
  }

  function handleCopyCredentials() {
    if (!tempPasswordDialog.password) return;
    navigator.clipboard.writeText(tempPasswordDialog.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Staff Accounts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Provision and manage receptionist and owner accounts for your clinic •{" "}
            <span className="font-medium text-foreground">
              {activeReceptionistCount} of {includedReceptionists} receptionist seats used
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <Button onClick={openAddStaff}>
            <Plus className="h-4 w-4 mr-1.5" />
            + Add Staff
          </Button>
          {isSeatLimitReached && (
            <p className="text-[11px] text-muted-foreground">
              Receptionist seat limit reached. Contact SmartDentist to add more seats.
            </p>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No staff members found.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAddStaff}>
                <Plus className="h-4 w-4 mr-1.5" />
                + Add Staff
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned Branch</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date Added</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {s.full_name || "Unnamed"}
                        {s.id === session?.user.id && (
                          <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-normal">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="outline" className="capitalize">
                          {s.role}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {s.role === "owner" ? "All Branches" : s.branch?.name || "Unassigned"}
                      </td>
                      <td className="py-3.5 px-4">
                        {s.is_active ? (
                          <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-muted text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground">
                        {formatDateIST(s.created_at.split("T")[0])}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Reset Password"
                            onClick={() => handleResetPassword(s)}
                          >
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            Reset Pass
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(s)}
                            disabled={s.id === session?.user.id}
                            className={s.is_active ? "text-destructive hover:bg-destructive/10" : "text-emerald-600"}
                          >
                            {s.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Dialog */}
      <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
        <form onSubmit={handleCreateStaff}>
          <DialogHeader>
            <DialogTitle>Add New Staff Account</DialogTitle>
            <DialogDescription>
              Provision a receptionist or co-owner account for your clinic.
            </DialogDescription>
          </DialogHeader>

          {modalError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-name">Full Name *</Label>
              <Input
                id="st-name"
                required
                placeholder="e.g. Anjali Gupta"
                value={staffForm.full_name}
                onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-email">Email Address (Login ID) *</Label>
              <Input
                id="st-email"
                type="email"
                required
                placeholder="receptionist@clinic.com"
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-role">Role *</Label>
                <select
                  id="st-role"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as any })}
                >
                  <option value="receptionist" disabled={isSeatLimitReached}>
                    Receptionist {isSeatLimitReached ? "(Seat limit reached)" : ""}
                  </option>
                  <option value="owner">Clinic Owner</option>
                </select>
                {staffForm.role === "receptionist" && isSeatLimitReached && (
                  <p className="text-[11px] text-destructive mt-1">
                    Receptionist seat limit reached ({activeReceptionistCount} of {includedReceptionists} used). Contact SmartDentist to add more seats.
                  </p>
                )}
              </div>

              {staffForm.role === "receptionist" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="st-branch">Assigned Branch *</Label>
                  <select
                    id="st-branch"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={staffForm.branch_id}
                    onChange={(e) => setStaffForm({ ...staffForm, branch_id: e.target.value })}
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={() => setAddStaffOpen(false)} disabled={submittingStaff}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submittingStaff || (staffForm.role === "receptionist" && isSeatLimitReached)}
            >
              {submittingStaff ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Provision Account
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Temporary Password Display Dialog */}
      <Dialog
        open={tempPasswordDialog.open}
        onOpenChange={(open) => setTempPasswordDialog((prev) => ({ ...prev, open }))}
      >
        <DialogHeader>
          <DialogTitle>Temporary Password Generated</DialogTitle>
          <DialogDescription>
            Account provisioned for {tempPasswordDialog.email}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="rounded-lg border border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>WARNING:</strong> Copy this password now. It will NOT be shown again!
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3">
            <span className="font-mono text-base font-bold tracking-wider text-foreground">
              {tempPasswordDialog.password}
            </span>
            <Button size="sm" onClick={handleCopyCredentials}>
              {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => setTempPasswordDialog({ open: false, email: "", password: "" })}>
            Done
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Confirmation Action Dialog */}
      <Dialog
        open={confirmAction.open}
        onOpenChange={(open) => setConfirmAction((prev) => ({ ...prev, open }))}
      >
        <DialogHeader>
          <DialogTitle>{confirmAction.title}</DialogTitle>
          <DialogDescription className="text-left pt-2">
            {confirmAction.description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={() => setConfirmAction((prev) => ({ ...prev, open: false }))}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await confirmAction.action();
              setConfirmAction((prev) => ({ ...prev, open: false }));
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
