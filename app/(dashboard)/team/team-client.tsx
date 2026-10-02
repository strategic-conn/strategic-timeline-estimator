"use client";

import * as React from "react";
import {
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminInvitesSection } from "@/components/features/settings/AdminInvitesSection";
import { MemberSkillsEditor } from "@/components/features/skills/MemberSkillsEditor";
import { MemberAccessDialog } from "@/components/features/team/MemberAccessDialog";
import {
  formatWorkKeys,
  WorkKeysEditor,
} from "@/components/features/team/WorkKeysEditor";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore, type UserRole } from "@/store/auth-store";
import { useJoinedTeamMembers, useTeamStore } from "@/store/team-store";
import type { TeamMember } from "@/types/task.types";
import { tourAnchor } from "@/lib/tours/ids";
import { AppHelp } from "@/components/common/app-help";
import { SetupLinkButton } from "@/components/features/settings/SetupLinkDialog";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_REFERENCE: { role: string; blurb: string }[] = [
  {
    role: "Admin",
    blurb:
      "Full access — manage the team & invites, delete projects, plus everything below.",
  },
  {
    role: "Manager",
    blurb:
      "Create & edit projects and sprints, full task control, export proposals & run the estimator.",
  },
  {
    role: "Member",
    blurb:
      "Create and edit tasks and comments. No project, team, or proposal access.",
  },
  { role: "Viewer", blurb: "Read-only access to all workspace content." },
];

export function TeamClientPage() {
  const { canManageTeam, canEditMemberSkills } = usePermissions();
  const authId = useAuthStore((s) => s.user.authId);
  const selfId = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const members = useJoinedTeamMembers();
  const [skillsMember, setSkillsMember] = React.useState<TeamMember | null>(null);

  const [overrides, setOverrides] = React.useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [pageAccessOverrides, setPageAccessOverrides] = React.useState<
    Record<string, string[] | null>
  >({});
  const [accessMember, setAccessMember] = React.useState<TeamMember | null>(null);
  const hydrateTeam = useTeamStore((s) => s.hydrateFromSupabase);
  const [deactivateTarget, setDeactivateTarget] =
    React.useState<TeamMember | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TeamMember | null>(null);
  const [statusSaving, setStatusSaving] = React.useState(false);

  const active = members.filter((m) => !m.deactivated_at);
  const deactivated = members.filter((m) => m.deactivated_at);

  const setActive = async (m: TeamMember, deactivate: boolean) => {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/users/${m.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivate }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(deactivate ? "Couldn't deactivate" : "Couldn't reactivate", {
          description: payload.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      await hydrateTeam();
      toast.success(
        deactivate ? `${m.name} deactivated` : `${m.name} reactivated`
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const deleteMember = async (m: TeamMember) => {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/users/${m.id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("Couldn't delete", {
          description: payload.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      await hydrateTeam();
      toast.success(`${m.name} permanently deleted`);
    } finally {
      setStatusSaving(false);
    }
  };

  const roleOf = (id: string, fallback: UserRole) => overrides[id] ?? fallback;
  const pageAccessOf = (m: TeamMember): string[] | null =>
    m.id in pageAccessOverrides ? pageAccessOverrides[m.id] : m.page_access ?? null;

  const canEditRoles = canManageTeam && isSupabaseConfigured;

  const openAccess = (m: TeamMember, currentRole: UserRole) =>
    setAccessMember({ ...m, role: currentRole, page_access: pageAccessOf(m) });

  const changeRole = async (id: string, role: UserRole, prev: UserRole) => {
    setOverrides((o) => ({ ...o, [id]: role }));
    setSavingId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      setOverrides((o) => ({ ...o, [id]: prev }));
      toast.error("Couldn't update role", {
        description: parseSupabaseError(error),
      });
    } else {
      toast.success("Role updated");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="People"
        help={<AppHelp section="page.team" />}
        title="Team & access"
        description="Invite-only workspace. Manage who has access and the role they hold."
      />

      {canManageTeam ? (
        <Alert>
          <ShieldAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Invite-only registration</AlertTitle>
          <AlertDescription>
            New members can only join by invite. Send one below — they get an
            email to set a password and join with the role you choose. Anyone not
            invited is rejected at sign-up.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Real invite UI — admin + live mode only (renders nothing otherwise). */}
      <AdminInvitesSection />

      {canManageTeam && !isSupabaseConfigured ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Inviting teammates needs the Supabase backend (email + auth). This
            demo has no server to send invites.
          </CardContent>
        </Card>
      ) : null}

      <Card {...tourAnchor("team.members")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Members
          </CardTitle>
          <CardDescription>
            Everyone with an account in this workspace
            {canEditRoles ? " — change a role inline (admin)." : "."}
          </CardDescription>
          <CardAction>
            <AppHelp section="team.members" />
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {active.map((m) => {
                const current = roleOf(m.id, m.role);
                const isSelf = m.id === authId;
                return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar size="sm" className="shrink-0">
                        {m.avatar_url ? (
                          <AvatarImage src={m.avatar_url} alt="" />
                        ) : null}
                        <AvatarFallback>{m.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.name}
                          {isSelf ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.email}
                        </p>
                        {m.work_keys?.length ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {formatWorkKeys(m.work_keys)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-10 sm:shrink-0 sm:justify-end sm:pl-0">
                      {canEditRoles && !isSelf ? (
                        <Select
                          value={current}
                          disabled={savingId === m.id}
                          onValueChange={(v) =>
                            void changeRole(m.id, v as UserRole, current)
                          }
                        >
                          <SelectTrigger size="sm" className="w-28 capitalize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="font-normal capitalize"
                        >
                          {current}
                        </Badge>
                      )}
                      {current !== "admin" && pageAccessOf(m) != null ? (
                        <span className="text-xs text-muted-foreground">
                          Custom access
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        title="Work keys & skills"
                        aria-label={`Skills for ${m.name}`}
                        {...tourAnchor("team.skills")}
                        onClick={() => setSkillsMember(m)}
                      >
                        <Star className="size-4" />
                      </Button>
                      {canEditRoles && !isSelf && current !== "admin" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Manage page access"
                          aria-label={`Manage page access for ${m.name}`}
                          onClick={() => openAccess(m, current)}
                        >
                          <SlidersHorizontal className="size-4" />
                        </Button>
                      ) : null}
                      {/* Someone who joined but couldn't set a password
                          (their invite link was used up by an email scanner).
                          The server refuses anyone who already has one. */}
                      {canEditRoles && !isSelf && isSupabaseConfigured ? (
                        <SetupLinkButton email={m.email} name={m.name} />
                      ) : null}
                      {canEditRoles && !isSelf ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          title="Deactivate member"
                          aria-label={`Deactivate ${m.name}`}
                          onClick={() => setDeactivateTarget(m)}
                        >
                          <UserX className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEditRoles && deactivated.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserX className="size-4 text-muted-foreground" aria-hidden />
              Deactivated
            </CardTitle>
            <CardDescription>
              Access revoked. Their history stays attributed; reactivate to
              restore access.
            </CardDescription>
            <CardAction>
              <AppHelp section="team.deactivated" />
            </CardAction>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border rounded-lg border">
              {deactivated.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar size="sm" className="shrink-0 opacity-60">
                      {m.avatar_url ? (
                        <AvatarImage src={m.avatar_url} alt="" />
                      ) : null}
                      <AvatarFallback>{m.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-muted-foreground">
                        {m.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={statusSaving}
                      onClick={() => void setActive(m, false)}
                    >
                      <UserCheck className="size-4" aria-hidden />
                      Reactivate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete permanently"
                      aria-label={`Delete ${m.name} permanently`}
                      disabled={statusSaving}
                      onClick={() => setDeleteTarget(m)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card {...tourAnchor("team.roles")}>
        <CardHeader>
          <CardTitle className="text-base">What each role can do</CardTitle>
          <CardDescription>
            Access is role-based and enforced by the database (RLS) — the UI just
            mirrors it. Pick a role when you invite someone.
          </CardDescription>
          <CardAction>
            <AppHelp section="team.roles" />
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-28">Role</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLE_REFERENCE.map((r) => (
                  <TableRow key={r.role}>
                    <TableCell className="font-medium">{r.role}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.blurb}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {accessMember ? (
        <MemberAccessDialog
          member={accessMember}
          open={accessMember != null}
          onOpenChange={(v) => {
            if (!v) setAccessMember(null);
          }}
          onSaved={(value) =>
            setPageAccessOverrides((o) => ({ ...o, [accessMember.id]: value }))
          }
        />
      ) : null}

      <Dialog
        open={skillsMember != null}
        onOpenChange={(v) => {
          if (!v) setSkillsMember(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {`${skillsMember?.name ?? ""}${skillsMember && skillsMember.id === selfId ? " (you)" : ""} — Work keys & skills`}
            </DialogTitle>
            <DialogDescription>
              Work keys decide who can be given a task; skill stars only break
              ties between people who hold the right key. Level 2 also covers
              Level 1 work.
            </DialogDescription>
          </DialogHeader>
          {skillsMember ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Work keys</h3>
              <WorkKeysEditor
                profileId={skillsMember.id}
                editable={canManageTeam}
              />
              {canManageTeam ? null : (
                <p className="text-xs text-muted-foreground">
                  Only admins can change work keys.
                </p>
              )}
            </section>
          ) : null}
          {skillsMember ? (
            <h3 className="text-sm font-medium">Skills</h3>
          ) : null}
          {skillsMember ? (
            <MemberSkillsEditor
              profileId={skillsMember.id}
              editable={skillsMember.id === selfId || canEditMemberSkills}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deactivateTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {deactivateTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be signed out and blocked from logging in. Their tasks,
              comments, and logged hours stay in the workspace, and you can
              reactivate them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const m = deactivateTarget;
                setDeactivateTarget(null);
                if (m) void setActive(m, true);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Their account is erased and anything they
              authored — projects, tasks, comments — is reattributed to
              &quot;Former member.&quot; Assignments, reactions, and logged-hour
              entries are removed. To keep their history intact, reactivate instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const m = deleteTarget;
                setDeleteTarget(null);
                if (m) void deleteMember(m);
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
