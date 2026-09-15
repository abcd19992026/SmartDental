// Renders supabase/functions/send-prescription-pdf/pdf.ts locally, against a hardcoded real
// prescription (Anand Kumar, Nanda Dental Care, 25 Jul 2026), without deploying to Supabase or
// sending anything over WhatsApp. Run with: npm run preview:prescription
//
// pdf.ts is a Deno edge function file and imports pdf-lib from an esm.sh URL, which plain Node
// can't resolve -- so this script copies pdf.ts into a throwaway local file with that one import
// line swapped for the npm "pdf-lib" package (installed as a devDependency), imports
// buildPrescriptionPdf from the copy, and deletes the copy when done.

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "supabase/functions/send-prescription-pdf/pdf.ts");
const tmpPath = path.join(__dirname, ".pdf-preview-tmp.ts");

const source = readFileSync(sourcePath, "utf8");
const patched = source.replace(
  `import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";`,
  `import { PDFDocument, StandardFonts, rgb } from "pdf-lib";`,
);
if (patched === source) {
  throw new Error("Could not find the expected esm.sh pdf-lib import line in pdf.ts -- it may have changed, update this script's replace() call to match.");
}

writeFileSync(tmpPath, patched, "utf8");

try {
  const { buildPrescriptionPdf } = await import(pathToFileURL(tmpPath).href);

  // Real data for Anand Kumar's 25 Jul 2026 prescription at Nanda Dental Care, so the preview
  // matches the exact case that was manually checked against the print page during development.
  const prescription = {
    doctor_name: "Dr. Siddharth",
    prescribed_on: "2026-07-25",
    occupation: "Software Engineer",
    height: "155 cm",
    weight: "68 kg",
    blood_pressure: "118/78",
    spo2: "98%",
    chief_complaint: "Pain on eating cold food, upper left back tooth",
    past_dental_history: "Scaling done 1 month back, no other treatment",
    oral_examination: "Deep carious lesion on 26, sensitive to cold stimulus, no swelling",
    provisional_diagnosis: "Dental caries 26",
    treatment_plan: "Composite filling done on 26. Advised to avoid hard food for 24 hours.",
    notes: "Avoid hard and sticky food for 24 hours. Contact clinic if sensitivity persists.",
    medical_history: {
      diabetes: false,
      hypertension: false,
      thyroid: false,
      asthma: false,
      tuberculosis: false,
      cardiac: false,
      allergies: false,
      allergies_detail: null,
      arthritis: false,
      other: false,
      other_text: null,
    },
    investigation: { iopa: false, rvg: false, opg: false, blood_other: false, notes: null },
    teeth: [26],
    medications: [
      { name: "Ibuprofen + Paracetamol", dosage: "1-0-1", duration: "5 days", notes: "if pain persists" },
    ],
  };

  const patient = {
    name: "Anand Kumar",
    mobile: "7004971358",
    address: "Boring Road, Patna",
    age: 28,
    gender: "male",
  };

  const clinic = {
    name: "Nanda Dental Care",
    phone: "+91 9430032399",
    address: "Nawab Bahadur Road, Nai Sadak, Patna City - 800008",
    email: "nandadentalcare221122@gmail.com",
    letterhead: {
      doctors: [
        { name: "Dr. Priyanka", qualification: "BDS (PAT)" },
        { name: "Dr. Siddharth", qualification: "BDS (PAT)" },
        { name: "Dr. Vishal", qualification: "BDS (PAT)" },
      ],
      footer_note: "Not For Medico-Legal Purpose",
      logo_both_sides: true,
      regd_no: "4760/A",
      sunday_timings: "10:00 AM to 3:00 PM",
      tagline: "Quality and Affordable Dentistry.",
      timings: "10:00 AM to 2:00 PM & Evening : 4:00 PM to 9:00 PM",
    },
    logo_url:
      "https://yftxthmueqnsfjtastsg.supabase.co/storage/v1/object/public/clinic-logos/b3d5ee30-d617-4279-9570-dda423ff1613/1788705868466.jpeg",
  };

  const pdfBytes = await buildPrescriptionPdf(prescription, patient, clinic);
  const outputPath = path.join(repoRoot, "preview-output.pdf");
  writeFileSync(outputPath, pdfBytes);
  console.log("Wrote preview-output.pdf");
} finally {
  rmSync(tmpPath, { force: true });
}
