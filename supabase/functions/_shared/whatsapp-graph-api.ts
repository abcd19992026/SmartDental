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
