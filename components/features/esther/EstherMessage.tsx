"use client";

import * as React from "react";
import { Paperclip, Sparkles } from "lucide-react";

import { EstherAnalysisCard } from "@/components/features/esther/EstherAnalysisCard";
import { cn } from "@/lib/utils";
import type { EstherAnalysis, EstherMessage as EstherMessageType } from "@/types/esther.types";

type EstherMessageProps = {
  message: EstherMessageType;
  /** True while the proposal for this message's analysis is being created. */
  creating?: boolean;
  onCreateProposal: (analysis: EstherAnalysis) => void;
  onStartDiscovery: (analysis: EstherAnalysis) => void;
};

export function EstherMessage({
  message,
  creating,
  onCreateProposal,
  onStartDiscovery,
}: EstherMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
          {message.attachmentName ? (
            <div className="mb-1.5 flex items-center gap-1.5 border-b border-primary-foreground/20 pb-1.5 text-xs opacity-90">
              <Paperclip className="size-3.5" aria-hidden />
              <span className="truncate">{message.attachmentName}</span>
            </div>
          ) : null}
          <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <EstherAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card/50 px-3.5 py-2.5 text-sm">
          <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">
            {message.text}
          </p>
        </div>
        {message.kind === "analysis" ? (
          <EstherAnalysisCard
            analysis={message.analysis}
            creating={creating}
            onCreateProposal={() => onCreateProposal(message.analysis)}
            onStartDiscovery={() => onStartDiscovery(message.analysis)}
          />
        ) : null}
      </div>
    </div>
  );
}

export function EstherAvatar() {
  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-primary-foreground shadow-sm"
      aria-hidden
    >
      <Sparkles className="size-4" />
    </div>
  );
}

export function EstherTypingBubble() {
  return (
    <div className="flex gap-3">
      <EstherAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border/60 bg-card/50 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 animate-bounce rounded-full bg-muted-foreground/60",
            )}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
