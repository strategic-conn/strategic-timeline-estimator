"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { toast } from "sonner";

import type { CatalogItem } from "@/lib/proposal-catalog";
import {
  DEFAULT_ADDONS,
  computeLineHours,
} from "@/lib/constants/proposal-estimator";
import { analyzeDiscovery } from "@/lib/discovery";
import {
  phaseLabelForLineItem,
  quoteHasWork,
  resultFromQuote,
} from "@/lib/discovery/from-line-items";
import { proposalDraftFromDiscovery } from "@/lib/discovery/to-proposal";
import type { DiscoveryProject } from "@/types/discovery.types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import type { Database, Json } from "@/types/database.types";
import { CURRENT_USER_ID } from "@/types/task.types";
import type {
  ClientQuote,
  ProposalAddons,
  ProposalLineItem,
  ProposalPlatform,
  ProposalStatus,
  ProposalTier,
} from "@/types/proposal.types";

/**
 * Draft schedule from a quote's tentative timeline: one sprint per phase, in
 * order, carrying the estimate's dates. Managers then adjust these into the
 * real plan (dates, assignees, hours). Empty when there's no work to schedule.
 */
function phaseScaffold(quote: ClientQuote) {
  const result = quote.discovery
    ? analyzeDiscovery(quote.discovery)
    : quoteHasWork(quote)
      ? resultFromQuote(quote)
      : null;
  if (!result) return [];
  return result.timeline.phases.map((ph) => ({
    label: ph.label,
    goal: `~${ph.durationDays} business day${ph.durationDays === 1 ? "" : "s"} (from estimate)`,
    start_date: ph.startDate,
    end_date: ph.endDate,
  }));
}

type ProposalRow = Database["public"]["Tables"]["proposals"]["Row"];

function rowToQuote(r: ProposalRow): ClientQuote {
  return {
    id: r.id,
    title: r.title,
    project_id: r.project_id,
    client_name: r.client_name ?? undefined,
    notes: r.notes ?? undefined,
    platform: r.platform as ProposalPlatform,
    status: (r.status as ProposalStatus) ?? "draft",
    line_items: (r.line_items as unknown as ProposalLineItem[]) ?? [],
    addons: { ...DEFAULT_ADDONS, ...(r.addons as unknown as ProposalAddons) },
    requirements_unclear: r.requirements_unclear,
    discovery: (r.discovery as unknown as DiscoveryProject | null) ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Editable columns for a quote document (line_items + addons stored as JSONB). */
function quoteUpdatePayload(
  q: ClientQuote,
): Database["public"]["Tables"]["proposals"]["Update"] {
  return {
    title: q.title,
    project_id: q.project_id ?? null,
    client_name: q.client_name ?? null,
    notes: q.notes ?? null,
    platform: q.platform,
    status: q.status,
    line_items: q.line_items as unknown as Json,
    addons: q.addons as unknown as Json,
    requirements_unclear: q.requirements_unclear,
    discovery: (q.discovery ?? null) as unknown as Json,
    updated_at: q.updated_at,
  };
}

/**
 * Best-effort persist of a full quote document after an optimistic edit (live
 * mode only). Line-item / add-on edits fire frequently, so we don't roll back
 * per keystroke — a failed save surfaces as a toast and editing continues.
 */
function persistQuoteDoc(id: string, get: () => ProposalEstimatorState): void {
  if (!isSupabaseConfigured) return;
  const q = get().proposals.find((p) => p.id === id);
  if (!q) return;
  void (async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("proposals")
      .update(quoteUpdatePayload(q))
      .eq("id", id);
    if (error) {
      toast.error("Couldn't save changes", {
        description: parseSupabaseError(error),
      });
    }
  })();
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextQuoteId(quotes: ClientQuote[]): string {
  let max = 0;
  for (const q of quotes) {
    const m = /^quote-(\d+)$/.exec(q.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `quote-${max + 1}`;
}

const proposalEstimatorStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
});

function emptyLineItem(): ProposalLineItem {
  const tier: ProposalTier = "basic";
  const base_hours = 2;
  return {
    id: uid(),
    title: "",
    module: null,
    category_id: null,
    catalog_id: null,
    base_hours,
    tier,
    quantity: 1,
    hours: computeLineHours(base_hours, tier, 1),
    depends_on: [],
  };
}

function lineItemFromCatalog(item: CatalogItem): ProposalLineItem {
  const tier: ProposalTier = "basic";
  return {
    id: uid(),
    title: item.name,
    module: item.module,
    category_id: item.category_id,
    catalog_id: item.id,
    base_hours: item.base_hours,
    tier,
    quantity: 1,
    hours: computeLineHours(item.base_hours, tier, 1),
    depends_on: [],
  };
}

export type CreateQuoteInput = {
  title: string;
  project_id?: string | null;
  client_name?: string;
  platform?: ProposalPlatform;
  /** Guided-scoping answers, when created via the guided (questionnaire) path. */
  discovery?: DiscoveryProject | null;
};

/** A fully-formed quote draft (e.g. from Esther) imported in one shot, tiers preserved. */
export type ProposalDraftInput = {
  title: string;
  project_id?: string | null;
  client_name?: string;
  notes?: string;
  platform: ProposalPlatform;
  requirements_unclear?: boolean;
  addons?: Partial<ProposalAddons>;
  line_items: Array<
    Pick<
      ProposalLineItem,
      "title" | "base_hours" | "tier" | "quantity"
    > &
      Partial<Pick<ProposalLineItem, "module" | "category_id" | "catalog_id">>
  >;
};

export type LineItemPatch = Partial<
  Pick<
    ProposalLineItem,
    | "title"
    | "module"
    | "category_id"
    | "catalog_id"
    | "base_hours"
    | "tier"
    | "quantity"
    | "depends_on"
  >
>;

interface ProposalEstimatorState {
  proposals: ClientQuote[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Pull the user's proposals from Supabase (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  createProposal: (input: CreateQuoteInput) => string;
  createProposalFromDraft: (input: ProposalDraftInput) => string;
  updateProposal: (
    id: string,
    partial: Partial<
      Pick<
        ClientQuote,
        | "title"
        | "project_id"
        | "client_name"
        | "notes"
        | "platform"
        | "requirements_unclear"
      >
    >,
  ) => void;
  updateAddons: (id: string, partial: Partial<ProposalAddons>) => void;
  /** Save the guided-scoping answers on a proposal (merged Discovery wizard). */
  setDiscovery: (id: string, discovery: DiscoveryProject) => void;
  /**
   * (Re)generate the line items from the proposal's saved `discovery` scope —
   * runs the estimate engine and replaces the line items + scope-derived add-ons.
   */
  regenerateLineItems: (id: string) => void;
  /** Move a proposal through its approval lifecycle (draft/sent/approved/rejected). */
  setProposalStatus: (id: string, status: ProposalStatus) => void;
  /**
   * Convert an (approved) proposal into a real project. Creates the project,
   * optionally seeds backlog tasks from the line items, and links the proposal.
   * Returns the new project id (or null on failure).
   */
  convertToProject: (
    proposalId: string,
    input: { name: string; seedTasks: boolean },
  ) => Promise<string | null>;
  /**
   * Re-apply a linked quote's schedule to its EXISTING project: create any
   * phase sprints and line-item tasks not already present (dedupe by
   * name/title). Idempotent — safe to re-run after the quote changes.
   */
  regenerateSchedule: (projectId: string) => Promise<void>;
  deleteProposal: (id: string) => void;
  addLineItem: (proposalId: string) => void;
  addLineItemsFromCatalog: (proposalId: string, items: CatalogItem[]) => void;
  updateLineItem: (
    proposalId: string,
    lineId: string,
    partial: LineItemPatch,
  ) => void;
  removeLineItem: (proposalId: string, lineId: string) => void;
}

function recomputeHours(line: ProposalLineItem): ProposalLineItem {
  return {
    ...line,
    hours: computeLineHours(line.base_hours, line.tier, line.quantity),
  };
}

export const useProposalEstimatorStore = create<ProposalEstimatorState>()(
  persist(
    (set, get) => ({
      proposals: [],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        // RLS scopes proposals to admin/manager; others get an empty set.
        const { data, error } = await supabase
          .from("proposals")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          proposals: (data ?? []).map(rowToQuote),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      createProposal: (input) => {
        const now = new Date().toISOString();
        const id = isSupabaseConfigured
          ? crypto.randomUUID()
          : nextQuoteId(get().proposals);
        const quote: ClientQuote = {
          id,
          title: input.title.trim() || "Untitled quote",
          project_id: input.project_id ?? null,
          client_name: input.client_name?.trim() || undefined,
          notes: undefined,
          platform: input.platform ?? "react_next",
          status: "draft",
          // Guided quotes start empty (the wizard generates lines); manual keep a starter row.
          line_items: input.discovery ? [] : [emptyLineItem()],
          addons: { ...DEFAULT_ADDONS },
          requirements_unclear: false,
          discovery: input.discovery ?? null,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ proposals: [quote, ...s.proposals] }));

        if (isSupabaseConfigured) {
          const ownerId = useAuthStore.getState().user.authId;
          if (!ownerId) {
            set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }));
            toast.error("Couldn't create quote", {
              description: "You need to be signed in.",
            });
            return id;
          }
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase.from("proposals").insert({
              id,
              owner_id: ownerId,
              title: quote.title,
              project_id: quote.project_id ?? null,
              client_name: quote.client_name ?? null,
              notes: quote.notes ?? null,
              platform: quote.platform,
              status: quote.status,
              line_items: quote.line_items as unknown as Json,
              addons: quote.addons as unknown as Json,
              requirements_unclear: quote.requirements_unclear,
              discovery: (quote.discovery ?? null) as unknown as Json,
            });
            if (error) {
              set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }));
              toast.error("Couldn't create quote", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }

        return id;
      },

      createProposalFromDraft: (input) => {
        const now = new Date().toISOString();
        const id = isSupabaseConfigured
          ? crypto.randomUUID()
          : nextQuoteId(get().proposals);
        const line_items: ProposalLineItem[] = (
          input.line_items.length ? input.line_items : [{
            title: "",
            base_hours: 2,
            tier: "basic" as ProposalTier,
            quantity: 1,
          }]
        ).map((li) => ({
          id: uid(),
          title: li.title,
          module: li.module ?? null,
          category_id: li.category_id ?? null,
          catalog_id: li.catalog_id ?? null,
          base_hours: li.base_hours,
          tier: li.tier,
          quantity: li.quantity,
          hours: computeLineHours(li.base_hours, li.tier, li.quantity),
          depends_on: [],
        }));
        const quote: ClientQuote = {
          id,
          title: input.title.trim() || "Untitled quote",
          project_id: input.project_id ?? null,
          client_name: input.client_name?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          platform: input.platform,
          status: "draft",
          line_items,
          addons: { ...DEFAULT_ADDONS, ...input.addons },
          requirements_unclear: input.requirements_unclear ?? false,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ proposals: [quote, ...s.proposals] }));

        if (isSupabaseConfigured) {
          const ownerId = useAuthStore.getState().user.authId;
          if (!ownerId) {
            set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }));
            toast.error("Couldn't create quote", {
              description: "You need to be signed in.",
            });
            return id;
          }
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase.from("proposals").insert({
              id,
              owner_id: ownerId,
              title: quote.title,
              project_id: quote.project_id ?? null,
              client_name: quote.client_name ?? null,
              notes: quote.notes ?? null,
              platform: quote.platform,
              status: quote.status,
              line_items: quote.line_items as unknown as Json,
              addons: quote.addons as unknown as Json,
              requirements_unclear: quote.requirements_unclear,
            });
            if (error) {
              set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }));
              toast.error("Couldn't create quote", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }

        return id;
      },

      updateProposal: (id, partial) => {
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...partial,
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        persistQuoteDoc(id, get);
      },

      updateAddons: (id, partial) => {
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? {
                  ...p,
                  addons: { ...p.addons, ...partial },
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        persistQuoteDoc(id, get);
      },

      setDiscovery: (id, discovery) => {
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? { ...p, discovery, updated_at: new Date().toISOString() }
              : p,
          ),
        }));
        persistQuoteDoc(id, get);
      },

      regenerateLineItems: (id) => {
        const quote = get().proposals.find((p) => p.id === id);
        if (!quote?.discovery) return;
        const result = analyzeDiscovery(quote.discovery);
        const draft = proposalDraftFromDiscovery(quote.discovery, result);
        const line_items: ProposalLineItem[] = draft.line_items.map((li) => ({
          id: uid(),
          title: li.title,
          module: li.module ?? null,
          category_id: li.category_id ?? null,
          catalog_id: li.catalog_id ?? null,
          base_hours: li.base_hours,
          tier: li.tier,
          quantity: li.quantity,
          hours: computeLineHours(li.base_hours, li.tier, li.quantity),
          depends_on: [],
        }));
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? {
                  ...p,
                  line_items,
                  // Discovery itemises design/QA/PM into phases — don't double-count.
                  addons: { ...p.addons, ...draft.addons },
                  requirements_unclear:
                    draft.requirements_unclear ?? p.requirements_unclear,
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        persistQuoteDoc(id, get);
      },

      setProposalStatus: (id, status) => {
        const prev = get().proposals.find((p) => p.id === id);
        if (!prev) return;
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? { ...p, status, updated_at: new Date().toISOString() }
              : p,
          ),
        }));

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("proposals")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", id);
          if (error) {
            set((s) => ({
              proposals: s.proposals.map((p) =>
                p.id === id ? { ...p, status: prev.status } : p,
              ),
            }));
            toast.error("Couldn't update status", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      convertToProject: async (proposalId, input) => {
        const quote = get().proposals.find((p) => p.id === proposalId);
        if (!quote) return null;
        const name = input.name.trim() || quote.title;
        const description = quote.client_name
          ? `Client: ${quote.client_name}`
          : undefined;
        // Line items with a real title become backlog tasks (estimate = line hours).
        const seeds = input.seedTasks
          ? quote.line_items.filter((li) => li.title.trim())
          : [];

        // ── Demo: synchronous store calls (no FK ordering to worry about). ──
        if (!isSupabaseConfigured) {
          const projectId = useProjectsStore.getState().createProject({
            name,
            description,
            status: "active",
            owner_id: String(useAuthStore.getState().user.id),
          });
          // Scaffold the tentative timeline as sprints, then slot tasks in.
          const sprintsStore = useSprintsStore.getState();
          const phaseSprint = new Map<string, string>();
          for (const ph of phaseScaffold(quote)) {
            phaseSprint.set(
              ph.label,
              sprintsStore.createSprint({
                project_id: projectId,
                name: ph.label,
                goal: ph.goal,
                status: "planning",
                start_date: ph.start_date,
                end_date: ph.end_date,
              }),
            );
          }
          const tasksStore = useTasksDataStore.getState();
          for (const li of seeds) {
            tasksStore.createTask({
              title: li.title,
              description: undefined,
              status: "todo",
              priority: "medium",
              assignee_ids: [],
              reporter_id: CURRENT_USER_ID,
              project_id: projectId,
              sprint_id: phaseSprint.get(phaseLabelForLineItem(li)) ?? null,
              due_date: undefined,
              estimated_hours: li.hours,
              logged_hours: undefined,
              tags: [phaseLabelForLineItem(li)],
            });
          }
          set((s) => ({
            proposals: s.proposals.map((p) =>
              p.id === proposalId
                ? {
                    ...p,
                    project_id: projectId,
                    status: "approved",
                    updated_at: new Date().toISOString(),
                  }
                : p,
            ),
          }));
          toast.success("Project created from proposal");
          return projectId;
        }

        // ── Live: ordered, awaited inserts so tasks never beat the project FK. ──
        const ownerId = useAuthStore.getState().user.authId;
        if (!ownerId) {
          toast.error("You need to be signed in.");
          return null;
        }
        const supabase = createClient();
        const projectId = crypto.randomUUID();

        const { data: projRow, error: pErr } = await supabase
          .from("projects")
          .insert({
            id: projectId,
            name,
            description: description ?? null,
            status: "active",
            owner_id: ownerId,
          })
          .select()
          .single();
        if (pErr || !projRow) {
          toast.error("Couldn't create project", {
            description: parseSupabaseError(pErr),
          });
          return null;
        }
        // Optimistically add so navigation lands on a populated project.
        useProjectsStore.getState().applyRealtimeUpsert(projRow);

        // Scaffold the tentative timeline as sprints — awaited before tasks so
        // the task→sprint FK is satisfied. They stream in via realtime.
        const phaseSprint = new Map<string, string>();
        const scaffold = phaseScaffold(quote);
        if (scaffold.length) {
          const sprintRows = scaffold.map((ph, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            name: ph.label,
            goal: ph.goal,
            status: "planning" as const,
            start_date: ph.start_date,
            end_date: ph.end_date,
            position: i,
          }));
          const { data: sData, error: sErr } = await supabase
            .from("sprints")
            .insert(sprintRows)
            .select();
          if (sErr) {
            toast.error("Project created, but the schedule didn't seed", {
              description: parseSupabaseError(sErr),
            });
          } else {
            // Optimistically add so the timeline shows without waiting on realtime.
            const sprintsStore = useSprintsStore.getState();
            for (const r of sData) {
              sprintsStore.applyRealtimeUpsert(r);
              phaseSprint.set(r.name, r.id);
            }
          }
        }

        if (seeds.length) {
          const taskRows = seeds.map((li, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            sprint_id: phaseSprint.get(phaseLabelForLineItem(li)) ?? null,
            title: li.title,
            description: null,
            status: "todo" as const,
            priority: "medium" as const,
            reporter_id: ownerId,
            due_date: null,
            estimated_hours: li.hours,
            logged_hours: null,
            tags: [phaseLabelForLineItem(li)],
            position: i,
          }));
          const { data: tData, error: tErr } = await supabase
            .from("tasks")
            .insert(taskRows)
            .select();
          if (tErr) {
            toast.error("Project created, but tasks didn't seed", {
              description: parseSupabaseError(tErr),
            });
          } else {
            // Optimistically add so the board/backlog isn't empty pre-realtime.
            const tasksStore = useTasksDataStore.getState();
            for (const r of tData) tasksStore.applyRealtimeTaskUpsert(r);
          }
        }

        const { error: qErr } = await supabase
          .from("proposals")
          .update({
            project_id: projectId,
            status: "approved",
            updated_at: new Date().toISOString(),
          })
          .eq("id", proposalId);
        if (qErr) {
          toast.error("Project created, but couldn't link the proposal", {
            description: parseSupabaseError(qErr),
          });
        } else {
          set((s) => ({
            proposals: s.proposals.map((p) =>
              p.id === proposalId
                ? { ...p, project_id: projectId, status: "approved" }
                : p,
            ),
          }));
        }
        toast.success("Project created from proposal");
        return projectId;
      },

      regenerateSchedule: async (projectId) => {
        const quote = get().proposals.find((p) => p.project_id === projectId);
        if (!quote) {
          toast.error("No estimate is linked to this project.");
          return;
        }
        const scaffold = phaseScaffold(quote);
        const seeds = quote.line_items.filter((li) => li.title.trim());
        if (!scaffold.length && !seeds.length) {
          toast.error("This estimate has no work to schedule yet.");
          return;
        }

        const sprintsState = useSprintsStore.getState();
        const tasksState = useTasksDataStore.getState();
        // Dedupe against what's already on the project (idempotent re-runs).
        const sprintByName = new Map(
          sprintsState.sprints
            .filter((s) => s.project_id === projectId)
            .map((s) => [s.name, s.id] as [string, string]),
        );
        const existingTitles = new Set(
          tasksState.tasks
            .filter((t) => t.project_id === projectId)
            .map((t) => t.title),
        );
        const newPhases = scaffold.filter((ph) => !sprintByName.has(ph.label));
        const newSeeds = seeds.filter((li) => !existingTitles.has(li.title));
        if (!newPhases.length && !newSeeds.length) {
          toast.info("Schedule is already up to date with the estimate.");
          return;
        }

        // ── Demo: store methods are already optimistic + synchronous. ──
        if (!isSupabaseConfigured) {
          for (const ph of newPhases) {
            sprintByName.set(
              ph.label,
              sprintsState.createSprint({
                project_id: projectId,
                name: ph.label,
                goal: ph.goal,
                status: "planning",
                start_date: ph.start_date,
                end_date: ph.end_date,
              }),
            );
          }
          for (const li of newSeeds) {
            tasksState.createTask({
              title: li.title,
              description: undefined,
              status: "todo",
              priority: "medium",
              assignee_ids: [],
              reporter_id: CURRENT_USER_ID,
              project_id: projectId,
              sprint_id: sprintByName.get(phaseLabelForLineItem(li)) ?? null,
              due_date: undefined,
              estimated_hours: li.hours,
              logged_hours: undefined,
              tags: [phaseLabelForLineItem(li)],
            });
          }
          toast.success("Schedule synced from the estimate");
          return;
        }

        // ── Live: sprints first (awaited) so the task→sprint FK holds. ──
        const ownerId = useAuthStore.getState().user.authId;
        if (!ownerId) {
          toast.error("You need to be signed in.");
          return;
        }
        const supabase = createClient();

        if (newPhases.length) {
          const base = sprintsState.sprints.filter(
            (s) => s.project_id === projectId,
          ).length;
          const rows = newPhases.map((ph, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            name: ph.label,
            goal: ph.goal,
            status: "planning" as const,
            start_date: ph.start_date,
            end_date: ph.end_date,
            position: base + i,
          }));
          const { data, error } = await supabase
            .from("sprints")
            .insert(rows)
            .select();
          if (error) {
            toast.error("Couldn't create sprints", {
              description: parseSupabaseError(error),
            });
          } else {
            for (const r of data) {
              sprintsState.applyRealtimeUpsert(r);
              sprintByName.set(r.name, r.id);
            }
          }
        }

        if (newSeeds.length) {
          const rows = newSeeds.map((li, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            sprint_id: sprintByName.get(phaseLabelForLineItem(li)) ?? null,
            title: li.title,
            description: null,
            status: "todo" as const,
            priority: "medium" as const,
            reporter_id: ownerId,
            due_date: null,
            estimated_hours: li.hours,
            logged_hours: null,
            tags: [phaseLabelForLineItem(li)],
            position: i,
          }));
          const { data, error } = await supabase
            .from("tasks")
            .insert(rows)
            .select();
          if (error) {
            toast.error("Couldn't seed tasks", {
              description: parseSupabaseError(error),
            });
          } else {
            for (const r of data) tasksState.applyRealtimeTaskUpsert(r);
          }
        }

        toast.success("Schedule synced from the estimate");
      },

      deleteProposal: (id) => {
        const before = structuredClone(get().proposals);
        set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }));

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase
              .from("proposals")
              .delete()
              .eq("id", id);
            if (error) {
              set({ proposals: before });
              toast.error("Couldn't delete quote", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }
      },

      addLineItem: (proposalId) => {
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  line_items: [...p.line_items, emptyLineItem()],
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        persistQuoteDoc(proposalId, get);
      },

      addLineItemsFromCatalog: (proposalId, items) => {
        if (!items.length) return;
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  line_items: [
                    ...p.line_items,
                    ...items.map((it) => lineItemFromCatalog(it)),
                  ],
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        persistQuoteDoc(proposalId, get);
      },

      updateLineItem: (proposalId, lineId, partial) => {
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            return {
              ...p,
              line_items: p.line_items.map((li) => {
                if (li.id !== lineId) return li;
                const next: ProposalLineItem = { ...li, ...partial };
                if (
                  partial.base_hours !== undefined ||
                  partial.tier !== undefined ||
                  partial.quantity !== undefined
                ) {
                  return recomputeHours(next);
                }
                return next;
              }),
              updated_at: new Date().toISOString(),
            };
          }),
        }));
        persistQuoteDoc(proposalId, get);
      },

      removeLineItem: (proposalId, lineId) => {
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            const nextLines = p.line_items
              .filter((li) => li.id !== lineId)
              .map((li) => ({
                ...li,
                depends_on: li.depends_on.filter((d) => d !== lineId),
              }));
            return {
              ...p,
              line_items:
                nextLines.length > 0 ? nextLines : [emptyLineItem()],
              updated_at: new Date().toISOString(),
            };
          }),
        }));
        persistQuoteDoc(proposalId, get);
      },
    }),
    {
      name: "timeline-proposal-estimator",
      version: 4,
      storage: proposalEstimatorStorage,
      // Live data is the source of truth in Supabase; don't persist it locally.
      partialize: (s) =>
        isSupabaseConfigured ? { proposals: [] } : { proposals: s.proposals },
      migrate: (state, fromVersion) => {
        if (isSupabaseConfigured) {
          return {
            ...(state as object),
            proposals: [],
          } as unknown as ProposalEstimatorState;
        }
        if (!state || typeof state !== "object") return state;
        // v2/v3 -> v4: add pm_basis to add-ons, requirements_unclear + status to quotes.
        if (fromVersion >= 2) {
          const current = state as {
            proposals?: Array<Record<string, unknown>>;
          };
          const proposals = Array.isArray(current.proposals)
            ? current.proposals.map((q) => {
                const addons =
                  q.addons && typeof q.addons === "object"
                    ? (q.addons as Record<string, unknown>)
                    : {};
                return {
                  ...q,
                  status: typeof q.status === "string" ? q.status : "draft",
                  requirements_unclear:
                    typeof q.requirements_unclear === "boolean"
                      ? q.requirements_unclear
                      : false,
                  addons: {
                    ...DEFAULT_ADDONS,
                    ...addons,
                    pm_basis:
                      addons.pm_basis === "complex" ||
                      addons.pm_basis === "custom"
                        ? addons.pm_basis
                        : "simple",
                  },
                };
              })
            : [];
          return { ...current, proposals } as unknown as ProposalEstimatorState;
        }
        // v1 -> v2 migration: map old complexity tiers + add new fields.
        const legacy = state as {
          proposals?: Array<Record<string, unknown>>;
        };
        const proposals = Array.isArray(legacy.proposals)
          ? legacy.proposals.map((q) => {
              const lineItemsRaw = Array.isArray(q.line_items)
                ? (q.line_items as Array<Record<string, unknown>>)
                : [];
              const line_items: ProposalLineItem[] = lineItemsRaw.map(
                (li) => {
                  const oldHours =
                    typeof li.hours === "number" ? li.hours : 2;
                  const title =
                    typeof li.title === "string" ? li.title : "";
                  return {
                    id:
                      typeof li.id === "string"
                        ? li.id
                        : `${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`,
                    title,
                    module: null,
                    category_id: null,
                    catalog_id: null,
                    base_hours: oldHours,
                    tier: "basic",
                    quantity: 1,
                    hours: oldHours,
                    depends_on: [],
                  };
                },
              );
              return {
                ...q,
                platform: "react_next",
                status: typeof q.status === "string" ? q.status : "draft",
                line_items,
                addons: { ...DEFAULT_ADDONS },
                requirements_unclear: false,
              };
            })
          : [];
        return { ...legacy, proposals } as unknown as ProposalEstimatorState;
      },
    },
  ),
);
