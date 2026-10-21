"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Minus } from "lucide-react";

import { DiscoveryField } from "@/components/features/discovery/DiscoveryField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DISCOVERY_SECTIONS,
  SKIPPABLE_SECTIONS,
  getSectionQuestions,
  isSectionSkipped,
  unansweredBySection,
  type DiscoveryFieldId,
} from "@/lib/discovery/questions";
import { cn } from "@/lib/utils";
import type { DiscoveryProject } from "@/types/discovery.types";

type FieldValue = string | number | boolean | null;

type DiscoveryWizardProps = {
  project: DiscoveryProject;
  onChange: (id: DiscoveryFieldId, value: FieldValue) => void;
  onViewEstimate: () => void;
  /** Switch a section (3–8) in or out of this estimate. */
  onToggleSection?: (section: number, included: boolean) => void;
};

export function DiscoveryWizard({
  project,
  onChange,
  onViewEstimate,
  onToggleSection,
}: DiscoveryWizardProps) {
  const [section, setSection] = React.useState(1);

  const unanswered = React.useMemo(
    () => unansweredBySection(project),
    [project],
  );
  const current = DISCOVERY_SECTIONS.find((s) => s.n === section)!;
  const questions = getSectionQuestions(section, project);
  const isLast = section === DISCOVERY_SECTIONS.length;
  const skipped = isSectionSkipped(project, section);

  return (
    <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
      {/* Section rail — a compact numbered stepper on mobile (circles fit without
          scrolling), the detailed sidebar with titles/status on desktop. */}
      <nav className="flex items-center justify-between gap-1 overflow-x-auto pb-1 lg:flex-col lg:items-stretch lg:justify-normal lg:gap-2 lg:overflow-visible lg:pb-0">
        {DISCOVERY_SECTIONS.map((s) => {
          const active = s.n === section;
          const open = unanswered[s.n] ?? 0;
          const off = isSectionSkipped(project, s.n);
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => setSection(s.n)}
              aria-current={active ? "step" : undefined}
              aria-label={`Section ${s.n}: ${s.title}${
                off
                  ? " (left out)"
                  : open === 0
                    ? " (complete)"
                    : `, ${open} required left`
              }`}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl text-left text-sm transition-colors lg:shrink lg:border lg:px-3 lg:py-2",
                active
                  ? "lg:border-primary/50 lg:bg-primary/5"
                  : "lg:border-border/60 lg:hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2 lg:size-6 lg:ring-0",
                  off
                    ? "bg-muted text-muted-foreground"
                    : open === 0
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  active ? "ring-primary" : "ring-transparent",
                )}
              >
                {off ? (
                  <Minus className="size-3.5" />
                ) : open === 0 ? (
                  <Check className="size-3.5" />
                ) : (
                  s.n
                )}
                {/* Phones show no section titles, so the count rides on the circle. */}
                {open > 0 ? (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[0.6rem] font-bold text-white lg:hidden"
                  >
                    {open}
                  </span>
                ) : null}
              </span>
              <span className="hidden min-w-0 lg:block">
                <span
                  className={cn(
                    "block truncate font-medium",
                    off && "text-muted-foreground line-through",
                  )}
                >
                  {s.title}
                </span>
                <span
                  className={cn(
                    "block text-[0.7rem]",
                    off || open === 0
                      ? "text-muted-foreground"
                      : "font-medium text-amber-700 dark:text-amber-300",
                  )}
                >
                  {off
                    ? "Left out"
                    : open === 0
                      ? "Complete"
                      : `${open} required left`}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Section form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">
              {section}/{DISCOVERY_SECTIONS.length}
            </span>
            {current.title}
          </CardTitle>
          <CardDescription>{current.subtitle}</CardDescription>
          {onToggleSection && SKIPPABLE_SECTIONS.has(section) ? (
            <label className="mt-2 flex w-fit items-center gap-2 text-sm">
              <Checkbox
                checked={!skipped}
                onCheckedChange={(v) => onToggleSection(section, v === true)}
              />
              Include this section in the estimate
            </label>
          ) : null}
          {skipped ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Left out of this project — its questions aren&apos;t required
              and add no hours. Tick the box to bring it back; your answers
              are kept.
            </p>
          ) : (unanswered[section] ?? 0) > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              {`${unanswered[section]} required question${unanswered[section] === 1 ? "" : "s"} left in this section — highlighted below.`}
            </p>
          ) : (
            <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
              All required questions in this section are answered.
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pb-5">
          {skipped
            ? null
            : questions.map((q) => (
                <DiscoveryField
                  key={q.id}
                  question={q}
                  project={project}
                  onChange={onChange}
                />
              ))}

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSection((s) => Math.max(1, s - 1))}
              disabled={section === 1}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
            {isLast ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={onViewEstimate}
              >
                View estimate
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  setSection((s) => Math.min(DISCOVERY_SECTIONS.length, s + 1))
                }
              >
                Next
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
