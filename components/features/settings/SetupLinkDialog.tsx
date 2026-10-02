"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type SetupLinkState = {
  email: string;
  url: string;
  /** Why the admin is seeing this, shown above the link. */
  reason: "backup" | "scanned" | "requested";
} | null;

const REASON: Record<NonNullable<SetupLinkState>["reason"], string> = {
  backup:
    "The invite email is on its way. If it doesn't arrive, or opening it says the link has expired, send them this link instead.",
  scanned:
    "They'd already been sent a link that got used up before they could set a password — usually an email security scanner opens it first. Send them this link instead.",
  requested:
    "Send them this link to set their password.",
};

/**
 * Shows a password-setup link for the admin to pass on (chat, email, Teams).
 *
 * The link opens a page with a Continue button and only spends its one-time
 * token when a person presses it, so a link scanner opening it first does no
 * harm (lib/auth/setup-link.ts). It signs whoever opens it in as that person,
 * which is why the copy says to send it to them only.
 */
export function SetupLinkDialog({
  state,
  onClose,
}: {
  state: SetupLinkState;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const copy = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, permissions): select it instead.
      inputRef.current?.select();
      toast.message("Press Ctrl+C (⌘C) to copy the selected link");
    }
  };

  return (
    <Dialog
      open={state != null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden />
            Password setup link
          </DialogTitle>
          <DialogDescription>
            {state ? REASON[state.reason] : null}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                readOnly
                value={state.url}
                aria-label={`Password setup link for ${state.email}`}
                className="min-w-0 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" onClick={() => void copy()} className="shrink-0 gap-1.5">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                Send it to <span className="font-medium text-foreground">{state.email}</span>{" "}
                only — whoever opens it can set the password for this account.
              </li>
              <li>It works once. Making a new link cancels this one.</li>
              <li>
                Link scanners in email or chat can&apos;t use it up: it only
                works when a person presses Continue.
              </li>
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The key button on a member / pending-invite row: asks the server for a
 * setup link and shows it. The server refuses anyone who already chose a
 * password, and that refusal is shown as-is.
 */
export function SetupLinkButton({
  email,
  name,
  size = "icon-sm",
}: {
  email: string;
  name: string;
  size?: "icon" | "icon-sm";
}) {
  const [state, setState] = React.useState<SetupLinkState>(null);
  const [busy, setBusy] = React.useState(false);

  const request = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/invites/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        toast.message("No setup link made", {
          description: payload.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      setState({ email, url: payload.url, reason: "requested" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className="text-muted-foreground hover:text-foreground"
        title="Password setup link"
        aria-label={`Get a password setup link for ${name}`}
        disabled={busy}
        onClick={() => void request()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
      </Button>
      <SetupLinkDialog state={state} onClose={() => setState(null)} />
    </>
  );
}
