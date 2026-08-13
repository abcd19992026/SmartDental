import { useEffect, useState, type FormEvent } from "react";
import { Plus, ArrowUp, ArrowDown, Edit2, Save, X, AlertCircle, Info } from "lucide-react";
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

type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];

export function TreatmentTypesTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [treatments, setTreatments] = useState<TreatmentTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; recall_days: number }>({
    name: "",
    recall_days: 180,
  });

  // Add Treatment Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", recall_days: 180 });

  useEffect(() => {
    loadTreatments();
  }, []);

  async function loadTreatments() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("treatment_types")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .order("sort_order", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setTreatments(data || []);
    setLoading(false);
  }

  // Format Days to Human-Readable String
  function formatHumanRecallDays(days: number): string {
    if (days === 1) return "1 day";
    if (days % 365 === 0) {
      const yrs = days / 365;
      return `${days} days (~${yrs} ${yrs === 1 ? "year" : "years"})`;
    }
    if (days % 30 === 0) {
      const mos = days / 30;
      return `${days} days (~${mos} ${mos === 1 ? "month" : "months"})`;
    }
    if (days % 7 === 0) {
      const wks = days / 7;
      return `${days} days (~${wks} ${wks === 1 ? "week" : "weeks"})`;
    }
    return `${days} days`;
  }

  // Validate Recall Days Range (1 - 1095)
  function validateRecallDays(days: number): boolean {
    return Number.isInteger(days) && days >= 1 && days <= 1095;
  }

  // Save Inline Edit
  async function handleSaveInline(id: string) {
    if (!editForm.name.trim()) {
      toastError("Treatment name cannot be empty.", "Validation Error");
      return;
    }
    if (!validateRecallDays(editForm.recall_days)) {
      toastError("Recall days must be a whole number between 1 and 1095 days.", "Validation Error");
      return;
    }

    const { error } = await supabase
      .from("treatment_types")
      .update({
        name: editForm.name.trim(),
        recall_days: editForm.recall_days,
      })
      .eq("id", id);

    if (error) {
      toastError(error.message, "Save Failed");
      return;
    }

    success("Treatment type updated.");
    setEditingId(null);
    loadTreatments();
  }

  // Add Treatment
  async function handleAddTreatment(e: FormEvent) {
    e.preventDefault();
    if (!addForm.name.trim()) {
      toastError("Treatment name is required.", "Validation Error");
      return;
    }
    if (!validateRecallDays(addForm.recall_days)) {
      toastError("Recall days must be a whole number between 1 and 1095 days.", "Validation Error");
      return;
    }

    const nextSortOrder = (treatments.length > 0 ? Math.max(...treatments.map((t) => t.sort_order)) : 0) + 1;

    const { error } = await supabase.from("treatment_types").insert({
      clinic_id: profile?.clinic_id!,
      name: addForm.name.trim(),
      recall_days: addForm.recall_days,
      sort_order: nextSortOrder,
      is_active: true,
    });

    if (error) {
      toastError(error.message, "Creation Failed");
      return;
    }

    success("Treatment type added.");
    setAddModalOpen(false);
    setAddForm({ name: "", recall_days: 180 });
    loadTreatments();
  }

  // Reorder (Up/Down)
  async function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= treatments.length) return;

    const current = treatments[index];
    const neighbor = treatments[targetIndex];

    const { error: err1 } = await supabase
      .from("treatment_types")
      .update({ sort_order: neighbor.sort_order })
      .eq("id", current.id);

    const { error: err2 } = await supabase
      .from("treatment_types")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbor.id);

    if (err1 || err2) {
      toastError("Failed to reorder treatments.", "Reorder Error");
      return;
    }

    loadTreatments();
  }

  // Toggle Active Status
  async function handleToggleActive(t: TreatmentTypeRow) {
    const nextState = !t.is_active;
    const { error } = await supabase
      .from("treatment_types")
      .update({ is_active: nextState })
      .eq("id", t.id);

    if (error) {
      toastError(error.message, "Action Failed");
      return;
    }

    success(nextState ? `Treatment "${t.name}" activated.` : `Treatment "${t.name}" deactivated.`);
    loadTreatments();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Explanation Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-foreground leading-relaxed">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong>Important Note:</strong> Changing a recall interval affects future visits only, and does not shift recall dates already scheduled. Deactivating a treatment hides it from the Add Visit dropdown without altering historical visit records.
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Treatment Types & Recalls</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure procedure names, recall day intervals, and ordering for visit entry
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          + Add Treatment Type
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Table with Inline Editing */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : treatments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No treatment types defined for this clinic.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                + Add Treatment Type
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Reorder</th>
                    <th className="py-3 px-4">Treatment Name</th>
                    <th className="py-3 px-4">Recall Days (Interval)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {treatments.map((t, idx) => {
                    const isEditing = editingId === t.id;
                    return (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        {/* Reorder Buttons */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMove(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              title="Move Up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove(idx, "down")}
                              disabled={idx === treatments.length - 1}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              title="Move Down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Name */}
                        <td className="py-3.5 px-4 font-medium text-foreground">
                          {isEditing ? (
                            <Input
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="h-8 text-xs"
                            />
                          ) : (
                            t.name
                          )}
                        </td>

                        {/* Recall Days & Human Readable Format */}
                        <td className="py-3.5 px-4 text-muted-foreground">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={1095}
                                value={editForm.recall_days}
                                onChange={(e) => setEditForm({ ...editForm, recall_days: parseInt(e.target.value) || 0 })}
                                className="h-8 w-24 text-xs font-mono"
                              />
                              <span className="text-xs text-muted-foreground">
                                {formatHumanRecallDays(editForm.recall_days)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs">{formatHumanRecallDays(t.recall_days)}</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {t.is_active ? (
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
                            {isEditing ? (
                              <>
                                <Button size="sm" onClick={() => handleSaveInline(t.id)} className="h-7 px-2 text-xs">
                                  <Save className="h-3.5 w-3.5 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingId(null)}
                                  className="h-7 px-2 text-xs"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingId(t.id);
                                    setEditForm({ name: t.name, recall_days: t.recall_days });
                                  }}
                                  className="h-8 px-2 text-xs"
                                >
                                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleActive(t)}
                                  className={t.is_active ? "text-destructive hover:bg-destructive/10 h-8 px-2 text-xs" : "text-emerald-600 h-8 px-2 text-xs"}
                                >
                                  {t.is_active ? "Deactivate" : "Activate"}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Treatment Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <form onSubmit={handleAddTreatment}>
          <DialogHeader>
            <DialogTitle>Add Treatment Type</DialogTitle>
            <DialogDescription>
              Define procedure name and standard recall day interval.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tt-name">Treatment Name *</Label>
              <Input
                id="tt-name"
                required
                placeholder="e.g. Root Canal Treatment (RCT)"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tt-days">Recall Interval (Days: 1–1095) *</Label>
              <Input
                id="tt-days"
                type="number"
                min={1}
                max={1095}
                required
                value={addForm.recall_days}
                onChange={(e) => setAddForm({ ...addForm, recall_days: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                Human-readable: {formatHumanRecallDays(addForm.recall_days)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Add Treatment
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
