"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import {
  DEFAULT_HOURLY_RATES,
  type HourlyRate,
  type RateLevel,
} from "@/lib/pricing/hourly-rates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import type { Database } from "@/types/database.types";

type RateRow = Database["public"]["Tables"]["hourly_rates"]["Row"];

function rowToRate(r: RateRow): HourlyRate {
  return {
    responsible: r.responsible,
    level: r.level as RateLevel,
    rate: Number(r.rate),
    updated_by: r.updated_by,
    updated_at: r.updated_at,
  };
}

const same = (a: HourlyRate, responsible: string, level: RateLevel) =>
  a.responsible === responsible && a.level === level;

export type RateChange = {
  responsible: string;
  level: RateLevel;
  rate: number;
};

type HourlyRatesState = {
  rates: HourlyRate[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /**
   * Admin + manager read the table; RLS returns nothing for a member or viewer,
   * which is the correct answer for them (rates are commercial data).
   */
  hydrateFromSupabase: () => Promise<void>;
  applyRealtimeUpsert: (row: RateRow) => void;
  applyRealtimeDelete: (responsible: string, level: RateLevel) => void;
  /**
   * Save several edited rates in ONE upsert (admin only — RLS refuses anyone
   * else). Optimistic, rolled back on failure. Resolves true when saved, so the
   * settings form can clear its dirty state only on success.
   */
  saveRates: (changes: RateChange[]) => Promise<boolean>;
};

export const useHourlyRatesStore = create<HourlyRatesState>()(
  persist(
    (set, get) => ({
      rates: isSupabaseConfigured ? [] : DEFAULT_HOURLY_RATES,
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase.from("hourly_rates").select("*");
        if (error) {
          set({
            loading: false,
            loaded: true,
            error: parseSupabaseError(error),
          });
          return;
        }
        set({
          rates: (data ?? []).map(rowToRate),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      applyRealtimeUpsert: (row) => {
        const next = rowToRate(row);
        set((s) => {
          const i = s.rates.findIndex((r) =>
            same(r, next.responsible, next.level),
          );
          if (i === -1) return { rates: [...s.rates, next] };
          const rates = [...s.rates];
          rates[i] = next;
          return { rates };
        });
      },

      applyRealtimeDelete: (responsible, level) =>
        set((s) => ({
          rates: s.rates.filter((r) => !same(r, responsible, level)),
        })),

      saveRates: async (changes) => {
        if (!changes.length) return true;
        const snapshot = get().rates;
        set((s) => ({
          rates: s.rates.map((r) => {
            const c = changes.find((x) => same(r, x.responsible, x.level));
            return c ? { ...r, rate: c.rate } : r;
          }),
        }));

        if (!isSupabaseConfigured) return true;

        const supabase = createClient();
        // updated_by / updated_at are stamped by the 0042 trigger — never sent.
        const { data, error } = await supabase
          .from("hourly_rates")
          .upsert(changes, { onConflict: "responsible,level" })
          .select("*");
        if (error) {
          set({ rates: snapshot });
          toast.error("Couldn't save hourly rates", {
            description: parseSupabaseError(error),
          });
          return false;
        }
        // Adopt the server's stamps so "last changed by" is right immediately.
        for (const row of data ?? []) get().applyRealtimeUpsert(row);
        return true;
      },
    }),
    {
      name: "timeline-hourly-rates",
      version: 1,
      // Live mode keeps nothing locally: Postgres is the source of truth.
      partialize: (s) => (isSupabaseConfigured ? {} : { rates: s.rates }),
    },
  ),
);
