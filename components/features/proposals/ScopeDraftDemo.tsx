"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FlaskConical,
  Loader2,
  Merge,
  Upload,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
 * DEMO ONLY — the "Draft from client scope" flow, for showing the idea before
 * it is built (decided 2026-10-26). Nothing here reads or writes an estimate,
 * calls an AI, or touches Supabase: the scope, the drafted lines and their
 * hours are fixed sample data (the Bespoke Tile Sample Box scope). Only the
 * prices are real — the workspace's own hourly rates.
 *
 * ponytail: hard-coded fixtures on purpose. When the real feature lands this
 * file is replaced, not extended.
 */

type Source = "catalog" | "ai";
type DraftLine = {
  id: string;
  section: number;
  title: string;
  source: Source;
  role: string;
  level: RateLevel;
  /** AI lines carry a range; catalog lines one fixed figure. */
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
  { id: "L1", section: 0, title: "Update Small (5) and Medium (7) sample box limits", source: "ai", role: "IT", level: 1, low: 2, likely: 3, high: 4, confidence: "medium", refs: ["s1", "s2"], note: "Two items, one change: product limits only; prices stay $25 and $30." },
  { id: "L2", section: 0, title: "Custom Mosaic flat-rate shipping $30 → $35", source: "ai", role: "IT", level: 1, low: 1, likely: 1.5, high: 2, confidence: "high", refs: ["s3"], note: "Like catalog \"Shipping rules\" (6 h), but this is one value change on an existing rule." },
  { id: "L3", section: 0, title: "Custom Mosaic box: 7 loose pieces at no charge, priced correctly", source: "ai", role: "IT", level: 2, low: 4, likely: 6, high: 8, confidence: "medium", refs: ["s4"], note: "Custom pricing logic so the free pieces calculate in the cart." },
  { id: "L4", section: 0, title: "Add Courtney's products to the Custom Mosaic selection", source: "ai", role: "IT", level: 1, low: 2, likely: 3, high: 4, confidence: "medium", refs: ["s5"], note: "Depends on the product list from Courtney (see questions)." },
  { id: "L5", section: 0, title: "Full backup before changes", source: "catalog", role: "IT", level: 1, ...fixed(1), refs: ["s6"], note: "Catalog: \"Full backup before deployment\"." },
  { id: "L6", section: 0, title: "Test sample configurations, pricing and cart", source: "ai", role: "QA Tester", level: 1, low: 2, likely: 2.5, high: 3, confidence: "high", refs: ["s6"], note: "The testing half of \"Backup & Testing\"." },
  { id: "L7", section: 0, title: "Remove the sample page pop-up", source: "ai", role: "IT", level: 1, low: 1, likely: 1.5, high: 2, confidence: "high", refs: ["s7"], note: "Keep the current sample ordering layout." },
  { id: "L8", section: 1, title: "Sticky, collapsible cart (desktop and mobile, live updates)", source: "ai", role: "IT", level: 2, low: 10, likely: 12, high: 16, confidence: "medium", refs: ["s9", "s10", "s11", "s12", "s13"], merged: true, note: "Five bullets describe one feature. Based on catalog \"Cart functionality\" (5 h) plus sticky, collapsible and mobile behaviour." },
  { id: "L9", section: 2, title: "Plugin cleanup", source: "ai", role: "IT", level: 2, low: 2, likely: 3, high: 4, confidence: "low", refs: ["s14"], note: "Low confidence: depends on how many plugins the site runs. Do after the backup." },
  { id: "L10", section: 2, title: "LiteSpeed caching", source: "catalog", role: "IT", level: 2, ...fixed(3), refs: ["s15"], note: "Catalog: \"Configure caching and CDN\"." },
  { id: "L11", section: 2, title: "CSS and JavaScript optimization", source: "catalog", role: "IT", level: 2, ...fixed(6), refs: ["s16"], note: "Catalog: \"Performance Core Web Vitals optimization\"." },
  { id: "L12", section: 2, title: "Image optimization to WebP", source: "catalog", role: "IT", level: 1, ...fixed(3), refs: ["s17"], note: "Catalog: \"Optimize images and media\"." },
  { id: "L13", section: 2, title: "Performance test, 4 pages, desktop and mobile", source: "ai", role: "QA Tester", level: 1, low: 2, likely: 2.5, high: 3, confidence: "high", refs: ["s18"], note: "Which four pages is a question for the client." },
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
…
SECTION 3. Sticky Cart & Checkout Enhancement
Sticky, Collapsible Cart - Strategic Connection will implement a cart that remains accessible at the bottom of the page…
…
SECTION 4. Technical Website Optimization
Plugin Cleanup - Our team will review and remove unnecessary plugins…`;

const DRAFT_STEPS = [
  "Reading the scope…",
  "Matching your catalog and task library…",
  "Sizing 8 new items…",
];

type Step = "paste" | "drafting" | "review" | "added";

const hrs = (n: number) => `${Math.round(n * 10) / 10} h`;

function DemoBanner() {
  return (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <FlaskConical className="size-4" aria-hidden />
      <AlertTitle>Demo UI only</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">
        A design preview of &ldquo;Draft from client scope&rdquo;. Nothing is
        saved, no AI is called, and the scope, lines and hours are sample data.
        Only the prices use your real hourly rates.
      </AlertDescription>
    </Alert>
  );
}

export function ScopeDraftDemo() {
  const { canExportProposals } = usePermissions();
  const storeRates = useHourlyRatesStore((s) => s.rates);
  const rates = storeRates.length ? storeRates : DEFAULT_HOURLY_RATES;
  const rate = React.useCallback(
    (l: DraftLine) => rateFor(rates, l.role, l.level) ?? 100,
    [rates],
  );

  const [step, setStep] = React.useState<Step>("paste");
  const [scopeText, setScopeText] = React.useState(SAMPLE_SCOPE);
  const [draftStep, setDraftStep] = React.useState(0);
  const [off, setOff] = React.useState<Record<string, boolean>>({});
  const [hours, setHours] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState("L8");
  const [phase1, setPhase1] = React.useState(false);

  // The fake "drafting" pause: three progress lines, then the review.
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
    const needsHours = l.source === "ai" && phase1;
    const likely = hours[l.id] ?? l.likely;
    return { ...l, on, needsHours, likely, amount: likely * rate(l) };
  });
  const counted = view.filter((l) => l.on && !l.needsHours);
  const waiting = view.filter((l) => l.on && l.needsHours).length;
  const total = {
    count: counted.length,
    low: counted.reduce((s, l) => s + l.low, 0),
    likely: counted.reduce((s, l) => s + l.likely, 0),
    high: counted.reduce((s, l) => s + l.high, 0),
    amount: counted.reduce((s, l) => s + Math.round(l.amount), 0),
  };
  const highlighted = new Set(LINES.find((l) => l.id === selected)?.refs ?? []);

  if (!canExportProposals) return <ProposalAccessDenied />;

  const header = (
    <WorkspacePageHeader
      eyebrow="Estimator · Demo"
      title="Draft from client scope"
      description="Paste what the client sent; the catalog and your task library are matched first, AI drafts the rest, and you review every line before it is added."
      actions={
        <Button variant="outline" className="gap-2" asChild>
          <Link href="/proposals">
            <ArrowLeft className="size-4" aria-hidden />
            Back to Estimator
          </Link>
        </Button>
      }
    />
  );

  if (step === "paste" || step === "drafting") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <DemoBanner />
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>New estimate · Client scope</CardTitle>
            <CardDescription>
              Client: Bespoke Tile &amp; Stone (sample) · Platform: WordPress
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="demo-scope">Client scope</Label>
            <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-2">
              <Textarea
                id="demo-scope"
                rows={10}
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                disabled={step === "drafting"}
                className="bg-background text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <span className="flex items-center gap-1.5 text-primary">
                  <Upload className="size-3.5" aria-hidden />
                  Or drop a .docx, .pdf or .txt here
                </span>
                <span className="text-muted-foreground">18 items detected in 3 sections</span>
              </div>
            </div>
            {step === "drafting" ? (
              <ol className="flex flex-col gap-1.5 text-sm" aria-live="polite">
                {DRAFT_STEPS.map((s, i) => (
                  <li
                    key={s}
                    className={cn(
                      "flex items-center gap-2",
                      i > draftStep && "text-muted-foreground/60",
                    )}
                  >
                    {i === draftStep ? (
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                    ) : (
                      <span className="inline-block size-4 text-center text-xs" aria-hidden>
                        {i < draftStep ? "✓" : "·"}
                      </span>
                    )}
                    {s}
                  </li>
                ))}
              </ol>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {step === "drafting" ? (
                <Button variant="outline" onClick={() => setStep("paste")}>
                  Cancel
                </Button>
              ) : null}
              <Button
                className="gap-2"
                disabled={step === "drafting" || !scopeText.trim()}
                onClick={() => {
                  setDraftStep(0);
                  setStep("drafting");
                }}
              >
                Create &amp; draft lines
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "added") {
    const added = view.filter((l) => l.on);
    return (
      <div className="flex flex-col gap-6">
        {header}
        <DemoBanner />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {`${added.length} lines added · ${hrs(total.likely)} · ${formatAmount(total.amount)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">Line</th>
                    <th scope="col" className="px-2 py-2 font-medium">Source</th>
                    <th scope="col" className="px-2 py-2 font-medium">Role</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Hours</th>
                    <th scope="col" className="py-2 pl-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {added.map((l) => (
                    <tr key={l.id} className="border-t border-border/60">
                      <td className="py-2 pr-2">{l.title}</td>
                      <td className="px-2 py-2"><SourceBadge source={l.source} /></td>
                      <td className="px-2 py-2 text-muted-foreground">{`${l.role} L${l.level}`}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.needsHours ? "—" : hrs(l.likely)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{l.needsHours ? "—" : formatAmount(Math.round(l.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sticky, collapsible cart</CardTitle>
                <CardDescription>Drafted by AI from 5 sentences of the client&apos;s scope</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button onClick={() => toast.info("Demo only — nothing was saved to the library.")}>
                  Save to task library
                </Button>
                <p className="text-xs text-muted-foreground">
                  The next sticky-cart job would match this line for free, with no AI call.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
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
            <Button variant="outline" onClick={() => setStep("review")}>
              Back to the review
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOff({});
                setHours({});
                setStep("paste");
              }}
            >
              Start the demo over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review ──
  return (
    <div className="flex flex-col gap-4 pb-24">
      {header}
      <DemoBanner />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
          <span className="font-semibold">18 items read → 13 lines</span>
          <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">5 catalog</Badge>
          <Badge className="bg-teal-500/15 text-teal-800 dark:text-teal-300">0 library</Badge>
          <Badge className="bg-indigo-500/15 text-indigo-800 dark:text-indigo-300">8 drafted by AI</Badge>
          <Badge variant="secondary">1 not ours</Badge>
          <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <Merge className="size-4" aria-hidden />
            5 cart bullets merged into 1
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={phase1} onCheckedChange={(v) => setPhase1(v === true)} />
            Show phase 1 (no AI yet)
          </label>
        </CardContent>
      </Card>
      {phase1 ? (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Phase 1: the scope is split and matched to your catalog, but the 8 AI lines need hours typed in before they can be added.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client&apos;s scope</CardTitle>
            <CardDescription>Click a line&apos;s title to see which sentences it came from.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {SCOPE.map((sec) => (
              <div key={sec.title} className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</p>
                {sec.items.map(([id, title, text]) => (
                  <p
                    key={id}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-sm leading-relaxed",
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
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {SECTIONS.map((title, si) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {view.filter((l) => l.section === si).map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3",
                      l.id === selected ? "border-primary bg-primary/5" : "border-border/70",
                      !l.on && "opacity-55",
                    )}
                  >
                    <Checkbox
                      checked={l.on}
                      onCheckedChange={(v) => setOff((o) => ({ ...o, [l.id]: v !== true }))}
                      aria-label={`Include ${l.title}`}
                      className="mt-1"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(l.id)}
                          className="text-left text-sm font-semibold hover:underline"
                        >
                          {l.title}
                        </button>
                        <SourceBadge source={l.source} />
                        {l.merged ? (
                          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">merged 5 → 1</Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">{`${l.role} L${l.level}`}</span>
                        {l.needsHours ? (
                          <span className="flex items-center gap-1.5">
                            <Label htmlFor={`need-${l.id}`} className="text-xs font-semibold text-amber-800 dark:text-amber-300">Needs hours</Label>
                            <Input id={`need-${l.id}`} type="number" min={0} step={0.5} placeholder="h" className="h-8 w-20 border-amber-500/60" />
                          </span>
                        ) : l.source === "catalog" ? (
                          <span className="font-semibold">{hrs(l.likely)}</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{`${l.low} –`}</span>
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
                              className="h-8 w-20 font-semibold"
                            />
                            <span className="text-muted-foreground">{`– ${l.high} h`}</span>
                          </span>
                        )}
                        {l.needsHours ? null : (
                          <span className={cn("text-xs", l.confidence === "low" ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground")}>
                            {l.confidence === "low" ? "⚠ low confidence" : l.confidence === "exact" ? "exact" : `${l.confidence} confidence`}
                          </span>
                        )}
                        {l.needsHours ? null : (
                          <span className="tabular-nums text-muted-foreground">{formatAmount(Math.round(l.amount))}</span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{l.note}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Not ours → client dependencies</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <span className="font-medium">Sample package messaging</span>
                {" — Bespoke Studio rewrites the wording. No hours; listed in the proposal so the client knows it's theirs."}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Questions for the client → notes</CardTitle>
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

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {`${total.count} lines · ${hrs(total.low)}–${hrs(total.high)} (likely ${hrs(total.likely)}) · ≈ ${formatAmount(total.amount)}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {waiting
              ? `${waiting} lines still need hours · priced at your hourly rates`
              : "Priced by the app at your hourly rates, not by the AI"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("paste")}>Back</Button>
          <Button className="gap-2" onClick={() => setStep("added")}>
            {`Add ${total.count + waiting} lines (demo)`}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  return source === "catalog" ? (
    <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">Catalog</Badge>
  ) : (
    <Badge className="bg-indigo-500/15 text-indigo-800 dark:text-indigo-300">AI draft</Badge>
  );
}
