-- Which PBS client an estimate bills to, and the PO once it exists.
--
-- Mirrors `proposals.zoho` (0029): one jsonb column rather than a table, because
-- the link is per-quote, always read with the quote, and never queried on its
-- own. Shape:
--
--   {
--     "client_id": "20",            -- PBS client, chosen in the estimator
--     "client_code": "MBA",         -- 3-letter code, for display
--     "po_id": 12638,               -- set once the PO exists (Phase 3)
--     "po_no": "MBA000632",
--     "created_at": "2026-08-27T…", -- when this app created it
--     "creating_at": "2026-08-27T…" -- transient claim; stops a double submit
--   }                                  creating two POs (PBS has no delete)
--
-- Every field is optional: a quote may name a client long before it has a PO.
--
-- NOTE for whoever adds the next field here: `quoteUpdatePayload()` and the
-- `Pick<ClientQuote, …>` on `updateProposal` are BOTH whitelists. Miss either
-- and the edit updates the store but silently never persists.

alter table public.proposals
  add column if not exists pbs jsonb;

comment on column public.proposals.pbs is
  'PBS billing link: chosen client, and the PO once created. See docs/pbs-integration-plan.md.';
