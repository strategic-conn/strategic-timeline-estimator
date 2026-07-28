"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";
import { CURRENT_USER_ID } from "@/types/task.types";
import type { Database } from "@/types/database.types";

export interface AppNotification {
  id: string;
  text: string;
  /** ISO timestamp */
  at: string;
  read: boolean;
  /** Optional deep link */
  href?: string;
  /** Workspace project scope (for activity feed filters). */
  project_id?: string | null;
  /** Who triggered it → drives the avatar + name in the bell. Null = system/legacy. */
  actor_id?: string | null;
}

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

function rowToNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    text: r.text,
    at: r.created_at,
    read: r.read,
    href: r.href ?? undefined,
    project_id: r.project_id,
    actor_id: r.actor_id,
  };
}

interface NotificationsState {
  items: AppNotification[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Pull the signed-in user's notifications from Supabase (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  /**
   * Notify specific people about something (the actor is always excluded).
   * Inserts one row per recipient; their own realtime channels deliver it.
   */
  notify: (
    recipientIds: string[],
    text: string,
    href?: string,
    project_id?: string | null,
  ) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
  /** Realtime: a row was inserted for this user (dedupes optimistic echoes). */
  applyRealtimeInsert: (row: NotificationRow) => void;
  /** Realtime: a row changed (e.g. read flag toggled from another device). */
  applyRealtimeUpdate: (row: NotificationRow) => void;
  /** Realtime: a row was removed. */
  applyRealtimeDelete: (id: string) => void;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Personal/targeted seeds only (workspace events now live in the activity log).
const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "seed-2",
    text: 'You were mentioned on "Create wireframes".',
    at: new Date(Date.now() - 3600000).toISOString(),
    read: false,
    href: "/projects/proj-1/sprints/sprint-2",
    project_id: "proj-1",
  },
  {
    id: "seed-5",
    text: 'Task "Kanban board drag-and-drop" assigned to you.',
    at: new Date(Date.now() - 48 * 3600000).toISOString(),
    read: true,
    href: "/projects/proj-1/sprints/sprint-2",
    project_id: "proj-1",
  },
];

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: isSupabaseConfigured ? [] : [...SEED_NOTIFICATIONS],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          items: (data ?? []).map(rowToNotification),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      notify: (recipientIds, text, href, project_id) => {
        const actor = isSupabaseConfigured
          ? useAuthStore.getState().user.authId
          : CURRENT_USER_ID;
        // Never notify the actor of their own action; dedupe recipients.
        const targets = [...new Set(recipientIds)].filter(
          (r) => r && r !== actor,
        );
        if (!targets.length) return;

        if (!isSupabaseConfigured) {
          // Single-user demo: only surface if the demo user is a target.
          if (!targets.includes(CURRENT_USER_ID)) return;
          const item: AppNotification = {
            id: uid(),
            text,
            at: new Date().toISOString(),
            read: false,
            href,
            project_id: project_id ?? null,
            actor_id: actor,
          };
          set((s) => ({ items: [item, ...s.items].slice(0, 50) }));
          return;
        }

        // Live: insert a row per recipient. We don't optimistically add to our
        // own store — these rows are for OTHER users; if one targets us, our
        // realtime channel delivers it (applyRealtimeInsert).
        void (async () => {
          const supabase = createClient();
          const rows = targets.map((rid) => ({
            id: crypto.randomUUID(),
            recipient_id: rid,
            text,
            href: href ?? null,
            actor_id: actor ?? null,
          }));
          const { error } = await supabase
            .from("notifications")
            .insert(rows.map((r) => ({ ...r, project_id: project_id ?? null })));
          if (error) {
            // project_id may reference a just-deleted project (FK) — retry unscoped.
            await supabase
              .from("notifications")
              .insert(rows.map((r) => ({ ...r, project_id: null })));
          }
        })();
      },

      markRead: (id) => {
        set((s) => ({
          items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          await supabase.from("notifications").update({ read: true }).eq("id", id);
        })();
      },

      markAllRead: () => {
        set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) }));
        if (!isSupabaseConfigured) return;
        void (async () => {
          const recipientId = useAuthStore.getState().user.authId;
          if (!recipientId) return;
          const supabase = createClient();
          await supabase
            .from("notifications")
            .update({ read: true })
            .eq("recipient_id", recipientId)
            .eq("read", false);
        })();
      },

      clear: () => {
        set({ items: [] });
        if (!isSupabaseConfigured) return;
        void (async () => {
          const recipientId = useAuthStore.getState().user.authId;
          if (!recipientId) return;
          const supabase = createClient();
          await supabase
            .from("notifications")
            .delete()
            .eq("recipient_id", recipientId);
        })();
      },

      applyRealtimeInsert: (row) =>
        set((s) =>
          s.items.some((n) => n.id === row.id)
            ? s
            : { items: [rowToNotification(row), ...s.items].slice(0, 50) },
        ),

      applyRealtimeUpdate: (row) =>
        set((s) => ({
          items: s.items.map((n) =>
            n.id === row.id ? rowToNotification(row) : n,
          ),
        })),

      applyRealtimeDelete: (id) =>
        set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
    }),
    {
      name: "timeline-notifications",
      version: 2,
      // Live notifications live in Supabase (re-fetched + streamed); demo mode
      // keeps persisting to localStorage.
      partialize: (s) =>
        isSupabaseConfigured ? { items: [] } : { items: s.items },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            items: [],
          } as unknown as NotificationsState;
        }
        return persisted as NotificationsState;
      },
    },
  ),
);
