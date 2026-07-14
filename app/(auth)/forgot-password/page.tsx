"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    if (isSupabaseConfigured) {
      const supabase = createClient();
      // Land back on the Site URL root; InviteHashCatcher routes the recovery
      // session on to /accept-invite to set a new password.
      const { error } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setError(parseSupabaseError(error));
        setSubmitting(false);
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
    // Always show success — never reveal whether the email has an account.
    setSent(true);
    setSubmitting(false);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            {sent ? (
              <MailCheck className="size-4" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </span>
          {sent ? "Check your email" : "Reset your password"}
        </CardTitle>
        <CardDescription>
          {sent
            ? `If an account exists for ${email.trim().toLowerCase()}, we've sent a link to reset your password.`
            : "Enter your email and we'll send you a link to set a new password."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sent ? (
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Back to sign in
            </Link>
          </Button>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
              {error ? (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </Button>

            <Link
              href="/login"
              className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
