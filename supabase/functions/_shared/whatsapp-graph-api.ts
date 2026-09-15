const GRAPH_API_VERSION = "v21.0";

export interface WhatsappTemplate {
  meta_template_name: string;
  language_code: string;
  variable_mapping: Record<string, string> | null;
}

export type GraphApiResult =
  | { ok: true; waMessageId: string }
  | { ok: false; errorCode: string | null; errorMessage: string };

/** Builds the Graph API template message body. `variable_mapping` maps positional template
 * placeholders ("1", "2", ...) to field names (patient_name, treatment_name, ...); the demo
 * hello_world template has no variables at all, so an empty/null mapping omits `components`
 * entirely rather than sending an empty array (Meta rejects a body component list for a template
 * that defines no variables). Shared by send-recall-messages (real fields from a recall) and
 * send-test-message (generic placeholder fields, since there's no recall to render). */
export function buildTemplateMessage(
  mobile10Digit: string,
  template: WhatsappTemplate,
  fields: Record<string, string>,
): Record<string, unknown> {
  const templateBody: Record<string, unknown> = {
    name: template.meta_template_name,
    language: { code: template.language_code },
  };

  const mapping = template.variable_mapping;
  if (mapping && Object.keys(mapping).length > 0) {
    const parameters = Object.entries(mapping)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, fieldKey]) => ({ type: "text", text: fields[fieldKey] ?? "" }));
    templateBody.components = [{ type: "body", parameters }];
  }

  return {
    messaging_product: "whatsapp",
    // Mobile numbers are stored as bare 10 digits; the country code is prefixed only here, at
    // the point of calling the API -- never stored with the prefix.
    to: `91${mobile10Digit}`,
    type: "template",
    template: templateBody,
  };
}

/** Same positional variable_mapping resolution as buildTemplateMessage, but for a document-header
 * template (send-prescription-pdf): the media id from uploadMediaToGraphApi below goes in a
 * `header` component ahead of the `body` component, which buildTemplateMessage's body-only shape
 * has no room for. */
export function buildDocumentTemplateMessage(
  mobile10Digit: string,
  template: WhatsappTemplate,
  mediaId: string,
  filename: string,
  fields: Record<string, string>,
): Record<string, unknown> {
  const components: Record<string, unknown>[] = [
    {
      type: "header",
      parameters: [{ type: "document", document: { id: mediaId, filename } }],
    },
  ];

  const mapping = template.variable_mapping;
  if (mapping && Object.keys(mapping).length > 0) {
    const parameters = Object.entries(mapping)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, fieldKey]) => ({ type: "text", text: fields[fieldKey] ?? "" }));
    components.push({ type: "body", parameters });
  }

  return {
    messaging_product: "whatsapp",
    to: `91${mobile10Digit}`,
    type: "template",
    template: {
      name: template.meta_template_name,
      language: { code: template.language_code },
      components,
    },
  };
}

export async function callGraphApi(
  wabaPhoneNumberId: string,
  accessToken: string,
  message: Record<string, unknown>,
): Promise<GraphApiResult> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  const result = await response.json().catch(() => null);

  if (response.ok && result?.messages?.[0]?.id) {
    return { ok: true, waMessageId: result.messages[0].id };
  }

  return {
    ok: false,
    errorCode: result?.error?.code != null ? String(result.error.code) : null,
    errorMessage: result?.error?.message ?? `Graph API returned HTTP ${response.status}`,
  };
}

/** Uploads a file (e.g. a generated prescription PDF) to Meta's Media endpoint ahead of sending
 * it as a document-header template message -- Graph API requires the media to already exist
 * (returning an id) before a template message can reference it, unlike a plain text parameter. */
export async function uploadMediaToGraphApi(
  wabaPhoneNumberId: string,
  accessToken: string,
  fileBytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; errorCode: string | null; errorMessage: string }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([fileBytes], { type: mimeType }), filename);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaPhoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  const result = await response.json().catch(() => null);

  if (response.ok && result?.id) {
    return { ok: true, mediaId: result.id };
  }

  return {
    ok: false,
    errorCode: result?.error?.code != null ? String(result.error.code) : null,
    errorMessage: result?.error?.message ?? `Graph API media upload returned HTTP ${response.status}`,
  };
}
