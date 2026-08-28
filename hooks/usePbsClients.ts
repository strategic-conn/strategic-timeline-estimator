"use client";

import * as React from "react";

import type { PbsClient } from "@/lib/pbs/clients";
import type { ProposalPbsLink } from "@/types/proposal.types";

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
type Directory = {
  clients: PbsClient[];
  templateOverride: string | null;
  defaultClient: PbsClient | null;
};

let cache: Directory | null = null;
let inFlight: Promise<Directory> | null = null;

async function fetchClients(): Promise<Directory> {
  const res = await fetch("/api/pbs/clients");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load PBS clients.");
  return {
    clients: (data?.clients ?? []) as PbsClient[],
    templateOverride: (data?.templateOverride ?? null) as string | null,
    defaultClient: (data?.defaultClient ?? null) as PbsClient | null,
  };
}

export function usePbsClients() {
  const [clients, setClients] = React.useState<PbsClient[]>(cache?.clients ?? []);
  const [templateOverride, setTemplateOverride] = React.useState<string | null>(
    cache?.templateOverride ?? null,
  );
  const [defaultClient, setDefaultClient] = React.useState<PbsClient | null>(
    cache?.defaultClient ?? null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    // Adopt an already-warm cache instead of bailing. Two components use this
    // hook and mount together; whichever loaded first filled the module cache,
    // and returning early here left the other one showing "not loaded" — which
    // is how Setup could read STR while the send dialog read "no billing client".
    if (cache) {
      setClients(cache.clients);
      setTemplateOverride(cache.templateOverride);
      setDefaultClient(cache.defaultClient);
      return;
    }
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
        setDefaultClient(dir.defaultClient);
      })
      .catch((e: unknown) => {
        // Don't cache a failure — the next open should try again.
        inFlight = null;
        setError(e instanceof Error ? e.message : "Couldn't load PBS clients.");
      })
      .finally(() => setLoading(false));
  }, []);

  return { clients, templateOverride, defaultClient, loading, error, load };
}

/**
 * Where this estimate's PO would be filed — client, code and template.
 *
 * Both the send dialog (which shows it) and the Create-PO dialog (which acts on
 * it) resolve it here, for the same reason `lib/pbs/directory.ts` is shared
 * server-side: two copies of this precedence eventually disagree, and the only
 * symptom is a PO on the wrong client. Resolution order matches the server —
 * the estimate's own client, else the workspace default.
 */
export function usePbsPoTarget(quote: { pbs?: ProposalPbsLink | null }) {
  const { clients, templateOverride, defaultClient, loading, error, load } =
    usePbsClients();

  const own = quote.pbs?.client_id ?? null;
  const clientId = own ?? defaultClient?.clientId ?? null;
  const code =
    quote.pbs?.client_code ??
    (own
      ? (clients.find((c) => c.clientId === own)?.code ?? null)
      : (defaultClient?.code ?? null));

  return {
    clients,
    load,
    loading,
    error,
    clientId,
    code,
    /** No client of its own — falling back to the workspace default. */
    usingDefault: !own && Boolean(defaultClient),
    template:
      templateOverride ??
      clients.find((c) => c.clientId === clientId)?.templates[0] ??
      null,
    templateOverride,
    /** PBS can't delete or update a PO, so an existing one is final. */
    existingPo: quote.pbs?.po_no ?? quote.pbs?.po_id ?? null,
  };
}
