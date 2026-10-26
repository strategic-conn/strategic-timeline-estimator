"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  Merge,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { formatAmount } from "@/lib/constants/proposal-estimator";
import {
  DEFAULT_HOURLY_RATES,
  rateFor,
  type RateLevel,
} from "@/lib/pricing/hourly-rates";
import { cn } from "@/lib/utils";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";

/**
 * DEMO ONLY — the "Draft from client scope" flow with Esther, for showing the
 * idea before it is built (decided 2026-10-26). Nothing here reads or writes an
 * estimate, calls a model, or touches Supabase: the scope, the drafted lines
 * and their hours are fixed sample data (the Bespoke Tile Sample Box scope).
 * Only the prices are real — the workspace's own hourly rates.
 *
 * ponytail: hard-coded fixtures on purpose. When the real feature lands this
 * file is replaced, not extended.
 */

type Source = "catalog" | "esther";
type DraftLine = {
  id: string;
  section: number;
  title: string;
  source: Source;
  role: string;
  level: RateLevel;
  /** Esther's lines carry a range; catalog lines one fixed figure. */
  low: number;
  likely: number;
  high: number;
  confidence: "exact" | "high" | "medium" | "low";
  refs: string[];
  merged?: boolean;
  note: string;
};

const SECTIONS = ["Sample boxes and pop-up", "Sticky cart", "Optimization"];

const SCOPE: { title: string; items: [string, string, string][] }[] = [
  {
    title: "Section 1 & 2 · Sample boxes and pop-up",
    items: [
      ["s1", "Small Sample Box", "allow 5 samples at the current $25.00"],
      ["s2", "Medium Sample Box", "allow 7 samples at the current $30.00"],
      ["s3", "Custom Mosaic Sample Box", "flat-rate shipping from $30.00 to $35.00"],
      ["s4", "Custom Mosaic + 7 Loose Pieces", "include 7 loose pieces at no charge, calculated correctly"],
      ["s5", "Product Selection Updates", "add Courtney's products to the Custom Mosaic selection"],
      ["s6", "Backup & Testing", "full backup first, then test configurations, pricing and selections"],
      ["s7", "Pop-Up Removal", "remove the sample page pop-up, keep the layout"],
      ["s8", "Sample Package Messaging", "Bespoke Studio will update the explanatory wording"],
    ],
  },
  {
    title: "Section 3 · Sticky cart",
    items: [
      ["s9", "Sticky, Collapsible Cart", "cart stays at the bottom on desktop and mobile"],
      ["s10", "Cart Visibility", "expand to review, collapse while browsing"],
      ["s11", "Selection Management", "clearer view, easy removal"],
      ["s12", "Checkout Accessibility", "checkout always within reach"],
      ["s13", "Dynamic Cart Updates", "updates as items are added, removed or changed"],
    ],
  },
  {
    title: "Section 4 · Optimization",
    items: [
      ["s14", "Plugin Cleanup", "remove unnecessary plugins"],
      ["s15", "LiteSpeed Caching", "faster page loading"],
      ["s16", "CSS & JavaScript Optimization", "reduce loading demands"],
      ["s17", "Image Optimization", "compress images to WebP"],
      ["s18", "Performance Testing", "four pages, desktop and mobile"],
    ],
  },
];

const fixed = (h: number) => ({ low: h, likely: h, high: h, confidence: "exact" as const });

const LINES: DraftLine[] = [
  { id: "L1", section: 0, title: "Update Small (5) and Medium (7) sample box limits", source: "esther", role: "IT", level: 1, low: 2, likely: 3, high: 4, confidence: "medium", refs: ["s1", "s2"], note: "Two items, one change: product limits only; prices stay $25 and $30." },
  { id: "L2", section: 0, title: "Custom Mosaic flat-rate shipping $30 → $35", source: "esther", role: "IT", level: 1, low: 1, likely: 1.5, high: 2, confidence: "high", refs: ["s3"], note: "Like catalog \"Shipping rules\" (6 h), but this is one value change on an existing rule." },
  { id: "L3", section: 0, title: "Custom Mosaic box: 7 loose pieces at no charge, priced correctly", source: "esther", role: "IT", level: 2, low: 4, likely: 6, high: 8, confidence: "medium", refs: ["s4"], note: "Custom pricing logic so the free pieces calculate in the cart." },
  { id: "L4", section: 0, title: "Add Courtney's products to the Custom Mosaic selection", source: "esther", role: "IT", level: 1, low: 2, likely: 3, high: 4, confidence: "medium", refs: ["s5"], note: "Depends on the product list from Courtney (see questions)." },
  { id: "L5", section: 0, title: "Full backup before changes", source: "catalog", role: "IT", level: 1, ...fixed(1), refs: ["s6"], note: "Catalog: \"Full backup before deployment\"." },
  { id: "L6", section: 0, title: "Test sample configurations, pricing and cart", source: "esther", role: "QA Tester", level: 1, low: 2, likely: 2.5, high: 3, confidence: "high", refs: ["s6"], note: "The testing half of \"Backup & Testing\"." },
  { id: "L7", section: 0, title: "Remove the sample page pop-up", source: "esther", role: "IT", level: 1, low: 1, likely: 1.5, high: 2, confidence: "high", refs: ["s7"], note: "Keep the current sample ordering layout." },
  { id: "L8", section: 1, title: "Sticky, collapsible cart (desktop and mobile, live updates)", source: "esther", role: "IT", level: 2, low: 10, likely: 12, high: 16, confidence: "medium", refs: ["s9", "s10", "s11", "s12", "s13"], merged: true, note: "Five bullets describe one feature. Based on catalog \"Cart functionality\" (5 h) plus sticky, collapsible and mobile behaviour." },
  { id: "L9", section: 2, title: "Plugin cleanup", source: "esther", role: "IT", level: 2, low: 2, likely: 3, high: 4, confidence: "low", refs: ["s14"], note: "Low confidence: depends on how many plugins the site runs. Do after the backup." },
  { id: "L10", section: 2, title: "LiteSpeed caching", source: "catalog", role: "IT", level: 2, ...fixed(3), refs: ["s15"], note: "Catalog: \"Configure caching and CDN\"." },
  { id: "L11", section: 2, title: "CSS and JavaScript optimization", source: "catalog", role: "IT", level: 2, ...fixed(6), refs: ["s16"], note: "Catalog: \"Performance Core Web Vitals optimization\"." },
  { id: "L12", section: 2, title: "Image optimization to WebP", source: "catalog", role: "IT", level: 1, ...fixed(3), refs: ["s17"], note: "Catalog: \"Optimize images and media\"." },
  { id: "L13", section: 2, title: "Performance test, 4 pages, desktop and mobile", source: "esther", role: "QA Tester", level: 1, low: 2, likely: 2.5, high: 3, confidence: "high", refs: ["s18"], note: "Which four pages is a question for the client." },
];

const QUESTIONS = [
  "Who sends Courtney's product list, and by when?",
  "Which four pages are the performance test pages?",
  "Do the 7 free loose pieces change the shipping weight or price?",
];

const SAMPLE_SCOPE = `Custom Website Enhancements

SECTION 1 & 2. Sample Box Updates & Sample Page Pop-Up Removal
Small Sample Box - Our team will update the Small Sample Box to allow 5 samples while maintaining the current price of $25.00.
Medium Sample Box - Strategic Connection will update the Medium Sample Box to allow 7 samples while maintaining the current price of $30.00.
Custom Mosaic Sample Box - Our team will increase flat-rate shipping from $30.00 to $35.00.
…

SECTION 3. Sticky Cart & Checkout Enhancement
Sticky, Collapsible Cart - Strategic Connection will implement a cart that remains accessible at the bottom of the page on both desktop and mobile devices.
…

SECTION 4. Technical Website Optimization
Plugin Cleanup - Our team will review and remove unnecessary plugins that may be affecting website performance.
LiteSpeed Caching - Strategic Connection will implement LiteSpeed caching…`;

const DRAFT_STEPS = [
  "Reading the scope",
  "Matching your catalog and task library",
  "Sizing 8 new items",
];

type Step = "paste" | "drafting" | "review" | "added";

const hrs = (n: number) => `${Math.round(n * 10) / 10} h`;

// ── Small shared pieces ────────────────────────────────────────────────────

function DemoStrip() {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">Demo UI only.</span>{" "}
        Nothing is saved, Esther isn&apos;t called, and the scope, lines and
        hours are sample data. Prices use your real hourly rates.
      </span>
    </p>
  );
}

const STEP_LABELS = ["Paste the scope", "Review Esther's draft", "Add to the estimate"];

function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
      {STEP_LABELS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            i === current
              ? "border-primary bg-primary/10 font-medium text-foreground"
              : i < current
                ? "border-border bg-muted/40 text-foreground"
                : "border-border text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              i === current
                ? "bg-primary text-primary-foreground"
                : i < current
                  ? "bg-emerald-600 text-white"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < current ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          {/* Short labels on a phone; the full one stays the accessible name. */}
          <span className="hidden truncate sm:inline">{label}</span>
          <span className="sm:hidden" aria-hidden>
            {["Paste", "Review", "Add"][i]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SourceBadge({ source }: { source: Source }) {
  return source === "catalog" ? (
    <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">Catalog</Badge>
  ) : (
    <Badge className="gap-1 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300">
      <Sparkles className="size-3" aria-hidden />
      Esther
    </Badge>
  );
}

const CONF_STYLE: Record<DraftLine["confidence"], string> = {
  exact: "bg-emerald-500",
  high: "bg-emerald-500",
  medium: "bg-sky-500",
  low: "bg-amber-500",
};

function Confidence({ level }: { level: DraftLine["confidence"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        level === "low" ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      <span className={cn("size-2 rounded-full", CONF_STYLE[level])} aria-hidden />
      {level === "exact" ? "Exact" : level === "low" ? "Low confidence — check" : `${level[0].toUpperCase()}${level.slice(1)} confidence`}
    </span>
  );
}

function ScopeList({ highlighted }: { highlighted: Set<string> }) {
  return (
    <div className="flex flex-col gap-4">
      {SCOPE.map((sec) => (
        <div key={sec.title} className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</p>
          {sec.items.map(([id, title, text]) => (
            <p
              key={id}
              className={cn(
                "rounded-md px-2 py-1.5 text-sm leading-relaxed transition-colors",
                highlighted.has(id) && "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]",
                id === "s8" && "text-muted-foreground line-through",
              )}
            >
              <span className="font-medium">{title}</span>
              {` — ${text}`}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── The demo ───────────────────────────────────────────────────────────────

export function ScopeDraftDemo() {
  const { canExportProposals } = usePermissions();
  const storeRates = useHourlyRatesStore((s) => s.rates);
  const rates = storeRates.length ? storeRates : DEFAULT_HOURLY_RATES;

  const [step, setStep] = React.useState<Step>("paste");
  const [scopeText, setScopeText] = React.useState(SAMPLE_SCOPE);
  const [draftStep, setDraftStep] = React.useState(0);
  const [off, setOff] = React.useState<Record<string, boolean>>({});
  const [hours, setHours] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState("L8");
  const [phase1, setPhase1] = React.useState(false);

  // The pretend "Esther is drafting" pause: three progress lines, then review.
  React.useEffect(() => {
    if (step !== "drafting") return;
    if (draftStep >= DRAFT_STEPS.length) {
      setStep("review");
      return;
    }
    const t = window.setTimeout(() => setDraftStep((n) => n + 1), 900);
    return () => window.clearTimeout(t);
  }, [step, draftStep]);

  const view = LINES.map((l) => {
    const on = !off[l.id];
    const needsHours = l.source === "esther" && phase1;
    const likely = hours[l.id] ?? l.likely;
    const rate = rateFor(rates, l.role, l.level) ?? 100;
    return { ...l, on, needsHours, likely, amount: Math.round(likely * rate) };
  });
  const counted = view.filter((l) => l.on && !l.needsHours);
  const waiting = view.filter((l) => l.on && l.needsHours).length;
  const total = {
    count: counted.length,
    low: counted.reduce((s, l) => s + l.low, 0),
    likely: counted.reduce((s, l) => s + l.likely, 0),
    high: counted.reduce((s, l) => s + l.high, 0),
    amount: counted.reduce((s, l) => s + l.amount, 0),
  };
  const highlighted = new Set(LINES.find((l) => l.id === selected)?.refs ?? []);

  if (!canExportProposals) return <ProposalAccessDenied />;

  const restart = () => {
    setOff({});
    setHours({});
    setSelected("L8");
    setStep("paste");
  };

  const top = (current: 0 | 1 | 2) => (
    <>
      <WorkspacePageHeader
        eyebrow="Estimator · Demo"
        title="Draft from client scope"
        description="Paste what the client sent. Esther matches your catalog and task library, drafts the rest, and you review every line before it is added."
        actions={
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/proposals">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Estimator
            </Link>
          </Button>
        }
      />
      <DemoStrip />
      <Stepper current={current} />
    </>
  );

  // ── 1. Paste ──
  if (step === "paste" || step === "drafting") {
    const drafting = step === "drafting";
    return (
      <div className="flex flex-col gap-5">
        {top(0)}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Client scope</CardTitle>
              <CardDescription>
                New estimate for Bespoke Tile &amp; Stone (sample client) · WordPress
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="demo-scope" className="sr-only">Client scope</Label>
                <Textarea
                  id="demo-scope"
                  value={scopeText}
                  onChange={(e) => setScopeText(e.target.value)}
                  disabled={drafting}
                  className="min-h-64 resize-y text-sm leading-relaxed lg:min-h-96"
                />
                <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Upload className="size-4 shrink-0" aria-hidden />
                    Or drop the client&apos;s .docx, .pdf or .txt file here
                  </span>
                  <span className="font-medium text-foreground">18 items found in 3 sections</span>
                </div>
              </div>

              {drafting ? (
                <div
                  className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
                  aria-live="polite"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-primary" aria-hidden />
                    Esther is drafting your lines
                  </p>
                  <ol className="flex flex-col gap-2 text-sm">
                    {DRAFT_STEPS.map((s, i) => (
                      <li
                        key={s}
                        className={cn(
                          "flex items-center gap-2",
                          i > draftStep && "text-muted-foreground",
                        )}
                      >
                        {i < draftStep ? (
                          <Check className="size-4 text-emerald-600" aria-hidden />
                        ) : i === draftStep ? (
                          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                        ) : (
                          <span className="size-4" aria-hidden />
                        )}
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {drafting ? (
                  <Button variant="outline" onClick={() => setStep("paste")}>
                    Cancel
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  className="gap-2"
                  disabled={drafting || !scopeText.trim()}
                  onClick={() => {
                    setDraftStep(0);
                    setStep("drafting");
                  }}
                >
                  <Sparkles className="size-4" aria-hidden />
                  Draft with Esther
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/20">
            <CardHeader>
              <CardTitle className="text-base">How Esther drafts it</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 text-sm">
              <ol className="flex flex-col gap-3">
                {[
                  ["Free matches first", "Each item is looked up in your catalog and task library. A match uses its known hours."],
                  ["Esther drafts the rest", "New work gets a title, a role and level, and an hours range, with a confidence. Duplicates are merged; other people's work is set aside."],
                  ["You approve every line", "Nothing reaches the estimate until you add it."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-medium">{t}</span>
                      <span className="text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2 border-t pt-4">
                <p className="font-medium">What Esther never decides</p>
                <ul className="flex flex-col gap-1.5 text-muted-foreground">
                  <li>The price: hours × your hourly rates</li>
                  <li>The timeline and who does the work: the planner</li>
                  <li>Sending to Zoho or raising a PO: your click</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── 3. Added ──
  if (step === "added") {
    const added = view.filter((l) => l.on);
    return (
      <div className="flex flex-col gap-5">
        {top(2)}
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          {`${added.length} lines added to "Custom Website Enhancements" (demo — nothing was saved).`}
        </p>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {`${added.length} lines · ${hrs(total.likely)} · ${formatAmount(total.amount)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              <div className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem_4.5rem_6rem] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Line</span>
                <span>Source</span>
                <span>Role</span>
                <span className="text-right">Hours</span>
                <span className="text-right">Amount</span>
              </div>
              {added.map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_6rem_6rem_4.5rem_6rem] md:items-center"
                >
                  <span className="font-medium md:font-normal">{l.title}</span>
                  <span className="justify-self-end md:justify-self-start"><SourceBadge source={l.source} /></span>
                  <span className="text-muted-foreground">{`${l.role} L${l.level}`}</span>
                  <span className="text-right tabular-nums md:hidden">
                    {l.needsHours ? "Needs hours" : `${hrs(l.likely)} · ${formatAmount(l.amount)}`}
                  </span>
                  <span className="hidden text-right tabular-nums md:inline">{l.needsHours ? "—" : hrs(l.likely)}</span>
                  <span className="hidden text-right tabular-nums md:inline">{l.needsHours ? "—" : formatAmount(l.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="gap-1">
                <CardTitle className="text-base">Sticky, collapsible cart</CardTitle>
                <CardDescription>Drafted by Esther from 5 sentences of the client&apos;s scope</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button onClick={() => toast.info("Demo only — nothing was saved to the library.")}>
                  Save to task library
                </Button>
                <p className="text-xs text-muted-foreground">
                  The next sticky-cart job would match this line for free, without asking Esther.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="gap-1">
                <CardTitle className="text-base">From the client&apos;s scope</CardTitle>
                <CardDescription>Printed on the PDF under Assumptions</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client dependencies</p>
                  <p>Bespoke Studio updates the sample package messaging.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open questions</p>
                  <ul className="list-disc pl-5">
                    {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("review")}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to the review
              </Button>
              <Button variant="ghost" className="flex-1 gap-2" onClick={restart}>
                <RotateCcw className="size-4" aria-hidden />
                Start the demo over
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Review ──
  const stats: [string, number, string][] = [
    ["Lines drafted", 13, "text-foreground"],
    ["From the catalog", 5, "text-emerald-700 dark:text-emerald-300"],
    ["Drafted by Esther", 8, "text-indigo-700 dark:text-indigo-300"],
    ["Not ours", 1, "text-muted-foreground"],
  ];

  return (
    <div className="flex flex-col gap-5">
      {top(1)}

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Review Esther&apos;s draft</h2>
            <span className="text-sm text-muted-foreground">18 items read from the client&apos;s scope</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([label, n, color]) => (
              <div key={label} className="rounded-lg border bg-muted/20 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={cn("text-2xl font-semibold tabular-nums", color)}>{n}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Merge className="size-4 shrink-0" aria-hidden />
              5 sticky-cart bullets merged into one line
            </span>
            <label className="flex items-center gap-2 text-muted-foreground">
              <Checkbox checked={phase1} onCheckedChange={(v) => setPhase1(v === true)} />
              Show phase 1 (before Esther)
            </label>
          </div>
          {phase1 ? (
            <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              Phase 1: the scope is split and matched to your catalog, but the 8 new lines need hours typed in before they can be added.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Phones and tablets: the scope folds away above the lines. */}
      <details className="group rounded-xl border bg-card xl:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
          Show the client&apos;s scope
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t px-4 py-3">
          <ScopeList highlighted={highlighted} />
        </div>
      </details>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        {/* Wide screens: the scope sits beside the lines and stays in view. */}
        <Card className="hidden xl:sticky xl:top-4 xl:flex xl:max-h-[calc(100dvh-2rem)] xl:flex-col">
          <CardHeader className="gap-1">
            <CardTitle className="text-base">Client&apos;s scope</CardTitle>
            <CardDescription>Click a line&apos;s title to see where it came from.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto">
            <ScopeList highlighted={highlighted} />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {SECTIONS.map((title, si) => {
            const lines = view.filter((l) => l.section === si);
            const sub = lines.filter((l) => l.on && !l.needsHours).reduce((s, l) => s + l.likely, 0);
            return (
              <Card key={title} className="gap-0 py-0">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">{hrs(sub)}</span>
                </div>
                <ul className="flex flex-col">
                  {lines.map((l) => (
                    <li
                      key={l.id}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[auto_minmax(0,1fr)_11rem_5.5rem] md:items-start",
                        l.id === selected && "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
                        !l.on && "opacity-55",
                      )}
                    >
                      <Checkbox
                        checked={l.on}
                        onCheckedChange={(v) => setOff((o) => ({ ...o, [l.id]: v !== true }))}
                        aria-label={`Include ${l.title}`}
                        className="mt-0.5"
                      />
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelected(l.id)}
                          className="text-left text-sm font-medium leading-snug hover:underline"
                        >
                          {l.title}
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <SourceBadge source={l.source} />
                          <span className="text-xs text-muted-foreground">{`${l.role} L${l.level}`}</span>
                          {l.needsHours ? null : <Confidence level={l.confidence} />}
                          {l.merged ? (
                            <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">5 → 1</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{l.note}</p>
                      </div>

                      {/* Hours + amount: one row under the text on a phone, their own
                          columns from md (`md:contents` lifts both into the grid). */}
                      <div className="col-start-2 flex items-center justify-between gap-3 md:contents">
                      <div className="flex items-center gap-2 md:justify-end">
                        {l.needsHours ? (
                          <>
                            <Label htmlFor={`need-${l.id}`} className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Needs hours
                            </Label>
                            <Input id={`need-${l.id}`} type="number" min={0} step={0.5} placeholder="h" className="h-8 w-20 border-amber-500/60" />
                          </>
                        ) : l.source === "catalog" ? (
                          <span className="text-sm font-semibold tabular-nums">{hrs(l.likely)}</span>
                        ) : (
                          <>
                            <span className="text-xs tabular-nums text-muted-foreground">{l.low}</span>
                            <Input
                              aria-label={`Likely hours for ${l.title}`}
                              type="number"
                              min={0}
                              step={0.5}
                              value={l.likely}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setHours((h) => ({ ...h, [l.id]: Number.isNaN(v) ? l.likely : v }));
                              }}
                              className="h-8 w-20 text-center font-semibold tabular-nums"
                            />
                            <span className="text-xs tabular-nums text-muted-foreground">{`${l.high} h`}</span>
                          </>
                        )}
                      </div>
                      <span className="text-sm tabular-nums text-muted-foreground md:pt-1.5 md:text-right">
                        {l.needsHours ? "" : formatAmount(l.amount)}
                      </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-sm">Not ours → client dependencies</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <span className="font-medium">Sample package messaging</span>
                {" — Bespoke Studio rewrites the wording. No hours; listed in the proposal so the client knows it's theirs."}
              </CardContent>
            </Card>
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-sm">Questions for the client → notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm">
                  {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">
            {`${total.count} lines · ${hrs(total.likely)} likely (${hrs(total.low)}–${hrs(total.high)}) · ${formatAmount(total.amount)}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {waiting
              ? `${waiting} lines still need hours · priced at your hourly rates`
              : "Priced by the app at your hourly rates, not by Esther"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setStep("paste")}>
            Back
          </Button>
          <Button className="flex-1 gap-2 sm:flex-none" onClick={() => setStep("added")}>
            {`Add ${total.count + waiting} lines (demo)`}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
