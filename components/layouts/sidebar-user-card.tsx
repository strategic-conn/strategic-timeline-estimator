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
    <div className="space-y-2">
      <Link
        href="/settings"
        className={cn(
          "-mx-1 flex items-center gap-3 rounded-md p-1 transition-colors",
          "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          onSettings && "bg-muted/50"
        )}
        aria-label={`Profile and settings — ${user.name}`}
      >
        <Avatar size="sm">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-xs font-medium leading-5">
            {user.name}
          </div>
          <div className="truncate text-xs capitalize text-muted-foreground">
            {user.role}
          </div>
        </div>
      </Link>
      <Select value={user.role} onValueChange={(v) => setRole(v as UserRole)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
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
