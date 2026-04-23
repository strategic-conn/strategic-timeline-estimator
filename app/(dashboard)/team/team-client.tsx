"use client";

import * as React from "react";
import { Loader2, MailPlus, ShieldAlert } from "lucide-react";

import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";

/** Stable IDs the API can persist (RBAC / invite payload). */
export const PERMISSION_IDS = [
  "content.view",
  "project.create",
  "project.edit",
  "project.delete",
  "task.create",
  "task.edit",
  "task.delete",
  "team.manage",
  "proposals.export",
] as const;

export type PermissionId = (typeof PERMISSION_IDS)[number];

type PermissionDef = {
  id: PermissionId;
  label: string;
  description: string;
  group: string;
};

const PERMISSIONS: PermissionDef[] = [
  {
    id: "content.view",
    group: "General",
    label: "View workspace content",
    description: "See projects, tasks, boards, and shared data.",
  },
  {
    id: "project.create",
    group: "Projects",
    label: "Create projects",
    description: "Start new projects and workspaces.",
  },
  {
    id: "project.edit",
    group: "Projects",
    label: "Edit projects",
    description: "Change project details and settings.",
  },
  {
    id: "project.delete",
    group: "Projects",
    label: "Delete projects",
    description: "Remove projects (destructive).",
  },
  {
    id: "task.create",
    group: "Tasks",
    label: "Create tasks",
    description: "Add tasks on boards and lists.",
  },
  {
    id: "task.edit",
    group: "Tasks",
    label: "Edit tasks",
    description: "Update status, assignees, and details.",
  },
  {
    id: "task.delete",
    group: "Tasks",
    label: "Delete tasks",
    description: "Remove tasks (destructive).",
  },
  {
    id: "team.manage",
    group: "Team",
    label: "Manage team & invites",
    description: "Invite people, change access, revoke invites.",
  },
  {
    id: "proposals.export",
    group: "Proposals",
    label: "Export proposals",
    description: "PDF / Excel exports for client proposals.",
  },
];

type PresetKey = "viewer" | "member" | "manager" | "admin";

const PRESET_KEYS: PresetKey[] = [
  "viewer",
  "member",
  "manager",
  "admin",
];

const TEMPLATE_LABEL: Record<PresetKey | "custom", string> = {
  custom: "Custom (adjusted below)",
  viewer: "Viewer — read only",
  member: "Member — tasks",
  manager: "Manager — projects + tasks",
  admin: "Admin — full access",
};

/** Presets match your product matrix; users can still tweak every checkbox. */
const TEMPLATE_PERMISSIONS: Record<PresetKey, Set<PermissionId>> = {
  viewer: new Set<PermissionId>(["content.view"]),
  member: new Set<PermissionId>([
    "content.view",
    "task.create",
    "task.edit",
  ]),
  manager: new Set<PermissionId>([
    "content.view",
    "project.create",
    "project.edit",
    "task.create",
    "task.edit",
    "task.delete",
    "proposals.export",
  ]),
  admin: new Set<PermissionId>(PERMISSION_IDS),
};

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function detectTemplate(selected: Set<PermissionId>): PresetKey | null {
  for (const k of PRESET_KEYS) {
    if (setsEqual(selected, TEMPLATE_PERMISSIONS[k])) return k;
  }
  return null;
}

function permissionSummary(selected: Set<PermissionId>): string {
  const match = detectTemplate(selected);
  if (match) return TEMPLATE_LABEL[match];
  return `Custom · ${selected.size} permission${selected.size === 1 ? "" : "s"}`;
}

const GROUP_ORDER = ["General", "Projects", "Tasks", "Team", "Proposals"];

function groupPermissions(list: PermissionDef[]) {
  const map = new Map<string, PermissionDef[]>();
  for (const p of list) {
    const g = p.group;
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(p);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    items: map.get(g)!,
  }));
}

type PendingInvite = {
  id: string;
  email: string;
  permissionIds: PermissionId[];
  summaryLabel: string;
  sentAt: string;
  expiresAt: string;
};

const INITIAL_PENDING: PendingInvite[] = [
  {
    id: "inv_01",
    email: "jamie@client.com",
    permissionIds: ["content.view", "task.create", "task.edit"],
    summaryLabel: TEMPLATE_LABEL.member,
    sentAt: "Mar 28, 2026",
    expiresAt: "Apr 4, 2026",
  },
  {
    id: "inv_02",
    email: "sam@agency.io",
    permissionIds: ["content.view"],
    summaryLabel: TEMPLATE_LABEL.viewer,
    sentAt: "Mar 30, 2026",
    expiresAt: "Apr 6, 2026",
  },
];

export function TeamClientPage() {
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Set<PermissionId>>(
    () => new Set(TEMPLATE_PERMISSIONS.member)
  );

  const [pending, setPending] = React.useState<PendingInvite[]>(INITIAL_PENDING);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const grouped = React.useMemo(() => groupPermissions(PERMISSIONS), []);

  const presetSelectValue = detectTemplate(selected) ?? "custom";

  function applyPreset(key: PresetKey) {
    setSelected(new Set(TEMPLATE_PERMISSIONS[key]));
  }

  function togglePermission(id: PermissionId, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function validateEmail(value: string) {
    const t = value.trim();
    if (!t) return "Email is required.";
    if (!/^\S+@\S+\.\S+$/.test(t)) return "Enter a valid email address.";
    return null;
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;

    if (selected.size === 0) {
      setStatus("Select at least one permission (e.g. View workspace content).");
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      const ids = [...selected].sort() as PermissionId[];
      const next: PendingInvite = {
        id: `inv_${Date.now()}`,
        email: email.trim(),
        permissionIds: ids,
        summaryLabel: permissionSummary(selected),
        sentAt: "Just now",
        expiresAt: "7 days",
      };
      setPending((prev) => [next, ...prev]);
      setEmail("");
      setNote("");
      setStatus(
        "Invite queued (demo). Payload will include permission IDs for the backend to enforce."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <WorkspacePageHeader
        eyebrow="People"
        title="Team & access"
        description="Invite-only signup. Choose exactly what this person can do — like Shopify staff permissions — or start from a preset and adjust."
      />

      <Alert>
        <ShieldAlert className="size-4" aria-hidden="true" />
        <AlertTitle>Invite-only registration</AlertTitle>
        <AlertDescription>
          New users join only through an invite. Each invite stores a permission
          set your API validates on every request. Wire this form to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            POST /invites
          </code>{" "}
          with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            permission_ids[]
          </code>
          .
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailPlus className="size-4 text-muted-foreground" aria-hidden />
              Invite someone
            </CardTitle>
            <CardDescription>
              Pick a preset to pre-fill access, then turn individual permissions
              on or off before sending.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onInvite} className="space-y-6" noValidate>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Work email</Label>
                    <Input
                      id="invite-email"
                      name="email"
                      type="email"
                      autoComplete="off"
                      placeholder="colleague@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      aria-invalid={Boolean(emailError) || undefined}
                    />
                    {emailError ? (
                      <p className="text-xs text-destructive">{emailError}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invite-template">Start from preset</Label>
                    <Select
                      value={presetSelectValue}
                      onValueChange={(v) => {
                        if (
                          v === "viewer" ||
                          v === "member" ||
                          v === "manager" ||
                          v === "admin"
                        ) {
                          applyPreset(v);
                        }
                      }}
                    >
                      <SelectTrigger
                        id="invite-template"
                        className="w-full max-w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom" disabled>
                          {TEMPLATE_LABEL.custom}
                        </SelectItem>
                        {PRESET_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {TEMPLATE_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Pick a preset to reset the checkboxes, then turn individual
                      permissions on or off. If the set doesn’t match a preset,
                      the menu shows Custom.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invite-note">Personal note (optional)</Label>
                    <Textarea
                      id="invite-note"
                      placeholder="e.g. You’ll be on the Client Portal project."
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-18 resize-y"
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-card/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">
                      Permissions for this invite
                    </Label>
                    <Badge variant="outline">{permissionSummary(selected)}</Badge>
                  </div>
                  <div className="max-h-[min(420px,55vh)] space-y-5 overflow-y-auto pr-1">
                    {grouped.map(({ group, items }) => (
                      <div key={group}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {group}
                        </p>
                        <ul className="space-y-3">
                          {items.map((p) => (
                            <li
                              key={p.id}
                              className="flex gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40"
                            >
                              <Checkbox
                                id={`perm-${p.id}`}
                                checked={selected.has(p.id)}
                                onCheckedChange={(v) =>
                                  togglePermission(p.id, v === true)
                                }
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <Label
                                  htmlFor={`perm-${p.id}`}
                                  className="cursor-pointer text-sm font-medium leading-snug"
                                >
                                  {p.label}
                                </Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {p.description}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {status ? (
                <p className="text-sm text-foreground" role="status">
                  {status}
                </p>
              ) : null}

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="mr-2 size-4 animate-spin"
                      aria-hidden
                    />
                    Sending invite…
                  </>
                ) : (
                  "Send invite"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
            <CardDescription>
              Each row stores the permission set that will apply when they
              accept.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">{row.summaryLabel}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.permissionIds.length} id
                            {row.permissionIds.length === 1 ? "" : "s"}:{" "}
                            {row.permissionIds.join(", ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.sentAt}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.expiresAt}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Later: resend, revoke, and compare invites to live members from the
              API.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preset reference</CardTitle>
          <CardDescription>
            Starting points only—every invite can mix permissions freely. Backend
            should still authorize by permission ID, not by preset name.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Preset</TableHead>
                  <TableHead>Includes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  ["viewer", "member", "manager", "admin"] as const
                ).map((key) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      {TEMPLATE_LABEL[key]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[...TEMPLATE_PERMISSIONS[key]].join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            If someone has{" "}
            <span className="font-medium text-foreground">View</span> but not
            edit rights, hide action controls instead of showing disabled
            buttons.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
