"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppNotification {
  id: string;
  text: string;
  /** ISO timestamp */
  at: string;
  read: boolean;
  /** Optional deep link */
  href?: string;
}

interface NotificationsState {
  items: AppNotification[];
  push: (text: string, href?: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "seed-1",
    text: 'Project "Client Portal" was marked Active.',
    at: new Date(Date.now() - 86400000).toISOString(),
    read: true,
    href: "/projects/proj-2",
  },
  {
    id: "seed-2",
    text: 'New comment on "Create wireframes".',
    at: new Date(Date.now() - 3600000).toISOString(),
    read: false,
    href: "/projects/proj-1/sprints/sprint-2",
  },
  {
    id: "seed-3",
    text: 'You moved "Define MVP scope" to In Progress.',
    at: new Date(Date.now() - 7200000).toISOString(),
    read: false,
  },
];

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [...SEED_NOTIFICATIONS],

      push: (text, href) => {
        const item: AppNotification = {
          id: uid(),
          text,
          at: new Date().toISOString(),
          read: false,
          href,
        };
        set((s) => ({ items: [item, ...s.items].slice(0, 50) }));
      },

      markRead: (id) =>
        set((s) => ({
          items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllRead: () =>
        set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: "timeline-notifications",
      version: 1,
    }
  )
);
