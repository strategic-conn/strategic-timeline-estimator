"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
  const items = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const markRead = useNotificationsStore((s) => s.markRead);
  const clear = useNotificationsStore((s) => s.clear);

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
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
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-80 flex-col gap-0 overflow-hidden p-0 sm:w-96"
        sideOffset={8}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
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
        <Separator className="shrink-0" />
        {/*
          Avoid ScrollArea here: Radix ScrollArea viewport uses h-full, which often
          fails to resolve inside a flex popover and lets list items paint outside bg-popover.
        */}
        <div className="max-h-[min(20rem,70vh)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
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
                        onClick={() => markRead(n.id)}
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
      </PopoverContent>
    </Popover>
  );
}
