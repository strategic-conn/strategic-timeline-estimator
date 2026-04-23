import type { AppNotification } from "@/store/notifications-store";

/** Derive project id from internal links like /projects/proj-1/... */
export function deriveProjectIdFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = /^\/projects\/([^/]+)/.exec(href);
  return m ? m[1] : null;
}

export function activityItemMatchesProject(
  item: AppNotification,
  projectId: string
): boolean {
  if (item.project_id === projectId) return true;
  const fromHref = deriveProjectIdFromHref(item.href);
  return fromHref === projectId;
}

export function sortActivityNewestFirst(items: AppNotification[]): AppNotification[] {
  return [...items].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}

export type ActivityDayGroup = {
  key: string;
  label: string;
  items: AppNotification[];
};

export function groupActivityByDay(items: AppNotification[]): ActivityDayGroup[] {
  const sorted = sortActivityNewestFirst(items);
  const map = new Map<string, AppNotification[]>();
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
      label = dayDate.toLocaleDateString(undefined, {
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
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
