"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Mail,
  MailPlus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  isCustomAccess,
  PageAccessChecklist,
  reachableForRole,
} from "@/components/features/team/PageAccessChecklist";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { type UserRole } from "@/store/auth-store";
import { useJoinedTeamMembers } from "@/store/team-store";
import type { Database } from "@/types/database.types";

type InviteRow = Database["public"]["Tables"]["allowed_emails"]["Row"];

const ROLES: { value: UserRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

export function AdminInvitesSection() {
  const { canManageTeam } = usePermissions();
  const members = useJoinedTeamMembers();
  const eligible = isSupabaseConfigured && canManageTeam;

  const [rows, setRows] = React.useState<InviteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("member");
  const [pageSel, setPageSel] = React.useState<Set<string>>(
    () => new Set(reachableForRole("member")),
  );
  const [adding, setAdding] = React.useState(false);
  const [resending, setResending] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<string | null>(null);

  // When the role changes, reset the page selection to that role's full set.
  React.useEffect(() => {
    setPageSel(new Set(reachableForRole(role)));
  }, [role]);

  const togglePage = (href: string, checked: boolean) =>
    setPageSel((prev) => {
      const next = new Set(prev);
      if (checked) next.add(href);
      else next.delete(href);
      return next;
    });

  const customAccess = isCustomAccess(role, pageSel);
  const accessLabel =
    role === "admin"
      ? "All pages"
      : customAccess
        ? `Custom (${pageSel.size})`
        : "All pages";

  // Hide invites that have already been accepted (the person now has an account).
  const memberEmails = React.useMemo(
    () => new Set(members.map((m) => m.email.toLowerCase())),
    [members],
  );
  const pendingRows = React.useMemo(
    () => rows.filter((r) => !memberEmails.has(r.email.toLowerCase())),
    [rows, memberEmails],
  );

  const loadInvites = React.useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("allowed_emails")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(parseSupabaseError(error));
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!eligible) return;
    void loadInvites();
  }, [eligible, loadInvites]);

  if (!eligible) return null;

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      toast.error("Enter a valid email address");
      return;
    }
    setAdding(true);
    try {
      // Custom page access only when the admin narrowed a non-admin's pages.
      const page_access =
        role !== "admin" && customAccess ? [...pageSel] : null;
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, role, page_access }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: unknown;
      };
      if (!res.ok) {
        const detail =
          typeof payload.error === "string" && payload.error
            ? payload.error
            : `Request failed (${res.status}).`;
        toast.error("Couldn't send invite", { description: detail });
        return;
      }
      setEmail("");
      setRole("member"); // also resets pageSel via the role effect
      await loadInvites();
      toast.success("Invite sent", {
        description: `${clean} will get an email to set up their account.`,
      });
    } finally {
      setAdding(false);
    }
  };

  // Re-send an existing invite. The /api/invites route self-heals a stuck invite
  // (deletes the un-accepted auth user and mails a fresh link).
  const onResend = async (row: InviteRow) => {
    setResending(row.email);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          role: row.role,
          page_access: row.page_access,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        toast.error("Couldn't resend invite", {
          description:
            typeof payload.error === "string" && payload.error
              ? payload.error
              : `Request failed (${res.status}).`,
        });
        return;
      }
      toast.success("Invite re-sent", {
        description: `${row.email} will get a fresh link.`,
      });
    } finally {
      setResending(null);
    }
  };

  const onRemove = async (targetEmail: string) => {
    const before = rows;
    setRows((r) => r.filter((x) => x.email !== targetEmail));
    const supabase = createClient();
    const { error } = await supabase
      .from("allowed_emails")
      .delete()
      .eq("email", targetEmail);
    if (error) {
      setRows(before);
      toast.error("Couldn't remove invite", {
        description: parseSupabaseError(error),
      });
    } else {
      toast.success("Invite removed");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold">Invite members (admin)</h2>
          <p className="text-sm text-muted-foreground">
            Registration is invite-only. Adding someone emails them a link to set
            a password and create their account with the role you pick. Anyone
            not invited is rejected at sign-up.
          </p>
        </div>
      </div>

      <form onSubmit={onAdd} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email to invite</Label>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="invite-role" className="w-36 capitalize">
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
          </div>

          <div className="space-y-1.5">
            <Label>Page access</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-48 justify-between gap-2 font-normal"
                  disabled={role === "admin"}
                  title={
                    role === "admin"
                      ? "Admins always have full access"
                      : "Choose which pages this person can open"
                  }
                >
                  <span className="truncate">{accessLabel}</span>
                  <SlidersHorizontal
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Pages this person sees</p>
                  {customAccess ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => setPageSel(new Set(reachableForRole(role)))}
                    >
                      Reset
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-[50vh] overflow-y-auto pr-1">
                  <PageAccessChecklist
                    role={role}
                    selected={pageSel}
                    onToggle={togglePage}
                    idPrefix="invite"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            type="submit"
            className="ml-auto gap-1.5 self-end"
            disabled={adding}
          >
            <MailPlus className="size-4" aria-hidden />
            {adding ? "Adding…" : "Add invite"}
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Loading invites…
        </p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">{error}</p>
      ) : pendingRows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No pending invites. Add an email above to let someone register.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {pendingRows.map((row) => (
            <li
              key={row.email}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.email}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <Badge variant="secondary" className="font-normal capitalize">
                    {row.role}
                  </Badge>
                  {row.page_access != null ? (
                    <span className="text-xs text-muted-foreground">
                      · custom pages
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    · added {format(new Date(row.created_at), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:shrink-0 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Resend invite to ${row.email}`}
                  title="Resend invite"
                  disabled={resending === row.email}
                  onClick={() => void onResend(row)}
                >
                  <Mail className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  aria-label={`Remove invite for ${row.email}`}
                  onClick={() => setRemoveTarget(row.email)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={removeTarget != null}
        onOpenChange={(v) => {
          if (!v) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget} will no longer be able to register. Existing accounts
              are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removeTarget) void onRemove(removeTarget);
                setRemoveTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </CardContent>
    </Card>
  );
}
