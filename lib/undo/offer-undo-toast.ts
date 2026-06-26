import { toast } from "sonner";

/**
 * One-shot Undo from a toast. Restores captured state via the provided callback.
 * Not a stacked history — each action replaces the previous undo target.
 */
export function offerUndoToast(
  message: string,
  undo: () => void,
  description?: string,
): void {
  toast.success(message, {
    ...(description ? { description } : {}),
    duration: 8500,
    action: {
      label: "Undo",
      onClick: () => {
        undo();
      },
    },
  });
}
