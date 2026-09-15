import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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

function formatDateForPdf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export interface PrescriptionForPdf {
  doctor_name: string;
  prescribed_on: string;
  occupation: string | null;
  height: string | null;
  weight: string | null;
  blood_pressure: string | null;
  spo2: string | null;
  chief_complaint: string | null;
  past_dental_history: string | null;
  oral_examination: string | null;
  provisional_diagnosis: string | null;
  treatment_plan: string | null;
  notes: string | null;
  medical_history: unknown;
  investigation: unknown;
  teeth: number[] | null;
  medications: { name: string; dosage?: string | null; duration?: string | null; notes?: string | null }[] | null;
}

export interface PatientForPdf {
  name: string;
  mobile: string;
  address: string | null;
  age: number | null;
  gender: string | null;
}

export interface ClinicForPdf {
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  letterhead: Record<string, unknown> | null;
  logo_url: string | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_SAFE = 135;
// PrescriptionPrintPage.tsx's logo is h-20 w-20 (Tailwind default scale: 20 * 4px = 80px). This
// PDF's content width (CONTENT_WIDTH points) is built to match the print page's fixed 210mm
// print width in CSS px 1:1 (595.28pt page width == 210mm == the print page's own content box),
// so 1 CSS px there == 0.75pt here (96 CSS px/in vs 72pt/in) -- 80px * 0.75 = 60.
const LOGO_SIZE = 60;

export async function buildPrescriptionPdf(
  prescription: PrescriptionForPdf,
  patient: PatientForPdf,
  clinic: ClinicForPdf,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // PrescriptionPrintPage.tsx sets the clinic name in `'Georgia', 'Times New Roman', serif` --
  // pdf-lib only has the 14 standard PDF fonts (no custom font embedding wired up here), so an
  // exact match to Georgia isn't possible. TimesRomanBold is the closest available serif/bold
  // approximation and is used for the clinic name only, below.
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(h: number) {
    if (y - h < BOTTOM_SAFE) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function wrap(text: string, maxWidth: number, size: number, f: typeof font): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  function hr(gapBefore = 6, gapAfter = 6, thickness = 0.75) {
    ensureSpace(gapBefore + gapAfter + 10);
    y -= gapBefore;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness, color: rgb(0.6, 0.6, 0.6) });
    y -= gapAfter;
  }

  function labeledRow(label: string, value: string | null | undefined, labelWidth = 140, size = 10) {
    if (!value) return;
    const lines = wrap(value, CONTENT_WIDTH - labelWidth - 12, size, font);
    ensureSpace(13 * lines.length + 4);
    page.drawText(label, { x: MARGIN, y, size, font: bold });
    page.drawText(":", { x: MARGIN + labelWidth, y, size, font: bold });
    lines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN + labelWidth + 12, y: y - i * 13, size, font });
    });
    y -= 13 * lines.length + 4;
  }

  /** Mirrors PrescriptionPrintPage.tsx's "grid grid-cols-3" patient info block: up to 3 cells per
   * row, each cell its own "Label : value" (bold label, regular value, inline -- not aligned to a
   * shared colon column like labeledRow's body rows), a blank cell where the print page renders
   * an empty string for a missing field (the row still draws, other cells keep their position),
   * and the whole row skipped only when nothing in it has a value. */
  function gridRow3(cells: readonly (readonly [string, string | null | undefined])[], size = 10) {
    const colWidth = CONTENT_WIDTH / 3;
    const cellData = cells.map(([label, value]) => {
      if (!value) return null;
      const labelText = `${label} : `;
      const labelWidth = bold.widthOfTextAtSize(labelText, size);
      const firstLineMaxWidth = Math.max(colWidth - labelWidth - 6, 20);
      return { labelText, labelWidth, lines: wrap(value, firstLineMaxWidth, size, font) };
    });
    const maxLines = Math.max(1, ...cellData.map((c) => c?.lines.length ?? 0));
    if (cellData.every((c) => c === null)) return;
    ensureSpace(13 * maxLines + 4);
    cellData.forEach((cell, i) => {
      if (!cell) return;
      const x = MARGIN + i * colWidth;
      page.drawText(cell.labelText, { x, y, size, font: bold });
      page.drawText(cell.lines[0], { x: x + cell.labelWidth, y, size, font });
      for (let li = 1; li < cell.lines.length; li++) {
        page.drawText(cell.lines[li], { x, y: y - li * 13, size, font });
      }
    });
    y -= 13 * maxLines + 4;
  }

  /** The third cell of the vitals row is a single combined "BP : x · SpO2 : y" field (print
   * page's literal grouping), not two independent labeled cells -- drawn as one run of segments
   * (bold sub-labels, regular values, a plain " · " separator only when both are present) rather
   * than gridRow3's single-label-per-cell shape. No-op (draws nothing) when both are empty, same
   * as gridRow3 leaving an empty cell blank. */
  function drawVitalsCell(x: number, bp: string | null, spo2: string | null, size = 10): void {
    if (!bp && !spo2) return;
    let cx = x;
    if (bp) {
      const label = "BP : ";
      page.drawText(label, { x: cx, y, size, font: bold });
      cx += bold.widthOfTextAtSize(label, size);
      page.drawText(bp, { x: cx, y, size, font });
      cx += font.widthOfTextAtSize(bp, size);
    }
    if (bp && spo2) {
      const sep = "  ·  ";
      page.drawText(sep, { x: cx, y, size, font });
      cx += font.widthOfTextAtSize(sep, size);
    }
    if (spo2) {
      const label = "SpO2 : ";
      page.drawText(label, { x: cx, y, size, font: bold });
      cx += bold.widthOfTextAtSize(label, size);
      page.drawText(spo2, { x: cx, y, size, font });
    }
  }

  const lh = (clinic.letterhead ?? {}) as Record<string, unknown>;
  const doctors = Array.isArray(lh.doctors) ? (lh.doctors as { name: string; qualification?: string | null }[]) : [];
  const regdNo = typeof lh.regd_no === "string" ? lh.regd_no : null;
  const tagline = typeof lh.tagline === "string" ? lh.tagline : null;
  const logoBothSides = lh.logo_both_sides === true;

  if (regdNo) {
    page.drawText(`Regd. No: ${regdNo}`, { x: MARGIN, y, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  }
  if (clinic.phone) {
    const text = `Mob: ${clinic.phone}`;
    page.drawText(text, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(text, 8), y, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  }
  y -= 16;

  const headerTopY = y;
  let logoHeight = 0;

  if (clinic.logo_url) {
    try {
      const logoResponse = await fetch(clinic.logo_url);
      if (logoResponse.ok) {
        const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
        const contentType = logoResponse.headers.get("content-type") ?? "";
        const logoImage = contentType.includes("png")
          ? await pdfDoc.embedPng(logoBytes)
          : await pdfDoc.embedJpg(logoBytes);
        const scale = Math.min(LOGO_SIZE / logoImage.width, LOGO_SIZE / logoImage.height, 1);
        const w = logoImage.width * scale;
        const h = logoImage.height * scale;
        logoHeight = h;
        const drawY = headerTopY - h;
        page.drawImage(logoImage, { x: MARGIN, y: drawY, width: w, height: h });
        if (logoBothSides) {
          page.drawImage(logoImage, { x: PAGE_WIDTH - MARGIN - w, y: drawY, width: w, height: h });
        }
      }
    } catch (err) {
      console.error("Failed to embed clinic logo in prescription PDF -- continuing without it", err);
    }
  }

  const clinicName = clinic.name.toUpperCase();
  const clinicNameSize = 35;
  const clinicNameWidth = serifBold.widthOfTextAtSize(clinicName, clinicNameSize);
  const clinicNameY = tagline ? headerTopY - 32 : headerTopY - 36;
  page.drawText(clinicName, { x: (PAGE_WIDTH - clinicNameWidth) / 2, y: clinicNameY, size: clinicNameSize, font: serifBold });

  let textBottomY = clinicNameY;
  if (tagline) {
    const taglineSize = 10.5;
    const taglineWidth = serifItalic.widthOfTextAtSize(tagline, taglineSize);
    const taglineY = clinicNameY - 14;
    page.drawText(tagline, { x: (PAGE_WIDTH - taglineWidth) / 2, y: taglineY, size: taglineSize, font: serifItalic, color: rgb(0.15, 0.15, 0.15) });
    textBottomY = taglineY;
  }

  const rowHeight = Math.max(logoHeight || LOGO_SIZE, headerTopY - textBottomY + 8);
  y = headerTopY - rowHeight - 22;

  // Mirrors PrescriptionPrintPage.tsx's doctor row: N equal-width columns (N = doctors.length),
  // each doctor's name centered in their own column with their qualification centered directly
  // below it in that same column -- not one space-joined line, which reads as a single doctor
  // with a garbled multi-part name once there's more than one.
  if (doctors.length > 0) {
    const doctorSize = 18;
    const qualSize = 10;
    const doctorsBlockWidth = 410;
    const startX = (PAGE_WIDTH - doctorsBlockWidth) / 2;
    const colWidth = doctorsBlockWidth / doctors.length;

    doctors.forEach((d, i) => {
      const colCenterX = startX + colWidth * i + colWidth / 2;
      const nameWidth = bold.widthOfTextAtSize(d.name, doctorSize);
      page.drawText(d.name, { x: colCenterX - nameWidth / 2, y, size: doctorSize, font: bold });
    });
    y -= doctorSize + 2;

    if (doctors.some((d) => d.qualification && d.qualification.trim())) {
      doctors.forEach((d, i) => {
        const qual = d.qualification?.trim();
        if (!qual) return;
        const colCenterX = startX + colWidth * i + colWidth / 2;
        const qualWidth = font.widthOfTextAtSize(qual, qualSize);
        page.drawText(qual, { x: colCenterX - qualWidth / 2, y, size: qualSize, font, color: rgb(0.35, 0.35, 0.35) });
      });
      y -= qualSize;
    }
  }

  hr(3, 13);

  // Mirrors PrescriptionPrintPage.tsx's "grid grid-cols-3 gap-x-6 gap-y-1" patient block exactly:
  // Row 1 Patient / Age-Sex / Date, Row 2 Address / Mobile / Occupation, Row 3 (only when at
  // least one vital is present) Height / Weight / combined "BP : x · SpO2 : y" -- three columns,
  // not a stacked single-column list.
  const age = patient.age != null ? `${patient.age} Yrs` : null;
  const genderAge = [age, patient.gender].filter(Boolean).join(" / ");

  gridRow3([
    ["Patient", patient.name],
    ["Age / Sex", genderAge || null],
    ["Date", formatDateForPdf(prescription.prescribed_on)],
  ]);
  gridRow3([
    ["Address", patient.address],
    ["Mobile", patient.mobile],
    ["Occupation", prescription.occupation],
  ]);

  const hasVitalsRow = Boolean(prescription.height || prescription.weight || prescription.blood_pressure || prescription.spo2);
  if (hasVitalsRow) {
    const colWidth = CONTENT_WIDTH / 3;
    const size = 10;
    ensureSpace(13 + 4);
    if (prescription.height) {
      const label = "Height : ";
      page.drawText(label, { x: MARGIN, y, size, font: bold });
      page.drawText(prescription.height, { x: MARGIN + bold.widthOfTextAtSize(label, size), y, size, font });
    }
    if (prescription.weight) {
      const x = MARGIN + colWidth;
      const label = "Weight : ";
      page.drawText(label, { x, y, size, font: bold });
      page.drawText(prescription.weight, { x: x + bold.widthOfTextAtSize(label, size), y, size, font });
    }
    drawVitalsCell(MARGIN + colWidth * 2, prescription.blood_pressure, prescription.spo2, size);
    y -= 13 + 1;
  }

  hr(2, 14);

  const medicalHistoryText = formatMedicalHistory(prescription.medical_history);
  const investigationText = formatInvestigation(prescription.investigation);
  labeledRow("Chief Complaint", prescription.chief_complaint);
  labeledRow("Medical History", medicalHistoryText);
  labeledRow("Past Dental History", prescription.past_dental_history);
  labeledRow("Oral Examination", prescription.oral_examination);
  labeledRow("Investigation", investigationText);
  labeledRow("Provisional Diagnosis", prescription.provisional_diagnosis);
  labeledRow("Treatment Plan", prescription.treatment_plan);
  if (prescription.teeth && prescription.teeth.length > 0) {
    labeledRow("Teeth", prescription.teeth.join(", "));
  }

  hr(1, 18, 1);

  const medications = prescription.medications ?? [];
  if (medications.length > 0) {
    ensureSpace(20);
    page.drawText("Rx", { x: MARGIN, y, size: 16, font: bold });
    y -= 20;

    const colMedicine = MARGIN;
    const colDosage = MARGIN + CONTENT_WIDTH * 0.55;
    const colDuration = MARGIN + CONTENT_WIDTH * 0.8;

    ensureSpace(14);
    page.drawText("Medicine", { x: colMedicine, y, size: 9, font: bold });
    page.drawText("Dosage", { x: colDosage, y, size: 9, font: bold });
    page.drawText("Duration", { x: colDuration, y, size: 9, font: bold });
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
    y -= 12;

    medications.forEach((m, i) => {
      const nameLines = wrap(`${i + 1}) ${m.name}`, colDosage - colMedicine - 8, 10, font);
      const noteLines = m.notes ? wrap(`Notes: ${m.notes}`, colDosage - colMedicine - 8, 8, font) : [];
      const rowHeight = 13 * nameLines.length + 11 * noteLines.length + 6;
      ensureSpace(rowHeight);

      nameLines.forEach((line, li) => page.drawText(line, { x: colMedicine, y: y - li * 13, size: 10, font: bold }));
      page.drawText(m.dosage ?? "", { x: colDosage, y, size: 10, font });
      page.drawText(m.duration ?? "", { x: colDuration, y, size: 10, font });
      y -= 13 * nameLines.length;
      noteLines.forEach((line, li) => {
        page.drawText(line, { x: colMedicine + 10, y: y - li * 11, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
      });
      y -= 11 * noteLines.length + 6;
    });
  }

  if (prescription.notes) {
    labeledRow("Advice", prescription.notes, 60);
  }

  // --- Bottom Pinned Signature & Footer ---
  ensureSpace(120);

  const sigY = 115;
  const sigWidth = 160;
  const sigX = PAGE_WIDTH - MARGIN - sigWidth;
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigWidth, y: sigY }, thickness: 0.75 });
  const doctorNameWidth = font.widthOfTextAtSize(prescription.doctor_name, 10);
  page.drawText(prescription.doctor_name, { x: sigX + (sigWidth - doctorNameWidth) / 2, y: sigY - 12, size: 10, font });

  page.drawLine({ start: { x: MARGIN, y: 85 }, end: { x: PAGE_WIDTH - MARGIN, y: 85 }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });

  let footerY = 73;
  const footerSize = 8;
  const timings = typeof lh.timings === "string" ? lh.timings : null;
  const sundayTimings = typeof lh.sunday_timings === "string" ? lh.sunday_timings : null;
  if (timings) {
    const label = "Timing: ";
    page.drawText(label, { x: MARGIN, y: footerY, size: footerSize, font: bold, color: rgb(0, 0, 0) });
    const labelWidth = bold.widthOfTextAtSize(label, footerSize);
    page.drawText(timings, { x: MARGIN + labelWidth, y: footerY, size: footerSize, font, color: rgb(0.2, 0.2, 0.2) });
  }
  if (sundayTimings) {
    const label = "Sunday Timing: ";
    const labelWidth = bold.widthOfTextAtSize(label, footerSize);
    const valueWidth = font.widthOfTextAtSize(sundayTimings, footerSize);
    const totalWidth = labelWidth + valueWidth;
    const startX = PAGE_WIDTH - MARGIN - totalWidth;
    page.drawText(label, { x: startX, y: footerY, size: footerSize, font: bold, color: rgb(0, 0, 0) });
    page.drawText(sundayTimings, { x: startX + labelWidth, y: footerY, size: footerSize, font, color: rgb(0.2, 0.2, 0.2) });
  }
  if (timings || sundayTimings) footerY -= 11;

  if (clinic.address) {
    const label = "Address: ";
    page.drawText(label, { x: MARGIN, y: footerY, size: footerSize, font: bold, color: rgb(0, 0, 0) });
    const labelWidth = bold.widthOfTextAtSize(label, footerSize);
    page.drawText(clinic.address, { x: MARGIN + labelWidth, y: footerY, size: footerSize, font, color: rgb(0.2, 0.2, 0.2) });
    footerY -= 11;
  }
  if (clinic.email) {
    const label = "Email: ";
    page.drawText(label, { x: MARGIN, y: footerY, size: footerSize, font: bold, color: rgb(0, 0, 0) });
    const labelWidth = bold.widthOfTextAtSize(label, footerSize);
    page.drawText(clinic.email, { x: MARGIN + labelWidth, y: footerY, size: footerSize, font, color: rgb(0.2, 0.2, 0.2) });
    footerY -= 11;
  }
  const footerNote = typeof lh.footer_note === "string" ? lh.footer_note : null;
  if (footerNote) {
    const text = `* ${footerNote} *`;
    const textWidth = bold.widthOfTextAtSize(text, 8);
    page.drawText(text, { x: (PAGE_WIDTH - textWidth) / 2, y: 35, size: 8, font: bold, color: rgb(0, 0, 0) });
  }

  return pdfDoc.save();
}
