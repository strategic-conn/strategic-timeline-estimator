"use client";

import { TriangleAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isBlank,
  isQuestionRequired,
  type DiscoveryFieldId,
  type DiscoveryQuestion,
} from "@/lib/discovery/questions";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/common/info-tip";
import { QUESTION_HELP } from "@/lib/discovery/question-help";
import type { DiscoveryProject } from "@/types/discovery.types";

type FieldValue = string | number | boolean | null;

type DiscoveryFieldProps = {
  question: DiscoveryQuestion;
  project: DiscoveryProject;
  onChange: (id: DiscoveryFieldId, value: FieldValue) => void;
};

export function DiscoveryField({
  question,
  project,
  onChange,
}: DiscoveryFieldProps) {
  const value = project[question.id];
  const required = isQuestionRequired(question, project);
  // Required and still blank: highlighted until answered, so the questions the
  // estimate actually needs stand out from the optional ones.
  const missing = required && isBlank(value, question.type);
  const warn = question.warnWhen?.(project) ?? false;
  const fieldId = `disc-${question.id}`;
  const help = QUESTION_HELP[question.id];
  const options = question.optionsFor
    ? question.optionsFor(project)
    : question.options ?? [];
  // A "range" stores its band's lower bound. Snap any other number (an exact
  // count typed before the bands existed, or one seeded from a brief) to the
  // band containing it, so the Select still shows the right selection.
  const selected =
    question.type === "range"
      ? typeof value === "number"
        ? [...options].reverse().find((o) => Number(o.value) <= value)?.value
        : undefined
      : typeof value === "string" && value
        ? value
        : undefined;

  return (
    <div
      data-required={required ? (missing ? "missing" : "answered") : undefined}
      className={cn(
        "flex flex-col gap-1.5",
        // The highlight sits in the gutter, so fields don't shift as it comes and goes.
        missing &&
          "-mx-3 rounded-lg border-l-4 border-amber-500 bg-amber-500/[0.06] px-3 py-2.5",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Label htmlFor={fieldId} className="text-sm">
            {question.label}
          </Label>
          {required ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide",
                missing
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-green-500/15 text-green-700 dark:text-green-400",
              )}
            >
              {missing ? "Required" : "✓ Required"}
            </span>
          ) : null}
          {help ? <InfoTip label={question.label}>{help}</InfoTip> : null}
        </div>
        {question.impact ? (
          <span className="hidden shrink-0 text-[0.7rem] text-muted-foreground sm:block">
            {question.impact}
          </span>
        ) : null}
      </div>

      {question.type === "toggle" ? (
        <YesNoToggle
          value={Boolean(value)}
          onChange={(v) => onChange(question.id, v)}
          id={fieldId}
        />
      ) : question.type === "dropdown" || question.type === "range" ? (
        <Select
          value={selected}
          onValueChange={(v) =>
            onChange(question.id, question.type === "range" ? Number(v) : v)
          }
        >
          <SelectTrigger id={fieldId} aria-required={required || undefined} className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : question.type === "textarea" ? (
        <Textarea
          id={fieldId}
          aria-required={required || undefined}
          rows={3}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(question.id, e.target.value)}
        />
      ) : question.type === "number" ? (
        <Input
          id={fieldId}
          aria-required={required || undefined}
          type="number"
          inputMode="numeric"
          min={question.min}
          max={question.max}
          value={value === null || value === undefined ? "" : String(value)}
          placeholder={question.placeholder}
          onChange={(e) =>
            onChange(
              question.id,
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          className="max-w-40 tabular-nums"
        />
      ) : (
        <Input
          id={fieldId}
          aria-required={required || undefined}
          type={question.type === "date" ? "date" : question.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(question.id, e.target.value)}
          className={question.type === "date" ? "max-w-52" : undefined}
        />
      )}

      {question.impact ? (
        <span className="text-[0.7rem] text-muted-foreground sm:hidden">
          {question.impact}
        </span>
      ) : null}
      {missing ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          Answer this for an accurate estimate. Blank required questions raise the risk score.
        </p>
      ) : null}
      {warn && question.warnText ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {question.warnText}
        </p>
      ) : null}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
  id,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <div
      id={id}
      role="group"
      className="inline-flex w-fit rounded-lg border border-border/70 bg-muted/40 p-0.5"
    >
      {[
        { label: "No", v: false },
        { label: "Yes", v: true },
      ].map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-md px-4 py-1 text-sm font-medium transition-colors",
              active
                ? opt.v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
