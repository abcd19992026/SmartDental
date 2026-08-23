import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, AlertCircle, Info, Loader2, FileText, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import {
  fetchClinicLetterheadData,
  updateClinicLetterhead,
  type ClinicLetterhead,
  type ClinicLetterheadData,
} from "@/lib/clinic-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface DoctorFormItem {
  name: string;
  qualification: string;
}

export function LetterheadTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [clinicData, setClinicData] = useState<ClinicLetterheadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [regdNo, setRegdNo] = useState("");
  const [tagline, setTagline] = useState("");
  const [timings, setTimings] = useState("");
  const [sundayTimings, setSundayTimings] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [logoBothSides, setLogoBothSides] = useState(false);
  const [doctors, setDoctors] = useState<DoctorFormItem[]>([]);

  useEffect(() => {
    loadLetterhead();
  }, [profile?.clinic_id]);

  async function loadLetterhead() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const res = await fetchClinicLetterheadData(profile.clinic_id);

    if (!res.ok) {
      setErrorMsg(res.error);
      setLoading(false);
      return;
    }

    const data = res.data;
    setClinicData(data);

    const lh = data.letterhead || {};
    setRegdNo(lh.regd_no || "");
    setTagline(lh.tagline || "");
    setTimings(lh.timings || "");
    setSundayTimings(lh.sunday_timings || "");
    setFooterNote(lh.footer_note || "");
    setLogoBothSides(Boolean(lh.logo_both_sides));

    if (lh.doctors && Array.isArray(lh.doctors)) {
      setDoctors(
        lh.doctors.map((d) => ({
          name: d.name || "",
          qualification: d.qualification || "",
        }))
      );
    } else {
      setDoctors([]);
    }

    setLoading(false);
  }

  // Doctor list modifiers
  function handleAddDoctor() {
    setDoctors([...doctors, { name: "", qualification: "" }]);
  }

  function handleUpdateDoctor(index: number, field: "name" | "qualification", value: string) {
    setDoctors(
      doctors.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  function handleRemoveDoctor(index: number) {
    setDoctors(doctors.filter((_, i) => i !== index));
  }

  function handleMoveDoctor(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= doctors.length) return;

    const newDoctors = [...doctors];
    const temp = newDoctors[index];
    newDoctors[index] = newDoctors[targetIndex];
    newDoctors[targetIndex] = temp;
    setDoctors(newDoctors);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.clinic_id) return;

    setSubmitting(true);
    setErrorMsg(null);

    // Clean up doctors list: preserve non-empty names
    const cleanedDoctors = doctors
      .map((d) => ({
        name: d.name.trim(),
        qualification: d.qualification.trim() || null,
      }))
      .filter((d) => d.name.length > 0);

    const payload: ClinicLetterhead = {
      regd_no: regdNo.trim() || null,
      tagline: tagline.trim() || null,
      doctors: cleanedDoctors,
      timings: timings.trim() || null,
      sunday_timings: sundayTimings.trim() || null,
      footer_note: footerNote.trim() || null,
      logo_both_sides: logoBothSides,
    };

    const res = await updateClinicLetterhead(profile.clinic_id, payload);

    if (!res.ok) {
      setErrorMsg(res.error);
      toastError(res.error, "Save Failed");
      setSubmitting(false);
      return;
    }

    if (!res.data) {
      setErrorMsg("Action was blocked by the database. No settings were updated.");
      toastError("Action was blocked by the database.", "Save Blocked");
      setSubmitting(false);
      return;
    }

    success("Letterhead settings saved successfully.");
    setSubmitting(false);
    loadLetterhead();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Top Explanation Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-foreground leading-relaxed">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong>Letterhead Branding:</strong> Configure your clinic's prescription print header and footer. Clinic name, phone, address, and email are automatically sourced from the <span className="font-semibold text-primary">Clinic Profile</span> tab.
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Section 1: Header Branding & Tagline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Header Details
          </CardTitle>
          <CardDescription>
            Registration details, practice tagline, and logo print options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lh-regd">Registration Number</Label>
              <Input
                id="lh-regd"
                placeholder="e.g. Reg. No. 12345/MH/2018"
                value={regdNo}
                onChange={(e) => setRegdNo(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lh-tagline">Tagline / Motto</Label>
              <Input
                id="lh-tagline"
                placeholder="e.g. Quality and Affordable Dentistry."
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </div>
          </div>

          {/* Logo Both Sides Toggle & Print Resolution Advisory */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background shrink-0 overflow-hidden">
                  {clinicData?.logo_url ? (
                    <img src={clinicData.logo_url} alt="Clinic Logo" className="h-full w-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      id="lh-logo-both"
                      type="checkbox"
                      checked={logoBothSides}
                      onChange={(e) => setLogoBothSides(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <Label htmlFor="lh-logo-both" className="text-sm font-medium cursor-pointer">
                      Show logo on both sides of the header
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mirrors the clinic logo on the left and right corners of the printed prescription.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground italic border-t border-border/50 pt-2">
              Note: A logo that looks fine on screen often prints blurry, so upload one at least 600px wide (configured in Clinic Profile).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Doctors & Qualifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">Attending Doctors</CardTitle>
            <CardDescription>
              Doctors listed on the printed letterhead. Order determines print sequence.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddDoctor}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Doctor
          </Button>
        </CardHeader>
        <CardContent>
          {doctors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-lg border border-dashed border-border bg-muted/10">
              <p className="text-xs text-muted-foreground">
                No doctor rows added. Add doctor names and qualifications to print on your prescription header.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3 text-xs" onClick={handleAddDoctor}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add First Doctor
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doc, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/20"
                >
                  {/* Reorder Up/Down */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveDoctor(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDoctor(idx, "down")}
                      disabled={idx === doctors.length - 1}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Doctor Name */}
                  <div className="flex-1 w-full sm:w-auto">
                    <Input
                      placeholder="Doctor Name (e.g. Dr. Sarah Jenkins)"
                      value={doc.name}
                      onChange={(e) => handleUpdateDoctor(idx, "name", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Qualification (Optional) */}
                  <div className="flex-1 w-full sm:w-auto">
                    <Input
                      placeholder="Qualification (optional, e.g. BDS, MDS Orthodontics)"
                      value={doc.qualification}
                      onChange={(e) => handleUpdateDoctor(idx, "qualification", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Remove Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDoctor(idx)}
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                    title="Remove Doctor"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <p className="text-[11px] text-muted-foreground">
                Qualification is optional — empty qualifications print cleanly with no trailing separators.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Operating Timings & Footer Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Timings & Footer Information</CardTitle>
          <CardDescription>
            Clinic operating hours and legal/disclaimer footer notes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lh-timings">Standard Timings</Label>
              <Input
                id="lh-timings"
                placeholder="e.g. Mon - Sat: 9:00 AM - 1:00 PM, 5:00 PM - 9:00 PM"
                value={timings}
                onChange={(e) => setTimings(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lh-sunday">Sunday Timings</Label>
              <Input
                id="lh-sunday"
                placeholder="e.g. Sunday: 10:00 AM - 1:00 PM (By Appointment)"
                value={sundayTimings}
                onChange={(e) => setSundayTimings(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lh-footer">Footer Note</Label>
            <Input
              id="lh-footer"
              placeholder="e.g. Not For Medico-Legal Purpose"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Prints at the bottom of prescription slips as a standard disclaimer or patient reminder.
            </p>
          </div>
        </CardContent>

        <CardFooter className="border-t border-border pt-4">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Letterhead
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
