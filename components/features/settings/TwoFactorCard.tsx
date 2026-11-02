"use client";

import * as React from "react";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { TotpEnroll } from "@/components/features/auth/TotpEnroll";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { tourAnchor } from "@/lib/tours/ids";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

type Verified = { id: string; created_at: string } | null;

/** Settings → Security: the person's own authenticator app (0052). Live only. */
export function TwoFactorCard() {
  const [factor, setFactor] = React.useState<Verified | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [enrolling, setEnrolling] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data, error: e } = await createClient().auth.mfa.listFactors();
    if (e) setError(parseSupabaseError(e));
    else setFactor(data.totp.find((f) => f.status === "verified") ?? null);
  }, []);

  React.useEffect(() => {
    if (isSupabaseConfigured) void load();
  }, [load]);

  if (!isSupabaseConfigured) return null;

  async function turnOff() {
    if (!factor) return;
    const { error: e } = await createClient().auth.mfa.unenroll({ factorId: factor.id });
    if (e) toast.error("Couldn't turn off two-factor", { description: parseSupabaseError(e) });
    else toast.success("Two-factor sign-in is off");
    await load();
  }

  return (
    <Card {...tourAnchor("settings.2fa")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          Two-factor sign-in
          {factor ? <Badge variant="secondary">On</Badge> : null}
        </CardTitle>
        <CardDescription>
          After your password, also ask for a 6-digit code from an authenticator
          app on your phone, so a leaked password alone can&apos;t get into your
          account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : factor === undefined ? (
          <Skeleton className="h-9 w-48" />
        ) : enrolling ? (
          <TotpEnroll
            onCancel={() => setEnrolling(false)}
            onDone={() => {
              setEnrolling(false);
              toast.success("Two-factor sign-in is on", {
                description: "You'll be asked for a code each time you sign in.",
              });
              void load();
            }}
          />
        ) : factor ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {`On since ${format(new Date(factor.created_at), "MMM d, yyyy")}.`}
            </p>
            <Button type="button" variant="outline" onClick={() => setConfirmOff(true)}>
              Turn off
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setEnrolling(true)}>
            Set up authenticator app
          </Button>
        )}
      </CardContent>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off two-factor sign-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Your password alone will get into your account again. You can set
              it back up any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction onClick={() => void turnOff()}>Turn off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
