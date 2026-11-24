"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  Check,
  ChevronDown,
  Loader2,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppHelp } from "@/components/common/app-help";
import { EstherFace } from "@/components/features/esther-estimate/EstherFace";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useEstherReferences } from "@/hooks/useEstherReferences";
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/esther/estimate/types";
import type { EstherReference } from "@/lib/esther/estimate/references";
import { platformLabel } from "@/lib/proposal-catalog";
import { cn } from "@/lib/utils";

type Job = {
  key: string;
  name: string;
  state: "waiting" | "reading" | "added" | "failed";
  message?: string;
};

/**
 * Settings → Workspace → Esther's past estimates. The team uploads estimates
 * written before this app; Esther reads each once (names removed) and uses the
 * most similar ones in every draft. Files go one at a time — each is a Claude
 * call — and every file reports its own result.
 */
export function EstherReferencesCard() {
  const { refs, loaded, error, upload, remove } = useEstherReferences();
  // Admins upload and delete; managers see the list (like the hourly rates).
  const { canEditHourlyRates: isAdmin } = usePermissions();
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [deleting, setDeleting] = React.useState<EstherReference | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const busy = jobs.some((j) => j.state === "waiting" || j.state === "reading");

  const setJob = (key: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  const addFiles = async (files: File[]) => {
    const queued: Job[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      name: f.name,
      state: "waiting",
    }));
    setJobs((js) => [...queued, ...js.filter((j) => j.state === "failed")]);
    for (const [i, f] of files.entries()) {
      const key = queued[i].key;
      const ext = `.${f.name.toLowerCase().split(".").pop()}`;
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setJob(key, {
          state: "failed",
          message: "Not a file Esther reads (PDF, Word, Excel, CSV or text).",
        });
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setJob(key, { state: "failed", message: "Over 4 MB." });
        continue;
      }
      setJob(key, { state: "reading" });
      try {
        const ref = await upload(f);
        setJob(key, {
          state: "added",
          message: `${ref.lines.length} lines · ${ref.total_hours} h`,
        });
      } catch (e) {
        setJob(key, { state: "failed", message: (e as Error).message });
      }
    }
  };

  return (
    <Card data-testid="esther-references">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EstherFace className="size-7" />
          {"Esther's past estimates"}
        </CardTitle>
        <CardDescription>
          {
            "Upload estimates your team wrote before this app — Word, Excel, CSV or PDF. Esther reads each one once, removes client names, and learns from the most similar ones every time she drafts."
          }
        </CardDescription>
        <CardAction>
          <AppHelp section="settings.estherReferences" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isAdmin ? (
          <p className="text-xs text-muted-foreground">
            {"Only admins can upload or delete past estimates."}
          </p>
        ) : null}
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="gap-2"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {busy ? "Esther is reading…" : "Upload past estimates"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {
                "Several at once is fine · up to 4 MB each · about 30 s per file"
              }
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="sr-only"
              data-testid="esther-references-input"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void addFiles(files);
              }}
            />
          </div>
        ) : null}

        {jobs.length ? (
          <ul
            className="flex flex-col gap-1.5 text-sm"
            aria-live="polite"
            data-testid="esther-references-jobs"
          >
            {jobs.map((j) => (
              <li
                key={j.key}
                className="flex items-start gap-2"
                data-state={j.state}
              >
                {j.state === "added" ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : j.state === "failed" ? (
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden
                  />
                ) : (
                  <Loader2
                    className={cn(
                      "mt-0.5 size-4 shrink-0 text-muted-foreground",
                      j.state === "reading" && "animate-spin",
                    )}
                    aria-hidden
                  />
                )}
                <span className="min-w-0">
                  <span className="break-all font-medium">{j.name}</span>
                  <span className="text-muted-foreground">
                    {` — ${j.state === "waiting" ? "waiting" : j.state === "reading" ? "reading…" : (j.message ?? "")}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !refs.length ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {
              "No past estimates yet. Esther still learns from the approved estimates in the app."
            }
          </p>
        ) : (
          <ul
            className="flex flex-col divide-y rounded-lg border"
            data-testid="esther-references-list"
          >
            {refs.map((r) => (
              <li key={r.id}>
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {`${r.platform ? platformLabel(r.platform as never) : "Platform not stated"} · ${r.lines.length} lines · ${r.total_hours} h · ${dateOf(r.created_at)}`}
                      </span>
                    </span>
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${r.title}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleting(r);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="flex flex-col gap-2 border-t bg-muted/30 px-3 py-2.5 text-xs">
                    {r.summary ? (
                      <p className="text-muted-foreground">{r.summary}</p>
                    ) : null}
                    <p className="text-muted-foreground">{`From ${r.file_name || "an upload"} — what Esther will see:`}</p>
                    <ul className="flex flex-col gap-0.5">
                      {r.lines.map((l, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="min-w-0 flex-1">
                            {l.title}
                            {l.phase ? (
                              <span className="text-muted-foreground">{` · ${l.phase}`}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {`${l.hours} h${l.role ? ` · ${l.role}` : ""}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${deleting?.title ?? ""}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Esther stops using this past estimate (${deleting?.lines.length ?? 0} lines) in new drafts. Estimates she already drafted don't change. You can upload the file again later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const r = deleting;
                setDeleting(null);
                if (r)
                  remove(r.id).catch((e) => toast.error((e as Error).message));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function dateOf(iso: string) {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "";
  }
}
