"use client";

import { useRouter } from "next/navigation";
import { ListChecks, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTourStore } from "@/store/tour-store";
import { useTourUserId } from "@/components/features/tour/use-tours";

/** Settings → Profile: the same reset + checklist the Help menu offers. */
export function TourSettingsCard() {
  const router = useRouter();
  const userId = useTourUserId();
  const resetAll = useTourStore((s) => s.resetAll);
  const forget = useTourStore((s) => s.forget);
  const openChecklist = useTourStore((s) => s.openChecklist);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tours &amp; tips</CardTitle>
        <CardDescription>
          Every page has a short tour under the ? button at the top. Reset them
          to have each one offered again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            resetAll(userId);
            toast.success("Tours reset", {
              description: "Every page's tour is offered again.",
            });
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset all tours
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            forget(userId, "checklist");
            openChecklist();
            router.push("/dashboard");
          }}
        >
          <ListChecks className="size-4" aria-hidden />
          Open Getting started
        </Button>
      </CardContent>
    </Card>
  );
}
