-- Phase 30A Task 1: split the recall reminder from payment info into two separate,
-- Meta-approved templates for Nanda Dental Care (b3d5ee30-d617-4279-9570-dda423ff1613) only.
-- Both templates are already approved on Meta, category UTILITY, language English -- the body
-- text below matches Meta's approved version verbatim, not altered here.

-- Demote the current default so the partial unique index
-- (idx_whatsapp_templates_one_default_per_clinic) doesn't reject the new insert below.
update public.whatsapp_templates
set is_default = false
where clinic_id = 'b3d5ee30-d617-4279-9570-dda423ff1613'
  and meta_template_name = 'nanda_dental_v1';

insert into public.whatsapp_templates
  (clinic_id, meta_template_name, language_code, category, body_preview, variable_mapping, approval_status, is_default)
values
  (
    'b3d5ee30-d617-4279-9570-dda423ff1613',
    'recall_nanda_dental',
    'en',
    'UTILITY',
    E'Dear {{1}},\n\nThis is a record update from {{2}}.\n\nAs per our records, your next dental check-up is recommended on {{3}}.\n\nRegular dental check-ups are important for maintaining good dental health. We encourage you to visit the clinic on the recommended date.\n\nFor any assistance, please feel free to contact us directly.\n\nRegards,\n{{4}} Team',
    jsonb_build_object('1', 'patient_name', '2', 'clinic_name', '3', 'due_date', '4', 'clinic_name'),
    'approved',
    true
  ),
  (
    'b3d5ee30-d617-4279-9570-dda423ff1613',
    'payment_update_nanda_dental',
    'en',
    'UTILITY',
    E'Dear {{1}},\n\nThis is a payment update from {{6}}.\n\nPayment Summary :\n\nTotal Bill: ₹{{2}}\nAmount Paid: ₹{{3}}\nBalance Due: ₹{{4}}\n\nIf you have any questions regarding your payment, please feel free to contact us directly.\n\nRegards,\n{{5}} Team',
    jsonb_build_object('1', 'patient_name', '2', 'total_bill', '3', 'amount_paid', '4', 'balance_due', '5', 'clinic_name', '6', 'clinic_name'),
    'approved',
    false
  );
