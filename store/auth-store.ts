"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { deriveInitials } from "@/lib/utils/initials";

export type UserRole = "admin" | "manager" | "member" | "viewer";

export interface AuthUser {
  /** Numeric id used by the demo data layer (tasks/projects keyed 1–6). */
  id: number;
  /** Real Supabase profile UUID — set only when signed in via Supabase. */
  authId?: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  initials: string;
  /** Per-user page allowlist (hrefs). null/undefined = role defaults. */
  page_access?: string[] | null;
}

export type ProfileUpdate = Partial<
  Pick<AuthUser, "name" | "email" | "avatar_url">
>;

/** Shape of a `profiles` row as loaded from Supabase. */
export interface ProfileRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string | null;
  page_access?: string[] | null;
}

interface AuthState {
  user: AuthUser;
  setUser: (user: AuthUser) => void;
  setRole: (role: UserRole) => void;
  /** Persists profile fields (demo). Recomputes initials when `name` changes. */
  updateProfile: (partial: ProfileUpdate) => void;
  /** Mirror a real Supabase profile into the store (Phase 1 auth bridge). */
  applyProfile: (profile: ProfileRecord) => void;
  /** Restore the demo user (e.g. after Supabase sign-out). */
  resetToDemo: () => void;
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
      applyProfile: (profile) =>
        set(() => ({
          user: {
            // Keep a numeric id so the still-demo data layer (tasks/projects)
            // doesn't break; the real UUID lives in authId until Phases 2–3.
            id: DEMO_USER.id,
            authId: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            avatar_url: profile.avatar_url ?? undefined,
            initials: deriveInitials(profile.name),
            page_access: profile.page_access ?? null,
          },
        })),
      resetToDemo: () => set({ user: DEMO_USER }),
    }),
    {
      name: "timeline-auth",
      version: 1,
    }
  )
);
