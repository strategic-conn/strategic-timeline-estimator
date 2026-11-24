"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleHelp, Clock3, FileText, TriangleAlert } from "lucide-react";
import { format, parseISO } from "date-fns";

import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";

import { needsDevConfirm } from "@/lib/estimator/send-checks";
import { cn } from "@/lib/utils";
import { EstherFace } from "@/components/features/esther-estimate/EstherFace";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * Line items tab → an Esther draft, arranged around what the reviewer has to
 * DO (changed 2026-11-24; it used to show everything at once):
 *  1. a short "Your review" list — hours to confirm, requests not priced,
 *     questions for the developer — each a count that opens its list, green
 *     when there's nothing left;
 *  2. her summary, two lines;
 *  3. "Where this came from" (the client's requests, the past estimates she
 *     was shown), folded into one line at the bottom.
 * Only on estimates Esther drafted (`context.esther`). The hours count is
 * live, so it drops as lines are confirmed.
 */
export function EstherDraftCard({ quote }: { quote: ClientQuote }) {
  const meta = quote.context?.esther;
  const proposals = useProposalEstimatorStore((s) => s.proposals);
  const [moreSummary, setMoreSummary] = React.useState(false);
  if (!meta) return null;

  // The past estimates she was shown. One deleted since is simply left out.
  const basedOn = (meta.based_on ?? [])
    .map((id) => proposals.find((p) => p.id === id))
    .filter((p) => p != null);
  const uploaded = meta.references_used ?? 0;
  const lines = quote.line_items.filter((li) => li.title.trim());
  const toConfirm = lines.filter(needsDevConfirm);
  const byId = new Map(meta.requirements.map((r) => [r.id, r]));
  const uncovered = meta.uncovered.map((id) => byId.get(id)).filter((r) => r != null);
  let when = "";
  try {
    when = format(parseISO(meta.drafted_at), "MMM d, yyyy");
  } catch {
    when = "";
  }
  const open = [toConfirm.length, uncovered.length, meta.open_questions.length].filter(Boolean).length;

  return (
    <details
      open
      className="group/card rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] to-chart-2/[0.07]"
      data-testid="esther-draft-card"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <EstherFace mood={open ? "idle" : "success"} className="size-8" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">{"Drafted by Esther"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {`${lines.length} lines from ${meta.file_name}${when ? ` · ${when}` : ""}`}
          </span>
        </span>
        <span
          className={cn(
            "hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline",
            open
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {open ? `${open} to review` : "Reviewed"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/card:rotate-180" aria-hidden />
      </summary>

      <div className="flex flex-col gap-3 border-t border-primary/15 px-3.5 py-3 text-sm">
        <div>
          <p className={cn("text-muted-foreground", !moreSummary && "line-clamp-2")}>{meta.summary}</p>
          {meta.summary.length > 160 ? (
            <button
              type="button"
              onClick={() => setMoreSummary((v) => !v)}
              className="mt-0.5 min-h-6 text-xs font-medium text-primary underline-offset-4 hover:underline dark:text-indigo-300"
            >
              {moreSummary ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your review</p>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-background/60">
            <ReviewItem
              testId="esther-to-confirm"
              done={!toConfirm.length}
              icon={<Clock3 className="size-4" aria-hidden />}
              title={
                toConfirm.length
                  ? `Confirm hours on ${toConfirm.length} new task${toConfirm.length === 1 ? "" : "s"}`
                  : "All hours confirmed"
              }
              hint="Not in your catalog, so Esther estimated them. Tap one to jump to it, then tick “Hours confirmed by a developer” in its details."
            >
              <ul className="flex flex-col gap-0.5">
                {toConfirm.map((li) => (
                  <li key={li.id}>
                    <button
                      type="button"
                      onClick={() => jumpToLine(li.id)}
                      className="flex min-h-8 w-full items-center justify-between gap-3 rounded px-1.5 text-left hover:bg-muted/60"
                    >
                      <span className="truncate">{li.title}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{`${li.base_hours} h`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ReviewItem>
            <ReviewItem
              done={!uncovered.length}
              icon={<TriangleAlert className="size-4" aria-hidden />}
              title={
                uncovered.length
                  ? `${uncovered.length} request${uncovered.length === 1 ? " isn't" : "s aren't"} priced yet`
                  : "Every request is priced"
              }
              hint="The client asked for these, but no line covers them. Add a line, or say they're out of scope in the assumptions."
            >
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {uncovered.map((r) => (
                  <li key={r.id}>{r.text}</li>
                ))}
              </ul>
            </ReviewItem>
            <ReviewItem
              done={!meta.open_questions.length}
              tone="info"
              icon={<CircleHelp className="size-4" aria-hidden />}
              title={
                meta.open_questions.length
                  ? `${meta.open_questions.length} question${meta.open_questions.length === 1 ? "" : "s"} for your developer`
                  : "No open questions"
              }
              hint="Things Esther couldn't settle from the document. Worth a look before the estimate goes out."
            >
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {meta.open_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </ReviewItem>
          </div>
        </div>

        <details className="group/src">
          <summary
            className="flex min-h-7 w-fit cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
            data-testid="esther-based-on"
          >
            <FileText className="size-3.5 shrink-0" aria-hidden />
            {`Built from ${meta.requirements.length} client request${meta.requirements.length === 1 ? "" : "s"} · ${
              basedOn.length
                ? `based on ${basedOn.length} past approved estimate${basedOn.length === 1 ? "" : "s"}`
                : "no past approved estimates on this platform yet"
            }${uploaded ? ` + ${uploaded} uploaded past estimate${uploaded === 1 ? "" : "s"}` : ""}`}
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open/src:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
            <div>
              <p className="mb-1 font-medium">Past approved estimates Esther followed</p>
              {basedOn.length ? (
                <p>
                  {basedOn.map((p, i) => (
                    <span key={p.id}>
                      {i ? ", " : ""}
                      <Link href={`/proposals/${p.id}`} className="text-primary underline-offset-4 hover:underline dark:text-indigo-300">
                        {p.title}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {"None yet. Esther gets more consistent as approved estimates and finished, time-logged tasks build up."}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 font-medium">{`What the client asked for (${meta.requirements.length})`}</p>
              <ul className="flex flex-col gap-2">
                {meta.requirements.map((r) => (
                  <li key={r.id} className="flex gap-2">
                    <span className="h-fit shrink-0 rounded bg-muted px-1.5 font-medium text-muted-foreground">{r.area}</span>
                    <span>
                      {r.text}
                      {r.quote ? <span className="block italic text-muted-foreground">{`“${r.quote}”`}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>
    </details>
  );
}

/** Scroll to a line on the Line items tab and flash it, so it's easy to spot. */
function jumpToLine(id: string) {
  const row = document.getElementById(`line-${id}`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("ring-2", "ring-amber-500", "ring-inset");
  setTimeout(() => row.classList.remove("ring-2", "ring-amber-500", "ring-inset"), 1600);
}

/** One row of "Your review": a count that opens its list; green when done. */
function ReviewItem({
  done,
  tone = "warn",
  icon,
  title,
  hint,
  testId,
  children,
}: {
  done: boolean;
  tone?: "warn" | "info";
  icon: React.ReactNode;
  title: string;
  hint: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        done
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : tone === "warn"
            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
            : "bg-primary/15 text-primary dark:text-indigo-300",
      )}
      aria-hidden
    >
      {done ? <Check className="size-4" /> : icon}
    </span>
  );
  if (done) {
    return (
      <div className="flex min-h-11 items-center gap-3 px-3 py-2">
        {badge}
        <span className="text-sm text-muted-foreground" data-testid={testId}>{title}</span>
      </div>
    );
  }
  return (
    <details className="group/item">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        {badge}
        <span className="min-w-0 flex-1 text-sm font-medium" data-testid={testId}>{title}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3 text-xs sm:pl-13">
        <p className="text-muted-foreground">{hint}</p>
        {children}
      </div>
    </details>
  );
}
