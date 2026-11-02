-- New clinics now get the FULL shared WhatsApp template set automatically, already marked approved
-- and with recall_n1 as the default, instead of only two 'pending' rows (prescription_copy,
-- payment_update) that had to be hand-fixed per clinic.
--
-- These three template NAMES are the same for every clinic; the texts live once on the platform's
-- Meta WABA (Cavora Technologies). A clinic row only points at the name. If a name or its variable
-- order changes it must change together in: the Meta template, this function, and the sender
-- (send-recall-messages / send-prescription-pdf / send-payment-message).
--
-- Same signature as before, so CREATE OR REPLACE keeps the existing ACL (postgres + service_role).

create or replace function public.seed_default_whatsapp_templates(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into whatsapp_templates (
    clinic_id, meta_template_name, language_code, category, approval_status, is_default,
    variable_mapping, body_preview
  )
  values
    (
      p_clinic_id, 'recall_n1', 'en', 'UTILITY', 'approved', true,
      '{"1":"patient_name","2":"clinic_name","3":"due_date","4":"clinic_name"}'::jsonb,
      E'Dear {{1}},\n\nThis is a record update from {{2}}.\n\nAs per our records, your next dental check-up is recommended on {{3}}.\n\nRegular dental check-ups are important for maintaining good dental health. We encourage you to visit the clinic on the recommended date.\n\nFor any assistance, please feel free to contact us directly.\n\nRegards,\n{{4}} Team'
    ),
    (
      p_clinic_id, 'prescription_copy', 'en', 'UTILITY', 'approved', false,
      '{"1":"patient_name","2":"clinic_name"}'::jsonb,
      E'Dear {{1}},\n\nPlease find your prescription attached.\nKindly keep it safe for your records.\n\nRegards,\n{{2}} Team'
    ),
    (
      p_clinic_id, 'payment_update', 'en', 'UTILITY', 'approved', false,
      '{"1":"patient_name","2":"total_bill","3":"amount_paid","4":"balance_due","5":"clinic_name","6":"clinic_name"}'::jsonb,
      E'Dear {{1}},\n\nThis is a payment update from {{6}}.\n\nPayment Summary :\n\nTotal Bill: ₹{{2}}\nAmount Paid: ₹{{3}}\nBalance Due: ₹{{4}}\n\nIf you have any questions regarding your payment, please feel free to contact us directly.\n\nRegards,\n{{5}} Team'
    )
  on conflict (clinic_id, meta_template_name) do nothing;
end;
$function$;

revoke execute on function public.seed_default_whatsapp_templates(uuid) from public, anon, authenticated;
