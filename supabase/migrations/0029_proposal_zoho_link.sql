-- Link a quote back to the Zoho CRM Deal it was imported from.
--
-- Stores the deal id plus a small snapshot (account, contact, owner, closing
-- date, amount, quote number, stage, deep link) so the Estimator can show the
-- CRM context without another API round-trip, and so the context survives even
-- if the deal later changes in Zoho. Null = quote wasn't imported from Zoho.

alter table public.proposals
  add column if not exists zoho jsonb;

comment on column public.proposals.zoho is
  'Zoho CRM Deal link + snapshot: {deal_id, deal_name, account, contact, owner, closing_date, amount, currency, quote_number, stage, web_url, imported_at}. Null = not imported from Zoho.';
