alter table public.supplier_matches drop constraint if exists supplier_matches_source_check;
alter table public.api_usage drop constraint if exists api_usage_provider_check;

update public.supplier_matches set source = 'web_search' where source = 'apify';
update public.api_usage set provider = 'web_search' where provider = 'apify';

alter table public.supplier_matches
  add constraint supplier_matches_source_check
  check (source = any (array['tendata'::text, 'web_search'::text]));

alter table public.api_usage
  add constraint api_usage_provider_check
  check (provider = any (array['tendata'::text, 'qcc'::text, 'web_search'::text, 'openai'::text]));
