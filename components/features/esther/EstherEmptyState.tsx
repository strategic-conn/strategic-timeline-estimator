"use client";

import { FileText, Sparkles } from "lucide-react";

import { EstherAvatar } from "@/components/features/esther/EstherMessage";
import { Button } from "@/components/ui/button";
import { ESTHER_GREETING, ESTHER_SUGGESTIONS } from "@/lib/esther/sample";

type EstherEmptyStateProps = {
  onPick: (prompt: string) => void;
  onUseSample: () => void;
};

export function EstherEmptyState({ onPick, onUseSample }: EstherEmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-8 text-center sm:py-12">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground shadow-md">
        <Sparkles className="size-7" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Meet Esther</h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {ESTHER_GREETING}
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        {ESTHER_SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
          >
            <EstherAvatar />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {s.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Button variant="outline" size="sm" className="gap-2" onClick={onUseSample}>
        <FileText className="size-4" aria-hidden />
        Try a sample brief
      </Button>
    </div>
  );
}
