"use client";

import { create } from "zustand";

/**
 * Shared open-state for the mobile navigation drawer, so both the header
 * hamburger and the bottom bar's "More" tab open the same sheet.
 */
export const useNavDrawerStore = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
