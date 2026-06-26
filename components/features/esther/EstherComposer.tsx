"use client";

import * as React from "react";
import { Paperclip, SendHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROPOSAL_PLATFORM_OPTIONS } from "@/lib/proposal-catalog";
import { cn } from "@/lib/utils";
import type { ProposalPlatform } from "@/types/proposal.types";

type EstherComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  platform: ProposalPlatform;
  onPlatformChange: (p: ProposalPlatform) => void;
  attachmentName: string | null;
  onAttach: (file: File) => void;
  onClearAttachment: () => void;
  disabled?: boolean;
};

export function EstherComposer({
  value,
  onChange,
  onSend,
  platform,
  onPlatformChange,
  attachmentName,
  onAttach,
  onClearAttachment,
  disabled,
}: EstherComposerProps) {
  const fileRef = React.useRef<HTMLInputElement>(null);

  const canSend = !disabled && (value.trim().length > 0 || attachmentName !== null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/95 p-2 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
      {attachmentName ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{attachmentName}</span>
          <button
            type="button"
            onClick={onClearAttachment}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder="Paste a project brief, or attach a document…"
        disabled={disabled}
        className="min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAttach(file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            aria-label="Attach document"
            title="Attach a document"
          >
            <Paperclip className="size-4" />
          </Button>
          <Select
            value={platform}
            onValueChange={(v) => onPlatformChange(v as ProposalPlatform)}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="h-8 w-[10.5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPOSAL_PLATFORM_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          size="sm"
          className={cn("gap-1.5")}
          onClick={onSend}
          disabled={!canSend}
        >
          <SendHorizontal className="size-4" aria-hidden />
          Send
        </Button>
      </div>
    </div>
  );
}
