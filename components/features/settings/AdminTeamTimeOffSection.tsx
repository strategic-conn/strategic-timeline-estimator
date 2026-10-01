"use client";

import * as React from "react";
import { format } from "date-fns";
import { Inbox, Plus, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { TimeOffApprovalDialog } from "@/components/features/settings/TimeOffApprovalDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { ymdCompare } from "@/lib/utils/availability-dates";
import { useActiveTeamMembers, useTeamMembers } from "@/store/team-store";
import { useAvailabilityStore } from "@/store/availability-store";
import type {
  AvailabilityEntry,
  AvailabilityEntryKind,
} from "@/types/availability.types";
import { tourAnchor } from "@/lib/tours/ids";

const KIND_LABEL: Record<AvailabilityEntryKind, string> = {
  pto: "PTO / vacation",
  unavailable: "Away (other)",
  partial: "Partial day",
};

const schema = z
  .object({
    start_date: z.string().min(1, "Start date required"),
    end_date: z.string().min(1, "End date required"),
    kind: z.enum(["pto", "unavailable", "partial"]),
    note: z.string().optional(),
  })
  .refine((d) => ymdCompare(d.start_date, d.end_date) <= 0, {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

type FormValues = z.infer<typeof schema>;

export function AdminTeamTimeOffSection() {
  const { canEditOthersAvailability, canApproveTimeOff } = usePermissions();
  /**
   * Active members only, like every other picker.
   *
   * `useTeamMembers()` includes invitees who never accepted, and because the
   * list is alphabetical this section DEFAULTED to one of them — offering to
   * record time off for someone who has never signed in. Deactivated members
   * are out too: you do not schedule leave for someone who has left.
   */
  const members = useActiveTeamMembers();
  const entries = useAvailabilityStore((s) => s.entries);
  const addEntry = useAvailabilityStore((s) => s.addEntry);
  const deleteEntry = useAvailabilityStore((s) => s.deleteEntry);

  /**
   * Requests waiting on a decision, oldest first — a queue, so the person who
   * asked first is answered first.
   *
   * Reads the FULL directory rather than `useActiveTeamMembers`, because a
   * request from somebody since deactivated still has to be visible; it would
   * otherwise sit pending forever with no way to clear it.
   */
  const allMembers = useTeamMembers();
  const pending = React.useMemo(
    () =>
      entries
        .filter((e) => e.status === "pending")
        .sort((a, b) => ymdCompare(a.start_date, b.start_date)),
    [entries]
  );
  const [reviewing, setReviewing] = React.useState<AvailabilityEntry | null>(null);
  const reviewingName =
    allMembers.find((m) => m.id === reviewing?.user_id)?.name ?? "This person";

  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string;
    userId: string;
  } | null>(null);

  // Default to the first teammate once the directory loads (live mode hydrates async).
  React.useEffect(() => {
    if (!selectedUserId && members.length > 0) {
      setSelectedUserId(members[0].id);
    }
  }, [members, selectedUserId]);

  const selectedMember = members.find((m) => m.id === selectedUserId);

  const forPerson = React.useMemo(
    () =>
      entries
        .filter((e) => e.user_id === selectedUserId)
        .sort((a, b) => ymdCompare(b.start_date, a.start_date)),
    [entries, selectedUserId]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      start_date: "",
      end_date: "",
      kind: "pto",
      note: "",
    },
  });

  if (!canEditOthersAvailability) {
    return null;
  }

  const openAdd = () => {
    form.reset({
      start_date: "",
      end_date: "",
      kind: "pto",
      note: "",
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    addEntry({
      user_id: selectedUserId,
      start_date: values.start_date,
      end_date: values.end_date,
      kind: values.kind,
      note: values.note,
    });
    toast.success("Time off saved for teammate", {
      description: selectedMember?.name ?? `User ${selectedUserId}`,
    });
    setDialogOpen(false);
    form.reset();
  });

  return (
    <div className="space-y-6 border-t border-border/60 pt-8">
      {canApproveTimeOff ? (
        <section className="space-y-3" {...tourAnchor("settings.approvals")}>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Inbox className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Time-off requests
                {pending.length > 0 ? (
                  <Badge className="bg-amber-500/15 font-normal text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
                    {pending.length} waiting
                  </Badge>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                A request changes nothing until it is approved — not capacity, not
                the plan. Reviewing one shows exactly what it would hit.
              </p>
            </div>
          </div>

          {pending.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Nothing waiting. Requests appear here as soon as someone submits one.
            </p>
          ) : (
            <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border">
              {pending.map((e) => {
                const who = allMembers.find((m) => m.id === e.user_id);
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {who?.name ?? "Unknown member"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(`${e.start_date}T12:00:00`), "MMM d")}
                        {e.end_date !== e.start_date
                          ? ` – ${format(new Date(`${e.end_date}T12:00:00`), "MMM d, yyyy")}`
                          : format(new Date(`${e.start_date}T12:00:00`), ", yyyy")}{" "}
                        · {KIND_LABEL[e.kind]}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setReviewing(e)}
                    >
                      Review
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <TimeOffApprovalDialog
        entry={reviewing}
        memberName={reviewingName}
        onClose={() => setReviewing(null)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Users className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            {/* Not "(admin)": the gate is canEditOthersAvailability, which
                managers have too — and a manager seeing a section labelled
                admin-only reasonably wonders whether they should be there. */}
            <h2 className="text-base font-semibold">Team time off</h2>
            <p className="text-sm text-muted-foreground">
              Add or remove PTO and away days for anyone on the team. Shown on the
              calendar like their own entries.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <Label htmlFor="admin-pto-person" className="text-xs text-muted-foreground">
            Person
          </Label>
          <Select
            value={selectedUserId}
            onValueChange={(v) => setSelectedUserId(v)}
          >
            <SelectTrigger id="admin-pto-person" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}{" "}
                  <span className="text-muted-foreground">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="size-4" aria-hidden />
          Add for {selectedMember?.name.split(/\s+/)[0] ?? "teammate"}
        </Button>
      </div>

      {forPerson.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No time off for {selectedMember?.name ?? "this person"} yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dates</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forPerson.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(row.start_date + "T12:00:00"), "MMM d, yyyy")}
                    {row.end_date !== row.start_date
                      ? ` – ${format(new Date(row.end_date + "T12:00:00"), "MMM d, yyyy")}`
                      : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {KIND_LABEL[row.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-[200px] truncate text-muted-foreground sm:table-cell">
                    {row.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      aria-label="Remove entry"
                      onClick={() =>
                        setDeleteTarget({ id: row.id, userId: row.user_id })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add time off — {selectedMember?.name ?? "teammate"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-pto-start">Start</Label>
                <Input
                  id="admin-pto-start"
                  type="date"
                  {...form.register("start_date")}
                />
                {form.formState.errors.start_date ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.start_date.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-pto-end">End</Label>
                <Input
                  id="admin-pto-end"
                  type="date"
                  {...form.register("end_date")}
                />
                {form.formState.errors.end_date ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.end_date.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.watch("kind")}
                onValueChange={(v) =>
                  form.setValue("kind", v as AvailabilityEntryKind)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as AvailabilityEntryKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-pto-note">Note (optional)</Label>
              <Textarea
                id="admin-pto-note"
                rows={2}
                placeholder="e.g. Approved PTO…"
                {...form.register("note")}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the time off block for{" "}
              {selectedMember?.name ?? "this person"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteEntry(deleteTarget.id, deleteTarget.userId);
                  toast.success("Time off removed");
                }
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
