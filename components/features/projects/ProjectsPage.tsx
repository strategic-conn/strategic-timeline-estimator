"use client";

import * as React from "react";
import { FolderKanban, Plus, Search } from "lucide-react";
import { Toaster, toast } from "sonner";

import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { CreateProjectModal } from "@/components/features/projects/CreateProjectModal";
import { DeleteProjectDialog } from "@/components/features/projects/DeleteProjectDialog";
import { EditProjectModal } from "@/components/features/projects/EditProjectModal";
import { ProjectCard } from "@/components/features/projects/ProjectCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/useProjects";
import type { Project, ProjectStatus } from "@/types/project.types";

type StatusFilter = ProjectStatus | "all";
type SortKey = "updated_desc" | "name_asc" | "name_desc";

export function ProjectsPage() {
  const {
    projects,
    createProject,
    updateProject,
    deleteProject,
    setStatus,
  } = useProjects();

  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [status, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("updated_desc");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editProject, setEditProject] = React.useState<Project | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [projects, query, status]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "name_asc":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name_desc":
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      default:
        arr.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime()
        );
    }
    return arr;
  }, [filtered, sort]);

  const counts = React.useMemo(() => {
    const map: Record<ProjectStatus, number> = {
      active: 0,
      completed: 0,
      archived: 0,
    };
    for (const p of projects) map[p.status] += 1;
    return map;
  }, [projects]);

  const openEdit = (p: Project) => {
    setEditProject(p);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditProject(null);
  };

  const openDelete = (p: Project) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" richColors closeButton />

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(payload) => {
          createProject(payload);
          toast.success("Project created", {
            description: payload.name,
          });
        }}
      />

      <EditProjectModal
        project={editProject}
        open={editOpen}
        onClose={closeEdit}
        onSave={(id, partial) => {
          updateProject(id, partial);
          toast.success("Project updated");
        }}
      />

      <DeleteProjectDialog
        project={deleteTarget}
        open={deleteOpen}
        onClose={closeDelete}
        onConfirm={(id) => {
          deleteProject(id);
          toast.success("Project removed from list");
        }}
      />

      <div className="flex flex-col gap-6">
        <WorkspacePageHeader
          eyebrow="Workspaces"
          title="Projects"
          description="Create and manage workspaces. Data stays in this browser until the API is connected."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Active {counts.active}</Badge>
              <Badge variant="secondary">Completed {counts.completed}</Badge>
              <Badge variant="outline">Archived {counts.archived}</Badge>
            </div>
          }
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[min(100%,20rem)] sm:items-end">
              <Button
                type="button"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                New project
              </Button>
              <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
                <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects…"
                    className="h-9 border-border/60 bg-background/80 pl-9 backdrop-blur-sm"
                    aria-label="Search projects"
                  />
                </div>
                <Select
                  value={status}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <SelectTrigger className="h-9 w-42 shrink-0 border-border/60 bg-background/80">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-9 w-46 shrink-0 border-border/60 bg-background/80">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated_desc">Recently updated</SelectItem>
                    <SelectItem value="name_asc">Name A–Z</SelectItem>
                    <SelectItem value="name_desc">Name Z–A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
        />

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderKanban className="size-6" aria-hidden />
            </div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first project to organize tasks and timelines.
            </p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create project
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderKanban className="size-6" aria-hidden />
            </div>
            <p className="text-sm font-medium">No projects match</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Try a different search term or status filter.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onSetStatus={setStatus}
                onEdit={openEdit}
                onDelete={openDelete}
              />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
