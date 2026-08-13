-- Attach set_updated_at() to every table with an updated_at column.
-- message_log and activity_log are append-only logs and are deliberately excluded.

create trigger set_updated_at before update on public.clinics
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.treatment_types
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.visits
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.recalls
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.message_log
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.clinic_usage
  for each row execute function public.set_updated_at();
