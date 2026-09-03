/** Minimal shape shared by activity-log entries and notifications. */
export interface ActivityLike {
  id: string;
  text: string;
  at: string;
  href?: string;
  project_id?: string | null;
}

/** Fixed locale so SSR and browser produce identical strings (avoids hydration errors). */
const ACTIVITY_DATE_LOCALE = "en-US";

/** Derive project id from internal links like /projects/proj-1/... */
export function deriveProjectIdFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = /^\/projects\/([^/]+)/.exec(href);
  return m ? m[1] : null;
}

export function activityItemMatchesProject(
  item: ActivityLike,
  projectId: string
): boolean {
  if (item.project_id === projectId) return true;
  const fromHref = deriveProjectIdFromHref(item.href);
  return fromHref === projectId;
}

export function sortActivityNewestFirst<T extends ActivityLike>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}

/**
 * Resolve the actor for an entry: the stored `actor_id`, else the name the text
 * starts with (rows written before `actor_id` existed carry only the name).
 *
 * **Longest name wins.** One member's name can be a prefix of another's — this
 * workspace has both "Daniel" and "Daniel Arvi Paragas" — and taking the first
 * match attributed the longer name's entries to the shorter person. Worse,
 * `activityDisplayBody` then strips only the matched part, so the row rendered
 * as "Arvi Paragas deleted project …". It also mixed the two together in the
 * per-user filter.
 */
export function resolveActorId(
  item: { actor_id?: string | null; text: string },
  members: { id: string; name: string }[]
): string | null {
  if (item.actor_id) return item.actor_id;
  const m = [...members]
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))
    .find((mm) => mm.name && item.text.startsWith(mm.name));
  return m ? m.id : null;
}

/** Strip the leading actor name and trailing " · Project" so both can render separately. */
export function activityDisplayBody(
  text: string,
  actorName: string | null,
  projectName: string | null
): string {
  let body = text;
  if (actorName && body.startsWith(actorName)) {
    body = body.slice(actorName.length).replace(/^\s+/, "");
  }
  if (projectName && body.endsWith(` · ${projectName}`)) {
    body = body.slice(0, body.length - ` · ${projectName}`.length);
  }
  return body;
}

export type ActivityDayGroup<T extends ActivityLike = ActivityLike> = {
  key: string;
  label: string;
  items: T[];
};

export function groupActivityByDay<T extends ActivityLike>(
  items: T[]
): ActivityDayGroup<T>[] {
  const sorted = sortActivityNewestFirst(items);
  const map = new Map<string, T[]>();
  const order: string[] = [];

  for (const item of sorted) {
    const d = new Date(item.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  return order.map((key) => {
    const [y, mo, da] = key.split("-").map(Number);
    const dayDate = new Date(y, mo - 1, da);
    dayDate.setHours(0, 0, 0, 0);
    let label: string;
    if (dayDate.getTime() === startOfToday.getTime()) label = "Today";
    else if (dayDate.getTime() === startOfYesterday.getTime())
      label = "Yesterday";
    else
      label = dayDate.toLocaleDateString(ACTIVITY_DATE_LOCALE, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year:
          dayDate.getFullYear() !== new Date().getFullYear()
            ? "numeric"
            : undefined,
      });

    return { key, label, items: map.get(key)! };
  });
}

export function formatActivityTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(ACTIVITY_DATE_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
