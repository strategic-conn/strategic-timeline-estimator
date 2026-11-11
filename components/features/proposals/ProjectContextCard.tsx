"use client";

import { Lightbulb, Plus } from "lucide-react";
import * as React from "react";

import { DiscoveryField } from "@/components/features/discovery/DiscoveryField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createEmptyDiscoveryProject } from "@/lib/discovery/constants";
import { contextOf, withContext } from "@/lib/discovery/context-inputs";
import { SETUP_SECTION, getSectionQuestions } from "@/lib/discovery/questions";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { DiscoveryProject } from "@/types/discovery.types";
import type { ClientQuote, ProposalLineItem } from "@/types/proposal.types";

/**
 * Setup → Project context: primary goal, redesign (+ current URL) and
 * regulated industry (+ type). Moved here from questionnaire section 1
 * (2026-11-12) so an estimate that goes straight to Line items still asks
 * them. Rendered with the questionnaire's own `DiscoveryField`, so the help
 * tips, impact notes and Required pills are exactly the same. Saved on
 * `proposals.context` (0054); `contextOf` falls back to the old answers.
 */
export function ProjectContextCard({
  quote,
  help,
}: {
  quote: ClientQuote;
  help?: React.ReactNode;
}) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  // The answers as the fields see them: the estimate's context over the
  // questionnaire (or a blank one), on the estimate's platform — which hides
  // the goal when the platform implies it (Shopify ⇒ e-commerce).
  const project = React.useMemo(() => {
    const base = (quote.discovery ?? createEmptyDiscoveryProject()) as DiscoveryProject;
    return withContext({ ...base, platform: quote.platform }, quote);
  }, [quote]);
  const questions = getSectionQuestions(SETUP_SECTION, project);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project context</CardTitle>
        <CardDescription>
          The goal is printed on the quote. A redesign or a regulated industry
          adds Discovery work.
        </CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {questions.map((q) => (
          <DiscoveryField
            key={q.id}
            question={q}
            project={project}
            onChange={(id, value) =>
              updateProposal(quote.id, {
                context: { ...(quote.context ?? {}), [id]: value },
              })
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

type Suggestion = {
  key: string;
  why: string;
  /** Lower-case fragment that, in any line's title, means it's already there. */
  match: string;
  line: Partial<ProposalLineItem>;
};

/**
 * Line items: what Setup's context says this job needs, offered as a line
 * with one click. A guided estimate gets these hours from the questionnaire
 * (Generate line items), so this shows only for a line-items-only estimate —
 * where a redesign or a regulated industry would otherwise change nothing.
 * Hours are the midpoint of the questionnaire's range; Project Manager work
 * lands in the Discovery & Strategy phase.
 */
export function ContextSuggestions({ quote }: { quote: ClientQuote }) {
  const addLineItem = useProposalEstimatorStore((s) => s.addLineItem);
  if (quote.discovery) return null;
  const ctx = contextOf(quote);
  const titles = quote.line_items.map((li) => li.title.toLowerCase());
  const all: Suggestion[] = [];
  if (ctx.is_redesign) {
    all.push({
      key: "redesign",
      why: "It's a redesign",
      match: "site audit",
      line: {
        title: ctx.current_url ? `Site audit of ${ctx.current_url} (redesign)` : "Site audit (redesign)",
        base_hours: 4,
        responsible: "Project Manager",
        level: 1,
        // The questionnaire's own range, not a guess — nothing for a dev to confirm.
        hours_confirmed: true,
      },
    });
  }
  if (ctx.regulated_industry) {
    all.push({
      key: "regulated",
      why: "It's a regulated industry",
      match: "compliance review",
      line: {
        title: "Compliance review (regulated industry)",
        base_hours: 6,
        responsible: "Project Manager",
        level: 1,
        // The questionnaire's own range, not a guess — nothing for a dev to confirm.
        hours_confirmed: true,
      },
    });
  }
  const open = all.filter((s) => !titles.some((t) => t.includes(s.match)));
  if (!open.length) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3"
      data-testid="context-suggestions"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Lightbulb className="size-4 text-primary" aria-hidden />
        From Setup → Project context
      </p>
      <ul className="flex flex-col gap-1.5">
        {open.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {`${s.why}: add `}
              <span className="font-medium">{s.line.title}</span>
              {` (${s.line.base_hours} h)?`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => addLineItem(quote.id, s.line)}
            >
              <Plus className="size-3.5" aria-hidden />
              Add line
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
