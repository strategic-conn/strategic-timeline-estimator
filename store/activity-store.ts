"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";
import type { Database } from "@/types/database.types";

/** One entry in the workspace-wide activity log (the /activity feed). */
export interface ActivityItem {
  id: string;
  text: string;
  /** ISO timestamp */
  at: string;
  href?: string;
  project_id?: string | null;
  actor_id?: string;
}

type ActivityRow = Database["public"]["Tables"]["activity"]["Row"];

function rowToActivity(r: ActivityRow): ActivityItem {
  return {
    id: r.id,
    text: r.text,
    at: r.created_at,
    href: r.href ?? undefined,
    project_id: r.project_id,
    actor_id: r.actor_id,
  };
}

interface ActivityState {
  items: ActivityItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /** Record a workspace event (everyone sees it). */
  log: (text: string, href?: string, project_id?: string | null) => void;
  applyRealtimeInsert: (row: ActivityRow) => void;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Prefix an action summary with the actor's name, e.g. "created task X" →
 * "Daniel created task X". The verb is lower-cased so it reads after the name.
 * Summaries are authored as past-tense verb phrases ("created…", "moved…").
 * Other viewers see the name baked into the stored text (no per-viewer lookup).
 */
function withActor(summary: string): string {
  const name = useAuthStore.getState().user.name?.trim() || "Someone";
  const phrase = summary.charAt(0).toLowerCase() + summary.slice(1);
  return `${name} ${phrase}`;
}

const SEED_ACTIVITY: ActivityItem[] = [
  {
    id: "seed-1",
    text: 'Ana Reyes marked project "Client Portal" as Active',
    at: new Date(Date.now() - 86400000).toISOString(),
    href: "/projects/proj-2",
    project_id: "proj-2",
  },
  {
    id: "seed-2",
    text: 'Ben Cruz commented on "Create wireframes"',
    at: new Date(Date.now() - 3600000).toISOString(),
    href: "/projects/proj-1/sprints/sprint-2",
    project_id: "proj-1",
  },
  {
    id: "seed-3",
    text: 'Felix Gomez moved "Define MVP scope" to In Progress',
    at: new Date(Date.now() - 7200000).toISOString(),
    href: "/projects/proj-1/sprints/sprint-2",
    project_id: "proj-1",
  },
  {
    id: "seed-4",
    text: 'Ana Reyes started sprint "Sprint 2 — Polish"',
    at: new Date(Date.now() - 5 * 3600000).toISOString(),
    href: "/projects/proj-1/sprints/sprint-2",
    project_id: "proj-1",
  },
];

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      items: isSupabaseConfigured ? [] : [...SEED_ACTIVITY],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("activity")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80);
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          items: (data ?? []).map(rowToActivity),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      log: (text, href, project_id) => {
        const display = withActor(text);
        if (!isSupabaseConfigured) {
          const item: ActivityItem = {
            id: uid(),
            text: display,
            at: new Date().toISOString(),
            href,
            project_id: project_id ?? null,
          };
          set((s) => ({ items: [item, ...s.items].slice(0, 80) }));
          return;
        }

        const actorId = useAuthStore.getState().user.authId;
        if (!actorId) return;
        const id = crypto.randomUUID();
        const item: ActivityItem = {
          id,
          text: display,
          at: new Date().toISOString(),
          href,
          project_id: project_id ?? null,
          actor_id: actorId,
        };
        set((s) => ({ items: [item, ...s.items].slice(0, 80) }));

        void (async () => {
          const supabase = createClient();
          const base = { id, actor_id: actorId, text: display, href: href ?? null };
          let { error } = await supabase
            .from("activity")
            .insert({ ...base, project_id: project_id ?? null });
          if (error) {
            // project_id may reference a just-deleted project (FK) — log unscoped.
            ({ error } = await supabase
              .from("activity")
              .insert({ ...base, project_id: null }));
          }
          if (error) {
            set((s) => ({ items: s.items.filter((n) => n.id !== id) }));
          }
        })();
      },

      applyRealtimeInsert: (row) =>
        set((s) =>
          s.items.some((n) => n.id === row.id)
            ? s
            : { items: [rowToActivity(row), ...s.items].slice(0, 80) },
        ),
    }),
    {
      name: "timeline-activity",
      version: 1,
      partialize: (s) =>
        isSupabaseConfigured ? { items: [] } : { items: s.items },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            items: [],
          } as unknown as ActivityState;
        }
        return persisted as ActivityState;
      },
    },
  ),
);
