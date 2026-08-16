import { useState, useEffect, type ChangeEvent } from "react";
import { Upload, Trash2, AlertCircle, Loader2, Camera } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { uploadOwnAvatar, removeOwnAvatar } from "@/lib/clinic-api";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface ChangeAvatarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatarUrl: string | null;
  displayName: string;
  onAvatarUpdated: (newUrl: string | null) => void;
}

export function ChangeAvatarModal({
  open,
  onOpenChange,
  currentAvatarUrl,
  displayName,
  onAvatarUpdated,
}: ChangeAvatarModalProps) {
  const { profile } = useAuth();
  const { success: toastSuccess } = useToast();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) {
      setErrorMsg(null);
      setLoading(false);
    }
  }, [open]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);

    // 1. Client-side type validation (PNG / JPEG only)
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setErrorMsg("Invalid file type. Only PNG and JPG images are accepted.");
      return;
    }

    // 2. Client-side size validation (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg("File size exceeds 2MB limit. Please upload a smaller image.");
      return;
    }

    if (!profile?.id) {
      setErrorMsg("User profile not loaded.");
      return;
    }

    setLoading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const res = await uploadOwnAvatar(file, ext);

      if (!res.ok) {
        setErrorMsg(res.error);
        setLoading(false);
        return;
      }

      const newUrl = res.data.avatar_url;
      toastSuccess("Profile photo updated.");
      onAvatarUpdated(newUrl);
      window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: newUrl }));
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to upload avatar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemovePhoto() {
    setErrorMsg(null);
    setLoading(true);

    const res = await removeOwnAvatar();

    if (!res.ok) {
      setErrorMsg(res.error);
      setLoading(false);
      return;
    }

    toastSuccess("Profile photo removed.");
    onAvatarUpdated(null);
    window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: null }));
    setLoading(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Change Profile Photo
        </DialogTitle>
        <DialogDescription>
          Upload a new photo for your profile avatar. PNG or JPG, up to 2MB.
        </DialogDescription>
      </DialogHeader>

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center gap-4 py-6">
        {/* Avatar Preview */}
        <Avatar className="h-20 w-20 border border-border">
          {currentAvatarUrl ? (
            <AvatarImage src={currentAvatarUrl} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-2xl font-semibold">{initial}</AvatarFallback>
        </Avatar>

        <div className="flex items-center gap-2">
          <Label
            htmlFor="avatar-file-upload"
            className="cursor-pointer inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {currentAvatarUrl ? "Upload New Photo" : "Upload Photo"}
          </Label>
          <input
            id="avatar-file-upload"
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleFileChange}
            className="hidden"
            disabled={loading}
          />

          {currentAvatarUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemovePhoto}
              disabled={loading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove Photo
            </Button>
          )}
        </div>
      </div>

      <DialogFooter className="border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
