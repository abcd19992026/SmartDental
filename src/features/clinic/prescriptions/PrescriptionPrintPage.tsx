import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchPrescriptionById,
  fetchClinicLetterheadData,
  type PrescriptionRow,
  type ClinicLetterheadData,
  type PrescriptionMedication,
} from "@/lib/clinic-api";
import { formatDateIST } from "@/lib/dates";

// Standalone print route -- deliberately does NOT reuse any component or class from the app's
// themed tree. That tree spreads Tailwind dark-mode classes across it, and a single missed one
// here would print a black band and burn the clinic's toner. Every color used below is a literal
// utility (text-black, border-gray-400, etc.), never a theme token (bg-background,
// text-foreground, ...) -- this holds regardless of the signed-in user's own dark/light setting,
// which is a class on <html> that this page never reads or depends on.

interface PatientInfo {
  name: string;
  mobile: string;
  address: string | null;
  age: number | null;
  gender: string | null;
}

const MEDICAL_HISTORY_LABELS: Record<string, string> = {
  diabetes: "Diabetes",
  hypertension: "Hypertension",
  thyroid: "Thyroid",
  asthma: "Asthma",
  tuberculosis: "Tuberculosis",
  cardiac: "Cardiac",
  allergies: "Allergies",
  arthritis: "Arthritis",
};

const INVESTIGATION_LABELS: Record<string, string> = {
  iopa: "IOPA",
  rvg: "RVG",
  opg: "OPG",
  blood_other: "Blood / Other",
};

/** Ticked items only, comma separated; "other" carries its free text. Returns null when there is
 * nothing to print, so the caller can omit the whole row rather than print a blank one. */
function formatMedicalHistory(mh: unknown): string | null {
  if (!mh || typeof mh !== "object") return null;
  const rec = mh as Record<string, unknown>;
  const items: string[] = [];
  for (const [key, label] of Object.entries(MEDICAL_HISTORY_LABELS)) {
    if (rec[key] === true) items.push(label);
  }
  if (rec.other === true) {
    const text = typeof rec.other_text === "string" ? rec.other_text.trim() : "";
    items.push(text ? `Other: ${text}` : "Other");
  }
  return items.length > 0 ? items.join(", ") : null;
}

/** Same ticked-items rule as medical history, with the free-text notes folded in -- a row with
 * only notes and nothing ticked still has real content and must still print. */
function formatInvestigation(inv: unknown): string | null {
  if (!inv || typeof inv !== "object") return null;
  const rec = inv as Record<string, unknown>;
  const parts: string[] = [];
  for (const [key, label] of Object.entries(INVESTIGATION_LABELS)) {
    if (rec[key] === true) parts.push(label);
  }
  const notes = typeof rec.notes === "string" ? rec.notes.trim() : "";
  if (notes) parts.push(notes);
  return parts.length > 0 ? parts.join(", ") : null;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function PrescriptionPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  // Save & Print (AddVisitModal) passes ?print=1 so the dialog opens automatically; the plain
  // View button (PrescriptionsCard) does not, so that path stays view-only, unchanged.
  const autoPrint = searchParams.get("print") === "1";
  const [prescription, setPrescription] = useState<PrescriptionRow | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [clinic, setClinic] = useState<ClinicLetterheadData | null>(null);
  const [visit, setVisit] = useState<{ teeth?: number[] | null; tooth_numbers?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasAutoPrintedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      const rxRes = await fetchPrescriptionById(id);
      if (!active) return;
      if (!rxRes.ok) {
        setError(rxRes.error);
        setLoading(false);
        return;
      }

      const [patientRes, clinicRes, visitRes] = await Promise.all([
        supabase.from("patients").select("name, mobile, address, age, gender").eq("id", rxRes.data.patient_id).maybeSingle(),
        fetchClinicLetterheadData(rxRes.data.clinic_id),
        rxRes.data.visit_id
          ? supabase.from("visits").select("teeth, tooth_numbers").eq("id", rxRes.data.visit_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;

      if (patientRes.error || !patientRes.data) {
        setError(patientRes.error?.message ?? "Patient not found or not accessible");
        setLoading(false);
        return;
      }
      if (!clinicRes.ok) {
        setError(clinicRes.error);
        setLoading(false);
        return;
      }

      setPrescription(rxRes.data);
      setPatient(patientRes.data);
      setClinic(clinicRes.data);
      setVisit(visitRes.data ?? null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [id]);

  // Fires window.print() once, only when Save & Print asked for it (?print=1) and only once the
  // real data has actually rendered -- printing the loading/error placeholder would produce a
  // blank or wrong page. The ref guards against firing again on an unrelated re-render.
  useEffect(() => {
    if (autoPrint && !loading && !error && prescription && patient && clinic && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      window.print();
    }
  }, [autoPrint, loading, error, prescription, patient, clinic]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (error || !prescription || !patient || !clinic) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">
        {error ?? "Could not load this prescription."}
      </div>
    );
  }

  const lh = clinic.letterhead ?? {};
  const doctors = Array.isArray(lh.doctors) ? lh.doctors : [];

  let teethNumbers: number[] = [];
  if (Array.isArray(prescription.teeth) && prescription.teeth.length > 0) {
    teethNumbers = [...prescription.teeth];
  } else if (visit?.teeth && Array.isArray(visit.teeth) && visit.teeth.length > 0) {
    teethNumbers = [...visit.teeth];
  } else if (visit?.tooth_numbers && typeof visit.tooth_numbers === "string") {
    teethNumbers = visit.tooth_numbers
      .split(",")
      .map((t) => parseInt(t.trim(), 10))
      .filter((n) => !isNaN(n));
  }
  const teeth = Array.from(new Set(teethNumbers)).sort((a, b) => a - b);
  const medications = Array.isArray(prescription.medications)
    ? (prescription.medications as unknown as PrescriptionMedication[])
    : [];

  const medicalHistoryText = formatMedicalHistory(prescription.medical_history);
  const investigationText = formatInvestigation(prescription.investigation);
  const hasVitalsRow = Boolean(prescription.height || prescription.weight || prescription.blood_pressure || prescription.spo2);

  return (
    <div className="bg-white text-black min-h-screen">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex justify-end border-b border-gray-300 bg-white p-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Printer className="h-4 w-4 mr-1" />
          Print
        </button>
      </div>

      <div
        className="mx-auto flex flex-col justify-between text-black text-[11px] leading-[1.45]"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "6mm 8mm 6mm 14mm",
          boxSizing: "border-box",
        }}
      >
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header>
            <div className="flex justify-between text-[11px] font-medium text-gray-700 leading-[1.4]">
              <span>{lh.regd_no ? `Regd. No : ${lh.regd_no}` : ""}</span>
              <span>{clinic.phone ? `Mob : ${clinic.phone}` : ""}</span>
            </div>

            {/* Clinic Name with Anchored Logos */}
            <div className="flex items-center justify-between gap-4 mt-1.5">
              {/* Left Logo Anchor */}
              <div className="w-20 shrink-0 flex justify-start">
                {clinic.logo_url ? (
                  <img src={clinic.logo_url} alt="" className="h-16 w-16 object-contain" />
                ) : (
                  <div className="w-16 h-16" />
                )}
              </div>

              {/* Centered Prominent Clinic Name */}
              <div className="text-center flex-1 min-w-0">
                <div
                  className="text-[40px] font-black tracking-[0.04em] uppercase text-[#0a2540] leading-[1.15] py-0.5"
                  style={{
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    fontWeight: 900,
                  }}
                >
                  {clinic.name}
                </div>
                {lh.tagline && (
                  <div
                    className="text-[14px] italic text-[#1b3b6f] tracking-wide leading-[1.4] mt-0.5"
                    style={{
                      fontFamily: "'Lucida Calligraphy', 'Monotype Corsiva', 'Apple Chancery', 'Georgia', cursive, serif",
                      fontVariantLigatures: "none",
                    }}
                  >
                    {lh.tagline}
                  </div>
                )}
              </div>

              {/* Right Logo Anchor */}
              <div className="w-20 shrink-0 flex justify-end">
                {lh.logo_both_sides && clinic.logo_url ? (
                  <img src={clinic.logo_url} alt="" className="h-16 w-16 object-contain" />
                ) : (
                  <div className="w-16 h-16" />
                )}
              </div>
            </div>

            {/* Doctor Names & Qualifications */}
            {doctors.length > 0 && (
              <div className="flex justify-center flex-wrap gap-x-8 gap-y-1.5 mt-2 text-center">
                {doctors.map((d, i) => (
                  <div key={i} className="text-center leading-[1.4]">
                    <div className="text-[20px] font-bold text-black leading-[1.25]">{d.name}</div>
                    {d.qualification && (
                      <div className="text-[11px] text-gray-700 mt-0.5 leading-[1.4]">{d.qualification}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <hr className="border-t border-black mt-2" />
          </header>

          {/* Patient block -- three-column grid matching the paper slip */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[11px] leading-[1.45] mt-2">
            <div>
              <span className="font-semibold">Patient : </span>
              {patient.name}
            </div>
            <div>
              <span className="font-semibold">Age/Sex : </span>
              {[patient.age ? `${patient.age} yrs` : null, patient.gender ? capitalize(patient.gender) : null]
                .filter(Boolean)
                .join(" / ")}
            </div>
            <div>
              <span className="font-semibold">Date : </span>
              {formatDateIST(prescription.prescribed_on)}
            </div>

            <div>
              {patient.address ? (
                <>
                  <span className="font-semibold">Address : </span>
                  {patient.address}
                </>
              ) : (
                ""
              )}
            </div>
            <div>
              <span className="font-semibold">Mobile : </span>
              {patient.mobile}
            </div>
            <div>
              {prescription.occupation ? (
                <>
                  <span className="font-semibold">Occupation : </span>
                  {prescription.occupation}
                </>
              ) : (
                ""
              )}
            </div>

            {hasVitalsRow && (
              <>
                <div>
                  {prescription.height ? (
                    <>
                      <span className="font-semibold">Height : </span>
                      {prescription.height}
                    </>
                  ) : (
                    ""
                  )}
                </div>
                <div>
                  {prescription.weight ? (
                    <>
                      <span className="font-semibold">Weight : </span>
                      {prescription.weight}
                    </>
                  ) : (
                    ""
                  )}
                </div>
                <div>
                  {prescription.blood_pressure && (
                    <span>
                      <span className="font-semibold">BP : </span>
                      <span className="font-bold text-black">{prescription.blood_pressure}</span>
                    </span>
                  )}
                  {prescription.blood_pressure && prescription.spo2 && <span> · </span>}
                  {prescription.spo2 && (
                    <span>
                      <span className="font-semibold">SpO2 : </span>
                      <span className="font-bold text-black">{prescription.spo2}</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <hr className="border-t border-gray-400 mt-2" />

          {/* Body -- 3-column layout with aligned colons and proper descent room */}
          <div className="mt-2 text-[11px] leading-[1.45] space-y-1">
            {prescription.chief_complaint && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Chief Complaint</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{prescription.chief_complaint}</span>
              </div>
            )}
            {medicalHistoryText && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Medical History</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{medicalHistoryText}</span>
              </div>
            )}
            {prescription.past_dental_history && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Past Dental History</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{prescription.past_dental_history}</span>
              </div>
            )}
            {prescription.oral_examination && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Oral Examination</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{prescription.oral_examination}</span>
              </div>
            )}
            {investigationText && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Investigation</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{investigationText}</span>
              </div>
            )}
            {prescription.provisional_diagnosis && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Provisional Diagnosis</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{prescription.provisional_diagnosis}</span>
              </div>
            )}
            {prescription.treatment_plan && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Treatment Plan</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{prescription.treatment_plan}</span>
              </div>
            )}
            {teeth.length > 0 && (
              <div className="flex items-start">
                <span className="font-semibold w-40 shrink-0">Teeth</span>
                <span className="font-semibold w-3 shrink-0 text-left">:</span>
                <span className="flex-1 min-w-0">{teeth.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Section Divider between Clinical Notes and Rx */}
          <hr className="border-t border-black mt-2 mb-1" />

          {/* Rx -- 3-column table */}
          {medications.length > 0 && (
            <div className="mt-0.5 break-inside-avoid" style={{ breakInside: "avoid" }}>
              <div className="text-[18px] font-bold pb-0.5 mb-1 text-black leading-tight">Rx</div>
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-gray-400 text-[11px] font-bold text-black leading-[1.4]">
                    <th className="py-1 pr-4 font-bold text-left w-[55%]">Medicine</th>
                    <th className="py-1 px-4 font-bold text-left w-[25%]">Dosage</th>
                    <th className="py-1 pl-4 font-bold text-left w-[20%]">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {medications.map((m, i) => (
                    <tr key={i} className="text-[11px] text-black leading-[1.45]">
                      {/* Medicine Name with Number and Sub-line Notes */}
                      <td className="py-1 pr-4 align-top w-[55%]">
                        <div className="font-semibold text-[11.5px] text-black leading-[1.4]">
                          <span className="font-bold text-[10px] mr-1.5">{i + 1})</span>
                          {m.name}
                        </div>
                        {m.notes && (
                          <div className="text-[10px] text-gray-700 italic pl-4 mt-0.5 leading-[1.4]">
                            <span className="font-medium not-italic">Notes : </span>
                            {m.notes}
                          </div>
                        )}
                      </td>

                      {/* Dosage Column */}
                      <td className="py-1 px-4 align-top font-medium text-[11px] text-gray-900 leading-[1.4] w-[25%]">
                        {m.dosage || ""}
                      </td>

                      {/* Duration Column */}
                      <td className="py-1 pl-4 align-top font-medium text-[11px] text-gray-900 leading-[1.4] w-[20%]">
                        {m.duration || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {prescription.notes && (
            <div className="mt-2.5 text-[11px] leading-[1.45] text-black">
              <span className="font-semibold">Advice : </span>
              {prescription.notes}
            </div>
          )}
        </div>

        {/* Bottom Area: Pinned Signature & Structured Footer */}
        <div className="mt-auto pt-4 break-inside-avoid">
          {/* Signature -- pinned to the bottom above the footer */}
          <div className="flex justify-end mb-3 break-inside-avoid">
            <div className="text-center text-[11px] leading-[1.4]">
              <div className="border-t border-black w-44 pt-1 pb-1 font-medium">{prescription.doctor_name}</div>
            </div>
          </div>

          {/* Footer -- structured and labelled, matching real printed slip */}
          <footer className="border-t border-gray-400 pt-2 text-[10px] leading-[1.4] text-gray-800 space-y-0.5 break-inside-avoid">
            {(lh.timings || lh.sunday_timings) && (
              <div className="flex justify-between items-start gap-4">
                <div>
                  {lh.timings ? (
                    <>
                      <span className="font-semibold">Timing : </span>
                      {lh.timings}
                    </>
                  ) : null}
                </div>
                <div>
                  {lh.sunday_timings ? (
                    <>
                      <span className="font-semibold">Sunday Timing : </span>
                      {lh.sunday_timings}
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {clinic.address && (
              <div>
                <span className="font-semibold">Address : </span>
                {clinic.address}
              </div>
            )}

            {clinic.email && (
              <div>
                <span className="font-semibold">Email : </span>
                {clinic.email}
              </div>
            )}

            {lh.footer_note && (
              <div className="text-center text-[10.5px] font-bold text-black pt-1 tracking-wide leading-[1.4]">
                * {lh.footer_note} *
              </div>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
