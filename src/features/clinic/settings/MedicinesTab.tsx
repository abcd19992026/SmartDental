import { useEffect, useState, useMemo, type FormEvent } from "react";
import { Plus, Edit2, Trash2, Search, X, AlertCircle, Info, Pill } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { createMedicine, updateMedicine, deleteMedicine, type MedicineRow } from "@/lib/clinic-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function MedicinesTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Add Medicine Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    default_dosage: "",
    default_duration: "",
    notes: "",
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit Medicine Modal State
  const [editingMedicine, setEditingMedicine] = useState<MedicineRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    default_dosage: "",
    default_duration: "",
    notes: "",
    is_active: true,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Delete Confirmation Modal State
  const [medicineToDelete, setMedicineToDelete] = useState<MedicineRow | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  useEffect(() => {
    loadMedicines();
  }, []);

  async function loadMedicines() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("medicines")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setMedicines(data || []);
    setLoading(false);
  }

  // Filtered medicines by client-side search
  const filteredMedicines = useMemo(() => {
    if (!searchQuery.trim()) return medicines;
    const query = searchQuery.trim().toLowerCase();
    return medicines.filter((m) => m.name.toLowerCase().includes(query));
  }, [medicines, searchQuery]);

  function isDuplicateName(name: string, excludeId?: string): boolean {
    const trimmed = name.trim().toLowerCase();
    return medicines.some(
      (m) => m.id !== excludeId && m.name.trim().toLowerCase() === trimmed
    );
  }

  function formatErrorMessage(err: string): string {
    const lower = err.toLowerCase();
    if (
      lower.includes("unique") ||
      lower.includes("duplicate") ||
      lower.includes("already exists") ||
      lower.includes("23505") ||
      lower.includes("medicines_clinic_id_name_key")
    ) {
      return "A medicine with this name already exists";
    }
    return err;
  }

  // Add Medicine
  async function handleAddMedicine(e: FormEvent) {
    e.preventDefault();
    setAddError(null);

    const name = addForm.name.trim();
    if (!name) {
      setAddError("Medicine name is required.");
      return;
    }

    if (isDuplicateName(name)) {
      setAddError("A medicine with this name already exists");
      return;
    }

    if (!profile?.clinic_id) {
      setAddError("Missing clinic information.");
      return;
    }

    setSubmittingAdd(true);

    const res = await createMedicine({
      clinic_id: profile.clinic_id,
      name,
      default_dosage: addForm.default_dosage.trim() || null,
      default_duration: addForm.default_duration.trim() || null,
      notes: addForm.notes.trim() || null,
    });

    if (!res.ok) {
      setAddError(formatErrorMessage(res.error));
      setSubmittingAdd(false);
      return;
    }

    if (!res.data) {
      setAddError("Action was blocked by the database. No row was created.");
      setSubmittingAdd(false);
      return;
    }

    success("Medicine added successfully.");
    setSubmittingAdd(false);
    setAddModalOpen(false);
    setAddForm({ name: "", default_dosage: "", default_duration: "", notes: "" });
    loadMedicines();
  }

  // Open Edit Modal
  function openEdit(m: MedicineRow) {
    setEditingMedicine(m);
    setEditForm({
      name: m.name,
      default_dosage: m.default_dosage || "",
      default_duration: m.default_duration || "",
      notes: m.notes || "",
      is_active: m.is_active,
    });
    setEditError(null);
  }

  // Save Edit Medicine
  async function handleEditMedicine(e: FormEvent) {
    e.preventDefault();
    if (!editingMedicine) return;
    setEditError(null);

    const name = editForm.name.trim();
    if (!name) {
      setEditError("Medicine name cannot be empty.");
      return;
    }

    if (isDuplicateName(name, editingMedicine.id)) {
      setEditError("A medicine with this name already exists");
      return;
    }

    setSubmittingEdit(true);

    const res = await updateMedicine(editingMedicine.id, {
      name,
      default_dosage: editForm.default_dosage.trim() || null,
      default_duration: editForm.default_duration.trim() || null,
      notes: editForm.notes.trim() || null,
      is_active: editForm.is_active,
    });

    if (!res.ok) {
      setEditError(formatErrorMessage(res.error));
      setSubmittingEdit(false);
      return;
    }

    if (!res.data) {
      setEditError("Action was blocked by the database. No row was updated.");
      setSubmittingEdit(false);
      return;
    }

    success("Medicine updated successfully.");
    setSubmittingEdit(false);
    setEditingMedicine(null);
    loadMedicines();
  }

  // Toggle Active Status
  async function handleToggleActive(m: MedicineRow) {
    const nextState = !m.is_active;
    const res = await updateMedicine(m.id, { is_active: nextState });

    if (!res.ok) {
      toastError(res.error, "Action Failed");
      return;
    }

    if (!res.data) {
      toastError("Action was blocked by the database.", "Action Blocked");
      return;
    }

    success(nextState ? `Medicine "${m.name}" activated.` : `Medicine "${m.name}" deactivated.`);
    loadMedicines();
  }

  // Confirm Delete
  async function handleDeleteMedicine() {
    if (!medicineToDelete) return;
    setSubmittingDelete(true);

    const res = await deleteMedicine(medicineToDelete.id);

    if (!res.ok) {
      toastError(res.error, "Delete Failed");
      setSubmittingDelete(false);
      return;
    }

    if (!res.data) {
      toastError("Action was blocked by the database. Row was not deleted.", "Delete Blocked");
      setSubmittingDelete(false);
      return;
    }

    success(`Medicine "${medicineToDelete.name}" deleted.`);
    setSubmittingDelete(false);
    setMedicineToDelete(null);
    loadMedicines();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Explanation Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-foreground leading-relaxed">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong>Prescription Defaults:</strong> Standard dosage, duration, and instructions defined here will auto-fill when prescribing medicines to patients. Deleting a medicine does not alter historical prescriptions already issued.
        </div>
      </div>

      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-foreground flex items-center gap-2">
            <Pill className="h-4 w-4 text-primary" />
            Medicines Master
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your clinic's drug formulary and prescription defaults
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          + Add Medicine
        </Button>
      </div>

      {/* Search Input Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search medicines by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredMedicines.length} {filteredMedicines.length === 1 ? "medicine" : "medicines"}
        </span>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Table List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : medicines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No medicines defined for this clinic.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                + Add Medicine
              </Button>
            </div>
          ) : filteredMedicines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <p className="text-sm text-muted-foreground">No medicines match "{searchQuery}".</p>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Default Dosage</th>
                    <th className="py-3 px-4">Default Duration</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMedicines.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      {/* Name */}
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {m.name}
                      </td>

                      {/* Default Dosage */}
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {m.default_dosage ? (
                          <span className="text-foreground">{m.default_dosage}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Default Duration */}
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {m.default_duration ? (
                          <span className="text-foreground">{m.default_duration}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3.5 px-4 text-muted-foreground text-xs max-w-xs truncate">
                        {m.notes ? (
                          <span>{m.notes}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {m.is_active ? (
                          <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-muted text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(m)}
                            className="h-8 px-2 text-xs"
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(m)}
                            className={m.is_active ? "text-destructive hover:bg-destructive/10 h-8 px-2 text-xs" : "text-emerald-600 h-8 px-2 text-xs"}
                          >
                            {m.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMedicineToDelete(m)}
                            className="text-destructive hover:bg-destructive/10 h-8 px-2 text-xs"
                            title="Delete Medicine"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add Medicine Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <form onSubmit={handleAddMedicine}>
          <DialogHeader>
            <DialogTitle>Add Medicine</DialogTitle>
            <DialogDescription>
              Add a medicine with default prescription dosage and duration.
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-add-name">Medicine Name *</Label>
              <Input
                id="m-add-name"
                required
                placeholder="e.g. Amoxicillin 500mg"
                value={addForm.name}
                onChange={(e) => {
                  setAddForm({ ...addForm, name: e.target.value });
                  setAddError(null);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-add-dosage">Default Dosage</Label>
                <Input
                  id="m-add-dosage"
                  placeholder="e.g. 1 tab tid (3 times/day)"
                  value={addForm.default_dosage}
                  onChange={(e) => setAddForm({ ...addForm, default_dosage: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-add-duration">Default Duration</Label>
                <Input
                  id="m-add-duration"
                  placeholder="e.g. 5 days"
                  value={addForm.default_duration}
                  onChange={(e) => setAddForm({ ...addForm, default_duration: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-add-notes">Notes / Instructions</Label>
              <Input
                id="m-add-notes"
                placeholder="e.g. Take after food, finish full course"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddModalOpen(false);
                setAddError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submittingAdd}>
              {submittingAdd ? "Adding..." : "Add Medicine"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Edit Medicine Dialog */}
      <Dialog
        open={!!editingMedicine}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMedicine(null);
            setEditError(null);
          }
        }}
      >
        <form onSubmit={handleEditMedicine}>
          <DialogHeader>
            <DialogTitle>Edit Medicine</DialogTitle>
            <DialogDescription>
              Update medicine details and default prescription values.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-edit-name">Medicine Name *</Label>
              <Input
                id="m-edit-name"
                required
                value={editForm.name}
                onChange={(e) => {
                  setEditForm({ ...editForm, name: e.target.value });
                  setEditError(null);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-edit-dosage">Default Dosage</Label>
                <Input
                  id="m-edit-dosage"
                  placeholder="e.g. 1 tab bid"
                  value={editForm.default_dosage}
                  onChange={(e) => setEditForm({ ...editForm, default_dosage: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-edit-duration">Default Duration</Label>
                <Input
                  id="m-edit-duration"
                  placeholder="e.g. 5 days"
                  value={editForm.default_duration}
                  onChange={(e) => setEditForm({ ...editForm, default_duration: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-edit-notes">Notes / Instructions</Label>
              <Input
                id="m-edit-notes"
                placeholder="e.g. Take after food"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="m-edit-active"
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="m-edit-active" className="text-xs cursor-pointer font-normal">
                Active (available in prescription dropdowns)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingMedicine(null);
                setEditError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submittingEdit}>
              {submittingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!medicineToDelete}
        onOpenChange={(open) => {
          if (!open) setMedicineToDelete(null);
        }}
      >
        <div>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Delete Medicine
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{medicineToDelete?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 text-xs text-muted-foreground space-y-2">
            <p>
              Deleting a medicine removes it from your formulary list, but does <strong>not</strong> affect prescriptions already written. Existing patient prescription slips preserve the exact medicine text that was prescribed.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMedicineToDelete(null)}
              disabled={submittingDelete}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteMedicine}
              disabled={submittingDelete}
            >
              {submittingDelete ? "Deleting..." : "Delete Medicine"}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
