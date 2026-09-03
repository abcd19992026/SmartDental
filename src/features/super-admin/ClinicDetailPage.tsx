import { useEffect, useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Users as UsersIcon,
  MessageSquare,
  BarChart2,
  Plus,
  Edit2,
  Copy,
  Check,
  KeyRound,
  LogIn,
  Power,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resetUserPassword, setUserActive } from "@/lib/admin-api";
import { formatDateIST, todayIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/auth/useAuth";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type BranchRow = Database["public"]["Tables"]["branches"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type UsageRow = Database["public"]["Tables"]["clinic_usage"]["Row"];
type TemplateRow = Database["public"]["Tables"]["whatsapp_templates"]["Row"];

export function ClinicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { startImpersonation } = useAuth();

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Dialog states
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "" });

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paid_on: todayIST(),
    period_from: "",
    period_to: "",
    mode: "bank_transfer",
    reference: "",
    notes: "",
  });

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");

  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  const [tempPasswordDialog, setTempPasswordDialog] = useState<{
    open: boolean;
    email: string;
    password: string;
  }>({ open: false, email: "", password: "" });
  const [copied, setCopied] = useState(false);

  // Form states for editable tabs
  const [profileForm, setProfileForm] = useState<Partial<ClinicRow>>({});
  const [planForm, setPlanForm] = useState<Partial<ClinicRow>>({});
  const [whatsappForm, setWhatsappForm] = useState<Partial<ClinicRow>>({});

  useEffect(() => {
    if (!id) return;
    loadClinicData();
  }, [id]);

  async function loadClinicData() {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [cRes, bRes, pRes, payRes, uRes, tRes] = await Promise.all([
      supabase.from("clinics").select("*").eq("id", id).single(),
      supabase.from("branches").select("*").eq("clinic_id", id).order("created_at"),
      supabase.from("profiles").select("*").eq("clinic_id", id),
      supabase.from("payments").select("*").eq("clinic_id", id).order("paid_on", { ascending: false }),
      supabase.from("clinic_usage").select("*").eq("clinic_id", id).order("month", { ascending: false }),
      supabase.from("whatsapp_templates").select("*").eq("clinic_id", id).eq("approval_status", "approved"),
    ]);

    if (cRes.error || !cRes.data) {
      setError(cRes.error?.message || "Clinic not found");
      setLoading(false);
      return;
    }

    setClinic(cRes.data);
    setProfileForm(cRes.data);
    setPlanForm(cRes.data);
    setWhatsappForm(cRes.data);

    if (bRes.data) setBranches(bRes.data);
    if (pRes.data) setProfiles(pRes.data);
    if (payRes.data) setPayments(payRes.data);
    if (uRes.data) setUsage(uRes.data);
    if (tRes.data) {
      setTemplates(tRes.data);
      const defaultTpl = tRes.data.find((t) => t.is_default);
      setSelectedTemplateId(defaultTpl ? defaultTpl.id : "");
    } else {
      setTemplates([]);
      setSelectedTemplateId("");
    }

    setLoading(false);
  }

  // --- Profile Tab Actions ---
  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const { error: err } = await supabase
      .from("clinics")
      .update({
        name: profileForm.name,
        owner_name: profileForm.owner_name,
        phone: profileForm.phone,
        email: profileForm.email,
        city: profileForm.city,
        address: profileForm.address,
        logo_url: profileForm.logo_url,
      })
      .eq("id", id);

    if (err) {
      toastError(err.message, "Save Failed");
      return;
    }
    success("Clinic profile updated successfully.");
    loadClinicData();
  }

  // Branch CRUD
  function openAddBranch() {
    setEditingBranch(null);
    setBranchForm({ name: "", address: "", phone: "" });
    setBranchDialogOpen(true);
  }

  function openEditBranch(b: BranchRow) {
    setEditingBranch(b);
    setBranchForm({ name: b.name, address: b.address || "", phone: b.phone || "" });
    setBranchDialogOpen(true);
  }

  async function handleSaveBranch(e: FormEvent) {
    e.preventDefault();
    if (!id) return;

    if (editingBranch) {
      const { error: err } = await supabase
        .from("branches")
        .update({ name: branchForm.name, address: branchForm.address, phone: branchForm.phone })
        .eq("id", editingBranch.id);
      if (err) {
        toastError(err.message, "Update Branch Failed");
        return;
      }
      success("Branch updated successfully.");
    } else {
      const { error: err } = await supabase.from("branches").insert({
        clinic_id: id,
        name: branchForm.name,
        address: branchForm.address,
        phone: branchForm.phone,
        is_active: true,
      });
      if (err) {
        toastError(err.message, "Add Branch Failed");
        return;
      }
      success("Branch added successfully.");
    }
    setBranchDialogOpen(false);
    loadClinicData();
  }

  function toggleBranchActive(b: BranchRow) {
    const isDeactivating = b.is_active;
    setDestructiveAction({
      title: isDeactivating ? "Deactivate Branch" : "Activate Branch",
      description: isDeactivating
        ? `Are you sure you want to deactivate branch "${b.name}"?`
        : `Are you sure you want to activate branch "${b.name}"?`,
      action: async () => {
        const { error: err } = await supabase
          .from("branches")
          .update({ is_active: !b.is_active })
          .eq("id", b.id);
        if (err) {
          toastError(err.message, "Action Failed");
          return;
        }
        success(`Branch "${b.name}" ${isDeactivating ? "deactivated" : "activated"}.`);
        loadClinicData();
      },
    });
    setConfirmDestructiveOpen(true);
  }

  // --- Plan Tab Actions ---
  function quickExtendExpiry(months: number) {
    const current = planForm.plan_expires_on ? new Date(planForm.plan_expires_on) : new Date();
    current.setMonth(current.getMonth() + months);
    const newDateStr = current.toISOString().split("T")[0];
    setPlanForm((prev) => ({ ...prev, plan_expires_on: newDateStr }));
  }

  async function handleSavePlan(e: FormEvent) {
    e.preventDefault();
    if (!id) return;

    const includedBranches = planForm.included_branches;
    const includedReceptionists = planForm.included_receptionists;

    if (!Number.isInteger(includedBranches) || (includedBranches as number) < 1) {
      toastError("Included Branches must be a whole number of 1 or more.", "Save Plan Failed");
      return;
    }
    if (!Number.isInteger(includedReceptionists) || (includedReceptionists as number) < 1) {
      toastError("Included Receptionists must be a whole number of 1 or more.", "Save Plan Failed");
      return;
    }
    // Never let the limit drop below what the clinic is already actively using -- that would
    // leave active branches/receptionists over their own cap with no way for the owner to
    // resolve it themselves (they can't deactivate their way back under a limit they can't see
    // the reason for). Deactivating first is the only supported path to lowering these.
    if ((includedBranches as number) < activeBranchCount) {
      toastError(
        `Cannot set Included Branches below ${activeBranchCount} -- this clinic already has ${activeBranchCount} active branch${activeBranchCount === 1 ? "" : "es"}. Deactivate branches first.`,
        "Save Plan Failed",
      );
      return;
    }
    if ((includedReceptionists as number) < activeReceptionistCount) {
      toastError(
        `Cannot set Included Receptionists below ${activeReceptionistCount} -- this clinic already has ${activeReceptionistCount} active receptionist${activeReceptionistCount === 1 ? "" : "s"}. Deactivate a receptionist first.`,
        "Save Plan Failed",
      );
      return;
    }

    const { error: err } = await supabase
      .from("clinics")
      .update({
        plan_name: planForm.plan_name,
        plan_started_on: planForm.plan_started_on,
        plan_expires_on: planForm.plan_expires_on,
        daily_message_cap: planForm.daily_message_cap,
        monthly_message_quota: planForm.monthly_message_quota,
        included_branches: includedBranches,
        included_receptionists: includedReceptionists,
        show_branding: planForm.show_branding,
        branding_domain: planForm.branding_domain?.trim() || null,
      })
      .eq("id", id);

    if (err) {
      toastError(err.message, "Save Plan Failed");
      return;
    }
    success("Subscription plan updated successfully.");
    loadClinicData();
  }

  function handleToggleClinicActive() {
    if (clinic?.is_active) {
      setSuspensionReason("");
      setSuspendDialogOpen(true);
    } else {
      setDestructiveAction({
        title: "Reactivate Clinic",
        description: `Are you sure you want to reactivate "${clinic?.name}"? The clinic users will regain access immediately.`,
        action: async () => {
          const { error: err } = await supabase
            .from("clinics")
            .update({ is_active: true, suspension_reason: null })
            .eq("id", id!);
          if (err) {
            toastError(err.message, "Reactivation Failed");
            return;
          }
          success("Clinic reactivated successfully.");
          loadClinicData();
        },
      });
      setConfirmDestructiveOpen(true);
    }
  }

  async function handleSubmitSuspension(e: FormEvent) {
    e.preventDefault();
    if (!id || !suspensionReason.trim()) return;

    const { error: err } = await supabase
      .from("clinics")
      .update({ is_active: false, suspension_reason: suspensionReason.trim() })
      .eq("id", id);

    if (err) {
      toastError(err.message, "Suspension Failed");
      return;
    }
    setSuspendDialogOpen(false);
    success("Clinic suspended successfully.");
    loadClinicData();
  }

  // --- Payments Tab Actions ---
  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!id) return;

    const { error: err } = await supabase.from("payments").insert({
      clinic_id: id,
      amount: parseFloat(paymentForm.amount),
      paid_on: paymentForm.paid_on,
      period_from: paymentForm.period_from || null,
      period_to: paymentForm.period_to || null,
      mode: paymentForm.mode as any,
      reference: paymentForm.reference || null,
      notes: paymentForm.notes || null,
    });

    if (err) {
      toastError(err.message, "Record Payment Failed");
      return;
    }

    setPaymentDialogOpen(false);
    success("Payment recorded successfully.");
    loadClinicData();
  }

  // --- Users Tab Actions ---
  async function handleOpenPanel(u: ProfileRow) {
    const res = await startImpersonation(u.id);
    if (!res.ok) {
      toastError(res.error || "Could not open panel for this user.", "Open Panel Failed");
      return;
    }
    navigate("/app");
  }

  async function handleResetPassword(u: ProfileRow) {
    setDestructiveAction({
      title: "Reset User Password",
      description: `Reset password for user "${u.full_name || u.id}"? A new temporary password will be generated.`,
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
        success("Password reset generated.");
      },
    });
    setConfirmDestructiveOpen(true);
  }

  function handleToggleUserActive(u: ProfileRow) {
    const isDeactivating = u.is_active;
    setDestructiveAction({
      title: isDeactivating ? "Deactivate User" : "Activate User",
      description: isDeactivating
        ? `Are you sure you want to deactivate user "${u.full_name}"?`
        : `Are you sure you want to activate user "${u.full_name}"?`,
      action: async () => {
        const res = await setUserActive(u.id, !u.is_active);
        if (res.ok === false) {
          toastError(res.error, "Action Failed");
          return;
        }
        success(`User "${u.full_name}" ${isDeactivating ? "deactivated" : "activated"}.`);
        loadClinicData();
      },
    });
    setConfirmDestructiveOpen(true);
  }

  // --- WhatsApp Tab Actions ---
  async function handleSaveWhatsapp(e: FormEvent) {
    e.preventDefault();
    if (!id) return;

    const { error: err } = await supabase
      .from("clinics")
      .update({
        waba_phone_number_id: whatsappForm.waba_phone_number_id,
        waba_business_id: whatsappForm.waba_business_id,
        whatsapp_enabled: whatsappForm.whatsapp_enabled,
      })
      .eq("id", id);

    if (err) {
      toastError(err.message, "Save Failed");
      return;
    }

    if (selectedTemplateId) {
      const { error: resetErr } = await supabase
        .from("whatsapp_templates")
        .update({ is_default: false })
        .eq("clinic_id", id);

      if (resetErr) {
        toastError(resetErr.message, "Failed to update default template");
        return;
      }

      const { error: setErr } = await supabase
        .from("whatsapp_templates")
        .update({ is_default: true })
        .eq("id", selectedTemplateId);

      if (setErr) {
        toastError(setErr.message, "Failed to set default template");
        return;
      }
    }

    success("WhatsApp settings saved.");
    loadClinicData();
  }

  function handleCopyCredentials() {
    navigator.clipboard.writeText(`Password: ${tempPasswordDialog.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-destructive">{error || "Clinic not found"}</p>
        <Link to="/admin/clinics" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Clinics
        </Link>
      </div>
    );
  }

  // Used to guard the Plan tab's included_branches/included_receptionists inputs against being
  // saved below what the clinic is already actively using -- branches/profiles are already
  // loaded for the Branches and Users tabs, so no extra fetch is needed here.
  const activeBranchCount = branches.filter((b) => b.is_active).length;
  const activeReceptionistCount = profiles.filter((p) => p.role === "receptionist" && p.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/clinics" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-medium text-foreground">{clinic.name}</h1>
              {clinic.is_active ? (
                <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Active Subscription
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10">
                  Suspended
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {clinic.city ? `${clinic.city} • ` : ""}
              Owner: {clinic.owner_name || "Unassigned"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={clinic.is_active ? "outline" : "default"} size="sm" onClick={handleToggleClinicActive}>
            <Power className="h-4 w-4 mr-1.5" />
            {clinic.is_active ? "Suspend Clinic" : "Activate Clinic"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <Building2 className="h-4 w-4 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="plan">
            <Calendar className="h-4 w-4 mr-1.5" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Payments ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="users">
            <UsersIcon className="h-4 w-4 mr-1.5" />
            Users ({profiles.length})
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <MessageSquare className="h-4 w-4 mr-1.5" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="usage">
            <BarChart2 className="h-4 w-4 mr-1.5" />
            Usage
          </TabsTrigger>
        </TabsList>

        {/* 1. Profile Tab */}
        <TabsContent value="profile" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Clinic Information</CardTitle>
              <CardDescription>General clinic profile, contact details, and branding</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 max-w-2xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-name">Clinic Name</Label>
                    <Input
                      id="c-name"
                      required
                      value={profileForm.name || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-owner">Owner Name</Label>
                    <Input
                      id="c-owner"
                      value={profileForm.owner_name || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, owner_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-phone">Phone</Label>
                    <Input
                      id="c-phone"
                      value={profileForm.phone || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-email">Email</Label>
                    <Input
                      id="c-email"
                      type="email"
                      value={profileForm.email || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-city">City</Label>
                    <Input
                      id="c-city"
                      value={profileForm.city || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-logo">Logo URL</Label>
                    <Input
                      id="c-logo"
                      value={profileForm.logo_url || ""}
                      onChange={(e) => setProfileForm({ ...profileForm, logo_url: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-address">Address</Label>
                  <Input
                    id="c-address"
                    value={profileForm.address || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Branches Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium">Branches</CardTitle>
                <CardDescription>Manage physical branches associated with this clinic</CardDescription>
              </div>
              <Button size="sm" onClick={openAddBranch}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Branch
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                    <tr>
                      <th className="py-3 px-4">Branch Name</th>
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {branches.map((b) => (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-medium text-foreground">{b.name}</td>
                        <td className="py-3 px-4 text-muted-foreground">{b.address || "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">{b.phone || "—"}</td>
                        <td className="py-3 px-4">
                          {b.is_active ? (
                            <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-muted text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditBranch(b)}>
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleBranchActive(b)}>
                            {b.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Plan Tab */}
        <TabsContent value="plan" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Subscription & Quotas</CardTitle>
              <CardDescription>Manage active plan dates, extension limits, and message caps</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePlan} className="flex flex-col gap-5 max-w-2xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-name">Plan Name</Label>
                    <Input
                      id="p-name"
                      value={planForm.plan_name || "standard"}
                      onChange={(e) => setPlanForm({ ...planForm, plan_name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-start">Plan Started On</Label>
                    <Input
                      id="p-start"
                      type="date"
                      value={planForm.plan_started_on || ""}
                      onChange={(e) => setPlanForm({ ...planForm, plan_started_on: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-expire">Plan Expiry Date</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="p-expire"
                      type="date"
                      value={planForm.plan_expires_on || ""}
                      onChange={(e) => setPlanForm({ ...planForm, plan_expires_on: e.target.value })}
                      className="max-w-xs"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => quickExtendExpiry(6)}>
                      +6 Months
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => quickExtendExpiry(12)}>
                      +1 Year
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-daily">Daily Message Cap</Label>
                    <Input
                      id="p-daily"
                      type="number"
                      value={planForm.daily_message_cap ?? 150}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, daily_message_cap: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-monthly">Monthly Message Quota</Label>
                    <Input
                      id="p-monthly"
                      type="number"
                      value={planForm.monthly_message_quota ?? 3000}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, monthly_message_quota: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-branches">Included Branches</Label>
                    <Input
                      id="p-branches"
                      type="number"
                      min={1}
                      value={planForm.included_branches ?? 1}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, included_branches: parseInt(e.target.value) || 0 })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {activeBranchCount} active branch{activeBranchCount === 1 ? "" : "es"} right now
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-receptionists">Included Receptionists</Label>
                    <Input
                      id="p-receptionists"
                      type="number"
                      min={1}
                      value={planForm.included_receptionists ?? 1}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, included_receptionists: parseInt(e.target.value) || 0 })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {activeReceptionistCount} active receptionist{activeReceptionistCount === 1 ? "" : "s"} right now
                    </span>
                  </div>
                </div>

                {/* Prescription Branding */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 mt-2">
                  <h4 className="font-medium text-foreground mb-3">Prescription branding</h4>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="p-show-branding"
                      checked={planForm.show_branding ?? true}
                      onChange={(e) => setPlanForm({ ...planForm, show_branding: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <Label htmlFor="p-show-branding" className="cursor-pointer font-medium">
                      Show "Powered by SmartDentist" on printed prescriptions
                    </Label>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-3 max-w-xs">
                    <Label htmlFor="p-branding-domain">Branding domain (optional)</Label>
                    <Input
                      id="p-branding-domain"
                      placeholder="smartdentist.in"
                      disabled={!(planForm.show_branding ?? true)}
                      value={planForm.branding_domain || ""}
                      onChange={(e) => setPlanForm({ ...planForm, branding_domain: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">Leave blank to show the name only.</span>
                  </div>
                </div>

                {/* Active / Suspension Status Card */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 mt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-foreground">Clinic Status</h4>
                      <p className="text-xs text-muted-foreground">
                        {clinic.is_active
                          ? "Clinic is active and accessible by clinic users."
                          : `Clinic suspended. Reason: ${clinic.suspension_reason || "None specified"}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={clinic.is_active ? "destructive" : "outline"}
                      size="sm"
                      onClick={handleToggleClinicActive}
                    >
                      {clinic.is_active ? "Suspend Clinic" : "Activate Clinic"}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit">Save Plan Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Payments Tab */}
        <TabsContent value="payments" className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium">Payment History</CardTitle>
                <CardDescription>Recorded subscription payments and receipts for this clinic</CardDescription>
              </div>
              <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Record Payment
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No payments recorded for this clinic yet.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setPaymentDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Record Payment
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Paid On</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Period Covered</th>
                        <th className="py-3 px-4">Payment Mode</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 px-4 font-medium text-foreground">{formatDateIST(p.paid_on)}</td>
                          <td className="py-3 px-4 font-medium text-foreground">₹{p.amount}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {p.period_from && p.period_to
                              ? `${formatDateIST(p.period_from)} – ${formatDateIST(p.period_to)}`
                              : "—"}
                          </td>
                          <td className="py-3 px-4 uppercase text-xs font-medium text-muted-foreground">{p.mode}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.reference || "—"}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Users Tab */}
        <TabsContent value="users" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">User Accounts</CardTitle>
              <CardDescription>Owner and staff profiles assigned to this clinic</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {profiles.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 px-4 font-medium text-foreground">{u.full_name || "—"}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="capitalize">
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{u.phone || "—"}</td>
                        <td className="py-3 px-4">
                          {u.is_active ? (
                            <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-muted text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right flex justify-end gap-2">
                          <Tooltip
                            disabled={u.role !== "super_admin" && u.is_active}
                            content={
                              u.role === "super_admin"
                                ? "Cannot open a panel as another platform admin"
                                : "Cannot open a panel for an inactive user"
                            }
                          >
                            <span>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={u.role === "super_admin" || !u.is_active}
                                onClick={() => handleOpenPanel(u)}
                              >
                                <LogIn className="h-3.5 w-3.5 mr-1" />
                                Open Panel
                              </Button>
                            </span>
                          </Tooltip>
                          <Button variant="outline" size="sm" onClick={() => handleResetPassword(u)}>
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            Reset Password
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleUserActive(u)}
                            className={u.is_active ? "text-destructive hover:bg-destructive/10" : ""}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. WhatsApp Tab */}
        <TabsContent value="whatsapp" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">WhatsApp Configuration</CardTitle>
              <CardDescription>Meta WABA account credentials and template mappings</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveWhatsapp} className="flex flex-col gap-5 max-w-2xl">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="wa-enabled"
                    checked={whatsappForm.whatsapp_enabled || false}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, whatsapp_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="wa-enabled" className="cursor-pointer font-medium">
                    Enable WhatsApp Recall Messaging
                  </Label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wa-phone-id">WABA Phone Number ID</Label>
                    <Input
                      id="wa-phone-id"
                      placeholder="e.g. 1098234876"
                      value={whatsappForm.waba_phone_number_id || ""}
                      onChange={(e) =>
                        setWhatsappForm({ ...whatsappForm, waba_phone_number_id: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wa-biz-id">WABA Business ID</Label>
                    <Input
                      id="wa-biz-id"
                      placeholder="e.g. 9847293847"
                      value={whatsappForm.waba_business_id || ""}
                      onChange={(e) =>
                        setWhatsappForm({ ...whatsappForm, waba_business_id: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-template">Default Template Selector</Label>
                  {templates.length === 0 ? (
                    <select
                      id="wa-template"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-not-allowed opacity-80"
                      disabled
                      value=""
                    >
                      <option value="" disabled>
                        No approved templates available for this clinic
                      </option>
                    </select>
                  ) : (
                    <select
                      id="wa-template"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                      {!selectedTemplateId && (
                        <option value="" disabled>
                          Select an approved template
                        </option>
                      )}
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.meta_template_name} ({t.language_code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <Tooltip content="Test message endpoint is not yet available. Test sending will be enabled once the backend test-send endpoint is deployed.">
                    <span>
                      <Button type="button" variant="outline" disabled>
                        Send Test Message
                      </Button>
                    </span>
                  </Tooltip>
                  <Button type="submit">Save WhatsApp Settings</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. Usage Tab */}
        <TabsContent value="usage" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Monthly Usage History</CardTitle>
              <CardDescription>Month-by-month message activity, patients added, and recalls generated</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {usage.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No monthly usage data recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Month</th>
                        <th className="py-3 px-4 text-right">Messages Sent</th>
                        <th className="py-3 px-4 text-right">Patients Added</th>
                        <th className="py-3 px-4 text-right">Recalls Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {usage.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 px-4 font-medium text-foreground">{u.month}</td>
                          <td className="py-3 px-4 text-right text-foreground">{u.messages_sent}</td>
                          <td className="py-3 px-4 text-right text-foreground">{u.patients_added}</td>
                          <td className="py-3 px-4 text-right text-foreground">{u.recalls_created}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* --- Dialogs --- */}

      {/* 1. Add / Edit Branch Dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <form onSubmit={handleSaveBranch}>
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "Add Branch"}</DialogTitle>
            <DialogDescription>Branch details and contact location</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-name">Branch Name</Label>
              <Input
                id="b-name"
                required
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-phone">Phone</Label>
              <Input
                id="b-phone"
                value={branchForm.phone}
                onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-addr">Address</Label>
              <Input
                id="b-addr"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Branch</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* 2. Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <form onSubmit={handleRecordPayment}>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Record a new subscription payment for this clinic</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amt">Amount (₹)</Label>
                <Input
                  id="pay-amt"
                  type="number"
                  step="0.01"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-date">Paid Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  required
                  value={paymentForm.paid_on}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paid_on: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-from">Period From</Label>
                <Input
                  id="pay-from"
                  type="date"
                  value={paymentForm.period_from}
                  onChange={(e) => setPaymentForm({ ...paymentForm, period_from: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-to">Period To</Label>
                <Input
                  id="pay-to"
                  type="date"
                  value={paymentForm.period_to}
                  onChange={(e) => setPaymentForm({ ...paymentForm, period_to: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-mode">Payment Mode</Label>
              <select
                id="pay-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={paymentForm.mode}
                onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-ref">Reference / Txn ID</Label>
              <Input
                id="pay-ref"
                placeholder="e.g. UTR / Transaction No."
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-notes">Notes</Label>
              <Input
                id="pay-notes"
                placeholder="Internal notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Record Payment</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* 3. Suspend Reason Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <form onSubmit={handleSubmitSuspension}>
          <DialogHeader>
            <DialogTitle>Suspend Clinic Access</DialogTitle>
            <DialogDescription>
              Please state the reason for suspending "{clinic.name}". This will immediately block access for all users of this clinic.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="sus-reason">Suspension Reason</Label>
            <Input
              id="sus-reason"
              required
              placeholder="e.g. Non-payment of subscription fee"
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Confirm Suspension
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* 4. Destructive Action Confirmation Dialog */}
      <Dialog open={confirmDestructiveOpen} onOpenChange={setConfirmDestructiveOpen}>
        <DialogHeader>
          <DialogTitle>{destructiveAction?.title}</DialogTitle>
          <DialogDescription>{destructiveAction?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmDestructiveOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              setConfirmDestructiveOpen(false);
              if (destructiveAction) await destructiveAction.action();
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 5. Temporary Password Display Dialog */}
      <Dialog open={tempPasswordDialog.open} onOpenChange={(val) => setTempPasswordDialog({ ...tempPasswordDialog, open: val })}>
        <DialogHeader>
          <DialogTitle>Temporary Password Generated</DialogTitle>
          <DialogDescription>
            A temporary password has been set for this account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="rounded-md border border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
            <strong>Warning:</strong> This temporary password will NOT be shown again. Copy it now and securely send it to the user.
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3">
            <span className="font-mono text-base font-semibold tracking-wider text-foreground">
              {tempPasswordDialog.password}
            </span>
            <Button size="sm" onClick={handleCopyCredentials}>
              {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => setTempPasswordDialog({ ...tempPasswordDialog, open: false })}>
            Done
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
