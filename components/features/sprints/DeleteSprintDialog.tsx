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
import type { Sprint } from "@/types/sprint.types";

export interface DeleteSprintDialogProps {
  sprint: Sprint | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (sprintId: string) => void;
}

export function DeleteSprintDialog({
  sprint,
  open,
  onClose,
  onConfirm,
}: DeleteSprintDialogProps) {
  return (
    <AlertDialog
      open={open && sprint != null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this sprint?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove{" "}
            <span className="font-medium text-foreground">
              {sprint?.name ?? "this sprint"}
            </span>
            . All tasks currently in this sprint will be moved to the project
            backlog. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (sprint) {
                onConfirm(sprint.id);
                onClose();
              }
            }}
          >
            Delete sprint
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
