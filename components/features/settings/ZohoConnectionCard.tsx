"use client";

import { CheckCircle2, Plug, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status = {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  apiDomain: string | null;
};

const REDIRECT_MESSAGES: Record<string, string> = {
  connected: "Zoho CRM connected.",
  denied: "Zoho connection was cancelled.",
  notstarted:
    "Use the “Connect Zoho CRM” button below — the callback URL can't be opened directly.",
  statemissing:
    "The connection attempt expired. Click “Connect Zoho CRM” and finish within 10 minutes.",
  badstate: "Connection failed a security check — please try again.",
  exchangefailed:
    "Zoho rejected the token exchange — check the client ID/secret and that the redirect URI matches exactly.",
  norefresh: "Zoho didn't return a refresh token — try the consent again.",
  savefailed: "Connected, but couldn't save the tokens. Check the database.",
  notconfigured: "Zoho isn't configured on the server yet.",
};

export function ZohoConnectionCard() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/zoho/status");
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      /* leave status null → shows the neutral state */
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // One-time feedback from the OAuth redirect (?zoho=...), then clean the URL.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("zoho");
    if (!outcome) return;
    if (outcome === "connected") toast.success(REDIRECT_MESSAGES[outcome]);
    else if (outcome === "notstarted") toast.info(REDIRECT_MESSAGES[outcome]);
    else toast.error(REDIRECT_MESSAGES[outcome] ?? "Zoho connection issue.");
    const url = new URL(window.location.href);
    url.searchParams.delete("zoho");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/zoho/org");
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const org = data?.org;
        toast.success(
          `Zoho reachable — ${org?.company_name ?? org?.primary_email ?? "org OK"}`,
        );
      } else {
        toast.error("Zoho test failed — check the server logs.");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/zoho/disconnect", { method: "POST" });
      if (res.ok) {
        toast.success("Disconnected from Zoho.");
        await load();
      } else {
        toast.error("Couldn't disconnect.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="size-4 shrink-0" aria-hidden />
          Zoho CRM
        </CardTitle>
        <CardDescription>
          Connect the workspace to Zoho CRM to read your CRM data. One admin
          connects once; the connection is shared workspace-wide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.configured ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Not configured on the server yet. Add{" "}
            <span className="font-mono text-xs">ZOHO_CLIENT_ID</span> and{" "}
            <span className="font-mono text-xs">ZOHO_CLIENT_SECRET</span> to the
            deployment&apos;s environment, then reload.
          </p>
        ) : null}

        {status?.connected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
              <span>
                <span className="font-medium">Connected</span>
                {status.connectedAt ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · since{" "}
                    {new Date(status.connectedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void test()}
                disabled={busy}
                className="gap-1.5"
              >
                <RefreshCw className="size-4" aria-hidden />
                Test
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void disconnect()}
                disabled={busy}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="gap-1.5"
            disabled={busy || (status != null && !status.configured)}
            asChild
          >
            <a href="/api/zoho/connect">
              <Plug className="size-4" aria-hidden />
              Connect Zoho CRM
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
