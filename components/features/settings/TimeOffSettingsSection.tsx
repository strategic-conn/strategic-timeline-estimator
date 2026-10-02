"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
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
import { ymdCompare } from "@/lib/utils/availability-dates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuthStore } from "@/store/auth-store";
import { useAvailabilityStore } from "@/store/availability-store";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import type {
  AvailabilityEntryKind,
  AvailabilityStatus,
} from "@/types/availability.types";
import { tourAnchor } from "@/lib/tours/ids";

const KIND_LABEL: Record<AvailabilityEntryKind, string> = {
  pto: "PTO / vacation",
  unavailable: "Away (other)",
  partial: "Partial day",
};

const STATUS_STYLE: Record<AvailabilityStatus, { label: string; className: string }> = {
  pending: {
    label: "Awaiting approval",
    className: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  },
  rejected: {
    label: "Declined",
    className: "border-destructive/40 text-destructive",
  },
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

export function TimeOffSettingsSection() {
  const userId = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const entries = useAvailabilityStore((s) => s.entries);
  const addEntry = useAvailabilityStore((s) => s.addEntry);
  const deleteEntry = useAvailabilityStore((s) => s.deleteEntry);
  // An approver's own entry needs no approval, so the copy must not promise one.
  const { canApproveTimeOff } = usePermissions();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const mine = React.useMemo(
    () =>
      entries
        .filter((e) => e.user_id === userId)
        .sort((a, b) => ymdCompare(b.start_date, a.start_date)),
    [entries, userId]
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
      user_id: userId,
      start_date: values.start_date,
      end_date: values.end_date,
      kind: values.kind,
      note: values.note,
    });
    toast.success(
      canApproveTimeOff ? "Time off added" : "Request submitted",
      {
        description: canApproveTimeOff
          ? "It appears on the team calendar for planning."
          : "An admin or manager will review it. Until then it does not change your capacity.",
      }
    );
    setDialogOpen(false);
    form.reset();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* max-sm:pr-8: room for the card's corner "?" on a phone only. */}
        <div className="flex items-start gap-3 max-sm:pr-8">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <CalendarOff className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold">Time off & availability</h2>
            <p className="text-sm text-muted-foreground">
              {canApproveTimeOff
                ? "Log when you’re out so teammates see it on the calendar."
                : "Request time off. An admin or manager reviews it — until it is approved it does not change your capacity or the project plan."}
              {isSupabaseConfigured
                ? " Saved to your workspace."
                : " Stored locally in this demo."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={openAdd}
          {...tourAnchor("settings.request-timeoff")}
        >
          <Plus className="size-4" aria-hidden />
          {canApproveTimeOff ? "Add time off" : "Request time off"}
        </Button>
      </div>

      {mine.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No entries yet. Add a date range when you&apos;re on PTO or unavailable.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dates</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.map((row) => (
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
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "whitespace-nowrap font-normal",
                        STATUS_STYLE[row.status].className
                      )}
                      title={
                        row.review_note
                          ? `Reason: ${row.review_note}`
                          : undefined
                      }
                    >
                      {STATUS_STYLE[row.status].label}
                    </Badge>
                    {/* A decline without a reason is the thing people chase an
                        approver about; show it where they read the verdict. */}
                    {row.status === "rejected" && row.review_note ? (
                      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                        {row.review_note}
                      </p>
                    ) : null}
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
                      onClick={() => setDeleteId(row.id)}
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
            <DialogTitle>Add time off</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pto-start">Start</Label>
                <Input
                  id="pto-start"
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
                <Label htmlFor="pto-end">End</Label>
                <Input id="pto-end" type="date" {...form.register("end_date")} />
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
              <Label htmlFor="pto-note">Note (optional)</Label>
              <Textarea
                id="pto-note"
                rows={2}
                placeholder="e.g. Conference, moving day…"
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
        open={deleteId != null}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this time off?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the time off entry. Your team calendar will update
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteId) deleteEntry(deleteId, userId);
                setDeleteId(null);
                toast.success("Time off removed");
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
