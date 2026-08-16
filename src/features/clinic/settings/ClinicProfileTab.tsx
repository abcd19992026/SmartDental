import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { Upload, Trash2, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { uploadOwnAvatar, removeOwnAvatar, uploadClinicLogo, removeClinicLogo } from "@/lib/clinic-api";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export function ClinicProfileTab() {
  const { profile, session } = useAuth();
  const { success, error: toastError } = useToast();

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User Profile Avatar State
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false);
  const [userAvatarError, setUserAvatarError] = useState<string | null>(null);

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
    setUserAvatarUrl(profile?.avatar_url || null);
  }, [profile?.avatar_url]);

  useEffect(() => {
    function handleAvatarUpdate(e: Event) {
      const customEvt = e as CustomEvent<string | null>;
      setUserAvatarUrl(customEvt.detail);
    }
    window.addEventListener("profile-avatar-updated", handleAvatarUpdate);
    return () => {
      window.removeEventListener("profile-avatar-updated", handleAvatarUpdate);
    };
  }, []);

  useEffect(() => {
    loadClinicProfile();
  }, [profile?.clinic_id]);

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

  // Handle User Personal Avatar Upload
  async function handleUserAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUserAvatarError(null);

    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      const msg = "Invalid file type. Only PNG and JPG images are accepted.";
      setUserAvatarError(msg);
      toastError(msg, "Upload Error");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      const msg = "File size exceeds 2MB limit. Please upload a smaller image.";
      setUserAvatarError(msg);
      toastError(msg, "Upload Error");
      return;
    }

    setUploadingUserAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const res = await uploadOwnAvatar(file, ext);

      if (!res.ok) {
        setUserAvatarError(res.error);
        toastError(res.error, "Upload Error");
        return;
      }

      const newUrl = res.data.avatar_url;
      setUserAvatarUrl(newUrl);
      window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: newUrl }));
      success("Profile photo updated successfully.");
    } catch (err: any) {
      const msg = err.message || "Failed to upload profile photo.";
      setUserAvatarError(msg);
      toastError(msg, "Upload Error");
    } finally {
      setUploadingUserAvatar(false);
    }
  }

  // Handle User Personal Avatar Removal
  async function handleRemoveUserAvatar() {
    setUserAvatarError(null);
    setUploadingUserAvatar(true);

    try {
      const res = await removeOwnAvatar();

      if (!res.ok) {
        setUserAvatarError(res.error);
        toastError(res.error, "Remove Error");
        return;
      }

      setUserAvatarUrl(null);
      window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: null }));
      success("Profile photo removed.");
    } catch (err: any) {
      const msg = err.message || "Failed to remove profile photo.";
      setUserAvatarError(msg);
      toastError(msg, "Remove Error");
    } finally {
      setUploadingUserAvatar(false);
    }
  }

  // Handle Clinic Business Logo Upload
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

    if (!profile?.clinic_id) return;

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const res = await uploadClinicLogo(profile.clinic_id, file, ext);

      if (!res.ok) {
        toastError(res.error, "Upload Error");
        return;
      }

      setForm((prev) => ({ ...prev, logo_url: res.data.logo_url }));
      success("Logo uploaded successfully.");
    } catch (err: any) {
      toastError(err.message || "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (!profile?.clinic_id) return;

    setUploadingLogo(true);
    try {
      const res = await removeClinicLogo(profile.clinic_id);

      if (!res.ok) {
        toastError(res.error, "Remove Error");
        return;
      }

      setForm((prev) => ({ ...prev, logo_url: "" }));
      success("Logo removed.");
    } catch (err: any) {
      toastError(err.message || "Failed to remove logo.");
    } finally {
      setUploadingLogo(false);
    }
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

  const userInitial = (profile?.full_name || "U").charAt(0).toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Section 1: Your Profile Photo */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium">Your Profile Photo</CardTitle>
            {profile?.role && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize border border-primary/20">
                {profile.role}
              </span>
            )}
          </div>
          <CardDescription>
            This is your personal photo, shown next to your name in the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border border-border p-4 bg-muted/20">
            <Avatar className="h-24 w-24 shrink-0 border border-border">
              {userAvatarUrl ? (
                <AvatarImage src={userAvatarUrl} alt={profile?.full_name || "Profile"} />
              ) : null}
              <AvatarFallback className="text-3xl font-semibold">{userInitial}</AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-1">
              <span className="text-sm font-semibold text-foreground block">
                {profile?.full_name || session?.user?.email || "Personal account photo"}
              </span>
              <p className="text-xs text-muted-foreground">PNG or JPG, maximum file size 2MB</p>
              {userAvatarError && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {userAvatarError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label
                htmlFor="user-avatar-upload-tab"
                className="cursor-pointer inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
              >
                {uploadingUserAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {userAvatarUrl ? "Change Photo" : "Upload Photo"}
              </Label>
              <input
                id="user-avatar-upload-tab"
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                onChange={handleUserAvatarChange}
                className="hidden"
                disabled={uploadingUserAvatar}
              />
              {userAvatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveUserAvatar}
                  disabled={uploadingUserAvatar}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove Photo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Clinic Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Clinic Logo</CardTitle>
          <CardDescription>
            Your clinic's business logo, used on branded materials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border border-border p-4 bg-muted/20">
            {/* Rounded-square container for business clinic logo */}
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background overflow-hidden shrink-0">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Clinic Logo" className="h-full w-full object-contain p-2" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-foreground block">Business Branding</span>
              <p className="text-xs text-muted-foreground">PNG or JPG, maximum file size 2MB</p>
            </div>

            <div className="flex items-center gap-2">
              <Label
                htmlFor="logo-upload"
                className="cursor-pointer inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
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
                <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove Logo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Clinic Information Details Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Clinic Information</CardTitle>
          <CardDescription>Update your dental practice contact details and location</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
