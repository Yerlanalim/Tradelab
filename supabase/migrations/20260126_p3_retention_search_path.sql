-- Harden search_path for retention function
alter function public.p3_cleanup_old_data() set search_path = public, extensions;
