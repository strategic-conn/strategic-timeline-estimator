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
import type { Sprint } from "@/types/sprint.types";
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
    (d) => !d.start_date || !d.end_date || new Date(d.end_date) > new Date(d.start_date),
    { message: "End date must be after start date", path: ["end_date"] }
  );

type FormValues = z.infer<typeof schema>;

export interface EditSprintModalProps {
  sprint: Sprint | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, partial: Partial<Sprint>) => void;
}

export function EditSprintModal({
  sprint,
  open,
  onClose,
  onSave,
}: EditSprintModalProps) {
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
    if (!open || !sprint) return;
    form.reset({
      name: sprint.name,
      goal: sprint.goal ?? "",
      status: sprint.status,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
    });
  }, [open, sprint, form.reset]);

  const startDate = form.watch("start_date");
  const endDate = form.watch("end_date");

  const onSubmit = form.handleSubmit((values) => {
    if (!sprint) return;
    onSave(sprint.id, {
      name: values.name.trim(),
      goal: values.goal?.trim() || undefined,
      status: values.status,
      start_date: values.start_date,
      end_date: values.end_date,
    });
    onClose();
  });

  return (
    <Dialog open={open && sprint != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit sprint</DialogTitle>
          <DialogDescription>
            Update the sprint details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-sprint-name"
              {...form.register("name")}
              aria-invalid={!!form.formState.errors.name}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-sprint-goal">Goal (optional)</Label>
            <Textarea
              id="edit-sprint-goal"
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
                        <span className={cn("rounded px-1.5 py-0.5 text-xs", s.color)}>
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
                      !startDate && "text-muted-foreground"
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
                      !endDate && "text-muted-foreground"
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
