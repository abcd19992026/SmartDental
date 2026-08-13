import { useEffect, useState, type FormEvent } from "react";
import { Plus, Edit2, AlertCircle, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type BranchRow = Database["public"]["Tables"]["branches"]["Row"];

interface BranchWithCount extends BranchRow {
  patient_count?: number;
}

export function BranchesTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [branches, setBranches] = useState<BranchWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dialog State
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });

  // Confirmation Dialog State for Deactivation
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [targetBranch, setTargetBranch] = useState<BranchWithCount | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  async function loadBranches() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const bRes = await supabase.from("branches").select("*").eq("clinic_id", profile.clinic_id).order("created_at");

    if (bRes.error) {
      setErrorMsg(bRes.error.message);
      setLoading(false);
      return;
    }

    // Calculate patient count per branch
    const list: BranchWithCount[] = await Promise.all(
      (bRes.data || []).map(async (b) => {
        const { count } = await supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", b.id);
        return { ...b, patient_count: count || 0 };
      })
    );

    setBranches(list);
    setLoading(false);
  }

  function openAddBranch() {
    setEditingBranch(null);
    setForm({ name: "", address: "", phone: "" });
    setBranchModalOpen(true);
  }

  function openEditBranch(b: BranchRow) {
    setEditingBranch(b);
    setForm({ name: b.name, address: b.address || "", phone: b.phone || "" });
    setBranchModalOpen(true);
  }

  async function handleSaveBranch(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toastError("Branch name is required.", "Validation Error");
      return;
    }

    if (editingBranch) {
      const { error } = await supabase
        .from("branches")
        .update({
          name: form.name.trim(),
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
        })
        .eq("id", editingBranch.id);

      if (error) {
        toastError(error.message, "Update Failed");
        return;
      }
      success("Branch updated.");
    } else {
      const { error } = await supabase.from("branches").insert({
        clinic_id: profile?.clinic_id!,
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        is_active: true,
      });

      if (error) {
        toastError(error.message, "Creation Failed");
        return;
      }
      success("New branch added.");
    }

    setBranchModalOpen(false);
    loadBranches();
  }

  function handlePromptDeactivate(b: BranchWithCount) {
    // Guardrail: A clinic must always have at least 1 active branch!
    const activeBranches = branches.filter((x) => x.is_active);
    if (activeBranches.length <= 1 && b.is_active) {
      toastError(
        "Cannot deactivate branch. A clinic must have at least one active branch.",
        "Action Blocked"
      );
      return;
    }

    setTargetBranch(b);
    setDeactivateConfirmOpen(true);
  }

  async function confirmDeactivateBranch() {
    if (!targetBranch) return;

    const nextState = !targetBranch.is_active;

    const { error } = await supabase
      .from("branches")
      .update({ is_active: nextState })
      .eq("id", targetBranch.id);

    if (error) {
      toastError(error.message, "Action Failed");
      return;
    }

    success(nextState ? `Branch "${targetBranch.name}" activated.` : `Branch "${targetBranch.name}" deactivated.`);
    setDeactivateConfirmOpen(false);
    setTargetBranch(null);
    loadBranches();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Clinic Branches</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage physical practice locations and assigned patient counts
          </p>
        </div>
        <Button onClick={openAddBranch}>
          <Plus className="h-4 w-4 mr-1.5" />
          + Add Branch
        </Button>
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
          ) : branches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No branches found for this clinic.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAddBranch}>
                <Plus className="h-4 w-4 mr-1.5" />
                + Add Branch
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4">Branch Name</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Patients</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {branches.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-foreground">{b.name}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{b.address || "—"}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{b.phone || "—"}</td>
                      <td className="py-3.5 px-4">
                        {b.is_active ? (
                          <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-muted text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center text-muted-foreground font-medium">
                        {b.patient_count}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditBranch(b)}>
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePromptDeactivate(b)}
                            className={b.is_active ? "text-destructive hover:bg-destructive/10" : "text-emerald-600"}
                          >
                            {b.is_active ? "Deactivate" : "Activate"}
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

      {/* Add / Edit Branch Dialog */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <form onSubmit={handleSaveBranch}>
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "Add New Branch"}</DialogTitle>
            <DialogDescription>Physical location details for patient visits</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="br-name">Branch Name *</Label>
              <Input
                id="br-name"
                required
                placeholder="e.g. Main Clinic / City Branch"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="br-phone">Phone</Label>
              <Input
                id="br-phone"
                placeholder="e.g. +91 9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="br-addr">Address</Label>
              <Input
                id="br-addr"
                placeholder="Street address / Landmark"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingBranch ? "Save Changes" : "Add Branch"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            {targetBranch?.is_active ? `Deactivate "${targetBranch?.name}"?` : `Activate "${targetBranch?.name}"?`}
          </DialogTitle>
          <DialogDescription className="text-left pt-2 leading-relaxed">
            {targetBranch?.is_active ? (
              <>
                Deactivating this branch will preserve all existing patient records ({targetBranch.patient_count} patients assigned) and visit history.
                <br />
                <br />
                The branch will simply stop appearing in dropdowns for new patients and visits.
              </>
            ) : (
              `Activating this branch will allow staff to select it when creating patients and visits.`
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={() => setDeactivateConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={targetBranch?.is_active ? "destructive" : "default"}
            onClick={confirmDeactivateBranch}
          >
            Confirm {targetBranch?.is_active ? "Deactivation" : "Activation"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
