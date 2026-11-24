# Manual security test — desktop + phone

A hands-on pass to check what a signed-in (or signed-out) person can and can't
do. The automated version is `node scripts/security-probe.mjs` — run that too;
this guide is for checking it yourself, in a real browser and on a real phone.

**Rules while testing (production is live):**
- Use test accounts and records only. Name anything you create `[TEST] …` and
  delete it afterwards.
- Never press **Send to Zoho**, **Create PO** or **Start project** on a real
  estimate. Zoho deals and PBS purchase orders can't be deleted.
- Write down every result that doesn't match "Expected", with the account,
  device and a screenshot.

---

## 0. Set up

You need four accounts, one per role. Invite them from **Team** with addresses
you control (for example `you+admin@…`, `you+manager@…`):

| Account | Role | Used for |
| --- | --- | --- |
| A | Admin | changing settings, checking results |
| M | Manager | the "manager can read but not change" checks |
| U | Member | most of the attack attempts |
| V | Viewer | the "can see, can't touch" checks |

Make a `[TEST] Security` project via a test estimate (or reuse an existing test
project) with one task assigned to **U**, and one task U is **not** on.

Phone: use a real iPhone (Safari) and Android (Chrome) if you have them.
Desktop: Chrome or Edge, with DevTools (F12).

---

## 1. Signing in and out (desktop + phone)

| # | Do | Expected |
| --- | --- | --- |
| 1.1 | Signed out, open `/dashboard`, `/proposals`, `/settings`, `/team` directly | Sent to the login page every time; no page content flashes first |
| 1.2 | Signed out, open `/api/zoho/status` and `/api/pbs/clients` | `401` JSON, no data |
| 1.3 | Wrong password 5 times in a row | Generic "invalid login" message — it must not say whether the email exists |
| 1.4 | Sign in, **Sign out**, then press the browser **Back** button | Login page (or a redirect to it), not the old page with data |
| 1.5 | Sign in on the phone and on desktop as the same person; sign out on one | The other keeps working until its session ends; sign-out isn't shared — note this, it's expected |
| 1.6 | Request **Forgot password** for an address that has no account | Same "check your email" message as for a real one |
| 1.7 | Open a password-reset or invite link a second time after using it | "Link expired" message on the login page, never a signed-in page |
| 1.8 | Phone: sign in, switch to another app for a few minutes, come back | Still signed in, or cleanly back at login — never a half-broken page |

## 2. Two-factor (desktop + phone)

| # | Do | Expected |
| --- | --- | --- |
| 2.1 | As U: Settings → Security → set up the authenticator app | "On since …" |
| 2.2 | Sign out and in again | Asked for the 6-digit code before any page loads |
| 2.3 | At the code screen, type `/dashboard` in the address bar | Sent back to the code screen |
| 2.4 | Enter a wrong code, then an old code (from 2+ minutes ago) | Both refused |
| 2.5 | As A: Team → U's **⋯ → Reset two-factor** | U signs in with just the password next time |
| 2.6 | As A, try to reset **your own** two-factor from Team | Not offered |

## 3. What each role can see (desktop + phone)

Sign in as each role and open these pages **by typing the address**, not only
through the menu. Hidden menu items don't count as a pass; the address has to
be blocked too.

| Page | Admin | Manager | Member | Viewer |
| --- | --- | --- | --- | --- |
| `/proposals` (Estimator) | ✅ | ✅ | ❌ no-access screen | ❌ |
| `/settings?tab=workspace` | ✅ edit | ✅ read only | ❌ tab not there | ❌ |
| Settings → Hourly rates | edit | read | not shown | not shown |
| Team → ⋯ menu (deactivate, reset 2FA, setup link) | ✅ | ❌ | ❌ | ❌ |
| Team → ★ Work keys | edit | read | read | read |
| Calendar → Team view | ✅ | ✅ | ❌ own only | ❌ own only |
| Workload → Team | ✅ | ✅ | ❌ | ❌ |
| Delete project | ✅ | ❌ | ❌ | ❌ |
| Create / edit task | ✅ | ✅ | ✅ | ❌ (buttons hidden, not just disabled) |

Also check:
- 3.1 As A, Team → U's **⋯ → Page access**, untick Calendar. As U: Calendar is
  gone from the menu, and typing `/calendar` shows no access.
  (Page access only hides pages; the **role** is what protects the data.)
- 3.2 As U, open another person's leave in the Calendar → you can't see
  their leave or its note.
- 3.3 As V, open a task → no edit, delete, status or comment controls.

## 4. Trying to get around the UI (desktop only, browser console)

The app's public key is in every browser, so anyone signed in can call the
database directly and skip the buttons. The database rules must stop them.
Do this as **U (Member)**.

**Set up the console:**
1. Sign in as U, open DevTools → **Network**, reload, click any request to
   `…supabase.co/rest/v1/…`.
2. From its **Request headers** copy `apikey` and the `authorization` value
   (after `Bearer `).
3. In the **Console** paste, filling in the three values:

```js
const URL = "https://YOUR-REF.supabase.co";
const KEY = "PASTE apikey";
const TOKEN = "PASTE token (without Bearer)";
const ME = JSON.parse(atob(TOKEN.split(".")[1])).sub; // your profile id
const api = (path, method = "GET", body, prefer = "return=representation") =>
  fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: prefer },
    body: body && JSON.stringify(body),
  }).then(async (r) => console.log(r.status, await r.text()));
```

Then run each line and compare. **"Blocked"** means an error status (400–403),
or `200 []` (nothing returned / nothing changed). Afterwards, look in the app
as A to confirm nothing actually changed.

| # | Run | Expected |
| --- | --- | --- |
| 4.1 | `api("proposals?select=id,title")` | `200 []` — members can't read estimates |
| 4.2 | `api("hourly_rates?select=*")` | `200 []` |
| 4.3 | `api("zoho_connection?select=*")` and `api("pbs_connection?select=*")` | `200 []` — tokens never reachable |
| 4.4 | `api("profiles?id=eq."+ME, "PATCH", {role:"admin"})` | Error "Only admins can change a profile role" |
| 4.5 | `api("profiles?id=eq."+ME, "PATCH", {work_keys:["IT\|Level 2"]})` | Error |
| 4.6 | `api("profiles?id=eq."+ME, "PATCH", {page_access:null})` (after 3.1) | Error "Only admins can change page access" |
| 4.7 | `api("profiles?id=eq."+ME, "PATCH", {confirmed_at:null})` | Error |
| 4.8 | `api("tasks?id=eq.TASK_ID", "PATCH", {logged_hours:999})` (a task you're on) | Error |
| 4.9 | `api("time_entries?profile_id=eq."+ME, "PATCH", {hours:99})` | `200 []` — members can't edit logged time |
| 4.10 | `api("time_entries?profile_id=eq."+ME, "DELETE")` | `200 []` |
| 4.11 | `api("task_assignees", "POST", {task_id:"OTHER_TASK_ID", profile_id:"COLLEAGUE_ID", status:"accepted"}, "return=minimal")` | Stored as **pending**, not accepted (check as A), or refused |
| 4.12 | Request leave in the app, then `api("availability_entries?user_id=eq."+ME, "PATCH", {status:"approved"})` | Stays **pending** |
| 4.13 | `api("notifications", "POST", {recipient_id:"COLLEAGUE_ID", actor_id:ME, text:"[TEST]", href:"https://evil.example"}, "return=minimal")` | Error (check constraint) — try `//evil.example` too |
| 4.14 | Same as 4.13 but `actor_id:"COLLEAGUE_ID"` | Error — you can't send as someone else |
| 4.15 | `api("workspace_settings", "POST", {id:true, sprint_weeks:4}, "resolution=merge-duplicates")` | Error; sprint length unchanged |
| 4.16 | `api("holiday_settings", "POST", {name:"Christmas Day", working:true}, "resolution=merge-duplicates")` | Error |

> For an INSERT, use `"return=minimal"` (as in 4.11, 4.13). With the default,
> the database also has to let you READ the new row back; it often can't, so
> you'd get an error even when the insert went through. That's a false pass.
> Check the result as A instead.

**API routes** (still as U, in the console):

```js
const call = (path, method = "GET") => fetch(path, { method }).then(async (r) => console.log(path, r.status, await r.text()));
```

| # | Run | Expected |
| --- | --- | --- |
| 4.17 | `call("/api/zoho/deals")`, `call("/api/zoho/accounts?q=a")`, `call("/api/pbs/clients")` | `403` (members can't read CRM/billing) |
| 4.18 | `call("/api/users/COLLEAGUE_ID/status", "POST")` | `403` |
| 4.19 | `call("/api/users/COLLEAGUE_ID/mfa", "DELETE")` | `403` |
| 4.20 | `call("/api/invites", "POST")` | `403` |
| 4.21 | Repeat 4.17 as **M** | Works (managers may read CRM) — but 4.18–4.20 still `403` |
| 4.22 | `call("/api/esther")` and `fetch("/api/esther/scan", { method: "POST", body: new FormData() }).then(r => console.log(r.status))` | `403` — Esther (and the API key behind her) is admins and managers only |

## 5. Content people type (desktop + phone)

| # | Do | Expected |
| --- | --- | --- |
| 5.1 | Comment on a task: `<img src=x onerror=alert(1)>` and `<script>alert(1)</script>` | Shown as harmless text or stripped; **no alert pops up**, on either device |
| 5.2 | Put the same in a task title, project name, leave note and your display name | No alert anywhere they appear (board, drawer, calendar, bell, activity feed, Team) |
| 5.3 | Comment with a link `javascript:alert(1)` | Not clickable as a script |
| 5.4 | Upload a non-image (a `.html` or `.svg` file renamed `.png`) as your avatar | Refused, or shown as a broken image — never runs anything |
| 5.5 | Very long text (5,000+ characters) in a comment | Saved or refused cleanly; layout doesn't break |

## 6. Links, cookies and headers (desktop)

| # | Do | Expected |
| --- | --- | --- |
| 6.1 | Open `/auth/confirm?next=https://google.com` and `?next=//google.com` | Never sent to google.com |
| 6.2 | DevTools → Network → click the main page request → Response headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy` present |
| 6.3 | Make a local HTML file with `<iframe src="https://YOUR-SITE">` and open it | Refused to load in the frame |
| 6.4 | DevTools → Application → Cookies → `sb-…-auth-token` | `SameSite=Lax`. **HttpOnly and Secure are NOT ticked** — that's the Supabase browser library's default (it reads the cookie in JavaScript). HSTS (6.2) keeps it on HTTPS; the protection against token theft is section 5 (no injected scripts). Note it, don't file it as a new bug. |
| 6.5 | Search the page source and Network tab for `service_role`, `ZOHO_CLIENT_SECRET`, `PBS_APP_SECRET`, `RESEND` | Not found anywhere |

## 7. Offboarding (desktop + phone)

| # | Do | Expected |
| --- | --- | --- |
| 7.1 | Sign in as U on the phone. As A on desktop: Team → U → ⋯ → **Deactivate** | Within an hour at most, U's phone stops loading data; after reload, U is signed out and can't sign back in |
| 7.2 | Before U's phone reloads, try to comment or move a card as U | Refused |
| 7.3 | As A, reactivate U | U can sign in again |
| 7.4 | Generate a **Password setup link** for someone who already has a password | Refused — a setup link would sign its holder in as that person |

---

## When you're done

- Delete everything named `[TEST]` (as A), reset U's page access and
  two-factor, and deactivate or delete the test accounts you no longer need.
- Run `node scripts/security-probe.mjs` — every line must read `PASS`.
- Anything that didn't match: note it in **architecture/QA-checklist.md →
  "Notes / issues found"** with the step number.
