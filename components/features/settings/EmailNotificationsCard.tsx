"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";

/**
 * Settings → Profile: the person's own switch for notification emails
 * (`profiles.email_notifications`, 0051). Live mode only — the demo sends none.
 * ponytail: reads/writes its one column directly, like ProfileForm; move into
 * auth-store if anything else ever needs the flag.
 */
export function EmailNotificationsCard() {
  const userId = useAuthStore((s) => s.user.authId);
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let live = true;
    void createClient()
      .from("profiles")
      .select("email_notifications")
      .eq("id", userId)
      .single()
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError(parseSupabaseError(e));
        else setOn(data.email_notifications);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  if (!isSupabaseConfigured) return null;

  const save = async (next: boolean) => {
    if (!userId) return;
    setOn(next);
    const { error: e } = await createClient()
      .from("profiles")
      .update({ email_notifications: next })
      .eq("id", userId);
    if (e) {
      setOn(!next);
      toast.error("Couldn't save", { description: parseSupabaseError(e) });
    } else {
      toast.success(next ? "Notification emails on" : "Notification emails off");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email notifications</CardTitle>
        <CardDescription>
          We email you when something changes your work. The bell still shows
          everything.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : on === null ? (
          <Skeleton className="h-5 w-56" />
        ) : (
          <div className="flex items-center gap-2">
            <Checkbox
              id="email-notifications"
              checked={on}
              onCheckedChange={(v) => void save(v === true)}
            />
            <Label htmlFor="email-notifications" className="font-normal">
              Email me about these
            </Label>
          </div>
        )}
        <details className="text-muted-foreground">
          <summary className="w-fit cursor-pointer select-none py-1 text-xs font-medium text-foreground hover:underline">
            What gets emailed
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>You&apos;re assigned, passed or taken off a task</li>
            <li>A task you&apos;re on changes due date, hours or sprint, is deleted, or its sprint&apos;s dates move</li>
            <li>You&apos;re mentioned in a reply, or someone declines a task you gave them</li>
            <li>Time off requests and decisions</li>
            <li>A deal is won (admins and managers)</li>
          </ul>
          <p className="mt-2 text-xs">A bulk change, like syncing a schedule, sends one email.</p>
        </details>
      </CardContent>
    </Card>
  );
}
