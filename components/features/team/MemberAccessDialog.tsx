"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  isCustomAccess,
  PageAccessChecklist,
  reachableForRole,
} from "@/components/features/team/PageAccessChecklist";
import { ALWAYS_ON_HREFS } from "@/components/layouts/dashboard-nav-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import type { TeamMember } from "@/types/task.types";

const ALWAYS_ON = new Set<string>(ALWAYS_ON_HREFS);

type Props = {
  member: TeamMember;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the saved value (array = custom, null = role default). */
  onSaved: (pageAccess: string[] | null) => void;
};

export function MemberAccessDialog({ member, open, onOpenChange, onSaved }: Props) {
  const reachable = React.useMemo(
    () => reachableForRole(member.role),
    [member.role],
  );

  const initialSelected = React.useMemo(() => {
    const reachableSet = new Set(reachable);
    const base =
      member.page_access == null
        ? reachable
        : member.page_access.filter((h) => reachableSet.has(h));
    const s = new Set(base);
    for (const h of ALWAYS_ON) s.add(h);
    return s;
  }, [member.page_access, reachable]);

  const [selected, setSelected] = React.useState<Set<string>>(initialSelected);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelected(new Set(initialSelected));
  }, [open, initialSelected]);

  const toggle = (href: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(href);
      else next.delete(href);
      return next;
    });

  const isCustom = isCustomAccess(member.role, selected);

  const save = async () => {
    setSaving(true);
    const value = isCustom ? [...selected] : null;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ page_access: value })
      .eq("id", member.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save access", {
        description: parseSupabaseError(error),
      });
      return;
    }
    onSaved(value);
    toast.success("Access updated", {
      description: `Saved ${member.name}'s page access.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Page access — {member.name}</DialogTitle>
          <DialogDescription>
            Choose which sections {member.name.split(/\s+/)[0]} can open. Data is
            still governed by their role ({member.role}) — this only controls
            which pages they see.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <PageAccessChecklist
            role={member.role}
            selected={selected}
            onToggle={toggle}
            idPrefix={`member-${member.id}`}
            disabled={saving}
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setSelected(new Set(reachable))}
            disabled={saving || !isCustom}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset to role default
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
