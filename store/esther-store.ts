"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { EstherMessage } from "@/types/esther.types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const estherStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
});

interface EstherState {
  messages: EstherMessage[];
  addMessage: (message: EstherMessage) => void;
  updateMessage: (id: string, partial: Partial<EstherMessage>) => void;
  removeMessage: (id: string) => void;
  reset: () => void;
}

export const useEstherStore = create<EstherState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      updateMessage: (id, partial) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? ({ ...m, ...partial } as EstherMessage) : m,
          ),
        })),
      removeMessage: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
      reset: () => set({ messages: [] }),
    }),
    {
      name: "timeline-esther",
      version: 1,
      storage: estherStorage,
    },
  ),
);

export { uid as estherUid };
