"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type ScopeView = "mine" | "team";

/**
 * The Mine / Team switch shared by Workload, Calendar and the Dashboard.
 *
 * One component because it was about to be written a third time. These three
 * pages answer the same question at two scopes, so the control that picks the
 * scope has to look and behave identically — a switch that sits in a different
 * place, or styles its selected state differently, reads as three unrelated
 * features rather than one idea.
 *
 * Renders nothing when the viewer cannot see the team scope: Member and Viewer
 * have exactly one scope, and a toggle with one reachable option is a control
 * that lies about what is available.
 */
export function MineTeamToggle({
  view,
  onChange,
  canSeeTeam,
}: {
  view: ScopeView;
  onChange: (v: ScopeView) => void;
  canSeeTeam: boolean;
}) {
  if (!canSeeTeam) return null;
  return (
    <div
      role="group"
      aria-label="Scope"
      // `w-fit self-start`: the header actions row stretches its children, which
      // made the bordered box span the full width with the two buttons huddled
      // at the left edge on a phone. `inline-flex` alone does not stop that.
      className="inline-flex w-fit self-start rounded-lg border border-border/60 bg-card/50 p-0.5 text-sm"
    >
      {(["mine", "team"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={cn(
            "rounded-md px-3 py-1 capitalize transition-colors",
            view === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "mine" ? "Mine" : "Team"}
        </button>
      ))}
    </div>
  );
}
