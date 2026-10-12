"use client";

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
import type { Task } from "@/types/task.types";

export interface DeleteTaskDialogProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (taskId: string) => void;
}

export function DeleteTaskDialog({
  task,
  open,
  onClose,
  onConfirm,
}: DeleteTaskDialogProps) {
  return (
    <AlertDialog
      open={open && task != null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete{" "}
            <span className="font-medium text-foreground">
              {task?.title ?? "this task"}
            </span>{" "}
            ({task?.id}). This action cannot be undone.
            {task?.logged_hours
              ? ` The ${task.logged_hours} h logged on it stay on each person's record (Workload, Reports), no longer tied to a task.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (task) {
                onConfirm(task.id);
                onClose();
              }
            }}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
