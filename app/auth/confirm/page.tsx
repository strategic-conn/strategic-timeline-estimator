"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

/**
 * /auth/confirm — completes an email link (invite, signup, recovery).
 *
 * The token is a ONE-TIME token. We deliberately do NOT verify it on page load:
 * email security scanners (Microsoft Defender/SafeLinks, etc.) pre-fetch links
 * with a GET and would burn the token before the human clicks. Instead we show a
 * button and verify only on a real click, so a scanner's GET is harmless.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [params, setParams] = React.useState<{
    token_hash: string | null;
    type: EmailOtpType | null;
    next: string;
  } | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setParams({
      token_hash: sp.get("token_hash"),
      type: sp.get("type") as EmailOtpType | null,
      next: sp.get("next") || "/dashboard",
    });
  }, []);

  const confirm = async () => {
    if (!params?.token_hash || !params.type) {
      setError("This link is missing its token. Ask an admin to re-send it.");
      return;
    }
    setError(null);
    setVerifying(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: params.type,
      token_hash: params.token_hash,
    });
    if (error) {
      setError(parseSupabaseError(error));
      setVerifying(false);
      return;
    }
    router.push(params.next);
    router.refresh();
  };

  const ready = params != null;
  const missing = ready && (!params.token_hash || !params.type);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="size-4" aria-hidden="true" />
          </span>
          {params?.type === "recovery" ? "Set your password" : "Confirm your invite"}
        </CardTitle>
        <CardDescription>
          {params?.type === "recovery"
            ? "Press Continue, then choose a password for your account."
            : "Click below to verify your email and continue setting up your account."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {missing ? (
          <p className="text-sm text-muted-foreground">
            This link is invalid or incomplete.{" "}
            <Link href="/login" className="underline underline-offset-4">
              Go to sign in
            </Link>{" "}
            and ask an admin to re-send your invite.
          </p>
        ) : (
          <>
            <Button
              type="button"
              className="w-full"
              disabled={!ready || verifying}
              onClick={() => void confirm()}
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                "Continue"
              )}
            </Button>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}{" "}
                <Link href="/login" className="underline underline-offset-4">
                  Back to sign in
                </Link>
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
