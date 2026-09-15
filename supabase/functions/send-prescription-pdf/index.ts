import { authorizeOwnerOrReceptionist } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { getIstNow, combineIstInstant } from "../_shared/ist-time.ts";
import {
  buildDocumentTemplateMessage,
  callGraphApi,
  uploadMediaToGraphApi,
  type WhatsappTemplate,
} from "../_shared/whatsapp-graph-api.ts";
import { incrementMessagesSent, getMonthlyMessagesSent, countMessagesSentToday } from "../_shared/clinic-usage.ts";
import { buildPrescriptionPdf } from "./pdf.ts";
import { validateSendPrescriptionPdfRequest, type SendPrescriptionPdfRequest } from "./validate.ts";

/** The one prescription-PDF template name every clinic is expected to use, hardcoded because
 * Meta template NAMES (not the templates themselves) are shared across this constant -- each
 * clinic's own WABA has its own independent approval for a template with this exact name (see
 * seed_default_whatsapp_templates, which auto-inserts a pending row with this same name for every
 * new clinic at creation time). If this literal name ever changes, it must change in three
 * places together: here, the Meta template submission, and seed_default_whatsapp_templates. */
const PRESCRIPTION_TEMPLATE_NAME = "prescription_copy";

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const auth = await authorizeOwnerOrReceptionist(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const validationErrors = validateSendPrescriptionPdfRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400, cors);
  }
  const input = body as SendPrescriptionPdfRequest;
  const { serviceClient } = auth;

  const { data: prescription, error: prescriptionError } = await serviceClient
    .from("prescriptions")
    .select(
      `id, clinic_id, branch_id, patient_id, doctor_name, prescribed_on, occupation, height,
       weight, blood_pressure, spo2, chief_complaint, medical_history, past_dental_history,
       oral_examination, investigation, provisional_diagnosis, treatment_plan, teeth,
       medications, notes`,
    )
    .eq("id", input.prescription_id)
    .maybeSingle();

  if (prescriptionError || !prescription) {
    return json({ error: "Prescription not found" }, 404, cors);
  }

  if (prescription.clinic_id !== auth.clinicId) {
    return json({ error: "Prescription not found" }, 404, cors);
  }
  if (auth.role === "receptionist" && prescription.branch_id !== auth.branchId) {
    return json({ error: "Forbidden: this prescription is outside your branch" }, 403, cors);
  }

  const { data: existingLog } = await serviceClient
    .from("message_log")
    .select("id, wa_message_id, status")
    .eq("clinic_id", prescription.clinic_id)
    .eq("client_request_id", input.client_request_id)
    .maybeSingle();
  if (existingLog) {
    return json(
      { success: true, already_sent: true, wa_message_id: existingLog.wa_message_id, prescription_id: prescription.id },
      200,
      cors,
    );
  }

  const { data: patient, error: patientError } = await serviceClient
    .from("patients")
    .select("id, name, mobile, address, age, gender, do_not_disturb")
    .eq("id", prescription.patient_id)
    .maybeSingle();
  if (patientError || !patient) {
    return json({ error: "Patient not found" }, 404, cors);
  }

  if (patient.do_not_disturb) {
    return json({ error: "This patient has do-not-disturb enabled", error_code: "PATIENT_DND" }, 400, cors);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return json({ error: "Server misconfigured" }, 500, cors);
  }

  const { data: clinic, error: clinicError } = await serviceClient
    .from("clinics")
    .select(
      "id, name, phone, address, email, letterhead, logo_url, waba_phone_number_id, whatsapp_enabled, is_active, plan_expires_on, daily_message_cap, monthly_message_quota",
    )
    .eq("id", prescription.clinic_id)
    .single();
  if (clinicError || !clinic) {
    return json({ error: "Clinic not found" }, 404, cors);
  }

  if (!clinic.whatsapp_enabled) {
    return json({ error: "WhatsApp sending is not enabled for this clinic", error_code: "WHATSAPP_DISABLED" }, 400, cors);
  }

  const { dateStr } = getIstNow();

  if (!clinic.is_active || clinic.plan_expires_on < dateStr) {
    return json({ error: "This clinic is suspended or its plan has expired", error_code: "CLINIC_SUSPENDED" }, 400, cors);
  }

  if (!clinic.waba_phone_number_id) {
    return json({ error: "This clinic has no WABA phone number configured" }, 400, cors);
  }

  const todayStartIso = combineIstInstant(dateStr, "00:00:00").toISOString();
  const sentToday = await countMessagesSentToday(serviceClient, clinic.id, todayStartIso);
  if (sentToday >= clinic.daily_message_cap) {
    return json({ error: "This clinic has reached its daily message cap", error_code: "DAILY_CAP_EXCEEDED" }, 400, cors);
  }

  const monthStart = `${dateStr.slice(0, 7)}-01`;
  const messagesSentThisMonth = await getMonthlyMessagesSent(serviceClient, clinic.id, monthStart);
  if (messagesSentThisMonth >= clinic.monthly_message_quota) {
    return json({ error: "This clinic has reached its monthly message quota", error_code: "MONTHLY_QUOTA_EXCEEDED" }, 400, cors);
  }

  // Scoped by clinic_id, not just the template name -- this is what makes the endpoint
  // multi-clinic-ready already: a second clinic just needs its own row with this same
  // meta_template_name (auto-seeded pending by seed_default_whatsapp_templates on creation,
  // flipped to 'approved' once that clinic's own WABA approves a template with this exact name).
  const { data: templateRow, error: templateError } = await serviceClient
    .from("whatsapp_templates")
    .select("meta_template_name, language_code, variable_mapping")
    .eq("clinic_id", clinic.id)
    .eq("meta_template_name", PRESCRIPTION_TEMPLATE_NAME)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (templateError || !templateRow) {
    return json({ error: "This clinic has no approved prescription template", error_code: "TEMPLATE_MISSING" }, 400, cors);
  }
  const template = templateRow as WhatsappTemplate;

  // Built fresh on every send, from the prescription's own stored fields -- never written to
  // Storage or kept anywhere after this request finishes. pdfBytes lives only in this function's
  // memory for the few seconds it takes to upload to Meta and send.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPrescriptionPdf(
      {
        doctor_name: prescription.doctor_name,
        prescribed_on: prescription.prescribed_on,
        occupation: prescription.occupation,
        height: prescription.height,
        weight: prescription.weight,
        blood_pressure: prescription.blood_pressure,
        spo2: prescription.spo2,
        chief_complaint: prescription.chief_complaint,
        past_dental_history: prescription.past_dental_history,
        oral_examination: prescription.oral_examination,
        provisional_diagnosis: prescription.provisional_diagnosis,
        treatment_plan: prescription.treatment_plan,
        notes: prescription.notes,
        medical_history: prescription.medical_history,
        investigation: prescription.investigation,
        teeth: prescription.teeth,
        medications: prescription.medications,
      },
      { name: patient.name, mobile: patient.mobile, address: patient.address, age: patient.age, gender: patient.gender },
      {
        name: clinic.name,
        phone: clinic.phone,
        address: clinic.address,
        email: clinic.email,
        letterhead: clinic.letterhead,
        logo_url: clinic.logo_url,
      },
    );
  } catch (err) {
    console.error(`Failed to build PDF for prescription ${prescription.id}`, err);
    return json({ error: "Failed to generate the prescription PDF" }, 500, cors);
  }

  const filename = `Prescription_${patient.name.replace(/[^a-zA-Z0-9]+/g, "_")}_${prescription.prescribed_on}.pdf`;

  const uploadResult = await uploadMediaToGraphApi(clinic.waba_phone_number_id, accessToken, pdfBytes, filename, "application/pdf");
  if (!uploadResult.ok) {
    console.error(`Failed to upload prescription PDF to Meta for prescription ${prescription.id}`, uploadResult.errorMessage);
    return json(
      { success: false, error_code: uploadResult.errorCode, error_message: uploadResult.errorMessage, prescription_id: prescription.id },
      200,
      cors,
    );
  }

  const trimmedPatientName = patient.name?.trim() ?? "";
  const trimmedClinicName = clinic.name?.trim() ?? "";
  const message = buildDocumentTemplateMessage(patient.mobile, template, uploadResult.mediaId, filename, {
    patient_name: trimmedPatientName,
    clinic_name: trimmedClinicName,
  });

  const { data: logRow, error: logInsertError } = await serviceClient
    .from("message_log")
    .insert({
      clinic_id: clinic.id,
      recall_id: null,
      patient_id: patient.id,
      mobile: patient.mobile,
      template_name: template.meta_template_name,
      status: "queued",
      message_type: "prescription",
      is_test: false,
      client_request_id: input.client_request_id,
    })
    .select("id")
    .single();

  if (logInsertError || !logRow) {
    if (logInsertError?.code === "23505") {
      const { data: raceRow } = await serviceClient
        .from("message_log")
        .select("wa_message_id")
        .eq("clinic_id", prescription.clinic_id)
        .eq("client_request_id", input.client_request_id)
        .maybeSingle();
      return json(
        { success: true, already_sent: true, wa_message_id: raceRow?.wa_message_id ?? null, prescription_id: prescription.id },
        200,
        cors,
      );
    }
    console.error(`Failed to insert message_log row for prescription ${prescription.id}`, logInsertError);
    return json({ error: "Failed to record the send attempt" }, 500, cors);
  }

  const result = await callGraphApi(clinic.waba_phone_number_id, accessToken, message);
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await serviceClient
      .from("message_log")
      .update({ status: "sent", wa_message_id: result.waMessageId, sent_at: nowIso })
      .eq("id", logRow.id);

    await incrementMessagesSent(serviceClient, clinic.id, monthStart);

    return json({ success: true, wa_message_id: result.waMessageId, prescription_id: prescription.id }, 200, cors);
  }

  await serviceClient
    .from("message_log")
    .update({ status: "failed", error_code: result.errorCode, error_message: result.errorMessage })
    .eq("id", logRow.id);

  return json(
    { success: false, error_code: result.errorCode, error_message: result.errorMessage, prescription_id: prescription.id },
    200,
    cors,
  );
});
