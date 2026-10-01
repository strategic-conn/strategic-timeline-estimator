"use client";

import * as React from "react";

import { SectionHelp } from "@/components/common/section-help";

/**
 * Section help for every page outside the Estimator (that one lives in
 * components/features/proposals/estimator-help.tsx) — the "?" in the top-right
 * corner of a page header or a section.
 *
 * ⚠️ This restates how each page behaves. Change an entry in the same commit
 * as the behaviour it describes, like the tour copy in lib/tours/tours.ts.
 *
 * ⚠️ Every space beside a{" "}<strong>/<em> is an explicit {" "}. The compiler
 * drops it when the neighbouring text holds an entity (&apos;), so the source
 * reads fine while the page shows "work?It isn't". e2e/estimator-help.spec.ts
 * checks this file too.
 */
const HELP = {
  // ── Page headers ───────────────────────────────────────────────────────────
  "page.dashboard": {
    label: "the dashboard",
    title: "Your starting point",
    body: (
      <>
        <p>
          <strong>Mine</strong>{" "}shows your numbers, what is due, how loaded
          you are and what changed recently.{" "}<strong>Team</strong>{" "}
          (admins and managers) shows who is carrying what.
        </p>
        <p>
          Every figure follows the same rules as the Workload page, so the two
          always agree. A dash (—) means the number is still loading, not
          zero.
        </p>
      </>
    ),
  },
  "page.projects": {
    label: "projects",
    title: "Every project in the workspace",
    body: (
      <>
        <p>
          A project is split into{" "}<strong>sprints</strong>{" "}— time-boxed
          chunks of work — plus a{" "}<strong>backlog</strong>{" "}of tasks not
          scheduled yet. Open a project to see them.
        </p>
        <p>
          <strong>New project</strong>{" "}(admins and managers) makes a blank
          one. A project from an approved estimate is made with{" "}
          <strong>Start project</strong>{" "}in the Estimator instead, with its
          sprints and tasks already laid out.
        </p>
        <p>
          Completed and archived projects stay here; use the status filter to
          find them.
        </p>
      </>
    ),
  },
  "page.project": {
    label: "this project",
    title: "One project: sprints, backlog, timeline",
    body: (
      <>
        <p>
          Each card is a{" "}<strong>sprint</strong>; open it to work on its
          task board. The{" "}<strong>backlog</strong>{" "}holds tasks that
          aren&apos;t in a sprint yet. The timeline below is drawn from the
          sprints&apos; dates.
        </p>
        <p>
          If the project came from an estimate,{" "}
          <strong>Sync schedule from estimate</strong>{" "}picks up changes to
          it — you see every added, renamed, re-houred or removed task first,
          and nothing changes until you confirm.
        </p>
        <p>
          <strong>Mark complete in Zoho</strong>{" "}appears once the project is
          completed. It moves the real Zoho deal, so press it only when the
          work is done.
        </p>
      </>
    ),
  },
  "page.calendar": {
    label: "the calendar",
    title: "What is happening when",
    body: (
      <>
        <p>
          Task due dates, sprint start and end dates, time off and US federal
          holidays, month by month. Click a day for the list.
        </p>
        <p>
          <strong>Mine</strong>{" "}is your own schedule;{" "}<strong>Team</strong>{" "}
          (admins and managers) adds everyone else&apos;s.
        </p>
        <p>
          A{" "}<strong>dashed amber</strong>{" "}outline is time off still waiting
          for approval. Only approved time off changes anyone&apos;s capacity.
          To ask for time off, go to Settings → Time off.
        </p>
      </>
    ),
  },
  "page.gantt": {
    label: "the timeline",
    title: "When each task is scheduled",
    body: (
      <>
        <p>
          One bar per task. A task in a sprint runs across the sprint&apos;s
          dates (or stops at its due date if that comes first). A backlog task
          runs from when it was created to its due date.
        </p>
        <p>
          This page only shows the schedule. To move a bar, change the
          sprint&apos;s dates or the task&apos;s due date. Click a bar to open
          the task on its board.
        </p>
      </>
    ),
  },
  "page.workload-mine": {
    label: "your workload",
    title: "How loaded you are",
    body: (
      <>
        <p>
          <strong>Open estimate</strong>{" "}is the hours on every task assigned
          to you that isn&apos;t done —{" "}<em>including</em>{" "}assignments you
          haven&apos;t answered yet.
        </p>
        <p>
          <strong>Utilization</strong>{" "}is that against your weekly hours
          (less approved time off and holidays). Over 100% means more work
          than time.
        </p>
        <p>
          <strong>Available</strong>{" "}is the working time left in this week
          after the hours you have logged. It is not spare capacity — you can
          have hours left this week and still be overloaded.
        </p>
        <p>A task leaves this page when it is moved to Done.</p>
      </>
    ),
  },
  "page.workload-team": {
    label: "team workload",
    title: "Who has room and who is overloaded",
    body: (
      <>
        <p>
          The same figures as each person&apos;s own Workload page: open work
          (accepted and still-pending assignments) against their weekly hours
          after approved time off and holidays.
        </p>
        <p>
          Each bar is coloured by task status, and an{" "}
          <strong>amber ring</strong>{" "}means over capacity. The overdue and
          pending counts open the tasks behind them.
        </p>
        <p>
          Weekly hours are set per person at the bottom of the page.
        </p>
      </>
    ),
  },
  "page.team": {
    label: "the team",
    title: "Who is in the workspace",
    body: (
      <>
        <p>
          The workspace is invite-only. Each person has one role:
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong>Admin</strong>{" "}— everything, including people, rates and
            Zoho.
          </li>
          <li>
            <strong>Manager</strong>{" "}— runs projects, estimates and time-off
            approvals.
          </li>
          <li>
            <strong>Member</strong>{" "}— works on tasks and logs time.
          </li>
          <li>
            <strong>Viewer</strong>{" "}— can look, can&apos;t change anything.
          </li>
        </ul>
        <p>
          The star button opens someone&apos;s{" "}<strong>work keys</strong>{" "}
          and skills — what work they can be given, and what they&apos;re good
          at.
        </p>
      </>
    ),
  },
  "page.activity": {
    label: "activity",
    title: "Everything that changed",
    body: (
      <>
        <p>
          Every change in the workspace, newest first and grouped by day:
          tasks, projects, sprints, comments, assignments, reactions and time
          logged.
        </p>
        <p>
          Search, or filter by project, kind of change and person. A
          project&apos;s own feed is on its page.
        </p>
      </>
    ),
  },
  "page.reports": {
    label: "reports",
    title: "Workspace-wide numbers",
    body: (
      <>
        <p>Worked out live from projects, tasks and logged time.</p>
        <p>
          <strong>Overdue</strong>{" "}means past its due date and not done.{" "}
          <strong>On-time delivery</strong>{" "}is the share of finished tasks
          that were done on or before their due date.
        </p>
        <p>A dash (—) means the number is still loading.</p>
      </>
    ),
  },
  "page.settings": {
    label: "settings",
    title: "Your account",
    body: (
      <>
        <p>
          <strong>Profile</strong>{" "}(name and photo),{" "}<strong>Skills</strong>{" "}
          and{" "}<strong>Time off</strong>{" "}are yours.{" "}
          <strong>Workspace</strong>{" "}(admins and managers) holds the hourly
          rates and the Zoho connection.
        </p>
      </>
    ),
  },
  "page.estimator": {
    label: "the estimator",
    title: "Scope and quote client work",
    body: (
      <>
        <p>
          Each estimate turns into a client PDF and can create or update a
          Zoho deal.
        </p>
        <p>
          <strong>List</strong>{" "}or{" "}<strong>Stages</strong>: Stages lays
          the estimates out like the Zoho pipeline, and dragging a card there
          moves the real deal in Zoho.
        </p>
        <p>
          <strong>Import from Zoho</strong>{" "}starts an estimate from an
          existing deal (and moves that deal to Discovery).{" "}
          <strong>New estimate</strong>{" "}starts from scratch.
        </p>
        <p>
          When the deal is won in Zoho, the estimate is approved automatically
          and{" "}<strong>Start project</strong>{" "}and{" "}<strong>Create PO</strong>{" "}
          appear on it.
        </p>
      </>
    ),
  },

  // ── Dashboard sections ─────────────────────────────────────────────────────
  "dash.due-soon": {
    label: "your work due soon",
    title: "What needs you first",
    body: (
      <>
        <p>
          Open tasks assigned to you that are overdue or due in the next 7
          days — highest priority first, then nearest due date.
        </p>
        <p>
          <strong>View</strong>{" "}opens the task on its board.
        </p>
      </>
    ),
  },
  "dash.my-work": {
    label: "my open work",
    title: "How much you are carrying",
    body: (
      <>
        <p>
          The ring splits your open tasks by status. Assignments you
          haven&apos;t answered yet count, because they are part of the plan.
        </p>
        <p>
          <strong>Utilisation</strong>{" "}is that work against your weekly hours,
          less approved time off and holidays.
        </p>
        <p>
          <strong>Available hours</strong>{" "}is the time left in this week after
          what you have logged — not spare capacity.
        </p>
      </>
    ),
  },
  "dash.activity": {
    label: "recent activity",
    title: "What changed lately",
    body: (
      <p>
        The five latest changes in the workspace.{" "}<strong>View all
        activity</strong>{" "}has the full feed with filters.
      </p>
    ),
  },
  "dash.team-chart": {
    label: "open tasks per person",
    title: "Open tasks per person",
    body: (
      <>
        <p>
          Each bar is one person&apos;s open tasks, coloured by status — so you
          can tell work nobody has started from work in progress or blocked.
        </p>
        <p>
          A task shared by two people counts once for each of them, because
          both are carrying it.
        </p>
      </>
    ),
  },
  "dash.status-mix": {
    label: "workspace status mix",
    title: "All open work, by status",
    body: (
      <p>
        Every open task in the workspace counted once, assigned or not.{" "}
        <strong>Blocked</strong>{" "}is the slice to chase.
      </p>
    ),
  },
  "dash.team-table": {
    label: "breakdown by person",
    title: "Breakdown by person",
    body: (
      <>
        <p>
          Busiest first.{" "}<strong>Open</strong>{" "}is accepted plus pending
          assignments — the figure a sprint is planned against.
        </p>
        <p>
          The overdue and pending counts open the tasks behind them.
        </p>
      </>
    ),
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  "project.timeline": {
    label: "the project timeline",
    title: "The project's schedule",
    body: (
      <>
        <p>
          Drawn from the sprints. When the project came from an estimate, this
          started as a draft — one sprint per phase — for the manager to
          adjust.
        </p>
        <p>
          To change it, edit a sprint&apos;s dates (the pencil on its card).
        </p>
      </>
    ),
  },
  "project.risk-buffer": {
    label: "the risk buffer",
    title: "Extra time for surprises",
    body: (
      <>
        <p>
          A forecast first: pick a percentage and see when the project would
          finish with that much slack. Nothing moves yet.
        </p>
        <p>
          <strong>Applying</strong>{" "}it shows every sprint&apos;s new dates
          for you to confirm, then rewrites them and resets the buffer to 0% —
          so it can&apos;t be applied twice by accident.
        </p>
        <p>Hours and prices never change.</p>
      </>
    ),
  },
  board: {
    label: "the task board",
    title: "Working the board",
    body: (
      <>
        <p>
          One column per status. Drag a card to change it — moving a task to{" "}
          <strong>Done</strong>{" "}is how work is finished, and it then leaves
          everyone&apos;s workload.
        </p>
        <p>
          Click a card to open it: accept or decline an assignment, log your
          hours once you have accepted, and comment. Tick cards to change
          several at once.
        </p>
        <p>
          <strong>Board / List / Table</strong>{" "}are the same tasks in three
          layouts. Press{" "}<strong>/</strong>{" "}to search and{" "}
          <strong>N</strong>{" "}to add a task.
        </p>
      </>
    ),
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  "calendar.day": {
    label: "the selected day",
    title: "The day you picked",
    body: (
      <p>
        Everything on that day — tasks due, sprints starting or ending, who is
        away and any holiday — with links to each task.
      </p>
    ),
  },
  "calendar.legend": {
    label: "the legend",
    title: "Reading the colours",
    body: (
      <p>
        Task dots use the same status colours as the board. Time off with a{" "}
        <strong>dashed amber</strong>{" "}outline is still waiting for approval
        and doesn&apos;t change anyone&apos;s capacity yet.
      </p>
    ),
  },

  // ── Workload ───────────────────────────────────────────────────────────────
  "workload.mine-work": {
    label: "your open work",
    title: "Your open work, task by task",
    body: (
      <>
        <p>
          The bar is coloured by task status; an{" "}<strong>amber ring</strong>{" "}
          means you are over your weekly hours.
        </p>
        <p>
          Tasks marked{" "}<strong>pending</strong>{" "}are waiting for you to
          accept, decline or pass. Click a task to open it on its board.
        </p>
      </>
    ),
  },
  "workload.people": {
    label: "load by person",
    title: "Load by person",
    body: (
      <>
        <p>
          <strong>Utilization</strong>{" "}= open estimated hours (accepted and
          pending) ÷ that person&apos;s weekly hours after time off and
          holidays.
        </p>
        <p>
          <strong>Available</strong>{" "}is the time left in their week after the
          hours they logged — not spare capacity.
        </p>
      </>
    ),
  },
  "workload.capacity": {
    label: "weekly capacity",
    title: "Weekly hours per person",
    body: (
      <p>
        How many hours each person works in a normal week (40 unless changed).
        Time off and holidays are taken off automatically, so don&apos;t lower
        this for a week of leave. Press Enter or click away to save.
      </p>
    ),
  },

  // ── Team ───────────────────────────────────────────────────────────────────
  "team.invite": {
    label: "invites",
    title: "Inviting someone",
    body: (
      <>
        <p>
          Enter their email and pick a role. They get an email to set a
          password; until they accept, they show as invited.
        </p>
        <p>
          You can limit which pages someone can open when you invite them, or
          later from the sliders button on their row.
        </p>
      </>
    ),
  },
  "team.members": {
    label: "members",
    title: "Members",
    body: (
      <>
        <p>
          Everyone with an account here. The star button shows a person&apos;s{" "}
          <strong>work keys</strong>{" "}(which kinds of work, at which level,
          they can be given) and their skills.
        </p>
        <p>
          Admins can change a role inline and set page access with the sliders
          button.
        </p>
      </>
    ),
  },
  "team.deactivated": {
    label: "deactivated people",
    title: "Deactivated",
    body: (
      <p>
        Deactivated people can&apos;t sign in, but everything they did keeps
        their name. Reactivate to give access back; deleting is permanent.
      </p>
    ),
  },
  "team.roles": {
    label: "roles",
    title: "What each role can do",
    body: (
      <p>
        The database enforces these rules, whatever the screen shows — hiding a
        button is only a convenience.
      </p>
    ),
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  "reports.status": {
    label: "task status breakdown",
    title: "Task status breakdown",
    body: <p>How every task in the workspace splits across the statuses.</p>,
  },
  "reports.time": {
    label: "time tracking",
    title: "Estimated vs logged",
    body: (
      <p>
        <strong>Estimated</strong>{" "}is the hours planned on every task;{" "}
        <strong>Logged</strong>{" "}is the time people have recorded on them.
        Logged running well past estimated is a sign the estimates need a look.
      </p>
    ),
  },
  "reports.projects": {
    label: "projects",
    title: "Projects",
    body: (
      <p>
        <strong>Progress</strong>{" "}is the share of a project&apos;s tasks that
        are done.{" "}<strong>Est / Logged</strong>{" "}compares planned and
        recorded hours.
      </p>
    ),
  },
  "reports.people": {
    label: "team workload",
    title: "Team workload",
    body: (
      <p>
        Tasks assigned to each person, how many are done, and the hours they
        logged themselves. Hours come from each person&apos;s own time
        entries, so a task shared by two people isn&apos;t counted twice.
      </p>
    ),
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  "settings.profile": {
    label: "your profile",
    title: "Your profile",
    body: (
      <p>
        Your name and photo appear on task cards, comments and the team list.
        Your email is your sign-in, so it can&apos;t be changed here.
      </p>
    ),
  },
  "settings.skills": {
    label: "your skills",
    title: "Your skills",
    body: (
      <p>
        Add what you work with and rate yourself from 1 to 5 stars.
        Coordinators use it to staff projects, and it helps decide who is
        suggested for work.
      </p>
    ),
  },
  "settings.timeoff": {
    label: "time off",
    title: "Time off",
    body: (
      <>
        <p>
          A member&apos;s request stays{" "}<strong>pending</strong>{" "}until an
          admin or manager approves it, and only approved time off reduces
          capacity or moves the plan. Changing the dates of approved time off
          sends it back for approval.
        </p>
        <p>
          Approvers see the team&apos;s requests below their own — and before
          approving, what the absence affects: tasks due while they&apos;re
          away and who could cover.
        </p>
      </>
    ),
  },
  "settings.rates": {
    label: "hourly rates",
    title: "Hourly rates",
    body: (
      <p>
        New estimate lines are priced at these rates. Existing quotes keep the
        rates they were priced at, so changing one here never reprices a quote
        by itself. Only admins can change rates.
      </p>
    ),
  },
  "settings.zoho": {
    label: "the Zoho connection",
    title: "Zoho CRM",
    body: (
      <p>
        One admin connects once for the whole workspace; nobody else ever sees
        a Zoho sign-in. This app creates and updates deals and attaches
        estimate PDFs, always behind a preview — it can never delete anything
        in Zoho.
      </p>
    ),
  },
} satisfies Record<string, { label: string; title: string; body: React.ReactNode }>;

export type AppHelpSection = keyof typeof HELP;

export function AppHelp({
  section,
  corner,
  className,
}: {
  section: AppHelpSection;
  /** For a section with no card header: pin to its top-right corner. */
  corner?: boolean;
  className?: string;
}) {
  const h = HELP[section];
  return (
    <SectionHelp label={h.label} title={h.title} corner={corner} className={className}>
      {h.body}
    </SectionHelp>
  );
}
