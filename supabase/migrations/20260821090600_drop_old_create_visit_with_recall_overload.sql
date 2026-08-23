-- CREATE OR REPLACE FUNCTION does not replace a function when the parameter list's arity
-- differs -- Postgres function identity includes the parameter signature, so the previous
-- migration actually left TWO overloads of create_visit_with_recall coexisting (the original
-- 7-parameter version and the new 8-parameter version), confirmed via pg_proc after applying it.
-- Two overloads risk PostgREST RPC-resolution ambiguity and leave a stale, discount-blind version
-- callable. Drop the old signature explicitly so exactly one function exists.
drop function public.create_visit_with_recall(uuid, uuid, date, text, text, numeric, date);
