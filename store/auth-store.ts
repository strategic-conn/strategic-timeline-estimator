"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { deriveInitials } from "@/lib/utils/initials";

export type UserRole = "admin" | "manager" | "member" | "viewer";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  initials: string;
}

export type ProfileUpdate = Partial<
  Pick<AuthUser, "name" | "email" | "avatar_url">
>;

interface AuthState {
  user: AuthUser;
  setUser: (user: AuthUser) => void;
  setRole: (role: UserRole) => void;
  /** Persists profile fields (demo). Recomputes initials when `name` changes. */
  updateProfile: (partial: ProfileUpdate) => void;
}

const DEMO_USER: AuthUser = {
  id: 6,
  name: "Felix Gomez",
  email: "felix@company.com",
  role: "manager",
  initials: "FG",
  avatar_url: "https://i.pravatar.cc/40?u=6",
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: DEMO_USER,
      setUser: (user) => set({ user }),
      setRole: (role) => set((s) => ({ user: { ...s.user, role } })),
      updateProfile: (partial) =>
        set((s) => {
          const next: AuthUser = { ...s.user, ...partial };
          if (partial.name != null) {
            next.initials = deriveInitials(partial.name);
          }
          if (partial.avatar_url === "") {
            next.avatar_url = undefined;
          }
          return { user: next };
        }),
    }),
    {
      name: "timeline-auth",
      version: 1,
    }
  )
);
