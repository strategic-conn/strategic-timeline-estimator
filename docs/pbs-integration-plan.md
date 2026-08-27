# PBS integration plan — create a PO when an estimate goes to Zoho

> Companion to [zoho-workflow-automation-plan.md](./zoho-workflow-automation-plan.md).
> Source material: `pbs-docs/PBS API.postman_collection.json` and
> `pbs-docs/PO-API-REFERENCE.docx` (dated 2026-08-26).
> **Status: plan only — no code written.** The API was exercised live on
> 2026-08-26 (token + both read endpoints, no writes); §1a records what actually
> happened, which differs from the reference doc in three places.

---

## 1. What PBS gives us

Machine-to-machine JSON API, JWT bearer tokens, no user-facing consent step.
Base URL is `https://pbsserver.com/`.

| Purpose | Endpoint | Notes |
| --- | --- | --- |
| Register app | `POST /api/register` | Once, by hand. Returns `app_id` + `app_secret` |
| Get tokens | `POST /api/token` | `app_id` + `app_secret` → access (1 h) + refresh |
| Refresh | `POST /api/refresh` | **Rotates the refresh token** |
| App details | `GET /api/fetch` | |
| List POs | `GET /api/fetch-all-po` | `po_no`, `date_from`, `date_to`, `limit` |
| One PO | `GET /api/fetch-po` | by `po_no` or `po_id` |
| **Create PO** | `POST /api/create-po` | `name`, `project_template_id`, `client_id` |

A created PO is stamped `create_by: "web estimator"` — PBS was built expecting
this app to be the caller.

---

## 1a. Verified against the live API

Three things the reference doc gets wrong. All were confirmed by running the
calls, not by reading.

**The base path is `/api`, not `/pbs/api`.** And the wrong one fails in the
nastiest way available: `POST /pbs/api/token` returns **HTTP 200** with an HTML
body that redirects to the app's login page —

```html
<script>window.location.href="https://pbsserver.com/log/in/cGJzL2FwaS90b2tlbg==";</script>
```

A client checking `res.ok` would sail past that and fail later on a JSON parse.
Any health check must assert on the parsed `status` field, never on the status
code.

**`Authorization: Bearer` does not work**, despite the doc's security section
saying it does. Verified:

| Transport | Result |
| --- | --- |
| `Authorization: Bearer <token>` | **400** "Access token is required." |
| `Authorization: <token>` (no prefix) | **400** same |
| `?access_token=…` query param | 200 |
| **POST with `access_token` in the JSON body** | **200** |

**The read endpoints accept POST.** `/api/fetch` and `/api/fetch-all-po` both
work as POSTs with a JSON body, which matters: since the header is out, POST is
the only way to keep the token out of URLs, access logs, and proxy history. So
this integration will POST everything, including the reads.

**PO record shape**, from live data:

```
id, po_no, name, project_id_old, project_id, project_template_id,
client_id, status, create_date, create_by, update_date, update_by, rate_per_hour
```

Two details worth knowing:

- `create_by` on the API-created sample reads **`"web estimatro"`** — misspelled
  on the PBS side (the doc says "web estimator"). Everything this app creates
  will carry that typo until PBS fixes it. It matters if anyone filters or
  reports on that column.
- `rate_per_hour` **is genuinely used** — real POs carry 22.00, 24.00, 25.00. It
  is only API-created POs that are pinned to `0.0000`. So the field this app
  could most usefully populate is the one the API refuses to accept.

### Endpoint behaviour, as observed

Every read endpoint and error path was exercised. Aliases work (`po` = `fetch-po`,
`po-list` = `fetch-all-po`), and the error messages are clear and distinguishable
— `"Invalid access token."`, `"Application ID is required."`, `"Access token does
not match application ID."`, `"Endpoint not found."` — which is enough to tell a
config problem from an expiry without guessing.

Four behaviours to design around:

- **`fetch-po` with no `po_no`/`po_id` returns the whole list.** Not an error —
  HTTP 200, `status: success`, and 200 PO records. A client that forgets the key
  gets a successful-looking response containing every PO. Our wrapper must
  require the key before calling, rather than trusting the response.
- **`count` is the page size, not a total.** `limit=3` → `count: 3`. There is no
  total and no offset/page parameter, so the API can return the most recent N and
  nothing else. Fine for our use; it does mean "have we seen every PO" is
  unanswerable.
- **`limit` is unbounded and unvalidated.** `limit=1000` returned 1000 rows;
  `limit=-5` silently fell back to 200. Cap it on our side.
- **The list's `po_no` filter is exact-match**, not a prefix search (`ABY000632`
  matches, `ABY` returns nothing).

### Tokens: skip `/refresh` entirely

Refresh works and rotates correctly — but the old refresh token is invalidated
**immediately**, with no reuse window (Supabase, by contrast, allows ~10 s). Two
server instances refreshing at once would leave one holding a dead token, which
is exactly the class of bug that logged users out of this app last week.

It is also avoidable, because minting is unconditional:

| Test | Result |
| --- | --- |
| Mint a 2nd token pair while the 1st is live | success |
| 1st access token afterwards | still valid |
| Mint a 3rd, then use the 2nd | still valid |
| Reuse a rotated refresh token | **400** "Refresh token is invalid or expired." |

Access tokens **coexist** — minting never revokes an existing one. So the
integration will **never call `/refresh`**: when the stored token is near expiry,
call `/token` with the app credentials for a fresh pair. That removes rotation,
removes the concurrency hazard, and removes the need to store a refresh token at
all — the `pbs_connection` row only needs `access_token` + `expires_at`, and a
lost row costs one extra call rather than a broken connection.

---

## 2. The one real dependency: which client?

`create-po` needs a numeric `client_id` from **PBS's own `client` table** — the
doc is explicit that it "looks up `client_code` from the client table using
`client_id`", and the first three letters of that code become the PO prefix
(`MBA` → `MBA000001`).

**That is not the Zoho account id.** Zoho ids are 18–19 digit strings issued by
a different system; PBS ids are small integers in a PHP/SQLite app. Nothing
links them today, and the documented API exposes **no way to list or search PBS
clients**, so the app cannot resolve "Test Company Lead Gen Services Ad" to a
`client_id` on its own.

**Confirmed: there is no clients endpoint.** Nine plausible paths were probed
(`/api/clients`, `/api/fetch-clients`, `/api/client-list`, `/api/fetch-client`,
`/api/project-templates`, …) and every one returned **404 "Endpoint not found."**

**But the ids are derivable from data we can already read.** `po_no`'s first
three letters are the client's code, so existing POs expose the mapping. One
call over 500 POs gives the whole picture:

| client_id | PO prefix | POs | templates seen |
| --- | --- | --- | --- |
| 20 | MBA | 436 | 25, 16, 18 |
| 33 | MSP | 31 | 37 |
| 32 | STR | 22 | 33 |
| 12 | TIM | 10 | 22, 20, 35 |
| 30 | ABY | 1 | 30 |

Five clients across 500 POs, one of them accounting for 87% of them. That makes
a hand-maintained mapping far more practical than it sounded in the abstract —
this is a handful of rows, not a directory.

Three ways out, best first:

1. **PBS adds a clients endpoint** (`GET /api/clients`, returning `client_id`,
   `client_code`, `name`). Then the estimator can offer a picker exactly like
   the Zoho account lookup, we store the chosen id on the quote, and no one
   maintains a mapping by hand. *This is the only option that scales.*
2. **A mapping we own** — a `pbs_client_id` recorded once per Zoho account
   (small table keyed by `zoho.account_id`). Works with today's API, but someone
   has to look each id up in PBS the first time a client is quoted, and a wrong
   number silently files the PO under another client.
3. **Type it per estimate.** No mapping, no lookup, a field in the send dialog.
   Fastest to build, worst to live with — a typo is a PO on the wrong client,
   and there is no delete endpoint.

**Recommendation: ask for (1); build (2) as the interim**, because (2) is also
the storage (1) would populate — the picker just replaces the manual entry, and
nothing else changes.

---

## 3. Decisions taken

| Question | Answer | Consequence |
| --- | --- | --- |
| Project template | One fixed template for estimator POs | `PBS_PROJECT_TEMPLATE_ID` env var, not a UI field |
| PO contents | **Empty PO for now** — name only | Hours, price and products stay in this app and Zoho; PBS gets a shell to be filled in there |
| Base URL | `https://pbsserver.com/` | `PBS_BASE_URL` env, default as above |
| Trigger | **Send to Zoho** | One click pushes to both systems |
| Client id | Unresolved — see §2 | Blocks automation; §2(2) unblocks a first version |

**On "empty PO for now":** worth saying plainly that a PO created this way
carries a name and nothing else. `rate_per_hour` is fixed at `0.0000` by the API
and is not settable, which is pointed given this app prices everything as
hours × `HOURLY_RATE`. Whoever works the PO in PBS still keys the numbers in. If
that changes later it is a PBS-side change, not one we can make from here.

---

## 4. Architecture — the Zoho integration, again

Nothing novel is needed. The Zoho plumbing already solves every problem PBS
poses, so the plan is to reuse its shape rather than invent a second one.

**Credentials.** `PBS_APP_ID`, `PBS_APP_SECRET`, `PBS_BASE_URL`,
`PBS_PROJECT_TEMPLATE_ID` — server-only, never `NEXT_PUBLIC_`.

**Token storage.** A `pbs_connection` singleton holding `access_token` +
`expires_at` only, with **RLS enabled and no policies** — like `zoho_connection`,
so only the service role can read it. No refresh token is stored (see §1a): when
the token is near expiry we re-mint from the app credentials. Simpler than Zoho
in two respects — no consent screen, so no connect/disconnect UI, and no rotation
to get wrong. The table is a cache, not a source of truth; losing it costs one
extra call.

**`lib/pbs/tokens.ts`.** `getAccessToken()` refreshing ~1 min before expiry, and
`pbsFetch(path, init)` as the single seam. Two rules carried over from Zoho:

- **A write allowlist.** `pbsFetch` refuses any non-GET that isn't listed, before
  the request leaves the process. Day one that is exactly one entry:
  `POST /api/create-po`.
- **POST with the token in the JSON body — never the query string.** The Bearer
  header does not work (§1a), and `?access_token=…` leaks into access logs,
  proxies and browser history. Since the reads accept POST, every call this app
  makes can keep the token in the body.

**Refresh-token rotation** is the same trap as Supabase's: the response carries a
new refresh token, and losing it kills the connection. Persist both tokens in
one write, and treat a failed refresh as "not connected" rather than throwing.

**Storage on our side.** A `proposals.pbs` jsonb column (`po_id`, `po_no`,
`client_id`, `created_at`, `creating_at`) — mirroring `proposals.zoho`, including
the compare-and-set claim that stops a double submit creating two POs. Adding
the column means updating **both** whitelists (`quoteUpdatePayload` and the
`Pick<ClientQuote, …>` on `updateProposal`) or the write silently never persists.

**Route.** `POST /api/pbs/pos`, gated admin+manager by a `requirePbsWriter()`
mirroring `requireZohoWriter()` — a separate named gate so the write surface
stays greppable.

---

## 5. Where it hooks into the flow

The **Send to Zoho** dialog (`ZohoSendDialog`) already previews every outward
write and handles both create-and-update. PBS becomes one more line in that
preview and one more line in the result, not a second button.

```
Send to Zoho
  ├─ Zoho: create deal / move stage, Packages rows, PDF
  └─ PBS:  create PO  "<estimate title>"  for <client>   [ ] skip
```

**Ordering: Zoho first, PBS second.** This is deliberate. The Zoho writes are
idempotent per stage (`proposals.zoho.pushes`), so a retry re-runs them safely;
PBS has no dedupe of its own and no delete endpoint. Putting the non-idempotent
call last means a failure anywhere earlier can be retried without risking a
duplicate PO, and a PBS failure leaves the Zoho work done rather than in doubt.

**Partial success is normal and must read that way.** Two external systems in
one click will sometimes half-succeed, and neither can be rolled back. So:

- The result reports each system separately — *"Deal moved to Proposal Sent ·
  PO MBA000123 created"*, or *"Deal moved to Proposal Sent · PBS: couldn't
  create the PO"*.
- A retry skips whatever already happened: Zoho by its `pushes` record, PBS by
  `proposals.pbs.po_no` being set.
- The checkbox is off, with an explanation, when the client has no
  `pbs_client_id` — the same pattern as the disabled create button when a quote
  has no Zoho account.

---

## 6. What ships in what order

**Phase 1 — connection. ✅ Built (2026-08-26).**

- `supabase/migrations/0030_pbs_connection.sql` — token cache, RLS on, no
  policies. Access token + expiry only; no refresh token is stored.
- `lib/pbs/config.ts` — env, defaulting to the **verified** `/api` base.
- `lib/pbs/endpoints.ts` — deny-by-default endpoint allowlist (`register`,
  `refresh` and `token` are unreachable through the call path), plus
  `isSuccessEnvelope`, since HTTP status can't be trusted.
- `lib/pbs/tokens.ts` — `getAccessToken()` (cache, re-mint at 60 s to expiry, and
  invalidate the cache if `PBS_APP_ID` changes) and `pbsFetch()`, which POSTs
  every call with credentials in the body.
- `GET /api/pbs/health` — admin only, read-only. Reports whether the token and
  both read endpoints work, and derives the **client list from PO history**,
  which is the input Phase 2 needs.

Still required before it can run: `PBS_APP_ID` and `PBS_APP_SECRET` in the
server environment, and `npm run db:push` for the migration.

**Phase 2 — client mapping. ✅ Built (2026-08-27).** Option (2) from §2, upgraded
by the derivation: no one types a numeric id.

- `lib/pbs/clients.ts` — `clientsFromPos()`, folding PO history into one entry
  per client. A client's code is its **majority** prefix, so one mis-keyed PO
  number can't rename it.
- `GET /api/pbs/clients` — admin+manager (`lib/pbs/guard.ts`), 10-minute cache,
  and it refuses to cache an empty list: no clients is far more likely a bad read
  than a billing system with no customers, and caching it would hide the fault.
- `supabase/migrations/0031_proposal_pbs_link.sql` — `proposals.pbs` jsonb,
  mirroring `proposals.zoho`. **Both** persistence whitelists updated.
- `hooks/usePbsClients.ts` — lazy, single-flight, module-cached. The list loads
  on the Select's first open, not on every estimate anyone views.
- Setup tab → **Billing client (PBS)**, listing codes with their PO counts,
  busiest first.

**Remembered per client, without a mapping table.** When an estimate has no PBS
client but an earlier estimate for the same Zoho account does, the picker offers
it in one click. The quotes already in the store carry the answer, so no second
table and nothing to keep in sync. Offered rather than auto-filled on purpose: a
wrong billing client is a PO on the wrong account, and PBS has no delete
endpoint.

Requires `npm run db:push` (migration 0031) and `npm run db:types`.

**Phase 3 — create the PO. ✅ Built (2026-08-27).**

- `POST /api/pbs/pos` — admin+manager. Refuses a quote that already has a
  `po_no`, claims the row with a compare-and-set before calling PBS, releases
  the claim if PBS refuses, and retries the link write once (a created PO that
  failed to record itself reads as "no PO yet" to the next click).
- `lib/pbs/directory.ts` — one cached read shared by the picker and PO creation,
  so a PO is filed under exactly the template the UI displayed.
- Send dialog — a checkbox line, `Also create a PO in PBS for MBA`, or a plain
  statement when there's no billing client or a PO already exists.

**Project templates are resolved per client.** `PBS_PROJECT_TEMPLATE_ID` wins
when set, but it is optional and unset by default, because the live data says
templates are client-scoped: across 500 POs and nine templates, **no template is
used by two clients**.

| Client | Templates |
| --- | --- |
| 20 (MBA) | 25 ×183, 16 ×154, 18 ×99 |
| 33 (MSP) | 37 ×31 |
| 32 (STR) | 33 ×22 |
| 12 (TIM) | 20 ×5, 22 ×4, 35 ×1 |
| 30 (ABY) | 30 ×1 |

So a single global id would file POs under another client's template. Instead
each client's own most-used template is chosen, and a client with no PO history
is **refused** rather than given someone else's — there is no delete endpoint to
undo that. Set the env var only if PBS confirms templates are global, or if a
dedicated "Web Estimator" template is created for all of them.

**Ordering: Zoho first, PBS second**, as designed in §5. A PBS failure reports
"Sent to Zoho, but PBS didn't create the PO" rather than implying the whole send
failed, and leaves the retry to the user — by then the Zoho half is idempotent
and the PO half is guarded by `po_no`.

**Not planned:** reading POs back (`fetch-all-po`) to show status in the
estimator. Cheap to add once Phase 1 exists, but nothing in the current workflow
asks for it, and a badge that nobody acts on is a maintenance cost.

---

## 7. Open questions for the PBS side

1. **A clients endpoint** — see §2. This is the blocker for real automation.
2. **Is there any way to attach amounts or line items to a PO?** If the intent is
   that PBS eventually carries the estimate's figures, that needs an API that
   accepts them; `create-po` cannot today, and `rate_per_hour` is fixed at 0.
3. **Idempotency.** Would PBS consider accepting a caller-supplied reference (our
   proposal id) and rejecting duplicates? Our claim protects against a double
   click from this app, not against two people on two machines.
4. **Confirm the base path** — `/api` (Postman) vs `/pbs/api` (doc).
5. **`fetch-po` with no key returns the full list** rather than an error (§1a).
   Worth fixing on the PBS side — it turns a caller's bug into a silent
   200-record response.
6. **The `create_by` typo** — "web estimatro". Cheap to fix now, awkward later
   once reports filter on it.
