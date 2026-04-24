import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/35 p-5 shadow-sm backdrop-blur-md dark:bg-card/25">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl border border-border/40" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl border border-border/40" />
    </div>
  );
}
