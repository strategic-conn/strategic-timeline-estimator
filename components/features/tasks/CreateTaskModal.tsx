"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Plus, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useActiveTeamMembers } from "@/store/team-store";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/types/task.types";
import {
  CURRENT_USER_ID,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/types/task.types";
import { format, parseISO } from "date-fns";

const schema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be 200 characters or fewer"),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "in_review", "done", "blocked"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignee_ids: z.array(z.string()),
  due_date: z.string().optional(),
  estimated_hours: z.number().min(0).optional(),
  tags: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  /** Tasks are scoped to a project; defaults to demo project with seeded data. */
  projectId?: string;
  /** Sprint context — string = sprint id, null = backlog, undefined = unspecified. */
  sprintId?: string | null;
  /** Initial status when the dialog opens (Kanban column vs toolbar default To Do). */
  defaultStatus?: TaskStatus;
  onCreate: (
    payload: Omit<
      Task,
      "id" | "position" | "created_at" | "updated_at" | "comments" | "assignees"
    >
  ) => void;
}

export function CreateTaskModal({
  open,
  onClose,
  projectId = "proj-1",
  sprintId,
  defaultStatus = "todo",
  onCreate,
}: CreateTaskModalProps) {
  const [tagInput, setTagInput] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);
  const teamMembers = useActiveTeamMembers();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      assignee_ids: [],
      due_date: undefined,
      estimated_hours: undefined,
      tags: [],
    },
  });

  const tags = watch("tags");
  const dueDate = watch("due_date");

  React.useEffect(() => {
    if (!open) return;
    reset({
      title: "",
      description: "",
      status: defaultStatus,
      priority: "medium",
      assignee_ids: [],
      due_date: undefined,
      estimated_hours: undefined,
      tags: [],
    });
    setTagInput("");
    setCalOpen(false);
  }, [open, defaultStatus, reset]);

  const addTag = () => {
    const raw = tagInput.trim().toLowerCase();
    if (!raw || tags.includes(raw)) {
      setTagInput("");
      return;
    }
    setValue("tags", [...tags, raw]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setValue(
      "tags",
      tags.filter((t) => t !== tag)
    );
  };

  const onSubmit = (data: FormValues) => {
    onCreate({
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      status: data.status as TaskStatus,
      priority: data.priority as TaskPriority,
      assignee_ids: data.assignee_ids,
      reporter_id: CURRENT_USER_ID,
      project_id: projectId,
      sprint_id: sprintId ?? null,
      due_date: data.due_date,
      estimated_hours: data.estimated_hours,
      logged_hours: 0,
      tags: data.tags,
    });
    reset();
    setTagInput("");
    onClose();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      setTagInput("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Add a new task. All fields except title are optional.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="ct-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ct-title"
              placeholder="What needs to be done?"
              {...register("title")}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-desc">Description</Label>
            <Textarea
              id="ct-desc"
              placeholder="Optional context…"
              rows={3}
              className="min-h-20 resize-y"
              {...register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => (
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

            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <span className={cn("text-sm", p.color)}>
                            {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          <Controller
            control={control}
            name="assignee_ids"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label>Assignees</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {teamMembers.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No teammates yet.
                    </p>
                  ) : null}
                  {teamMembers.map((m) => {
                    const checked = field.value.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            if (c === true) {
                              field.onChange([...field.value, m.id]);
                            } else {
                              field.onChange(
                                field.value.filter((x: string) => x !== m.id)
                              );
                            }
                          }}
                          aria-label={m.name}
                        />
                        <Avatar size="sm" className="size-6">
                          <AvatarImage src={m.avatar_url} alt="" />
                          <AvatarFallback className="text-[8px]">
                            {m.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="size-4" />
                    {dueDate
                      ? parseISO(dueDate).toLocaleDateString()
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ? parseISO(dueDate) : undefined}
                    onSelect={(d) => {
                      setValue("due_date", d ? format(d, "yyyy-MM-dd") : undefined);
                      setCalOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ct-est">Estimated hours</Label>
              <Input
                id="ct-est"
                type="number"
                min={0}
                step={0.25}
                placeholder="0"
                {...register("estimated_hours", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 pr-1 font-normal"
                >
                  {tag}
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-background/80"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Type a tag + Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addTag}
                aria-label="Add tag"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
