"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

/**
 * Set up an authenticator app (Supabase Auth MFA, TOTP): QR code + manual key,
 * then one code to prove it works. Used by Settings → Security and by /mfa when
 * two-factor is required. Verifying also upgrades this session to aal2.
 */
export function TotpEnroll({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [factor, setFactor] = React.useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      const mfa = createClient().auth.mfa;
      // An abandoned set-up leaves an unverified factor behind; clear it so the
      // new one isn't refused as a duplicate.
      const { data: list } = await mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      }
      const { data, error: e } = await mfa.enroll({
        factorType: "totp",
        // Unique per attempt: names must be unique per user, and a remount (or
        // dev StrictMode's double effect) starts a second enrolment in parallel.
        friendlyName: `Authenticator ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      });
      if (!live) return;
      if (e || !data) setError(e ? parseSupabaseError(e) : "Couldn't start set-up.");
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      live = false;
    };
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factor || !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    setBusy(false);
    if (err) setError("That code didn't match. Check the time on your phone and try the newest code.");
    else onDone();
  }

  if (!factor) {
    return error ? (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton className="h-44 w-44" />
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL SVG from Supabase */}
      <img src={factor.qr} alt="QR code for your authenticator app" className="size-44 rounded-md bg-white p-2" />
      <p className="text-xs text-muted-foreground">
        Key:{" "}
        <span className="select-all break-all font-mono text-foreground">{factor.secret}</span>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="totp-enroll-code">6-digit code</Label>
        <Input
          id="totp-enroll-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-40 font-mono tracking-widest"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          Turn on two-factor
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
