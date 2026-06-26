"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { DiscoveryField } from "@/components/features/discovery/DiscoveryField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DISCOVERY_SECTIONS,
  getSectionQuestions,
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
};

export function DiscoveryWizard({
  project,
  onChange,
  onViewEstimate,
}: DiscoveryWizardProps) {
  const [section, setSection] = React.useState(1);

  const unanswered = React.useMemo(
    () => unansweredBySection(project),
    [project],
  );
  const current = DISCOVERY_SECTIONS.find((s) => s.n === section)!;
  const questions = getSectionQuestions(section, project);
  const isLast = section === DISCOVERY_SECTIONS.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
      {/* Section rail */}
      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {DISCOVERY_SECTIONS.map((s) => {
          const active = s.n === section;
          const open = unanswered[s.n] ?? 0;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => setSection(s.n)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors lg:shrink",
                active
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  open === 0
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {open === 0 ? <Check className="size-3.5" /> : s.n}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title}</span>
                <span className="block text-[0.7rem] text-muted-foreground">
                  {open === 0 ? "Complete" : `${open} required left`}
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
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pb-5">
          {questions.map((q) => (
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
