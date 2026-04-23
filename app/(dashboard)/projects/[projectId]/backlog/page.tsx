import type { Metadata } from "next";
import { Suspense } from "react";

import { TasksPage } from "@/components/features/tasks/TasksPage";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Backlog",
  description: "Tasks not assigned to any sprint.",
};

function TasksPageFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="size-9" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-3 rounded-lg border p-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function BacklogRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<TasksPageFallback />}>
      <TasksPage projectId={projectId} sprintId={null} />
    </Suspense>
  );
}
