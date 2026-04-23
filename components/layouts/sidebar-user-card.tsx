"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore, type UserRole } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export function SidebarUserCard() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const setRole = useAuthStore((s) => s.setRole);
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2",
        "shadow-sm shadow-primary/[0.03] backdrop-blur-sm dark:bg-card/40"
      )}
    >
      <Link
        href="/settings"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-0.5 transition-colors",
          "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          onSettings && "bg-muted/60"
        )}
        aria-label={`Profile and settings — ${user.name}`}
      >
        <Avatar size="sm" className="shrink-0">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-left">
          <div className="truncate text-sm font-medium leading-tight">
            {user.name}
          </div>
          <div className="truncate text-[0.65rem] text-muted-foreground leading-tight">
            Account & settings
          </div>
        </div>
      </Link>

      <Select value={user.role} onValueChange={(v) => setRole(v as UserRole)}>
        <SelectTrigger
          size="sm"
          className="h-8 w-[min(7.5rem,38%)] min-w-27 shrink-0 justify-between gap-1 px-2 text-xs capitalize"
          aria-label="Demo role (permissions preview)"
        >
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent align="end">
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value} className="text-xs">
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
