"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CreateSprintInput } from "@/store/sprints-store";
import { SPRINT_STATUSES } from "@/types/sprint.types";

const schema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be 100 characters or fewer"),
    goal: z.string().max(500).optional(),
    status: z.enum(["planning", "active", "completed", "cancelled"]),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
  })
  .refine(
    // `>=`, not `>`. A one-day sprint is legitimate, and the estimate
    // scaffolder (`convertToProject` / `regenerateSchedule`) already writes
    // them — it inserts straight through supabase and never sees this schema.
    // With `>` those sprints could not be saved from this modal at all: rename
    // one and it failed validation on dates nobody had touched. Two live
    // sprints were in exactly that state.
    (d) =>
      !d.start_date ||
      !d.end_date ||
      new Date(d.end_date) >= new Date(d.start_date),
    { message: "End date cannot be before start date", path: ["end_date"] },
  );

type FormValues = z.infer<typeof schema>;

export interface CreateSprintModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreate: (payload: CreateSprintInput) => void;
}

export function CreateSprintModal({
  open,
  onClose,
  projectId,
  onCreate,
}: CreateSprintModalProps) {
  const [startCalOpen, setStartCalOpen] = React.useState(false);
  const [endCalOpen, setEndCalOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      goal: "",
      status: "planning",
      start_date: "",
      end_date: "",
    },
    mode: "onBlur",
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      name: "",
      goal: "",
      status: "planning",
      start_date: "",
      end_date: "",
    });
  }, [open, form.reset]);

  const startDate = form.watch("start_date");
  const endDate = form.watch("end_date");

  const onSubmit = form.handleSubmit((values) => {
    onCreate({
      project_id: projectId,
      name: values.name.trim(),
      goal: values.goal?.trim() || undefined,
      status: values.status,
      start_date: values.start_date,
      end_date: values.end_date,
    });
    onClose();
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create sprint</DialogTitle>
          <DialogDescription>
            Add a time-boxed iteration to this project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sprint-name"
              placeholder="e.g. Sprint 4"
              {...form.register("name")}
              aria-invalid={!!form.formState.errors.name}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sprint-goal">Goal (optional)</Label>
            <Textarea
              id="sprint-goal"
              placeholder="What should this sprint achieve?"
              rows={2}
              className="min-h-16 resize-y"
              {...form.register("goal")}
            />
          </div>

          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPRINT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs",
                            s.color,
                          )}
                        >
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Start date <span className="text-destructive">*</span>
              </Label>
              <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal",
                      !startDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarDays className="size-4" />
                    {startDate
                      ? new Date(startDate).toLocaleDateString()
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? new Date(startDate) : undefined}
                    onSelect={(d) => {
                      form.setValue("start_date", d?.toISOString() ?? "", {
                        shouldValidate: true,
                      });
                      setStartCalOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.start_date ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.start_date.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>
                End date <span className="text-destructive">*</span>
              </Label>
              <Popover open={endCalOpen} onOpenChange={setEndCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal",
                      !endDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarDays className="size-4" />
                    {endDate
                      ? new Date(endDate).toLocaleDateString()
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? new Date(endDate) : undefined}
                    onSelect={(d) => {
                      form.setValue("end_date", d?.toISOString() ?? "", {
                        shouldValidate: true,
                      });
                      setEndCalOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.end_date ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.end_date.message}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Create sprint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
