"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useNotificationsStore } from "@/store/notifications-store";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const items = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const markRead = useNotificationsStore((s) => s.markRead);
  const clear = useNotificationsStore((s) => s.clear);

  const unreadCount = items.filter((n) => !n.read).length;

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="relative"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full p-0 text-[0.6rem] tabular-nums"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-full flex-col gap-0 border-l p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b p-0 pr-12 text-left">
          <SheetDescription className="sr-only">
            Recent notifications and updates. Open the full activity feed from the
            link below.
          </SheetDescription>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <SheetTitle className="font-semibold">Notifications</SheetTitle>
            <div className="flex shrink-0 items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 gap-1 text-xs"
                  onClick={markAllRead}
                >
                  <Check className="size-3" aria-hidden />
                  Mark all read
                </Button>
              )}
              {items.length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={clear}
                >
                  <Trash2 className="size-3" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Inner = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("leading-snug", !n.read && "font-medium")}>
                        {n.text}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(n.at)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          markRead(n.id);
                          close();
                        }}
                        className="block"
                      >
                        {Inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => markRead(n.id)}
                      >
                        {Inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="shrink-0 border-t p-0 sm:flex-row sm:justify-start">
          <div className="w-full px-4 py-3">
            <Link
              href="/activity"
              onClick={close}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              View all activity
            </Link>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
