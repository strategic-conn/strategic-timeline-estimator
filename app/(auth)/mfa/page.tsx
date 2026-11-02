"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { TotpEnroll } from "@/components/features/auth/TotpEnroll";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

/**
 * The proxy sends a signed-in session here when it still owes two-factor
 * (lib/auth/mfa-gate.ts): a code if they have an authenticator app, set-up if
 * MFA_REQUIRED is on and they don't. A full page load afterwards, so the proxy
 * sees the upgraded (aal2) session cookie.
 */
export default function MfaPage() {
  const { signOut } = useAuth();
  const [factorId, setFactorId] = React.useState<string | null | undefined>(undefined);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null));
  }, []);

  const proceed = () => window.location.replace("/dashboard");

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setBusy(false);
      setError("That code didn't match. Try the newest code in your app.");
      return;
    }
    proceed();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          Two-factor sign-in
        </CardTitle>
        <CardDescription>
          {factorId === null
            ? "Your workspace requires two-factor sign-in. Set up an authenticator app to continue."
            : "Enter the 6-digit code from your authenticator app."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {factorId === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : factorId === null ? (
          <TotpEnroll onDone={proceed} />
        ) : (
          <form onSubmit={verify} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Code</Label>
              <Input
                id="mfa-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="font-mono tracking-widest"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              Verify
            </Button>
            <p className="text-xs text-muted-foreground">
              Lost your phone? Ask an admin to reset your two-factor (Team → your row).
            </p>
          </form>
        )}
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
