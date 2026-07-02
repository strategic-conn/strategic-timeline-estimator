"use client";

import * as React from "react";

import {
  ALWAYS_ON_HREFS,
  DASHBOARD_NAV_GROUP_LABELS,
  DASHBOARD_NAV_GROUP_ORDER,
  gateableNavItems,
  roleReachableHrefs,
} from "@/components/layouts/dashboard-nav-config";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/store/auth-store";

const ALWAYS_ON = new Set<string>(ALWAYS_ON_HREFS);

/** Pages a role can reach (drives which checkboxes are offered). */
export function reachableForRole(role: UserRole): string[] {
  return roleReachableHrefs(role, role === "admin" || role === "manager");
}

/** True when `selected` is narrower than the role's full reachable set. */
export function isCustomAccess(role: UserRole, selected: Set<string>): boolean {
  return !reachableForRole(role).every((h) => selected.has(h));
}

type Props = {
  role: UserRole;
  selected: Set<string>;
  onToggle: (href: string, checked: boolean) => void;
  /** Unique prefix so checkbox ids don't collide when two lists share a page. */
  idPrefix: string;
  disabled?: boolean;
};

/** Grouped page checkboxes for a role. Always-on pages render checked+locked. */
export function PageAccessChecklist({
  role,
  selected,
  onToggle,
  idPrefix,
  disabled,
}: Props) {
  const groups = React.useMemo(() => {
    const reachable = new Set(reachableForRole(role));
    return DASHBOARD_NAV_GROUP_ORDER.map((g) => ({
      group: g,
      label: DASHBOARD_NAV_GROUP_LABELS[g],
      items: gateableNavItems().filter(
        (i) => i.group === g && reachable.has(i.href),
      ),
    })).filter((x) => x.items.length);
  }, [role]);

  return (
    <div className="space-y-4">
      {groups.map(({ group, label, items }) => (
        <div key={group}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <ul className="space-y-2.5">
            {items.map((item) => {
              const locked = ALWAYS_ON.has(item.href);
              const id = `${idPrefix}-${item.href}`;
              return (
                <li key={item.href} className="flex items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={selected.has(item.href)}
                    disabled={locked || disabled}
                    onCheckedChange={(v) => onToggle(item.href, v === true)}
                  />
                  <Label
                    htmlFor={id}
                    className="flex flex-1 items-center gap-2 text-sm font-normal"
                  >
                    <item.icon className="size-4 text-muted-foreground" aria-hidden />
                    {item.label}
                    {locked ? (
                      <span className="text-xs text-muted-foreground">
                        (always on)
                      </span>
                    ) : null}
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
