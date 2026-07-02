"use client";

import * as React from "react";
import { ShieldAlert, SlidersHorizontal, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminInvitesSection } from "@/components/features/settings/AdminInvitesSection";
import { MemberAccessDialog } from "@/components/features/team/MemberAccessDialog";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useTeamMembers } from "@/store/team-store";
import type { TeamMember } from "@/types/task.types";

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
  const { canManageTeam } = usePermissions();
  const authId = useAuthStore((s) => s.user.authId);
  const members = useTeamMembers();

  const [overrides, setOverrides] = React.useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [pageAccessOverrides, setPageAccessOverrides] = React.useState<
    Record<string, string[] | null>
  >({});
  const [accessMember, setAccessMember] = React.useState<TeamMember | null>(null);

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Members
          </CardTitle>
          <CardDescription>
            Everyone with an account in this workspace
            {canEditRoles ? " — change a role inline (admin)." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="w-40">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const current = roleOf(m.id, m.role);
                    const isSelf = m.id === authId;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" className="shrink-0">
                              {m.avatar_url ? (
                                <AvatarImage src={m.avatar_url} alt="" />
                              ) : null}
                              <AvatarFallback>{m.initials}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {m.name}
                              {isSelf ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  (you)
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {m.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
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
                          </div>
                          {current !== "admin" && pageAccessOf(m) != null ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Custom access
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What each role can do</CardTitle>
          <CardDescription>
            Access is role-based and enforced by the database (RLS) — the UI just
            mirrors it. Pick a role when you invite someone.
          </CardDescription>
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
    </div>
  );
}
