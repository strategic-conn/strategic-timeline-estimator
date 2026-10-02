"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { clearAuthHash, readAuthHash } from "@/components/features/auth/invite-hash-catcher";
import Link from "next/link";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);
  const [email, setEmail] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Usually /auth/confirm set the session before sending them here. But when
  // the email template still links to Supabase's own verify step, Supabase
  // lands them HERE (the invite's redirectTo) with the session — or the
  // error — in the URL hash, so read that first.
  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setInvalid(true);
      setChecking(false);
      return;
    }
    const supabase = createClient();
    void (async () => {
      const found = readAuthHash();
      clearAuthHash();
      if (found?.kind === "error") {
        setInvalid(true);
        setChecking(false);
        return;
      }
      if (found?.kind === "session") {
        await supabase.auth.setSession({
          access_token: found.access_token,
          refresh_token: found.refresh_token,
        });
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) setEmail(data.user.email ?? null);
      else setInvalid(true);
      setChecking(false);
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(parseSupabaseError(error));
      setSubmitting(false);
      return;
    }
    // Record that they chose their own password, so an admin can no longer
    // make a setup link for this account. Best effort: never block sign-in.
    await fetch("/api/auth/password-set", { method: "POST" }).catch(() => undefined);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="size-4" aria-hidden="true" />
          </span>
          Set your password
        </CardTitle>
        <CardDescription>
          {checking
            ? "Verifying your invite…"
            : invalid
              ? "This link has already been used or has expired."
              : email
                ? `Finish setting up ${email}.`
                : "Choose a password to finish creating your account."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {checking ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : invalid ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Work email is often scanned for safety, and the scanner can open
              a one-time link before you do. Nothing is wrong with your account.
            </p>
            <p>
              Ask your admin for a <strong className="text-foreground">password setup link</strong>{" "}
              (Team → your name → key button) and open it here, or{" "}
              <Link href="/forgot-password" className="underline underline-offset-4">
                send yourself a password link
              </Link>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="invite-password">Password</Label>
              <PasswordInput
                id="invite-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-confirm">Confirm password</Label>
              <PasswordInput
                id="invite-confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
