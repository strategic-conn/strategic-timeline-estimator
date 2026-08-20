import { readFileSync } from "node:fs";
import { E2E_PREFIX } from "./helpers";

/**
 * Deletes anything a test created, matched strictly by the "[E2E]" prefix.
 *
 * Uses the service-role key directly rather than the UI, so cleanup still works
 * when a test failed midway. **Only ever removes prefixed rows** — a missing or
 * empty prefix aborts instead of risking a broad delete.
 */
function env(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* fall back to process env */
  }
  return { ...out, ...(process.env as Record<string, string>) };
}

export async function cleanupE2EData(): Promise<{ deleted: Record<string, number> }> {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  const deleted: Record<string, number> = {};
  if (!url || !key) return { deleted };

  // Guard rail: never run a delete without a non-empty, specific prefix.
  const prefix = E2E_PREFIX.trim();
  if (!prefix || prefix.length < 4) {
    throw new Error("Refusing to clean up: E2E prefix is missing or too broad.");
  }
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  // PostgREST `like` with * as the wildcard; prefix-anchored so only test rows match.
  const pattern = `${encodeURIComponent(prefix)}*`;

  // Children first — tasks/sprints reference projects.
  const targets: { table: string; column: string }[] = [
    { table: "tasks", column: "title" },
    { table: "sprints", column: "name" },
    { table: "projects", column: "name" },
    { table: "proposals", column: "title" },
  ];

  for (const { table, column } of targets) {
    const res = await fetch(`${url}/rest/v1/${table}?${column}=like.${pattern}`, {
      method: "DELETE",
      headers: { ...H, Prefer: "return=representation" },
    });
    if (!res.ok) {
      console.error(`[e2e cleanup] ${table} failed`, res.status, (await res.text()).slice(0, 200));
      continue;
    }
    const rows = await res.json().catch(() => []);
    deleted[table] = Array.isArray(rows) ? rows.length : 0;
  }
  return { deleted };
}
