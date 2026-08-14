import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { Upload, Trash2, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export function ClinicProfileTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    phone: "",
    email: "",
    city: "",
    address: "",
    logo_url: "",
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    loadClinicProfile();
  }, []);

  async function loadClinicProfile() {
    if (!profile?.clinic_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", profile.clinic_id)
      .single();

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setClinic(data);
    setForm({
      name: data.name || "",
      owner_name: data.owner_name || "",
      phone: data.phone || "",
      email: data.email || "",
      city: data.city || "",
      address: data.address || "",
      logo_url: data.logo_url || "",
    });
    setLoading(false);
  }

  // Handle Logo Upload
  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      toastError("Invalid file type. Only PNG and JPG images are accepted.", "Upload Error");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toastError("File size exceeds 2MB limit. Please upload a smaller image.", "Upload Error");
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const timestamp = Date.now();
      const path = `${profile?.clinic_id}/${timestamp}.${ext}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("clinic-logos")
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        toastError(uploadErr.message, "Upload Error");
        return;
      }

      const { data: urlData } = supabase.storage.from("clinic-logos").getPublicUrl(uploadData.path);
      setForm((prev) => ({ ...prev, logo_url: urlData.publicUrl }));
      success("Logo uploaded successfully.");
    } catch (err: any) {
      toastError(err.message || "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleRemoveLogo() {
    setForm((prev) => ({ ...prev, logo_url: "" }));
    success("Logo removed.");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clinic) return;

    if (!form.name.trim()) {
      toastError("Clinic name is required.", "Validation Error");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from("clinics")
      .update({
        name: form.name.trim(),
        owner_name: form.owner_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        logo_url: form.logo_url.trim() || null,
      })
      .eq("id", clinic.id);

    if (error) {
      setErrorMsg(error.message);
      toastError(error.message, "Save Failed");
      setSubmitting(false);
      return;
    }

    success("Clinic profile updated successfully.");
    setSubmitting(false);
    loadClinicProfile();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Editable Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Clinic Details</CardTitle>
          <CardDescription>Update your dental practice contact details and branding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo Upload Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border border-border p-4 bg-muted/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-background overflow-hidden shrink-0">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Clinic Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-foreground">Clinic Logo</span>
              <p className="text-xs text-muted-foreground">PNG or JPG, maximum file size 2MB</p>
            </div>

            <div className="flex items-center gap-2">
              <Label
                htmlFor="logo-upload"
                className="cursor-pointer inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {form.logo_url ? "Change Logo" : "Upload Logo"}
              </Label>
              <input
                id="logo-upload"
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                onChange={handleLogoChange}
                className="hidden"
                disabled={uploadingLogo}
              />
              {form.logo_url && (
                <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-name">Clinic Name *</Label>
              <Input
                id="cp-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-owner">Owner Name</Label>
              <Input
                id="cp-owner"
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-phone">Phone</Label>
              <Input
                id="cp-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-email">Email</Label>
              <Input
                id="cp-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-city">City</Label>
              <Input
                id="cp-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-address">Address</Label>
              <Input
                id="cp-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-border pt-4">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Profile
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
