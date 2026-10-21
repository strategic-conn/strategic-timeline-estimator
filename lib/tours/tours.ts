import type { Permissions } from "@/hooks/usePermissions";
import type { TourTarget } from "@/lib/tours/ids";

/**
 * The tours — what each page's guided walkthrough says, in one place.
 *
 * ⚠️ This copy restates how features behave. When a feature changes, its tour
 * copy changes in the same commit, and the tour's `version` goes up so people
 * who already took it are offered it again.
 *
 * Rules every step follows (docs/onboarding-tour-plan.md §3):
 *  - Read-only. A tour points at a control and explains it; it never presses
 *    it. The runner also blocks clicks on the highlighted element.
 *  - A step a role can't act on has a `when` that hides it, using the same
 *    `usePermissions()` flags the page uses to hide the control itself.
 *  - A step whose target isn't on screen is skipped, so empty states and
 *    loading pages simply show fewer steps.
 *  - Plain text only. The runner escapes it before handing it to driver.js.
 */

export type TourContext = Permissions & {
  /** Nav hrefs this person may open (`useAccessibleHrefs`). */
  accessible: Set<string>;
  /** Below md: bottom tab bar instead of the sidebar. */
  mobile: boolean;
};

type Copy = string | ((ctx: TourContext) => string);

export type TourStep = {
  /** No target: a centred popover. */
  target?: TourTarget;
  title: Copy;
  body: Copy;
  when?: (ctx: TourContext) => boolean;
};

export type TourId =
  | "welcome"
  | "dashboard"
  | "dashboard-team"
  | "projects"
  | "project"
  | "board"
  | "calendar"
  | "gantt"
  | "workload-mine"
  | "workload-team"
  | "team"
  | "activity"
  | "reports"
  | "estimator"
  | "estimate-setup"
  | "estimate-scope"
  | "estimate-lines"
  | "estimate-adjust"
  | "estimate-review"
  | "settings-profile"
  | "settings-skills"
  | "settings-timeoff"
  | "settings-workspace";

export type TourDef = {
  id: TourId;
  /** Bump when the copy or steps change meaningfully: re-offers the tour. */
  version: number;
  /** Shown in the Help menu: "Tour: {title}". */
  title: string;
  /** Nav href gating this tour (page access). Omitted = always reachable. */
  access?: string;
  /** Does this tour belong to the page at `pathname`? */
  match: (pathname: string) => boolean;
  /**
   * When several tours share a route (tabs, Mine/Team), the one whose scope
   * element is on screen applies. Inactive Radix tab panels are unmounted, so
   * the active tab's anchor is the only one present.
   */
  scope?: TourTarget;
  when?: (ctx: TourContext) => boolean;
  steps: TourStep[];
};

const exact = (path: string) => (p: string) => p === path;
const teamScope = (c: TourContext) => c.role === "admin" || c.role === "manager";

const SCOPE_TOGGLE_STEP: TourStep = {
  target: "scope-toggle",
  title: "Mine or Team",
  body: "Switch between your own work and the whole team's. Dashboard, Workload and Calendar use the same switch and the same numbers.",
  when: teamScope,
};

export const TOURS: TourDef[] = [
  {
    id: "welcome",
    version: 1,
    title: "Welcome tour",
    // Never picked as a page tour: it is started from the welcome dialog or
    // the Help menu, on whatever page you are on.
    match: () => false,
    steps: [
      {
        title: "Welcome to Timeline Estimator",
        body: "A quick look at where things are and where to find help. It takes under a minute. Use the buttons or the arrow keys, and press Esc to stop at any time.",
      },
      {
        target: "nav",
        title: "Getting around",
        body: (c) =>
          c.mobile
            ? "Your main pages are along the bottom. More opens the full menu. You only see the pages your role can open."
            : "Every page lives here, grouped into Workspace, Plan & people, Commercial and System. You only see the pages your role can open.",
      },
      {
        target: "notifications",
        title: "Notifications",
        body: "New assignments, mentions, comments and time-off decisions show up here.",
      },
      {
        target: "add-task",
        title: "Add a task from anywhere",
        body: "Pick a project and you land on its current sprint, ready to add the task.",
        when: (c) => c.canCreateTask,
      },
      {
        target: "user-card",
        title: "Your profile",
        body: "Your photo, skills and time off live in Settings. Click your name to get there.",
      },
      {
        target: "help",
        title: "Help is always here",
        body: "Every page has its own short tour. Open this menu to take one, pick up a tour you left, or reopen the Getting started checklist.",
      },
    ],
  },

  {
    id: "dashboard",
    version: 1,
    title: "Dashboard",
    match: exact("/dashboard"),
    scope: "dashboard.kpis",
    steps: [
      SCOPE_TOGGLE_STEP,
      {
        target: "dashboard.checklist",
        title: "Getting started",
        body: "A few first steps. Each one ticks itself once you have actually done it, and Show me takes you to the right place.",
      },
      {
        target: "dashboard.kpis",
        title: "Your numbers at a glance",
        body: "Active projects, your tasks due soon, on-time delivery and the next sprint deadline. A dash means the number is still loading, not zero.",
      },
      {
        target: "dashboard.due-soon",
        title: "Due soon",
        body: "Your open tasks that are overdue or due in the next 7 days, most urgent first. View opens the task on its board.",
      },
      {
        target: "dashboard.my-work",
        title: "My open work",
        body: "Everything assigned to you, including assignments you haven't answered yet, against your weekly hours. Available hours is the time left in this week, not spare capacity.",
      },
      {
        target: "dashboard.activity",
        title: "Activity",
        body: "The latest changes across the workspace.",
      },
    ],
  },

  {
    id: "dashboard-team",
    version: 1,
    title: "Dashboard (Team view)",
    match: exact("/dashboard"),
    scope: "dashboard.team",
    when: teamScope,
    steps: [
      SCOPE_TOGGLE_STEP,
      {
        target: "dashboard.team",
        title: "The team view",
        body: "Who is carrying what, where the overdue work is, and how the week is tracking. Every figure matches the Workload page.",
      },
      {
        target: "dashboard.team-chart",
        title: "Open tasks per person",
        body: "Each bar is coloured by task status, so unstarted, in-progress and blocked work look different at a glance.",
      },
      {
        target: "dashboard.team-table",
        title: "Breakdown by person",
        body: "Busiest people first. The overdue and pending counts open the tasks behind them.",
      },
    ],
  },

  {
    id: "projects",
    version: 2,
    title: "Projects",
    access: "/projects",
    match: exact("/projects"),
    steps: [
      {
        target: "projects.new",
        title: "Start a project",
        body: "Projects start from an approved estimate: press Start project in the Estimator and it arrives with its sprints already scheduled. Blank projects are switched off for now.",
        when: (c) => c.canCreateProject,
      },
      {
        target: "projects.search",
        title: "Find a project",
        body: "Search by name, filter by status and change the sort order.",
      },
      {
        target: "projects.grid",
        title: "Your projects",
        body: (c) =>
          c.canEditProject
            ? "Open a project to see its sprints, backlog and timeline. A card's menu edits it or changes its status."
            : "Open a project to see its sprints, backlog and timeline.",
      },
      {
        target: "projects.empty",
        title: "No projects yet",
        body: (c) =>
          c.canCreateProject
            ? "Start the first one from an approved estimate — Start project in the Estimator."
            : "An admin or manager adds projects. Work assigned to you will show up on your dashboard.",
      },
    ],
  },

  {
    id: "project",
    version: 2,
    title: "Project overview",
    access: "/projects",
    match: (p) => /^\/projects\/[^/]+\/?$/.test(p),
    steps: [
      {
        target: "project.sprints",
        title: "Sprints",
        body: "A project's work is split into time-boxed sprints. Open a sprint to work on its task board.",
      },
      {
        target: "project.empty",
        title: "No sprints yet",
        body: (c) =>
          c.canEditProject
            ? "Create the first sprint to start organising tasks."
            : "An admin or manager creates the sprints.",
      },
      {
        target: "project.backlog",
        title: "Backlog",
        body: "Tasks that aren't in a sprint yet wait here until someone schedules them.",
      },
      {
        target: "project.new-sprint",
        title: "New sprint",
        body: "Add a sprint with a start and end date, then move tasks into it from the backlog.",
        when: (c) => c.canEditProject,
      },
      {
        target: "project.sync",
        title: "Sync schedule from estimate",
        body: "When the estimate changes, this previews the tasks it would add, rename, re-hour or remove. Nothing changes until you confirm.",
        when: (c) => c.canExportProposals,
      },
      {
        target: "project.zoho-complete",
        title: "Mark complete in Zoho",
        body: "Moves the linked Zoho deal to Project Completed. It writes to the CRM, so press it only once the work is really finished.",
        when: (c) => c.canExportProposals,
      },
      {
        target: "project.timeline",
        title: "Timeline",
        body: "The project's schedule, drawn from its sprints. Change a sprint's dates and the chart follows.",
      },
      {
        target: "project.risk-buffer",
        title: "Risk buffer",
        body: "Forecasts how much later the project would finish with extra slack. It moves nothing on its own. Applying it shows the new sprint dates for you to confirm first.",
        when: (c) => c.canEditProject,
      },
      {
        target: "project.velocity",
        title: "Velocity",
        body: "How many estimated hours each sprint actually finished, the average pace, and when the work left would finish at that pace. Below it, a sprint's burndown.",
      },
    ],
  },

  {
    id: "board",
    version: 1,
    title: "Task board",
    access: "/projects",
    match: (p) =>
      /^\/projects\/[^/]+\/sprints\/[^/]+\/?$/.test(p) ||
      /^\/projects\/[^/]+\/backlog\/?$/.test(p),
    steps: [
      {
        target: "board.kanban",
        title: "The board",
        body: (c) =>
          c.canEditTask
            ? "One column per status. Drag a card to change its status. Moving a task to Done is how work is finished, and it then leaves everyone's workload."
            : "One column per status, from To do to Done.",
      },
      {
        target: "board.card",
        title: "A task",
        body: (c) =>
          c.canEditTask
            ? "Click a card to open it. That's where you accept or decline an assignment, log your hours once you have accepted, and comment."
            : "Click a card to see its details and comments.",
      },
      {
        target: "board.views",
        title: "Board, list or table",
        body: "The same tasks in three layouts. Use whichever suits the job.",
      },
      {
        target: "board.search",
        title: "Search",
        body: "Narrow the board by text. Press / to jump here.",
      },
      {
        target: "board.filters",
        title: "Filters",
        body: "Filter by assignee, priority, tags and more.",
      },
      {
        target: "board.add-task",
        title: "Add a task",
        body: "Creates a task here. The keyboard shortcut is N.",
        when: (c) => c.canCreateTask,
      },
    ],
  },

  {
    id: "calendar",
    version: 1,
    title: "Calendar",
    access: "/calendar",
    match: exact("/calendar"),
    steps: [
      {
        ...SCOPE_TOGGLE_STEP,
        body: "Your own schedule, or everyone's, including their time off.",
      },
      {
        target: "calendar.nav",
        title: "Change month",
        body: "Step through the months. Today jumps back to now.",
      },
      {
        target: "calendar.month",
        title: "The month",
        body: "Task due dates, sprint milestones, time off and US federal holidays. Click a day to see what's on it.",
      },
      {
        target: "calendar.day",
        title: "The day you picked",
        body: "Everything on the selected day, with links to each task.",
      },
      {
        target: "calendar.legend",
        title: "Reading the colours",
        body: "A dashed amber outline is time off still waiting for approval. Only approved time off changes anyone's capacity.",
      },
      {
        title: "Need time off?",
        body: (c) =>
          c.canApproveTimeOff
            ? "Add it in Settings, under Time off. Team requests waiting for you are on the same tab."
            : "Request it in Settings, under Time off. An admin or manager approves it.",
      },
    ],
  },

  {
    id: "gantt",
    version: 1,
    title: "Timeline",
    access: "/gantt",
    match: exact("/gantt"),
    steps: [
      {
        target: "gantt.project-picker",
        title: "Pick a project",
        body: "Show every project at once, or just one.",
      },
      {
        target: "gantt.chart",
        title: "The chart",
        body: (c) =>
          c.mobile
            ? "One bar per task. Swipe sideways for dates and scroll up and down for tasks. Tap a bar to open the task."
            : "One bar per task, placed by its sprint dates. Click a bar to open the task on its board.",
      },
      {
        target: "gantt.legend",
        title: "Status colours",
        body: "Bars are coloured by task status.",
      },
      {
        target: "gantt.how-to-read",
        title: "How to read this",
        body: "How sprint and backlog bars are drawn, if a bar looks longer or shorter than you expect.",
      },
    ],
  },

  {
    id: "workload-mine",
    version: 1,
    title: "My workload",
    access: "/workload",
    match: exact("/workload"),
    scope: "workload.mine",
    steps: [
      SCOPE_TOGGLE_STEP,
      {
        target: "workload.pending",
        title: "Waiting on you",
        body: "Assignments you haven't answered yet. They count towards your load until you accept, decline or pass.",
      },
      {
        target: "workload.mine",
        title: "Your week",
        body: "Open tasks, open estimate, hours logged this week and utilisation. Available is the time left in this week, not spare capacity. Utilisation tells you whether you're overloaded.",
      },
      {
        target: "workload.mine-work",
        title: "Your open work",
        body: "The bar is coloured by task status, and an amber ring means you're over your weekly hours. A task leaves this page once it's moved to Done.",
      },
    ],
  },

  {
    id: "workload-team",
    version: 1,
    title: "Workload (Team view)",
    access: "/workload",
    match: exact("/workload"),
    scope: "workload.team",
    when: teamScope,
    steps: [
      SCOPE_TOGGLE_STEP,
      {
        target: "workload.team",
        title: "Team totals",
        body: "People with open work, total open estimates, and how many people are over their weekly hours.",
      },
      {
        target: "workload.people",
        title: "Load by person",
        body: "Each bar is coloured by task status and includes assignments not yet answered. The overdue and pending counts open the tasks behind them.",
      },
      {
        target: "workload.capacity",
        title: "Weekly capacity",
        body: "Each person's weekly hours. Time off and holidays are taken off automatically. Press Enter or click away to save a change.",
      },
    ],
  },

  {
    id: "team",
    version: 1,
    title: "Team & access",
    access: "/team",
    match: exact("/team"),
    steps: [
      {
        target: "team.invite",
        title: "Invite people",
        body: "This workspace is invite-only. Choose a role when you invite someone; they get an email to set a password.",
        when: (c) => c.canManageTeam,
      },
      {
        target: "team.members",
        title: "Members",
        body: (c) =>
          c.canManageTeam
            ? "Everyone in the workspace. Change a role inline, or manage which pages someone can open."
            : "Everyone in the workspace and the role they hold.",
      },
      {
        target: "team.skills",
        title: "Work keys & skills",
        body: (c) =>
          c.role === "admin"
            ? "Set someone's work keys here. They decide who can be given which kind of work, and at what level."
            : "See someone's work keys and skills: what work they can be given, and what they're good at.",
      },
      {
        target: "team.roles",
        title: "What each role can do",
        body: "The same rules the database enforces, whatever the screen shows.",
      },
    ],
  },

  {
    id: "activity",
    version: 1,
    title: "Activity",
    access: "/activity",
    match: (p) => p === "/activity" || /^\/projects\/[^/]+\/activity\/?$/.test(p),
    steps: [
      {
        target: "activity.filters",
        title: "Find something",
        body: "Search, or filter by project, kind of change and person.",
      },
      {
        target: "activity.feed",
        title: "The feed",
        body: "Newest first. Links take you to the task or page that changed.",
      },
    ],
  },

  {
    id: "reports",
    version: 1,
    title: "Reports",
    access: "/reports",
    match: exact("/reports"),
    steps: [
      {
        target: "reports.kpis",
        title: "Workspace numbers",
        body: "Computed from live project data. A dash means it is still loading.",
      },
      {
        target: "reports.status",
        title: "Task status breakdown",
        body: "How every task in the workspace splits across statuses.",
      },
      {
        target: "reports.projects",
        title: "Projects",
        body: "Progress and effort, project by project.",
      },
      {
        target: "reports.people",
        title: "Team workload",
        body: "Tasks assigned and hours logged per person.",
      },
    ],
  },

  {
    id: "estimator",
    version: 2,
    title: "Estimator",
    access: "/proposals",
    match: exact("/proposals"),
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimator.views",
        title: "List or Stages",
        body: "Stages lays your estimates out like the Zoho pipeline. Dragging a card there moves the real deal in Zoho.",
      },
      {
        target: "estimator.new",
        title: "New estimate",
        body: "Start from scratch: add tasks from the platform catalog, or answer the guided questionnaire.",
      },
      {
        target: "estimator.import",
        title: "Import from Zoho",
        body: "Start from an existing Zoho deal. Importing moves that deal to Discovery in Zoho.",
      },
      {
        target: "estimator.list",
        title: "Your estimates",
        body: "Each card shows its price and Zoho stage. Start project appears once the deal is won — it raises the PO and creates the project in one go.",
      },
      {
        target: "estimator.board",
        title: "The pipeline",
        body: "One column per Zoho stage. Estimates not linked to a deal sit in Not in Zoho.",
      },
      {
        target: "estimator.empty",
        title: "No estimates yet",
        body: "Start one with New estimate, or import a deal from Zoho.",
      },
    ],
  },

  {
    id: "estimate-setup",
    version: 1,
    title: "Estimate: Setup",
    access: "/proposals",
    match: (p) => /^\/proposals\/[^/]+\/?$/.test(p),
    scope: "estimate.setup",
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimate.tabs",
        title: "Five tabs, one estimate",
        body: "Setup, Scope & risk, Line items, Adjust and Review. Each tab has its own short tour under the ? button.",
      },
      {
        target: "estimate.status",
        title: "Status",
        body: "Draft, sent, approved or rejected. Once the deal is won, Start project appears beside it — every project gets a PO, raised as its last step.",
      },
      {
        target: "estimate.client",
        title: "Client",
        body: "Type a name, or use Find in Zoho to link the company and contact.",
      },
      {
        target: "estimate.platform",
        title: "Platform",
        body: "Decides which catalog tasks you can add on the Line items tab.",
      },
      {
        target: "estimate.export",
        title: "Export",
        body: "Download the client PDF or Excel file at any time.",
      },
    ],
  },

  {
    id: "estimate-scope",
    version: 1,
    title: "Estimate: Scope & risk",
    access: "/proposals",
    match: (p) => /^\/proposals\/[^/]+\/?$/.test(p),
    scope: "estimate.guided",
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimate.guided-start",
        title: "Guided scoping",
        body: "Answer a questionnaire and the estimate works out hours (min, mid and max), a timeline and a risk score. It's optional: you can quote from the catalog alone.",
      },
      {
        target: "estimate.scope-summary",
        title: "The estimate",
        body: "The hours range, the risk score and the launch date the timeline gives. Anything the Setup tab already knows is filled in for you.",
      },
      {
        target: "estimate.generate",
        title: "Generate line items",
        body: "Turns this estimate into the quote's line items. Regenerating replaces the lines you have.",
      },
    ],
  },

  {
    id: "estimate-lines",
    version: 1,
    title: "Estimate: Line items",
    access: "/proposals",
    match: (p) => /^\/proposals\/[^/]+\/?$/.test(p),
    scope: "estimate.lines",
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimate.catalog",
        title: "Browse the catalog",
        body: "Add ready-made tasks for this platform, or add your own rows.",
      },
      {
        target: "estimate.line-list",
        title: "Line items",
        body: "Each line is base hours × tier (Basic 1×, Advanced 1.5×, Custom 2×) × quantity, priced at its role's hourly rate. The rate is fixed when the line is added, so later rate changes don't reprice it.",
      },
    ],
  },

  {
    id: "estimate-adjust",
    version: 1,
    title: "Estimate: Adjust",
    access: "/proposals",
    match: (p) => /^\/proposals\/[^/]+\/?$/.test(p),
    scope: "estimate.adjust",
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimate.requirements",
        title: "Requirements not pinned down",
        body: "Prices every line as Advanced. This changes the price.",
      },
      {
        target: "estimate.risk-buffer",
        title: "Risk buffer",
        body: "Adds slack to the timeline only. The dates move; hours and price don't.",
      },
      {
        target: "estimate.rates",
        title: "Rates",
        body: "Says whether today's hourly rates would change this quote, and lets you update it after seeing old and new prices.",
      },
      {
        target: "estimate.addons",
        title: "Add-ons",
        body: "Responsive, design, QA and project management hours on top of development. Each one can be switched off.",
      },
    ],
  },

  {
    id: "estimate-review",
    version: 1,
    title: "Estimate: Review",
    access: "/proposals",
    match: (p) => /^\/proposals\/[^/]+\/?$/.test(p),
    scope: "estimate.review",
    when: (c) => c.canExportProposals,
    steps: [
      {
        target: "estimate.preview",
        title: "What the client sees",
        body: "Below is a preview of the PDF, and you can download it or the Excel file here. Client documents show prices only, never roles, levels or rates.",
      },
      {
        target: "estimate.send-zoho",
        title: "Send to Zoho",
        body: "Creates or updates the Zoho deal and attaches this PDF. You see exactly what will be written before anything is sent.",
      },
    ],
  },

  {
    id: "settings-profile",
    version: 1,
    title: "Settings: Profile",
    match: exact("/settings"),
    scope: "settings.profile",
    steps: [
      {
        target: "settings.tabs",
        title: "Settings",
        body: (c) =>
          c.canViewHourlyRates
            ? "Your profile, skills and time off, plus workspace settings. Each tab has its own short tour."
            : "Your profile, skills and time off. Each tab has its own short tour.",
      },
      {
        target: "settings.avatar",
        title: "Your photo",
        body: "Upload a photo so teammates recognise you on task cards and comments.",
      },
    ],
  },

  {
    id: "settings-skills",
    version: 1,
    title: "Settings: Skills",
    match: exact("/settings"),
    scope: "settings.skills",
    steps: [
      {
        target: "settings.skills",
        title: "Your skills",
        body: "List what you work with and rate your confidence from 1 to 5 stars. Coordinators use it to staff projects.",
      },
    ],
  },

  {
    id: "settings-timeoff",
    version: 1,
    title: "Settings: Time off",
    match: exact("/settings"),
    scope: "settings.timeoff",
    steps: [
      {
        target: "settings.request-timeoff",
        title: (c) => (c.canApproveTimeOff ? "Add time off" : "Request time off"),
        body: (c) =>
          c.canApproveTimeOff
            ? "Your own time off is approved as you add it."
            : "It stays pending until an admin or manager approves it. Pending time off doesn't change your capacity or the plan.",
      },
      {
        target: "settings.approvals",
        title: "Team requests",
        body: "Before you approve, you see what the absence affects: tasks due while they're away and who could cover.",
        when: (c) => c.canApproveTimeOff,
      },
    ],
  },

  {
    id: "settings-workspace",
    version: 1,
    title: "Settings: Workspace",
    match: exact("/settings"),
    scope: "settings.workspace",
    when: (c) => c.canViewHourlyRates,
    steps: [
      {
        target: "settings.rates",
        title: "Hourly rates",
        body: (c) =>
          c.canEditHourlyRates
            ? "Rates by role and level. New estimate lines use them; existing quotes keep the rates they were priced at."
            : "Rates by role and level, used to price new estimate lines. Only an admin can change them.",
      },
      {
        target: "settings.zoho",
        title: "Zoho CRM",
        body: "Connect once for the whole workspace. Nobody else ever sees a Zoho sign-in screen.",
        when: (c) => c.role === "admin",
      },
    ],
  },
];

export function tourById(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

/** Tours allowed for this person at all (role + page access). */
export function tourAllowed(def: TourDef, ctx: TourContext): boolean {
  if (def.access && !ctx.accessible.has(def.access)) return false;
  return def.when ? def.when(ctx) : true;
}

export function resolveCopy(copy: Copy, ctx: TourContext): string {
  return typeof copy === "function" ? copy(ctx) : copy;
}
