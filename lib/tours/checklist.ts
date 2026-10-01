import type { TourTarget } from "@/lib/tours/ids";
import type { TourId } from "@/lib/tours/tours";
import type { TourProgress } from "@/store/tour-store";
import type { UserRole } from "@/store/auth-store";

/**
 * The Getting started checklist (docs/onboarding-tour-plan.md §5a).
 *
 * ⚠️ Every item is DERIVED from real data — the person never ticks one, and
 * nothing about completion is stored. That is the point: the checklist cannot
 * say you did something you didn't. Only its dismissal is stored.
 *
 * `null` in an input means "not loaded yet"; the item then reads "unknown" and
 * the card waits rather than flashing every item as not done.
 */

export type ChecklistState = "done" | "todo" | "na" | "unknown";

export type ChecklistItem = {
  id: string;
  label: string;
  /** Shown under the label when there is nothing to do yet (state "na"). */
  naHint?: string;
  state: ChecklistState;
  /** "Show me": go here, then start this tour at this step. */
  action: { href: string; tourId: TourId; target?: TourTarget };
};

export type ChecklistInput = {
  role: UserRole;
  canCreateProject: boolean;
  canExportProposals: boolean;
  canManageTeam: boolean;
  /** Nav hrefs this person may open. */
  accessible: Set<string>;
  progress: TourProgress | null;
  hasAvatar: boolean;
  /** Has a weekly-hours row of their own. */
  hasWeeklyHours: boolean | null;
  /** Assignments of mine, by response. */
  assignments: { accepted: number; pending: number } | null;
  /** Logged any time at all (time_entries). */
  loggedAny: boolean | null;
  /** Where to send "Show me" for logging hours: an accepted task's board. */
  firstAcceptedTaskHref: string | null;
  ownsProject: boolean | null;
  /** Created an estimate themselves (not just anyone in the workspace). */
  ownsEstimate: boolean | null;
  teamSize: number | null;
  zohoConnected: boolean | null;
  /** False in demo mode: there is no server to connect Zoho through. */
  zohoAvailable: boolean;
};

const bool = (v: boolean | null): ChecklistState =>
  v == null ? "unknown" : v ? "done" : "todo";

export function checklistItems(i: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const can = (href: string) => i.accessible.has(href);
  const teamRole = i.role === "admin" || i.role === "manager";

  items.push({
    id: "welcome",
    label: "Take the welcome tour",
    state: i.progress == null ? "unknown" : bool(i.progress.welcome?.status === "completed"),
    action: { href: "", tourId: "welcome" },
  });

  items.push({
    id: "photo",
    label: "Add a profile photo",
    state: bool(i.hasAvatar),
    action: { href: "/settings", tourId: "settings-profile", target: "settings.avatar" },
  });

  // Admin + manager only: a member has no screen to set their own hours
  // (the inputs are on Workload's Team view), so the item would be a dead end.
  if (teamRole && can("/workload")) {
    items.push({
      id: "weekly-hours",
      label: "Set your weekly hours",
      state: bool(i.hasWeeklyHours),
      action: { href: "/workload", tourId: "workload-team", target: "workload.capacity" },
    });
  }

  if (i.role === "member" && can("/workload")) {
    const a = i.assignments;
    items.push({
      id: "respond",
      label: "Respond to your first assignment",
      naHint: "Nothing assigned to you yet",
      // Declining deletes the assignment row, so "responded" is only
      // knowable as "accepted at least one".
      state: a == null ? "unknown" : a.accepted > 0 ? "done" : a.pending > 0 ? "todo" : "na",
      action: { href: "/workload", tourId: "workload-mine", target: "workload.pending" },
    });
  }

  if (i.role === "member" && can("/projects")) {
    const a = i.assignments;
    const state: ChecklistState =
      a == null
        ? "unknown"
        : a.accepted === 0
          ? "na"
          : i.loggedAny == null
            ? "unknown"
            : i.loggedAny
              ? "done"
              : "todo";
    items.push({
      id: "log-hours",
      label: "Log your first hours",
      naHint: "Once you've accepted a task",
      state,
      action: {
        href: i.firstAcceptedTaskHref ?? "/workload",
        tourId: i.firstAcceptedTaskHref ? "board" : "workload-mine",
        target: i.firstAcceptedTaskHref ? "board.card" : undefined,
      },
    });
  }

  if (i.canCreateProject && can("/projects")) {
    items.push({
      id: "project",
      label: "Create your first project",
      state: bool(i.ownsProject),
      action: { href: "/projects", tourId: "projects", target: "projects.new" },
    });
  }

  if (i.canExportProposals && can("/proposals")) {
    items.push({
      id: "estimate",
      label: "Create your first estimate",
      state: bool(i.ownsEstimate),
      action: { href: "/proposals", tourId: "estimator", target: "estimator.new" },
    });
  }

  if (i.canManageTeam && can("/team")) {
    items.push({
      id: "invite",
      // Workspace-wide on purpose: an admin joining a staffed workspace has
      // nobody left to invite, and the item should not nag them.
      label: "Invite a teammate",
      state: i.teamSize == null ? "unknown" : bool(i.teamSize > 1),
      action: { href: "/team", tourId: "team", target: "team.invite" },
    });
  }

  if (i.role === "admin" && i.zohoAvailable) {
    items.push({
      id: "zoho",
      label: "Connect Zoho CRM",
      state: bool(i.zohoConnected),
      action: {
        href: "/settings?tab=workspace",
        tourId: "settings-workspace",
        target: "settings.zoho",
      },
    });
  }

  if (i.role === "viewer" && can("/gantt")) {
    items.push({
      id: "timeline",
      label: "Explore the Timeline",
      state: i.progress == null ? "unknown" : bool(i.progress.gantt?.status === "completed"),
      action: { href: "/gantt", tourId: "gantt" },
    });
  }

  return items;
}

/** Progress counts only items that can be done now; "na" never blocks 100%. */
export function checklistProgress(items: ChecklistItem[]): {
  done: number;
  total: number;
  ready: boolean;
  complete: boolean;
} {
  const counted = items.filter((x) => x.state !== "na");
  const done = counted.filter((x) => x.state === "done").length;
  const ready = items.every((x) => x.state !== "unknown");
  return { done, total: counted.length, ready, complete: ready && done === counted.length };
}
