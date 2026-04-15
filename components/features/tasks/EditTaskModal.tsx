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
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { cn } from "@/lib/utils";
import { useSprintsStore } from "@/store/sprints-store";
import type { Task, TaskPriority, TaskStatus } from "@/types/task.types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/task.types";

const BACKLOG_VALUE = "__backlog__";

const schema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be 200 characters or fewer"),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "in_review", "done", "blocked"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  sprint_id: z.string(),
  assignee_ids: z.array(z.number().int()),
  due_date: z.string().optional(),
  estimated_hours: z.number().min(0).optional(),
  tags: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export interface EditTaskModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, partial: Partial<Task>) => void;
}

export function EditTaskModal({
  task,
  open,
  onClose,
  onUpdate,
}: EditTaskModalProps) {
  const [tagInput, setTagInput] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);

  const allSprints = useSprintsStore((s) => s.sprints);
  const projectSprints = React.useMemo(
    () => allSprints.filter((sp) => sp.project_id === (task?.project_id ?? "")),
    [allSprints, task?.project_id]
  );

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
      sprint_id: BACKLOG_VALUE,
      assignee_ids: [],
      due_date: undefined,
      estimated_hours: undefined,
      tags: [],
    },
  });

  React.useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        sprint_id: task.sprint_id ?? BACKLOG_VALUE,
        assignee_ids: [...task.assignee_ids],
        due_date: task.due_date,
        estimated_hours: task.estimated_hours,
        tags: [...task.tags],
      });
      setTagInput("");
    }
  }, [task?.id, task?.updated_at, reset]);

  const tags = watch("tags");
  const dueDate = watch("due_date");

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
    if (!task) return;
    onUpdate(task.id, {
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      status: data.status as TaskStatus,
      priority: data.priority as TaskPriority,
      sprint_id: data.sprint_id === BACKLOG_VALUE ? null : data.sprint_id,
      assignee_ids: data.assignee_ids,
      due_date: data.due_date,
      estimated_hours: data.estimated_hours,
      tags: data.tags,
    });
    onClose();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <Dialog open={open && task != null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update task details. Changes are applied on save.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="et-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="et-title"
              placeholder="What needs to be done?"
              {...register("title")}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-desc">Description</Label>
            <Textarea
              id="et-desc"
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
            name="sprint_id"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label>Sprint</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BACKLOG_VALUE}>Backlog</SelectItem>
                    {projectSprints.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.name}{" "}
                        <span className="text-xs text-muted-foreground capitalize">
                          ({sp.status})
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
            name="assignee_ids"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label>Assignees</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {TEAM_MEMBERS.map((m) => {
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
                                field.value.filter((x: number) => x !== m.id)
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
                      ? new Date(dueDate).toLocaleDateString()
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ? new Date(dueDate) : undefined}
                    onSelect={(d) => {
                      setValue("due_date", d?.toISOString());
                      setCalOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-est">Estimated hours</Label>
              <Input
                id="et-est"
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
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
