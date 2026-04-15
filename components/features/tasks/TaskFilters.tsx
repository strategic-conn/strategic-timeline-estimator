"use client";

import * as React from "react";
import { Check, Filter, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TEAM_MEMBERS, ALL_TAGS } from "@/lib/dummy/tasks.data";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/types/task.types";

export interface TaskFiltersProps {
  filters: {
    assigneeIds: number[];
    priorities: TaskPriority[];
    statuses: TaskStatus[];
    tags: string[];
    search: string;
  };
  onFiltersChange: (filters: TaskFiltersProps["filters"]) => void;
  isOpen: boolean;
}

const EMPTY_FILTERS: TaskFiltersProps["filters"] = {
  assigneeIds: [],
  priorities: [],
  statuses: [],
  tags: [],
  search: "",
};

function toggleInArray<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function FilterCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="h-5 min-w-5 gap-0.5 px-1.5 tabular-nums">
      <Check className="size-3 opacity-90" aria-hidden />
      {count}
    </Badge>
  );
}

function AssigneeAvatar({ member }: { member: (typeof TEAM_MEMBERS)[number] }) {
  return (
    <span className="relative flex size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
      <img
        src={member.avatar_url}
        alt=""
        className="size-full object-cover"
        width={28}
        height={28}
      />
    </span>
  );
}

function MultiSelectFilterButton({
  label,
  count,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-dashed"
          aria-expanded={open}
        >
          <Filter className="size-3.5 opacity-60" aria-hidden />
          <span>{label}</span>
          <FilterCountBadge count={count} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function TaskFilters({
  filters,
  onFiltersChange,
  isOpen,
}: TaskFiltersProps) {
  const [assigneeOpen, setAssigneeOpen] = React.useState(false);
  const [priorityOpen, setPriorityOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [tagOpen, setTagOpen] = React.useState(false);

  const patch = React.useCallback(
    (partial: Partial<TaskFiltersProps["filters"]>) => {
      onFiltersChange({ ...filters, ...partial });
    },
    [filters, onFiltersChange]
  );

  const toggleAssignee = (id: number) => {
    patch({ assigneeIds: toggleInArray(filters.assigneeIds, id) });
  };

  const togglePriority = (p: TaskPriority) => {
    patch({ priorities: toggleInArray(filters.priorities, p) });
  };

  const toggleStatus = (s: TaskStatus) => {
    patch({ statuses: toggleInArray(filters.statuses, s) });
  };

  const toggleTag = (tag: string) => {
    patch({ tags: toggleInArray(filters.tags, tag) });
  };

  const clearAll = () => {
    onFiltersChange({ ...EMPTY_FILTERS });
  };

  const activeTotal =
    filters.assigneeIds.length +
    filters.priorities.length +
    filters.statuses.length +
    filters.tags.length +
    (filters.search.trim() ? 1 : 0);

  return (
    <div
      className={cn(
        "border-b border-border bg-muted/20 px-4 py-3",
        !isOpen && "hidden"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilterButton
          label="Assignee"
          count={filters.assigneeIds.length}
          open={assigneeOpen}
          onOpenChange={setAssigneeOpen}
        >
          <Command>
            <CommandInput placeholder="Search people..." />
            <CommandList>
              <CommandEmpty>No teammate found.</CommandEmpty>
              <CommandGroup heading="Team">
                {TEAM_MEMBERS.map((member) => {
                  const selected = filters.assigneeIds.includes(member.id);
                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.name} ${member.email}`}
                      keywords={[member.email, member.role]}
                      onSelect={() => toggleAssignee(member.id)}
                      className="[&>svg:last-child]:hidden"
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                      />
                      <AssigneeAvatar member={member} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{member.name}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {member.email}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </MultiSelectFilterButton>

        <MultiSelectFilterButton
          label="Priority"
          count={filters.priorities.length}
          open={priorityOpen}
          onOpenChange={setPriorityOpen}
        >
          <Command>
            <CommandInput placeholder="Search priority..." />
            <CommandList>
              <CommandEmpty>No priority found.</CommandEmpty>
              <CommandGroup heading="Priority">
                {TASK_PRIORITIES.map((p) => {
                  const selected = filters.priorities.includes(p.value);
                  return (
                    <CommandItem
                      key={p.value}
                      value={p.label}
                      onSelect={() => togglePriority(p.value)}
                      className={cn(
                        "border-l-2 [&>svg:last-child]:hidden",
                        p.border
                      )}
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                      />
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-current/30 font-normal",
                          p.color
                        )}
                      >
                        {p.label}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </MultiSelectFilterButton>

        <MultiSelectFilterButton
          label="Status"
          count={filters.statuses.length}
          open={statusOpen}
          onOpenChange={setStatusOpen}
        >
          <Command>
            <CommandInput placeholder="Search status..." />
            <CommandList>
              <CommandEmpty>No status found.</CommandEmpty>
              <CommandGroup heading="Status">
                {TASK_STATUSES.map((s) => {
                  const selected = filters.statuses.includes(s.value);
                  return (
                    <CommandItem
                      key={s.value}
                      value={s.label}
                      onSelect={() => toggleStatus(s.value)}
                      className="[&>svg:last-child]:hidden"
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                      />
                      <Badge
                        variant="secondary"
                        className={cn("font-normal", s.color)}
                      >
                        {s.label}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </MultiSelectFilterButton>

        <MultiSelectFilterButton
          label="Tags"
          count={filters.tags.length}
          open={tagOpen}
          onOpenChange={setTagOpen}
        >
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tag found.</CommandEmpty>
              <CommandGroup heading="Tags">
                {ALL_TAGS.map((tag) => {
                  const selected = filters.tags.includes(tag);
                  return (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => toggleTag(tag)}
                      className="[&>svg:last-child]:hidden"
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                      />
                      <span className="truncate capitalize">{tag}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </MultiSelectFilterButton>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={clearAll}
          disabled={activeTotal === 0}
        >
          <X className="size-3.5" aria-hidden />
          Clear all
        </Button>
      </div>
    </div>
  );
}
