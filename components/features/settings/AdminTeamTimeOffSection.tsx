"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Trash2, Users } from "lucide-react";
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
import { usePermissions } from "@/hooks/usePermissions";
import { ymdCompare } from "@/lib/utils/availability-dates";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { useAvailabilityStore } from "@/store/availability-store";
import type { AvailabilityEntryKind } from "@/types/availability.types";

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
  const { canEditOthersAvailability } = usePermissions();
  const entries = useAvailabilityStore((s) => s.entries);
  const addEntry = useAvailabilityStore((s) => s.addEntry);
  const deleteEntry = useAvailabilityStore((s) => s.deleteEntry);

  const [selectedUserId, setSelectedUserId] = React.useState<number>(
    TEAM_MEMBERS[0]?.id ?? 1
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string;
    userId: number;
  } | null>(null);

  const selectedMember = TEAM_MEMBERS.find((m) => m.id === selectedUserId);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Users className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Team time off (admin)</h2>
            <p className="text-sm text-muted-foreground">
              Add or remove PTO and away days for anyone on the team. Shown on the
              calendar like their own entries. Demo only — wire to your API later.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <Label htmlFor="admin-pto-person" className="text-xs text-muted-foreground">
            Person
          </Label>
          <Select
            value={String(selectedUserId)}
            onValueChange={(v) => setSelectedUserId(Number(v))}
          >
            <SelectTrigger id="admin-pto-person" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_MEMBERS.map((m) => (
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
              {selectedMember?.name ?? "this person"} in the demo store only.
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
