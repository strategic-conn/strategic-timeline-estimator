"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, ChevronDown, FileText, Link2, Pencil, Search, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRIMARY_GOAL_OPTIONS, REGULATED_TYPE_OPTIONS } from "@/lib/discovery/constants";
import { PROPOSAL_PLATFORM_OPTIONS } from "@/lib/proposal-catalog";
import type {
  ConfirmedAnswers,
  ESTHER_GOALS,
  ESTHER_PLATFORMS,
  ESTHER_REGULATED,
  ScanResult,
  Source,
} from "@/lib/esther/estimate/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { EstherFace, type EstherMood } from "@/components/features/esther-estimate/EstherFace";
import type { ProposalZohoLink } from "@/types/proposal.types";

/**
 * Step 3 of "Let Esther estimate": a short conversation with Esther (the
 * component is at the bottom). This top part is the form's data — what she
 * found, what still needs an answer, and what is sent to the draft.
 */

type Platform = (typeof ESTHER_PLATFORMS)[number];
type Goal = (typeof ESTHER_GOALS)[number];
type Regulated = (typeof ESTHER_REGULATED)[number];

/** The form. `null` = not answered yet; "" on a date = "as soon as / none". */
export type DetailsDraft = {
  title: string;
  client_name: string;
  platform: Platform | null;
  primary_goal: Goal | null;
  is_redesign: boolean | null;
  current_url: string;
  regulated_industry: boolean | null;
  regulated_type: Regulated | null;
  start_date: string | null;
  hard_deadline: string | null;
  review_days: number | null;
  blackout: boolean | null;
  blackout_notes: string;
  extra: Record<string, string>;
};

/** A value counts only when it came from the document or a guess — "none" starts blank. */
const known = <T,>(f: { value: T; source: Source }): T | null =>
  f.source === "none" ? null : f.value;

export function initialDraft(scan: ScanResult): DetailsDraft {
  const date = (f: ScanResult["start_date"]) =>
    f.source === "none" ? null : /^\d{4}-\d{2}-\d{2}$/.test(f.value ?? "") ? f.value! : "";
  return {
    title: scan.project_title.slice(0, 200),
    client_name: scan.client_name ?? "",
    platform: known(scan.platform),
    primary_goal: known(scan.primary_goal),
    is_redesign: known(scan.is_redesign),
    current_url: scan.current_url.value ?? "",
    regulated_industry: known(scan.regulated_industry),
    regulated_type: known(scan.regulated_type),
    start_date: date(scan.start_date),
    hard_deadline: date(scan.hard_deadline),
    review_days: known(scan.review_days) == null ? null : Math.min(30, Math.max(1, Math.round(scan.review_days.value!))),
    blackout: known(scan.blackout),
    blackout_notes: scan.blackout_notes.value ?? "",
    extra: {},
  };
}

/** What still has to be answered before Esther can build — the button's countdown. */
export function missingAnswers(d: DetailsDraft, zoho: ProposalZohoLink | null): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push("Estimate title");
  if (isSupabaseConfigured ? !zoho?.account_id : false) out.push("Client");
  if (!d.platform) out.push("Platform");
  if (d.start_date === null) out.push("Start date");
  if (d.hard_deadline === null) out.push("Deadline");
  if (d.review_days === null) out.push("Client review time");
  if (d.blackout === null) out.push("Blackout periods");
  if (d.is_redesign === null) out.push("Redesign");
  if (d.regulated_industry === null) out.push("Regulated industry");
  if (d.regulated_industry && !d.regulated_type) out.push("Industry type");
  return out;
}

export function toConfirmed(d: DetailsDraft): ConfirmedAnswers {
  return {
    title: d.title.trim(),
    client_name: d.client_name.trim(),
    platform: d.platform ?? "custom",
    primary_goal: d.primary_goal,
    is_redesign: d.is_redesign ?? false,
    current_url: d.current_url.trim(),
    regulated_industry: d.regulated_industry ?? false,
    regulated_type: d.regulated_industry ? d.regulated_type : null,
    start_date: d.start_date ?? "",
    hard_deadline: d.hard_deadline ?? "",
    review_days: d.review_days ?? 3,
    blackout: d.blackout ?? false,
    blackout_notes: d.blackout ? d.blackout_notes.trim() : "",
    extra: Object.fromEntries(Object.entries(d.extra).map(([k, v]) => [k, v.trim()])),
  };
}

// ── Small controls ───────────────────────────────────────────────────────

function Chips<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-10 rounded-full border px-4 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const YES_NO = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

/** Where Esther got (or didn't get) this answer, in her own words. */
function SourceLine({ source, quote }: { source: Source | "question"; quote?: string | null }) {
  if (source === "question") return null;
  const text =
    source === "document"
      ? "I found this in the document"
      : source === "guess"
        ? "This is my guess — please check it"
        : "I couldn't find this in the document";
  return (
    <span className="mt-2 block text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
          source === "document" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          source === "guess" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
          source === "none" && "bg-background/70 text-muted-foreground",
        )}
      >
        {source === "document" ? <FileText className="size-3" aria-hidden /> : null}
        {text}
      </span>
      {quote ? <span className="mt-1.5 block italic text-muted-foreground">{`“${quote}”`}</span> : null}
    </span>
  );
}

/** Esther's side of the conversation: her avatar and a speech bubble. */
function Bubble({ children, id, mood = "idle" }: { children: React.ReactNode; id?: string; mood?: EstherMood }) {
  return (
    <div className="flex items-start gap-3">
      <EstherFace mood={mood} className="size-9" />
      <div
        id={id}
        className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-primary/20 bg-gradient-to-br from-primary/10 to-chart-2/10 px-4 py-3 text-sm"
      >
        {children}
      </div>
    </div>
  );
}

// ── The conversation ─────────────────────────────────────────────────────

type FieldKey =
  | "platform"
  | "start_date"
  | "hard_deadline"
  | "review_days"
  | "blackout"
  | "is_redesign"
  | "regulated_industry"
  | "primary_goal";

const FIELD_ORDER: FieldKey[] = [
  "platform",
  "start_date",
  "hard_deadline",
  "review_days",
  "blackout",
  "is_redesign",
  "regulated_industry",
  "primary_goal",
];

const QUESTION: Record<FieldKey, { ask: string; help?: string; short: string }> = {
  platform: { ask: "What will the website be built on?", short: "Platform" },
  start_date: { ask: "When can the work start?", short: "Start" },
  hard_deadline: {
    ask: "Is there a date it must be live by?",
    help: "A launch event, a season, a contract date.",
    short: "Must be live by",
  },
  review_days: {
    ask: "How many working days does the client need to review each stage?",
    help: "Time to look at a design or a build and send feedback.",
    short: "Client review time",
  },
  blackout: {
    ask: "Are there times the client is away, or the site can't change?",
    help: "Holiday closures, a busy season, an event.",
    short: "Blackout periods",
  },
  is_redesign: { ask: "Is this a redesign of a website they already have?", short: "Redesign" },
  regulated_industry: {
    ask: "Is the client in a regulated industry?",
    help: "Healthcare, finance, legal or education add a compliance review.",
    short: "Regulated industry",
  },
  primary_goal: {
    ask: "What's the website mainly for?",
    help: "Optional. It's printed on the quote and doesn't change the hours.",
    short: "Main goal",
  },
};

/** A screen of the conversation. */
type StepId = "intro" | "name" | "client" | FieldKey | `q:${string}` | "review";

const fmtDate = (iso: string) => {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
};

/**
 * Step 3 of "Let Esther estimate", as a conversation: Esther says what she
 * read, then asks ONE question per screen — only what she guessed or couldn't
 * find, plus her own questions — and ends on a review of everything she'll
 * use, where any answer (including the ones she found) can be changed.
 * Tapping a choice that fully answers a question moves on by itself.
 */
export function EstherDetails({
  scan,
  fileName,
  draft,
  setDraft,
  zoho,
  onFindClient,
  onBack,
  onBuild,
  startAtReview = false,
}: {
  scan: ScanResult;
  fileName: string;
  draft: DetailsDraft;
  setDraft: (update: (d: DetailsDraft) => DetailsDraft) => void;
  zoho: ProposalZohoLink | null;
  onFindClient: () => void;
  /** Leave the conversation for the drop step. */
  onBack: () => void;
  onBuild: () => void;
  /** Back from a failed draft: land on the review, not the start. */
  startAtReview?: boolean;
}) {
  const set = <K extends keyof DetailsDraft>(k: K, v: DetailsDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // Where each answer came from — decided once, from the scan. "From the
  // document" with no usable value is asked like a missing one, so an answer
  // the build button waits for is never skipped.
  const [sourceOf] = React.useState(() => {
    const filled = (k: FieldKey) => {
      const v = draft[k];
      return v !== null && !(k === "regulated_industry" && v === true && !draft.regulated_type);
    };
    const src = (k: FieldKey): Source => {
      const s = scan[k].source;
      return s === "document" && !filled(k) ? "none" : s;
    };
    return Object.fromEntries(FIELD_ORDER.map((k) => [k, src(k)])) as Record<FieldKey, Source>;
  });

  // The questions Esther asks, in order. Found-in-the-document answers are
  // not asked; they wait on the review screen.
  const [path] = React.useState<StepId[]>(() => [
    "intro",
    "name",
    "client",
    ...FIELD_ORDER.filter((k) => sourceOf[k] !== "document"),
    ...scan.questions.map((q) => `q:${q.id}` as const),
    "review",
  ]);
  const [at, setAt] = React.useState<StepId>(startAtReview ? "review" : "intro");
  /** Changing one answer from the review returns to the review. */
  const [fromReview, setFromReview] = React.useState(startAtReview);

  const goNext = React.useCallback(() => {
    if (fromReview) return setAt("review");
    setAt((cur) => path[Math.min(path.length - 1, path.indexOf(cur) + 1)]);
  }, [fromReview, path]);

  const goBack = () => {
    if (fromReview && at !== "review") return setAt("review");
    const i = path.indexOf(at);
    if (i <= 0) return onBack();
    setFromReview(false);
    setAt(path[i - 1]);
  };

  // A tap that fully answers the question moves on after a beat, so the
  // choice is seen before the next question replaces it.
  const advanceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => clearTimeout(advanceTimer.current ?? undefined), []);
  React.useEffect(() => clearTimeout(advanceTimer.current ?? undefined), [at]);
  const answerAndGo = () => {
    clearTimeout(advanceTimer.current ?? undefined);
    advanceTimer.current = setTimeout(goNext, 380);
  };

  const questionById = new Map(scan.questions.map((q) => [q.id, q]));
  const missing = missingAnswers(draft, zoho);

  /** Whether this screen's answer lets Next go (optional ones always do). */
  const answered = (s: StepId): boolean => {
    switch (s) {
      case "name":
        return Boolean(draft.title.trim());
      case "client":
        return isSupabaseConfigured ? Boolean(zoho?.account_id) : true;
      case "regulated_industry":
        return draft.regulated_industry === false || (draft.regulated_industry === true && Boolean(draft.regulated_type));
      case "primary_goal":
      case "intro":
      case "review":
        return true;
      default:
        if (s.startsWith("q:")) return true;
        return draft[s as FieldKey] !== null;
    }
  };

  // Progress counts questions only (not the hello or the review).
  const questions = path.filter((s) => s !== "intro" && s !== "review");
  const qIndex = (questions as StepId[]).indexOf(at);

  const display = (k: FieldKey): string => {
    switch (k) {
      case "platform":
        return PROPOSAL_PLATFORM_OPTIONS.find((p) => p.value === draft.platform)?.label ?? "—";
      case "start_date":
        return draft.start_date === null ? "—" : draft.start_date ? fmtDate(draft.start_date) : "As soon as it's approved";
      case "hard_deadline":
        return draft.hard_deadline === null ? "—" : draft.hard_deadline ? fmtDate(draft.hard_deadline) : "No fixed deadline";
      case "review_days":
        return draft.review_days === null ? "—" : `${draft.review_days} working day${draft.review_days === 1 ? "" : "s"}`;
      case "blackout":
        return draft.blackout === null ? "—" : draft.blackout ? `Yes${draft.blackout_notes.trim() ? ` — ${draft.blackout_notes.trim()}` : ""}` : "No";
      case "is_redesign":
        return draft.is_redesign === null ? "—" : draft.is_redesign ? `Yes${draft.current_url.trim() ? ` — ${draft.current_url.trim()}` : ""}` : "No";
      case "regulated_industry":
        return draft.regulated_industry === null
          ? "—"
          : draft.regulated_industry
            ? `Yes — ${REGULATED_TYPE_OPTIONS.find((o) => o.value === draft.regulated_type)?.label ?? "type?"}`
            : "No";
      case "primary_goal":
        return PRIMARY_GOAL_OPTIONS.find((o) => o.value === draft.primary_goal)?.label ?? "Not set";
    }
  };

  // ── One screen ──
  const field = (k: FieldKey): React.ReactNode => {
    switch (k) {
      case "platform":
        return (
          <Chips
            label="Platform"
            value={draft.platform}
            onChange={(v) => {
              set("platform", v);
              answerAndGo();
            }}
            options={PROPOSAL_PLATFORM_OPTIONS.map((p) => ({ value: p.value as Platform, label: p.label }))}
          />
        );
      case "start_date":
        return (
          <DateAnswer
            label="Start date"
            noneLabel="As soon as it's approved"
            value={draft.start_date}
            onChange={(v) => set("start_date", v)}
            onNone={answerAndGo}
          />
        );
      case "hard_deadline":
        return (
          <DateAnswer
            label="Deadline"
            noneLabel="No fixed deadline"
            value={draft.hard_deadline}
            onChange={(v) => set("hard_deadline", v)}
            onNone={answerAndGo}
          />
        );
      case "review_days":
        return (
          <Chips
            label="Client review time"
            value={draft.review_days}
            onChange={(v) => {
              set("review_days", v);
              answerAndGo();
            }}
            options={[1, 2, 3, 5, 10].map((n) => ({ value: n, label: `${n} day${n === 1 ? "" : "s"}` }))}
          />
        );
      case "blackout":
        return (
          <>
            <Chips
              label="Blackout periods"
              value={draft.blackout}
              onChange={(v) => {
                set("blackout", v);
                if (!v) answerAndGo();
              }}
              options={YES_NO}
            />
            {draft.blackout ? (
              <Textarea
                aria-label="When, and why"
                autoFocus
                placeholder="e.g. Closed Dec 20 – Jan 3 for the holidays"
                value={draft.blackout_notes}
                onChange={(e) => set("blackout_notes", e.target.value)}
                rows={2}
              />
            ) : null}
          </>
        );
      case "is_redesign":
        return (
          <>
            <Chips
              label="Redesign"
              value={draft.is_redesign}
              onChange={(v) => {
                set("is_redesign", v);
                if (!v) answerAndGo();
              }}
              options={YES_NO}
            />
            {draft.is_redesign ? (
              <Input
                aria-label="Current website address"
                autoFocus
                placeholder="Their current website, e.g. https://example.com"
                value={draft.current_url}
                onChange={(e) => set("current_url", e.target.value)}
              />
            ) : null}
          </>
        );
      case "regulated_industry":
        return (
          <>
            <Chips
              label="Regulated industry"
              value={draft.regulated_industry}
              onChange={(v) => {
                set("regulated_industry", v);
                if (!v) answerAndGo();
              }}
              options={YES_NO}
            />
            {draft.regulated_industry ? (
              <Chips
                label="Industry type"
                value={draft.regulated_type}
                onChange={(v) => {
                  set("regulated_type", v as Regulated);
                  answerAndGo();
                }}
                options={REGULATED_TYPE_OPTIONS.map((o) => ({ value: o.value as Regulated, label: o.label }))}
              />
            ) : null}
          </>
        );
      case "primary_goal":
        return (
          <Chips
            label="Main goal"
            value={draft.primary_goal}
            onChange={(v) => {
              set("primary_goal", v as Goal);
              answerAndGo();
            }}
            options={PRIMARY_GOAL_OPTIONS.map((o) => ({ value: o.value as Goal, label: o.label }))}
          />
        );
    }
  };

  let body: React.ReactNode;
  if (at === "intro") {
    const found = FIELD_ORDER.filter((k) => sourceOf[k] === "document").length;
    body = (
      <div className="flex flex-col gap-3">
        <Bubble>
          <p className="font-medium">{"Hi! I've read "}<span className="break-all">{fileName}</span>.</p>
          <p className="mt-1.5 text-muted-foreground">{scan.summary}</p>
          <details className="group mt-2.5">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary dark:text-indigo-300 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
              {`What the client asked for (${scan.requirements.length})`}
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs">
              {scan.requirements.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span className="shrink-0 rounded bg-background/70 px-1.5 font-medium text-muted-foreground">{r.area}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </details>
        </Bubble>
        <Bubble>
          {`I found ${found} of the project details in it. I have ${questions.length} quick question${questions.length === 1 ? "" : "s"} for you — then I'll draft the estimate.`}
        </Bubble>
      </div>
    );
  } else if (at === "review") {
    const row = (label: string, value: string, step: StepId, source?: Source) => (
      <li key={step}>
        <button
          type="button"
          onClick={() => {
            setFromReview(true);
            setAt(step);
          }}
          className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
          data-review={step}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className={cn("block truncate text-sm", value === "—" && "text-amber-700 dark:text-amber-300")}>
              {value === "—" ? "Needs an answer" : value}
            </span>
          </span>
          {source === "document" ? (
            <span className="hidden shrink-0 items-center gap-1 text-[0.7rem] text-emerald-700 sm:inline-flex dark:text-emerald-300">
              <FileText className="size-3" aria-hidden />
              From the document
            </span>
          ) : null}
          <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Change</span>
        </button>
      </li>
    );
    body = (
      <div className="flex flex-col gap-3">
        <Bubble mood="success">{"Here's everything I'll use. Tap anything to change it."}</Bubble>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70" data-testid="esther-review">
          {row("Estimate name", draft.title.trim() || "—", "name")}
          {row("Client", draft.client_name.trim() && (!isSupabaseConfigured || zoho?.account_id) ? draft.client_name : "—", "client")}
          {FIELD_ORDER.map((k) => row(QUESTION[k].short, display(k), k, sourceOf[k]))}
          {scan.questions.map((q) =>
            row(q.question, draft.extra[q.id]?.trim() || "Not sure — Esther will assume", `q:${q.id}`),
          )}
        </ul>
      </div>
    );
  } else if (at === "name") {
    body = (
      <div className="flex flex-col gap-3">
        <Bubble id="esther-ask" mood="ask">
          <p className="font-medium">What should we call this estimate?</p>
          <p className="mt-1 text-xs text-muted-foreground">Your team sees this name in the estimate list. I suggested one.</p>
        </Bubble>
        <div className="sm:pl-12">
          <Input
            aria-labelledby="esther-ask"
            autoFocus
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={200}
          />
        </div>
      </div>
    );
  } else if (at === "client") {
    body = (
      <div className="flex flex-col gap-3">
        <Bubble id="esther-ask" mood="ask">
          <p className="font-medium" id="esther-client-label">{"Who's the client?"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scan.client_name
              ? `The document says “${scan.client_name}”.${isSupabaseConfigured ? " Pick them in Zoho so the estimate can go there later." : ""}`
              : isSupabaseConfigured
                ? "I couldn't find a name. Pick them in Zoho so the estimate can go there later."
                : "I couldn't find a name in the document."}
          </p>
        </Bubble>
        <div className="flex flex-col gap-1.5 sm:pl-12">
          {isSupabaseConfigured ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 justify-start gap-2 py-2 text-left font-normal"
                onClick={onFindClient}
                aria-labelledby="esther-client-label esther-client-value"
                data-testid="esther-client"
              >
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {zoho?.account_id ? (
                  <span id="esther-client-value" className="truncate">{draft.client_name}</span>
                ) : (
                  <span id="esther-client-value" className="text-muted-foreground">
                    {scan.client_name ? `Find “${scan.client_name}” in Zoho` : "Find the client in Zoho"}
                  </span>
                )}
              </Button>
              {zoho?.account_id ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="size-3" aria-hidden />
                  Linked to Zoho{zoho.contact ? ` · ${zoho.contact}` : ""}
                </span>
              ) : null}
            </>
          ) : (
            <Input
              aria-labelledby="esther-client-label"
              autoFocus
              value={draft.client_name}
              onChange={(e) => set("client_name", e.target.value)}
              placeholder="Client's company"
            />
          )}
        </div>
      </div>
    );
  } else if (at.startsWith("q:")) {
    const q = questionById.get(at.slice(2))!;
    body = (
      <div className="flex flex-col gap-3" data-field={q.id}>
        <Bubble id="esther-ask" mood="ask">
          <p className="font-medium">{q.question}</p>
          <p className="mt-1 text-xs text-muted-foreground">{q.why}</p>
        </Bubble>
        <div className="flex flex-col gap-2 sm:pl-12">
          <ExtraAnswer
            q={q}
            value={draft.extra[q.id] ?? ""}
            onChange={(v) => setDraft((d) => ({ ...d, extra: { ...d.extra, [q.id]: v } }))}
            onChosen={answerAndGo}
          />
        </div>
      </div>
    );
  } else {
    const k = at as FieldKey;
    body = (
      <div className="flex flex-col gap-3" data-field={k}>
        <Bubble id="esther-ask" mood="ask">
          <p className="font-medium">{QUESTION[k].ask}</p>
          {QUESTION[k].help ? <p className="mt-1 text-xs text-muted-foreground">{QUESTION[k].help}</p> : null}
          <SourceLine
            source={sourceOf[k]}
            quote={
              k === "blackout"
                ? scan.blackout.quote || scan.blackout_notes.quote
                : k === "regulated_industry"
                  ? scan.regulated_industry.quote || scan.regulated_type.quote
                  : scan[k].quote
            }
          />
        </Bubble>
        <div className="flex flex-col gap-2 sm:pl-12">{field(k)}</div>
      </div>
    );
  }

  const optional = at === "primary_goal" || at.startsWith("q:");
  const nextLabel = at === "intro" ? "Let's go" : fromReview ? "Done" : optional && !answeredValue(at, draft) ? "Skip" : "Next";

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (at === "review") {
            if (!missing.length) onBuild();
          } else if (answered(at)) goNext();
        }}
        data-testid="esther-step"
        data-step={at}
      >
        {qIndex >= 0 && !fromReview ? (
          <div className="flex items-center gap-3" aria-label={`Question ${qIndex + 1} of ${questions.length}`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-chart-2 transition-[width] duration-300"
                style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{`${qIndex + 1} of ${questions.length}`}</span>
          </div>
        ) : null}
        <div key={at} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {body}
        </div>
        {/* Enter submits from a text box. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>

      <DialogFooter className="sticky -bottom-4 z-10 gap-2 bg-popover sm:items-center">
        {at === "review" ? (
          <p className="text-xs text-muted-foreground sm:mr-auto" aria-live="polite" data-testid="esther-missing">
            {missing.length ? `Still to answer: ${missing.join(", ")}` : "All set. Esther will draft the line items next."}
          </p>
        ) : null}
        <Button type="button" variant="outline" className="gap-1.5" onClick={goBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        {at === "review" ? (
          <Button type="button" className="gap-2" disabled={missing.length > 0} onClick={onBuild}>
            <Sparkles className="size-4" aria-hidden />
            Build my estimate
          </Button>
        ) : (
          <Button type="button" className="gap-1.5" disabled={!answered(at)} onClick={goNext}>
            {nextLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** Has an optional step actually been answered (for "Skip" vs "Next")? */
function answeredValue(at: StepId, d: DetailsDraft): boolean {
  if (at === "primary_goal") return d.primary_goal != null;
  if (at.startsWith("q:")) return Boolean(d.extra[at.slice(2)]?.trim());
  return true;
}

function DateAnswer({
  label,
  noneLabel,
  value,
  onChange,
  onNone,
}: {
  label: string;
  noneLabel: string;
  value: string | null;
  onChange: (v: string) => void;
  onNone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chips
        label={label}
        value={value === "" ? "none" : null}
        onChange={() => {
          onChange("");
          onNone();
        }}
        options={[{ value: "none", label: noneLabel }]}
      />
      <span className="text-xs text-muted-foreground">or</span>
      <Input
        type="date"
        aria-label={`${label}: pick a date`}
        className={cn("h-10 w-auto", value && "border-primary ring-1 ring-primary")}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ExtraAnswer({
  q,
  value,
  onChange,
  onChosen,
}: {
  q: ScanResult["questions"][number];
  value: string;
  onChange: (v: string) => void;
  onChosen: () => void;
}) {
  const NOT_SURE = "";
  const options =
    q.kind === "yes_no" ? ["Yes", "No"] : q.kind === "choice" ? q.options.slice(0, 6) : [];
  return (
    <>
      {options.length ? (
        <Chips
          label={q.question}
          value={value}
          onChange={(v) => {
            onChange(v);
            onChosen();
          }}
          options={[...options.map((o) => ({ value: o, label: o })), { value: NOT_SURE, label: "Not sure" }]}
        />
      ) : (
        <Input
          aria-label={q.question}
          autoFocus
          type={q.kind === "number" ? "number" : "text"}
          inputMode={q.kind === "number" ? "numeric" : undefined}
          className="max-w-xs"
          placeholder={q.kind === "number" ? "A number" : "Your answer"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {q.suggested && value !== q.suggested ? (
        <button
          type="button"
          onClick={() => {
            onChange(q.suggested);
            onChosen();
          }}
          className="flex min-h-6 w-fit items-center gap-1.5 text-xs text-primary dark:text-indigo-300 underline-offset-4 hover:underline"
        >
          <Wand2 className="size-3" aria-hidden />
          {`Use my guess: ${q.suggested}`}
        </button>
      ) : null}
      <p className="text-xs text-muted-foreground">{"Not sure? Skip it — I'll assume, and the assumption goes on the quote."}</p>
    </>
  );
}
