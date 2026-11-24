"use client";

import * as React from "react";

import type { EstherReference } from "@/lib/esther/estimate/references";

/** Esther's uploaded past estimates (`/api/esther/references`). Admin + manager. */
export function useEstherReferences() {
  const [refs, setRefs] = React.useState<EstherReference[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch("/api/esther/references");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load the past estimates.");
      setRefs(body.references ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  /** Reads one file with Esther and stores it. Throws with a message people can read. */
  const upload = React.useCallback(async (file: File): Promise<EstherReference> => {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/esther/references", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Esther couldn't read that file.");
    setRefs((r) => [body.reference, ...r]);
    return body.reference;
  }, []);

  const remove = React.useCallback(async (id: string) => {
    const before = refs;
    setRefs((r) => r.filter((x) => x.id !== id));
    const res = await fetch(`/api/esther/references?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      setRefs(before);
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't delete it.");
    }
  }, [refs]);

  return { refs, loaded, error, upload, remove };
}
