import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createClinic, type CreateClinicInput, type CreateClinicOutput } from "@/lib/admin-api";
import { todayIST } from "@/lib/dates";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DEFAULT_TREATMENTS = [
  { name: "Scaling / Cleaning", recall_days: 180 },
  { name: "Filling", recall_days: 180 },
  { name: "RCT — in progress", recall_days: 7 },
  { name: "RCT — completed, crown due", recall_days: 15 },
  { name: "Crown / Bridge fitted", recall_days: 180 },
  { name: "Extraction", recall_days: 7 },
  { name: "Denture delivered", recall_days: 15 },
  { name: "Orthodontic adjustment", recall_days: 21 },
  { name: "Implant placed", recall_days: 90 },
  { name: "General checkup", recall_days: 180 },
];

export function AddClinicWizardPage() {
  const [step, setStep] = useState(1);

  // Form State across 6 steps
  const [clinic, setClinic] = useState({
    name: "",
    owner_name: "",
    phone: "",
    email: "",
    city: "",
    address: "",
    logo_url: "",
  });

  const [branches, setBranches] = useState<Array<{ name: string; address: string; phone: string }>>([
    { name: "Main Branch", address: "", phone: "" },
  ]);

  const [owner, setOwner] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  const [treatments, setTreatments] = useState(DEFAULT_TREATMENTS);

  function getDefaultExpiry() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  }

  const [plan, setPlan] = useState({
    plan_name: "standard",
    plan_started_on: todayIST(),
    plan_expires_on: getDefaultExpiry(),
    daily_message_cap: 150,
    monthly_message_quota: 3000,
  });

  const [whatsapp, setWhatsapp] = useState({
    waba_phone_number_id: "",
    waba_business_id: "",
    whatsapp_enabled: false,
  });

  // Validation / Submission states
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successOutput, setSuccessOutput] = useState<CreateClinicOutput | null>(null);
  const [copied, setCopied] = useState(false);

  // Step Validations
  function validateStep(currentStep: number): boolean {
    setStepError(null);
    if (currentStep === 1) {
      if (!clinic.name.trim()) {
        setStepError("Clinic Name is required.");
        return false;
      }
    }
    if (currentStep === 2) {
      if (branches.length === 0 || branches.some((b) => !b.name.trim())) {
        setStepError("At least one branch with a valid name is required.");
        return false;
      }
    }
    if (currentStep === 3) {
      if (!owner.full_name.trim()) {
        setStepError("Owner Full Name is required.");
        return false;
      }
      if (!owner.email.trim() || !owner.email.includes("@")) {
        setStepError("A valid Owner Email is required.");
        return false;
      }
    }
    if (currentStep === 5) {
      if (!plan.plan_started_on || !plan.plan_expires_on) {
        setStepError("Plan start date and expiry date are required.");
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 6));
    }
  }

  function handleBack() {
    setStepError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  }

  // Branch operations
  function addBranch() {
    setBranches((prev) => [...prev, { name: `Branch ${prev.length + 1}`, address: "", phone: "" }]);
  }
  function removeBranch(index: number) {
    if (branches.length <= 1) return;
    setBranches((prev) => prev.filter((_, i) => i !== index));
  }

  // Treatment operations
  function addTreatment() {
    setTreatments((prev) => [...prev, { name: "Custom Treatment", recall_days: 180 }]);
  }
  function removeTreatment(index: number) {
    setTreatments((prev) => prev.filter((_, i) => i !== index));
  }

  // Final Submission
  async function handleSubmit() {
    if (!validateStep(step)) return;
    setSubmitting(true);
    setStepError(null);

    const input: CreateClinicInput = {
      clinic: {
        name: clinic.name.trim(),
        owner_name: owner.full_name.trim(),
        phone: clinic.phone.trim() || undefined,
        email: clinic.email.trim() || undefined,
        city: clinic.city.trim() || undefined,
        address: clinic.address.trim() || undefined,
        logo_url: clinic.logo_url.trim() || undefined,
        waba_phone_number_id: whatsapp.waba_phone_number_id.trim() || undefined,
        waba_business_id: whatsapp.waba_business_id.trim() || undefined,
        whatsapp_enabled: whatsapp.whatsapp_enabled,
        daily_message_cap: plan.daily_message_cap,
        monthly_message_quota: plan.monthly_message_quota,
        plan_name: plan.plan_name,
        plan_started_on: plan.plan_started_on,
        plan_expires_on: plan.plan_expires_on,
      },
      branches: branches.map((b) => ({
        name: b.name.trim(),
        address: b.address.trim() || undefined,
        phone: b.phone.trim() || undefined,
      })),
      owner: {
        full_name: owner.full_name.trim(),
        email: owner.email.trim(),
        phone: owner.phone.trim() || undefined,
      },
    };

    const res = await createClinic(input);

    if (res.ok === false) {
      setStepError(res.error || "Failed to create clinic. Please check your data and try again.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSuccessOutput(res.data);
  }

  function handleCopyCredentials() {
    if (!successOutput) return;
    const text = `Email: ${successOutput.owner.email}\nPassword: ${successOutput.owner.temporary_password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  // If completed successfully, show summary card
  if (successOutput) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 max-w-xl mx-auto">
        <Card className="w-full border-primary/30 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Clinic Created Successfully!</CardTitle>
            <CardDescription>
              "{clinic.name}" and owner account have been provisioned.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
              <strong>WARNING:</strong> Copy these credentials now. The owner's temporary password will NOT be shown again!
            </div>

            <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Owner Email:</span>
                <span className="font-medium text-foreground">{successOutput.owner.email}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="text-muted-foreground text-xs">Temporary Password:</span>
                <span className="font-bold text-primary tracking-wider">{successOutput.owner.temporary_password}</span>
              </div>
            </div>

            <Button onClick={handleCopyCredentials} variant="outline" className="w-full">
              {copied ? <Check className="h-4 w-4 mr-2 text-emerald-600" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Credentials Copied to Clipboard!" : "Copy Credentials"}
            </Button>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border pt-4">
            <Link
              to={`/admin/clinics/${successOutput.clinic_id}`}
              className={cn(buttonVariants({ variant: "default" }), "w-full text-center")}
            >
              View Created Clinic
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const stepTitles = [
    "Clinic Details",
    "Branches",
    "Owner Account",
    "Treatment Types",
    "Plan & Quotas",
    "WhatsApp Config",
  ];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/admin/clinics" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-medium text-foreground">Add New Clinic</h1>
          <p className="text-sm text-muted-foreground mt-0.5">6-step onboarding wizard for dental practice onboarding</p>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="grid grid-cols-6 gap-2">
        {stepTitles.map((title, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === step;
          const isComplete = stepNum < step;
          return (
            <div key={title} className="flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  isActive ? "bg-primary" : isComplete ? "bg-primary/50" : "bg-muted"
                }`}
              />
              <span
                className={`text-[10px] truncate ${
                  isActive ? "font-medium text-primary" : "text-muted-foreground"
                }`}
              >
                {stepNum}. {title}
              </span>
            </div>
          );
        })}
      </div>

      {stepError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{stepError}</span>
        </div>
      )}

      {/* Step Content Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Step {step} of 6: {stepTitles[step - 1]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* STEP 1: Clinic Details */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="w-name">Clinic Name *</Label>
                <Input
                  id="w-name"
                  placeholder="e.g. Apex Dental Care"
                  value={clinic.name}
                  onChange={(e) => setClinic({ ...clinic, name: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-city">City</Label>
                  <Input
                    id="w-city"
                    placeholder="e.g. Mumbai"
                    value={clinic.city}
                    onChange={(e) => setClinic({ ...clinic, city: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-phone">Phone</Label>
                  <Input
                    id="w-phone"
                    placeholder="e.g. +91 9876543210"
                    value={clinic.phone}
                    onChange={(e) => setClinic({ ...clinic, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-email">Email</Label>
                  <Input
                    id="w-email"
                    type="email"
                    placeholder="clinic@example.com"
                    value={clinic.email}
                    onChange={(e) => setClinic({ ...clinic, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-logo">Logo URL</Label>
                  <Input
                    id="w-logo"
                    placeholder="https://..."
                    value={clinic.logo_url}
                    onChange={(e) => setClinic({ ...clinic, logo_url: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="w-address">Address</Label>
                <Input
                  id="w-address"
                  placeholder="Street address / Landmark"
                  value={clinic.address}
                  onChange={(e) => setClinic({ ...clinic, address: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Branches */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Define the physical branches for this clinic. At least one branch is required.
              </p>

              {branches.map((b, idx) => (
                <div key={idx} className="rounded-lg border border-border p-4 space-y-3 relative bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs text-foreground uppercase tracking-wider">
                      Branch #{idx + 1}
                    </span>
                    {branches.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 h-7 px-2"
                        onClick={() => removeBranch(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Branch Name *</Label>
                      <Input
                        size={1}
                        value={b.name}
                        onChange={(e) => {
                          const updated = [...branches];
                          updated[idx].name = e.target.value;
                          setBranches(updated);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={b.phone}
                        onChange={(e) => {
                          const updated = [...branches];
                          updated[idx].phone = e.target.value;
                          setBranches(updated);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Address</Label>
                      <Input
                        value={b.address}
                        onChange={(e) => {
                          const updated = [...branches];
                          updated[idx].address = e.target.value;
                          setBranches(updated);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addBranch} className="w-fit">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Another Branch
              </Button>
            </div>
          )}

          {/* STEP 3: Owner Account */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Enter the clinic owner's details. A new user account will be created with a auto-generated temporary password.
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="o-name">Owner Full Name *</Label>
                <Input
                  id="o-name"
                  placeholder="e.g. Dr. Rajesh Sharma"
                  value={owner.full_name}
                  onChange={(e) => setOwner({ ...owner, full_name: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="o-email">Owner Email (Login ID) *</Label>
                  <Input
                    id="o-email"
                    type="email"
                    placeholder="doctor@clinic.com"
                    value={owner.email}
                    onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="o-phone">Owner Phone</Label>
                  <Input
                    id="o-phone"
                    placeholder="+91 9876543210"
                    value={owner.phone}
                    onChange={(e) => setOwner({ ...owner, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Treatment Types */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Pre-filled default dental procedures and recall intervals (in days). Editable and removable.
              </p>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {treatments.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2 border-b border-border pb-2">
                    <Input
                      className="flex-1"
                      value={t.name}
                      onChange={(e) => {
                        const updated = [...treatments];
                        updated[idx].name = e.target.value;
                        setTreatments(updated);
                      }}
                    />
                    <div className="flex items-center gap-1.5 w-36">
                      <Input
                        type="number"
                        className="w-20 text-center"
                        value={t.recall_days}
                        onChange={(e) => {
                          const updated = [...treatments];
                          updated[idx].recall_days = parseInt(e.target.value) || 0;
                          setTreatments(updated);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeTreatment(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addTreatment} className="w-fit">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Treatment Type
              </Button>
            </div>
          )}

          {/* STEP 5: Plan & Quotas */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-name">Plan Name</Label>
                  <Input
                    id="pl-name"
                    value={plan.plan_name}
                    onChange={(e) => setPlan({ ...plan, plan_name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-start">Plan Start Date *</Label>
                  <Input
                    id="pl-start"
                    type="date"
                    value={plan.plan_started_on}
                    onChange={(e) => setPlan({ ...plan, plan_started_on: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pl-expire">Plan Expiry Date *</Label>
                <Input
                  id="pl-expire"
                  type="date"
                  value={plan.plan_expires_on}
                  onChange={(e) => setPlan({ ...plan, plan_expires_on: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-daily">Daily Message Cap</Label>
                  <Input
                    id="pl-daily"
                    type="number"
                    value={plan.daily_message_cap}
                    onChange={(e) => setPlan({ ...plan, daily_message_cap: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pl-monthly">Monthly Message Quota</Label>
                  <Input
                    id="pl-monthly"
                    type="number"
                    value={plan.monthly_message_quota}
                    onChange={(e) => setPlan({ ...plan, monthly_message_quota: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: WhatsApp Config (Skippable) */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Optional: Configure WhatsApp WABA account parameters now, or leave empty to set up later.
              </p>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="w-wa-enable"
                  checked={whatsapp.whatsapp_enabled}
                  onChange={(e) => setWhatsapp({ ...whatsapp, whatsapp_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="w-wa-enable" className="cursor-pointer font-medium">
                  Enable WhatsApp Recall Integration
                </Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-phone-id">WABA Phone Number ID</Label>
                  <Input
                    id="w-phone-id"
                    placeholder="e.g. 102938475"
                    value={whatsapp.waba_phone_number_id}
                    onChange={(e) => setWhatsapp({ ...whatsapp, waba_phone_number_id: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="w-biz-id">WABA Business ID</Label>
                  <Input
                    id="w-biz-id"
                    placeholder="e.g. 984729384"
                    value={whatsapp.waba_business_id}
                    onChange={(e) => setWhatsapp({ ...whatsapp, waba_business_id: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={handleBack} disabled={step === 1 || submitting}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          {step < 6 ? (
            <Button type="button" onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating Clinic...
                </>
              ) : (
                <>
                  Create Clinic & Provision Owner
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
