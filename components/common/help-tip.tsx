"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function HelpTip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            className
          )}
          aria-label={label}
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[min(20rem,calc(100vw-2rem))] px-3 py-2.5 text-left font-normal leading-relaxed"
      >
        <div className="space-y-2 text-xs">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}
