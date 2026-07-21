"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { clampConfidence, skillKey, type MemberSkill } from "@/types/skill.types";

/** Skills keyed by profile id → list of { skill, confidence }. */
type SkillMap = Record<string, MemberSkill[]>;

function sortByConfidence(list: MemberSkill[]): MemberSkill[] {
  return [...list].sort(
    (a, b) => b.confidence - a.confidence || a.skill.localeCompare(b.skill),
  );
}

type MemberSkillsState = {
  skills: SkillMap;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /** Add a new skill or update an existing one's confidence (case-insensitive match). */
  setSkill: (profileId: string, skill: string, confidence: number) => void;
  removeSkill: (profileId: string, skill: string) => void;
};

export const useMemberSkillsStore = create<MemberSkillsState>()(
  persist(
    (set, get) => ({
      skills: {},
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase.from("member_skills").select("*");
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        const map: SkillMap = {};
        for (const row of data ?? []) {
          (map[row.profile_id] ??= []).push({
            skill: row.skill,
            confidence: clampConfidence(row.confidence),
          });
        }
        for (const id of Object.keys(map)) map[id] = sortByConfidence(map[id]);
        set({ skills: map, loading: false, loaded: true, error: null });
      },

      setSkill: (profileId, skillRaw, confidenceRaw) => {
        const skill = skillRaw.trim();
        if (!skill) return;
        const confidence = clampConfidence(confidenceRaw);
        const key = skillKey(skill);
        const prev = get().skills[profileId] ?? [];

        // Upsert by case-insensitive key; keep the existing display casing if present.
        const existing = prev.find((s) => skillKey(s.skill) === key);
        const next = existing
          ? prev.map((s) =>
              skillKey(s.skill) === key ? { ...s, confidence } : s,
            )
          : [...prev, { skill, confidence }];

        set((s) => ({
          skills: { ...s.skills, [profileId]: sortByConfidence(next) },
        }));

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("member_skills")
            .upsert(
              {
                profile_id: profileId,
                skill: existing ? existing.skill : skill,
                confidence,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "profile_id,skill" },
            );
          if (error) {
            set((s) => ({ skills: { ...s.skills, [profileId]: prev } }));
            toast.error("Couldn't save skill", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      removeSkill: (profileId, skill) => {
        const key = skillKey(skill);
        const prev = get().skills[profileId] ?? [];
        const target = prev.find((s) => skillKey(s.skill) === key);
        if (!target) return;
        set((s) => ({
          skills: {
            ...s.skills,
            [profileId]: prev.filter((x) => skillKey(x.skill) !== key),
          },
        }));

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("member_skills")
            .delete()
            .eq("profile_id", profileId)
            .eq("skill", target.skill);
          if (error) {
            set((s) => ({ skills: { ...s.skills, [profileId]: prev } }));
            toast.error("Couldn't remove skill", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },
    }),
    {
      name: "timeline-member-skills",
      version: 1,
      // Live skills live in Supabase (re-fetched on load); demo persists locally.
      partialize: (s) =>
        isSupabaseConfigured ? { skills: {} } : { skills: s.skills },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            skills: {},
          } as unknown as MemberSkillsState;
        }
        return persisted as MemberSkillsState;
      },
    },
  ),
);

/** Reactive skills list for one member (sorted, strongest first). */
export function useMemberSkills(profileId: string | null | undefined): MemberSkill[] {
  const skills = useMemberSkillsStore((s) => s.skills);
  return useMemo(
    () => (profileId ? skills[profileId] ?? [] : []),
    [skills, profileId],
  );
}

/**
 * Distinct skill names already used anywhere in the workspace (first-seen casing
 * kept). Feeds the editor's suggestions so naming stays consistent across people.
 */
export function useAllSkillNames(): string[] {
  const skills = useMemberSkillsStore((s) => s.skills);
  return useMemo(() => {
    const byKey = new Map<string, string>();
    for (const list of Object.values(skills)) {
      for (const s of list) {
        const k = skillKey(s.skill);
        if (!byKey.has(k)) byKey.set(k, s.skill);
      }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [skills]);
}
