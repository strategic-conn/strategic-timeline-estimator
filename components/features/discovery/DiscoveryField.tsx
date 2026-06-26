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
  isQuestionRequired,
  type DiscoveryFieldId,
  type DiscoveryQuestion,
} from "@/lib/discovery/questions";
import { cn } from "@/lib/utils";
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
  const warn = question.warnWhen?.(project) ?? false;
  const fieldId = `disc-${question.id}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={fieldId} className="text-sm">
          {question.label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
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
      ) : question.type === "dropdown" ? (
        <Select
          value={typeof value === "string" && value ? value : undefined}
          onValueChange={(v) => onChange(question.id, v)}
        >
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {question.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : question.type === "textarea" ? (
        <Textarea
          id={fieldId}
          rows={3}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(question.id, e.target.value)}
        />
      ) : question.type === "number" ? (
        <Input
          id={fieldId}
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
