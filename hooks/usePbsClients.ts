"use client";

import * as React from "react";

import type { PbsClient } from "@/lib/pbs/clients";

/**
 * The PBS billing clients, fetched on demand.
 *
 * Deliberately lazy: the list backs one Select on the Setup tab, and fetching it
 * for every estimate anyone opens would cost a 500-row PO read to populate a
 * control most visits never touch. `load()` runs on the Select's first open.
 *
 * Module-scoped cache, like the stage-refresh throttle: it survives client-side
 * navigation between estimates, and a real page load starts fresh — which is
 * when a newly-onboarded client should appear.
 */
type Directory = { clients: PbsClient[]; templateOverride: string | null };

let cache: Directory | null = null;
let inFlight: Promise<Directory> | null = null;

async function fetchClients(): Promise<Directory> {
  const res = await fetch("/api/pbs/clients");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load PBS clients.");
  return {
    clients: (data?.clients ?? []) as PbsClient[],
    templateOverride: (data?.templateOverride ?? null) as string | null,
  };
}

export function usePbsClients() {
  const [clients, setClients] = React.useState<PbsClient[]>(cache?.clients ?? []);
  const [templateOverride, setTemplateOverride] = React.useState<string | null>(
    cache?.templateOverride ?? null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (cache) return;
    setLoading(true);
    setError(null);
    // Share one request: opening and closing the Select twice in quick
    // succession shouldn't queue two 500-row reads.
    inFlight ??= fetchClients();
    void inFlight
      .then((dir) => {
        cache = dir;
        setClients(dir.clients);
        setTemplateOverride(dir.templateOverride);
      })
      .catch((e: unknown) => {
        // Don't cache a failure — the next open should try again.
        inFlight = null;
        setError(e instanceof Error ? e.message : "Couldn't load PBS clients.");
      })
      .finally(() => setLoading(false));
  }, []);

  return { clients, templateOverride, loading, error, load };
}
