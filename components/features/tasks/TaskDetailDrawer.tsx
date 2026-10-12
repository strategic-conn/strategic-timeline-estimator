"use client"

import * as React from "react"
import {
  CalendarDays,
  Check,
  Clock,
  Link2,
  MoreHorizontal,
  Pencil,
  Tag,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { HelpTip } from "@/components/common/help-tip"
import { TaskCommentSection } from "@/components/features/tasks/TaskCommentSection"
import { TaskTimeTracker } from "@/components/features/tasks/TaskTimeTracker"
import { useTimeTrackingAccess } from "@/hooks/useTimeTrackingAccess"
import { ALL_TAGS } from "@/lib/dummy/tasks.data"
import { useAuthStore } from "@/store/auth-store"
import { useTasksDataStore } from "@/store/tasks-store"
import { useActiveTeamMembers, useTeamMembers } from "@/store/team-store"
import { copyTextToClipboard, taskShareUrl } from "@/lib/utils/share-links"
import { cn } from "@/lib/utils"
import { formatWorkHours, roundWorkHours } from "@/lib/utils/work-hours"
import type {
  AssignmentStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/task.types"
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/task.types"
import { format, parseISO } from "date-fns";

const ASSIGN_STATUS_META: Record<
  AssignmentStatus,
  { label: string; cls: string }
> = {
  pending: {
    label: "Pending",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  accepted: {
    label: "Accepted",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  rejected: {
    label: "Declined",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  },
  passed: {
    label: "Passed",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
}

export interface TaskDetailDrawerProps {
  task: Task | null
  open: boolean
  onClose: () => void
  onUpdateTask: (id: string, partial: Partial<Task>) => void
  onDeleteTask: (id: string) => void
  onAddComment: (taskId: string, body: string) => void
  onEditComment: (taskId: string, commentId: string, body: string) => void
  onDeleteComment: (taskId: string, commentId: string) => void
  onAddReply: (
    taskId: string,
    commentId: string,
    body: string,
    mentionIds: string[]
  ) => void
  onAddReaction: (
    taskId: string,
    commentId: string,
    emoji: string,
    userId: string
  ) => void
  onAppendLoggedHours: (taskId: string, hours: number) => void
  /** When viewing the backlog board, offer one-click moves into sprints. */
  backlogSprintOptions?: { id: string; label: string }[]
  onMoveTaskToSprint?: (taskId: string, sprintId: string) => void
}

type DraftFields = {
  title: string
  description: string
  estimated_hours: number | undefined
}

function emptyDraft(): DraftFields {
  return {
    title: "",
    description: "",
    estimated_hours: undefined,
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function formatDateOnly(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
    })
  } catch {
    return iso
  }
}

function draftDirty(task: Task, draft: DraftFields): boolean {
  return (
    draft.title.trim() !== task.title ||
    (draft.description.trim() || "") !== (task.description ?? "") ||
    draft.estimated_hours !== task.estimated_hours
  )
}

function taskToDraft(task: Task): DraftFields {
  return {
    title: task.title,
    description: task.description ?? "",
    estimated_hours:
      task.estimated_hours != null
        ? roundWorkHours(task.estimated_hours)
        : undefined,
  }
}

export function TaskDetailDrawer({
  task,
  open,
  onClose,
  onUpdateTask,
  onDeleteTask,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onAddReply,
  onAddReaction,
  onAppendLoggedHours,
  backlogSprintOptions,
  onMoveTaskToSprint,
}: TaskDetailDrawerProps) {
  const [draft, setDraft] = React.useState<DraftFields>(emptyDraft)
  const [editingTitle, setEditingTitle] = React.useState(false)
  const [descriptionMode, setDescriptionMode] = React.useState<
    "edit" | "preview"
  >("preview")
  const [editingEst, setEditingEst] = React.useState(false)
  const [addHours, setAddHours] = React.useState("")
  const [tagInput, setTagInput] = React.useState("")
  const [dueOpen, setDueOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [assigneesOpen, setAssigneesOpen] = React.useState(false)

  const teamMembers = useTeamMembers()
  const activeMembers = useActiveTeamMembers()
  const memberById = React.useCallback(
    (id: string | null) => (id ? teamMembers.find((m) => m.id === id) : undefined),
    [teamMembers]
  )

  const timeAccess = useTimeTrackingAccess(task)

  const respondToAssignment = useTasksDataStore((s) => s.respondToAssignment)
  const passAssignment = useTasksDataStore((s) => s.passAssignment)
  const myId = useAuthStore((s) => s.user.authId ?? String(s.user.id))
  const myAssignment = task?.assignees.find((a) => a.profile_id === myId)
  const isPendingForMe = myAssignment?.status === "pending"

  const [assignAction, setAssignAction] = React.useState<
    "decline" | "pass" | null
  >(null)
  const [assignNote, setAssignNote] = React.useState("")
  const [passTarget, setPassTarget] = React.useState<string>("")

  const assignmentOf = React.useCallback(
    (id: string) => task?.assignees.find((a) => a.profile_id === id),
    [task]
  )

  const handleAccept = () => {
    if (task) respondToAssignment(task.id, "accepted")
  }
  const confirmAssignAction = () => {
    if (!task) return
    if (assignAction === "decline") {
      respondToAssignment(task.id, "rejected", assignNote.trim() || undefined)
    } else if (assignAction === "pass" && passTarget) {
      passAssignment(task.id, passTarget, assignNote.trim() || undefined)
    }
    setAssignAction(null)
  }

  React.useEffect(() => {
    if (!task) {
      setDraft(emptyDraft())
      setEditingTitle(false)
      setDescriptionMode("preview")
      setEditingEst(false)
      setAddHours("")
      setTagInput("")
      return
    }
    setDraft(taskToDraft(task))
    setEditingTitle(false)
    setDescriptionMode("preview")
    setEditingEst(false)
    setTagInput("")
    setAssignAction(null)
  }, [task?.id, task?.updated_at])

  const isOpen = Boolean(open && task)
  const dirty = task ? draftDirty(task, draft) : false

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose()
  }

  const handleSaveDraft = () => {
    if (!task) return
    onUpdateTask(task.id, {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      estimated_hours: draft.estimated_hours,
    })
  }

  const handleCancelDraft = () => {
    if (!task) return
    setDraft(taskToDraft(task))
    setEditingTitle(false)
    setDescriptionMode("preview")
    setEditingEst(false)
  }

  const finishTitleEdit = () => {
    setEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      finishTitleEdit()
    }
  }

  const addTagFromInput = () => {
    if (!task) return
    const raw = tagInput.trim().toLowerCase()
    if (!raw) return
    if (task.tags.includes(raw)) {
      setTagInput("")
      return
    }
    onUpdateTask(task.id, { tags: [...task.tags, raw] })
    setTagInput("")
  }

  const tagSuggestions = React.useMemo(() => {
    if (!task) return []
    const q = tagInput.trim().toLowerCase()
    return ALL_TAGS.filter(
      (t) =>
        !task.tags.includes(t) && (q === "" || t.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [task, tagInput])

  const dueDate = task?.due_date ? parseISO(task.due_date) : undefined

  const progressPct =
    task &&
    draft.estimated_hours != null &&
    draft.estimated_hours > 0 &&
    !Number.isNaN(draft.estimated_hours)
      ? Math.min(
          100,
          Math.round(
            ((task.logged_hours ?? 0) / draft.estimated_hours) * 100
          )
        )
      : null

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton
          className="flex h-full max-h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md md:max-w-lg"
        >
          {task ? (
            <>
              <SheetHeader className="shrink-0 space-y-3 border-b border-border px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 pr-10">
                  <Badge variant="outline" className="font-mono text-xs">
                    {task.id}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="shrink-0"
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Task actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingTitle(true)
                        }}
                      >
                        <Pencil className="size-4" />
                        Edit title
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          const url = taskShareUrl(task)
                          const ok = await copyTextToClipboard(url)
                          if (ok) {
                            toast.success("Task link copied", {
                              description:
                                "Recipients open the board with this task in view.",
                            })
                          } else {
                            toast.error("Could not copy link")
                          }
                        }}
                      >
                        <Link2 className="size-4" />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          const ok = await copyTextToClipboard(task.id)
                          if (ok) {
                            toast.success("Task ID copied")
                          } else {
                            toast.error("Could not copy ID")
                          }
                        }}
                      >
                        Copy ID
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {editingTitle ? (
                  <Input
                    autoFocus
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    onBlur={finishTitleEdit}
                    onKeyDown={handleTitleKeyDown}
                    className="text-lg font-semibold"
                    aria-label="Task title"
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left text-lg font-semibold leading-tight text-foreground hover:underline"
                    onClick={() => setEditingTitle(true)}
                  >
                    {draft.title || "Untitled task"}
                  </button>
                )}

                <SheetTitle className="sr-only">
                  Task {task.id}: {task.title}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  View and edit task details, metadata, and comments.
                </SheetDescription>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Status
                    </span>
                    <Select
                      value={task.status}
                      onValueChange={(v) =>
                        onUpdateTask(task.id, { status: v as TaskStatus })
                      }
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-xs",
                                s.color
                              )}
                            >
                              {s.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Priority
                    </span>
                    <Select
                      value={task.priority}
                      onValueChange={(v) =>
                        onUpdateTask(task.id, { priority: v as TaskPriority })
                      }
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Priority" />
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
                </div>

                {!task.sprint_id &&
                backlogSprintOptions &&
                backlogSprintOptions.length > 0 &&
                onMoveTaskToSprint ? (
                  <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Backlog
                      </span>
                      <Badge variant="secondary" className="text-[0.65rem]">
                        Not in a sprint
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pull this task into a sprint when the team commits to doing
                      it this iteration.
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-full"
                        >
                          Move to sprint…
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="max-h-64 w-[min(100vw-2rem,18rem)] overflow-y-auto"
                        align="start"
                      >
                        {backlogSprintOptions.map((o) => (
                          <DropdownMenuItem
                            key={o.id}
                            onSelect={() => onMoveTaskToSprint(task.id, o.id)}
                          >
                            {o.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </SheetHeader>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-5 p-4 pb-6">
                  {isPendingForMe ? (
                    <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                      <div className="flex items-start gap-2">
                        <UserPlus className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            You&apos;ve been assigned this task
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Accept to start working, or decline / pass it to
                            someone else.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" className="gap-1.5" onClick={handleAccept}>
                          <Check className="size-4" aria-hidden />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAssignNote("")
                            setAssignAction("decline")
                          }}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5"
                          onClick={() => {
                            setAssignNote("")
                            setPassTarget("")
                            setAssignAction("pass")
                          }}
                        >
                          <UserPlus className="size-4" aria-hidden />
                          Pass to…
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    <div className="col-span-2 rounded-lg border border-border bg-muted/15 p-4">
                      <div className="mb-3 flex items-center gap-1">
                        <Clock className="size-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-semibold tracking-tight">
                          Time tracking
                        </span>
                        <HelpTip label="How time tracking works">
                          <p>
                            The <strong>total</strong> is the sum of every time entry
                            logged on this task. Nobody types over it — time is
                            added, never overwritten.
                          </p>
                          <p>
                            The <strong>session</strong> clock uses{" "}
                            <span className="font-mono">hh:mm:ss</span>.{" "}
                            <strong>Stop</strong> converts that duration to hours and adds
                            it to your saved total.
                          </p>
                          <p>
                            Only people who have <strong>accepted</strong> the task
                            can log time on it, with the timer or by adding hours.
                          </p>
                        </HelpTip>
                      </div>
                      <div className="flex flex-col gap-5">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            Logged total
                          </p>
                          <div className="w-full rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-sm tabular-nums text-muted-foreground">
                            {formatWorkHours(task.logged_hours ?? 0)} h
                          </div>
                          {timeAccess?.canLogTime ? (
                            // Adds a time entry (the record); the total above is
                            // derived from entries in the database (0048).
                            <form
                              className="mt-2 flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault()
                                const h = roundWorkHours(Number(addHours))
                                if (!(h > 0)) return
                                onAppendLoggedHours(task.id, h)
                                setAddHours("")
                              }}
                            >
                              <Input
                                type="number"
                                min={0.25}
                                step={0.25}
                                inputMode="decimal"
                                placeholder="Hours, e.g. 1.5"
                                aria-label="Hours to add"
                                className="h-9"
                                value={addHours}
                                onChange={(e) => setAddHours(e.target.value)}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="outline"
                                className="h-9 shrink-0"
                                disabled={!(Number(addHours) > 0)}
                              >
                                Add time
                              </Button>
                            </form>
                          ) : null}
                        </div>

                        <Separator className="bg-border/70" />

                        <div>
                          <TaskTimeTracker
                            embedded
                            taskId={task.id}
                            savedLoggedHours={task.logged_hours ?? 0}
                            timerEnabled={
                              timeAccess?.canUseSessionTimer ?? false
                            }
                            onCommitSession={(h) =>
                              onAppendLoggedHours(task.id, h)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <User className="size-3.5" />
                        Assignees
                      </p>
                      <Popover open={assigneesOpen} onOpenChange={setAssigneesOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-transparent p-1.5 text-left transition-colors hover:bg-muted/80"
                          >
                            {task.assignee_ids.length > 0 ? (
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <div className="flex -space-x-2 shrink-0">
                                  {task.assignee_ids.slice(0, 3).map((id) => {
                                    const m = memberById(id)
                                    return (
                                      <Avatar
                                        key={id}
                                        size="sm"
                                        className="size-7 ring-2 ring-background"
                                      >
                                        {m?.avatar_url ? (
                                          <AvatarImage src={m.avatar_url} alt="" />
                                        ) : null}
                                        <AvatarFallback className="text-[10px]">
                                          {m?.initials ?? "?"}
                                        </AvatarFallback>
                                      </Avatar>
                                    )
                                  })}
                                </div>
                                <span className="truncate text-sm font-medium">
                                  {task.assignee_ids
                                    .map((id) => memberById(id)?.name ?? `#${id}`)
                                    .join(", ")}
                                </span>
                                {task.assignees.some(
                                  (a) => a.status === "pending"
                                ) ? (
                                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                    {
                                      task.assignees.filter(
                                        (a) => a.status === "pending"
                                      ).length
                                    }{" "}
                                    pending
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <>
                                <Avatar size="sm">
                                  <AvatarFallback className="bg-muted text-[10px]">
                                    —
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-muted-foreground">
                                  Unassigned
                                </span>
                              </>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-72 p-2"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <p className="mb-2 px-1 text-xs text-muted-foreground">
                            Select one or more people
                          </p>
                          <div className="max-h-60 space-y-0.5 overflow-y-auto">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-full justify-start px-2 text-xs text-muted-foreground"
                              onClick={() =>
                                onUpdateTask(task.id, { assignee_ids: [] })
                              }
                            >
                              Clear all
                            </Button>
                            {teamMembers
                              .filter(
                                (m) =>
                                  !m.deactivated_at ||
                                  task.assignee_ids.includes(m.id)
                              )
                              .map((m) => {
                              const checked = task.assignee_ids.includes(m.id)
                              return (
                                <label
                                  key={m.id}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => {
                                      const next = checked
                                        ? task.assignee_ids.filter((x) => x !== m.id)
                                        : [...task.assignee_ids, m.id]
                                      onUpdateTask(task.id, { assignee_ids: next })
                                    }}
                                    aria-label={m.name}
                                  />
                                  <Avatar size="sm" className="size-6">
                                    <AvatarImage src={m.avatar_url} alt="" />
                                    <AvatarFallback className="text-[9px]">
                                      {m.initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="min-w-0 flex-1 truncate">
                                    {m.name}
                                  </span>
                                  {checked ? (
                                    <span
                                      className={cn(
                                        "shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] font-medium",
                                        ASSIGN_STATUS_META[
                                          assignmentOf(m.id)?.status ?? "accepted"
                                        ].cls
                                      )}
                                    >
                                      {
                                        ASSIGN_STATUS_META[
                                          assignmentOf(m.id)?.status ?? "accepted"
                                        ].label
                                      }
                                    </span>
                                  ) : null}
                                </label>
                              )
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Reporter
                      </p>
                      <div className="flex items-center gap-2 px-1.5 py-1">
                        <Avatar size="sm">
                          {memberById(task.reporter_id)?.avatar_url ? (
                            <AvatarImage
                              src={memberById(task.reporter_id)!.avatar_url}
                              alt=""
                            />
                          ) : null}
                          <AvatarFallback className="text-[10px]">
                            {memberById(task.reporter_id)?.initials ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {memberById(task.reporter_id)?.name ?? "Former member"}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        Due date
                      </p>
                      <Popover open={dueOpen} onOpenChange={setDueOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                          >
                            {dueDate
                              ? formatDateOnly(task.due_date!)
                              : "No date"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dueDate}
                            onSelect={(d) => {
                              if (d)
                                onUpdateTask(task.id, {
                                  due_date: format(d, "yyyy-MM-dd"),
                                })
                              setDueOpen(false)
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Clock className="size-3.5" />
                        Estimated hours
                      </p>
                      {editingEst ? (
                        <Input
                          type="number"
                          min={0}
                          step={0.25}
                          className="h-9"
                          value={draft.estimated_hours ?? ""}
                          onChange={(e) => {
                            const v = e.target.value
                            setDraft((d) => ({
                              ...d,
                              estimated_hours:
                                v === "" ? undefined : Number(v),
                            }))
                          }}
                          onBlur={() => {
                            setDraft((d) => ({
                              ...d,
                              estimated_hours:
                                d.estimated_hours != null
                                  ? roundWorkHours(d.estimated_hours)
                                  : undefined,
                            }))
                            setEditingEst(false)
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-left text-sm tabular-nums hover:bg-muted/50"
                          onClick={() => setEditingEst(true)}
                        >
                          {formatWorkHours(draft.estimated_hours)}
                        </button>
                      )}
                    </div>

                    <div className="col-span-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Created
                      </p>
                      <p className="text-sm">{formatDateTime(task.created_at)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Updated
                      </p>
                      <p className="text-sm">{formatDateTime(task.updated_at)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Tag className="size-3.5" />
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {task.tags.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="gap-1 pr-1 font-normal"
                        >
                          {t}
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-background/80"
                            aria-label={`Remove tag ${t}`}
                            onClick={() =>
                              onUpdateTask(task.id, {
                                tags: task.tags.filter((x) => x !== t),
                              })
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Input
                        placeholder="Add tag…"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addTagFromInput()
                          }
                        }}
                        className="h-9"
                      />
                      {tagSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tagSuggestions.map((s) => (
                            <Button
                              key={s}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (!task.tags.includes(s))
                                  onUpdateTask(task.id, {
                                    tags: [...task.tags, s],
                                  })
                                setTagInput("")
                              }}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Description</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          setDescriptionMode((m) =>
                            m === "edit" ? "preview" : "edit"
                          )
                        }
                      >
                        {descriptionMode === "edit" ? "Preview" : "Edit"}
                      </Button>
                    </div>
                    {descriptionMode === "edit" ? (
                      <Textarea
                        value={draft.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Add a description…"
                        className="min-h-28"
                      />
                    ) : (
                      <div
                        className={cn(
                          "min-h-16 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm whitespace-pre-wrap text-foreground",
                          !draft.description.trim() &&
                            "text-muted-foreground italic"
                        )}
                      >
                        {draft.description.trim()
                          ? draft.description
                          : "No description."}
                      </div>
                    )}
                  </div>

                  {progressPct != null && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Progress</span>
                          <span className="tabular-nums text-muted-foreground">
                            {progressPct}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatWorkHours(task.logged_hours ?? 0)} /{" "}
                          {formatWorkHours(draft.estimated_hours)} hours logged
                        </p>
                      </div>
                    </>
                  )}

                  <Separator />

                  <TaskCommentSection
                    taskId={task.id}
                    comments={task.comments}
                    onAddComment={onAddComment}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                    onAddReply={onAddReply}
                    onAddReaction={onAddReaction}
                  />
                </div>
              </ScrollArea>

              {dirty ? (
                <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border bg-background px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelDraft}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSaveDraft}>
                    Save
                  </Button>
                </SheetFooter>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {task ? (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete{" "}
                <span className="font-medium text-foreground">
                  {task.title}
                </span>{" "}
                ({task.id}). This action cannot be undone.
                {task.logged_hours
                  ? ` The ${task.logged_hours} h logged on it stay on each person's record (Workload, Reports), no longer tied to a task.`
                  : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onDeleteTask(task.id)
                  setDeleteOpen(false)
                  onClose()
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {task ? (
        <Dialog
          open={assignAction != null}
          onOpenChange={(v) => {
            if (!v) setAssignAction(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {assignAction === "pass"
                  ? "Pass this task on"
                  : "Decline this task"}
              </DialogTitle>
              <DialogDescription>
                {assignAction === "pass"
                  ? "Hand this task to another developer — they'll be notified to accept or decline."
                  : "Let the coordinator know this isn't for you. They'll be notified so they can reassign it."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              {assignAction === "pass" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="pass-target">Assign to</Label>
                  <Select value={passTarget} onValueChange={setPassTarget}>
                    <SelectTrigger id="pass-target" className="w-full">
                      <SelectValue placeholder="Choose a teammate" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeMembers
                        .filter((m) => m.id !== myId)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="assign-note">
                  {assignAction === "pass" ? "Note (optional)" : "Reason (optional)"}
                </Label>
                <Textarea
                  id="assign-note"
                  rows={3}
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder={
                    assignAction === "pass"
                      ? "Context for the teammate…"
                      : "Why this isn't a fit…"
                  }
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignAction(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={assignAction === "decline" ? "destructive" : "default"}
                onClick={confirmAssignAction}
                disabled={assignAction === "pass" && !passTarget}
              >
                {assignAction === "pass" ? "Pass task" : "Decline"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
