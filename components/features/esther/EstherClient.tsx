"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  EstherMessage,
  EstherTypingBubble,
} from "@/components/features/esther/EstherMessage";
import { EstherComposer } from "@/components/features/esther/EstherComposer";
import { EstherEmptyState } from "@/components/features/esther/EstherEmptyState";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { createEmptyDiscoveryProject } from "@/lib/discovery/constants";
import { discoveryFromEstherAnalysis } from "@/lib/discovery/from-esther";
import { analyzeBrief, classifyMessage } from "@/lib/esther/engine";
import { ESTHER_SAMPLE_BRIEF } from "@/lib/esther/sample";
import { useEstherStore, estherUid } from "@/store/esther-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { DiscoveryProject } from "@/types/discovery.types";
import type { EstherAnalysis } from "@/types/esther.types";
import type { ProposalPlatform } from "@/types/proposal.types";

const READABLE_EXT = /\.(txt|md|markdown|csv|json)$/i;

export function EstherClient() {
  const { canExportProposals } = usePermissions();
  const router = useRouter();

  const messages = useEstherStore((s) => s.messages);
  const addMessage = useEstherStore((s) => s.addMessage);
  const reset = useEstherStore((s) => s.reset);
  const createProposalFromDraft = useProposalEstimatorStore(
    (s) => s.createProposalFromDraft,
  );
  const createProposal = useProposalEstimatorStore((s) => s.createProposal);

  const [hydrated, setHydrated] = React.useState(() =>
    useEstherStore.persist.hasHydrated(),
  );
  const [input, setInput] = React.useState("");
  const [platform, setPlatform] = React.useState<ProposalPlatform>("react_next");
  const [attachment, setAttachment] = React.useState<{
    name: string;
    text: string;
  } | null>(null);
  const [thinking, setThinking] = React.useState(false);
  const [creatingAnalysis, setCreatingAnalysis] =
    React.useState<EstherAnalysis | null>(null);

  const endRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (useEstherStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useEstherStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return unsub;
  }, []);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const hasPriorAnalysis = messages.some(
    (m) => m.role === "assistant" && m.kind === "analysis",
  );

  const respond = React.useCallback(
    (userText: string, attached: { name: string; text: string } | null) => {
      const brief = [attached?.text, userText].filter(Boolean).join("\n\n");
      const intent = classifyMessage(userText, !!attached, hasPriorAnalysis);

      setThinking(true);
      // Simulated "analysis" latency — swap for a real model call later.
      timerRef.current = window.setTimeout(
        () => {
          if (intent === "analyze") {
            const analysis = analyzeBrief({
              text: brief,
              platform,
              fileName: attached?.name,
            });
            setPlatform(analysis.platform);
            addMessage({
              id: estherUid(),
              role: "assistant",
              kind: "analysis",
              createdAt: new Date().toISOString(),
              text: analysis.summary,
              analysis,
            });
          } else if (intent === "refine") {
            addMessage({
              id: estherUid(),
              role: "assistant",
              kind: "text",
              createdAt: new Date().toISOString(),
              text: "Got it. To re-run the numbers, paste the updated scope (or attach the revised brief) and I'll regenerate the estimate and timeline. You can also tweak any line item directly in the proposal editor.",
            });
          } else {
            addMessage({
              id: estherUid(),
              role: "assistant",
              kind: "text",
              createdAt: new Date().toISOString(),
              text: "Share a project brief — a few sentences on the platform, key pages/features, and rough page or product counts — and I'll scope it into an estimate, a phased timeline, and a proposal draft.",
            });
          }
          setThinking(false);
        },
        900 + Math.floor(Math.random() * 500),
      );
    },
    [addMessage, hasPriorAnalysis, platform],
  );

  const send = React.useCallback(
    (textArg?: string) => {
      const text = (textArg ?? input).trim();
      const attached = attachment;
      if (!text && !attached) return;

      addMessage({
        id: estherUid(),
        role: "user",
        createdAt: new Date().toISOString(),
        text: text || `Please analyze ${attached?.name ?? "this document"}.`,
        attachmentName: attached?.name,
      });
      setInput("");
      setAttachment(null);
      respond(text, attached);
    },
    [addMessage, attachment, input, respond],
  );

  const handleAttach = React.useCallback(async (file: File) => {
    let text = "";
    if (READABLE_EXT.test(file.name) || file.type.startsWith("text/")) {
      try {
        text = await file.text();
      } catch {
        text = "";
      }
    }
    // Non-text formats (pdf/doc) can't be parsed in the browser demo — stand in
    // with the sample brief so the flow still produces a rich result.
    if (!text.trim()) text = ESTHER_SAMPLE_BRIEF;
    setAttachment({ name: file.name, text });
  }, []);

  const handleCreateProposal = React.useCallback(
    (analysis: EstherAnalysis) => {
      setCreatingAnalysis(analysis);
      try {
        const id = createProposalFromDraft({
          title: analysis.suggestedTitle,
          client_name: analysis.clientName,
          platform: analysis.platform,
          notes: `Drafted by Esther.\n\n${analysis.summary}\n\nAssumptions:\n- ${analysis.assumptions.join("\n- ")}`,
          line_items: analysis.lineItems.map((li) => ({
            title: li.title,
            module: li.module,
            category_id: li.category_id,
            catalog_id: li.catalog_id,
            base_hours: li.base_hours,
            tier: li.tier,
            quantity: li.quantity,
          })),
        });
        toast.success("Proposal created from Esther's estimate");
        router.push(`/proposals/${id}`);
      } catch {
        setCreatingAnalysis(null);
        toast.error("Could not create the proposal");
      }
    },
    [createProposalFromDraft, router],
  );

  const handleStartDiscovery = React.useCallback(
    (analysis: EstherAnalysis) => {
      // Guided scoping now lives inside an estimate — seed a proposal with the
      // discovery answers and open it on the Scope & risk tab.
      const now = new Date().toISOString();
      const discovery: DiscoveryProject = {
        ...createEmptyDiscoveryProject(),
        ...discoveryFromEstherAnalysis(analysis),
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      };
      const id = createProposal({
        title: analysis.suggestedTitle,
        client_name: analysis.clientName,
        platform: analysis.platform,
        discovery,
      });
      toast.success("Estimate started from Esther's brief");
      router.push(`/proposals/${id}`);
    },
    [createProposal, router],
  );

  if (!canExportProposals) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-muted">
            <Sparkles className="size-7 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>Esther is restricted</CardTitle>
          <CardDescription className="text-balance">
            Esther builds client estimates and proposals, so she&apos;s available
            to admins and managers only. Ask a manager to scope your brief.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center border-t pt-0">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <WorkspacePageHeader
        eyebrow="Assistant"
        title={
          <span className="flex items-center gap-2">
            Esther
            <Badge variant="secondary" className="text-[0.65rem]">
              demo
            </Badge>
          </span>
        }
        description="Turn a brief or document into an hours estimate, a phased timeline, and a ready-to-edit proposal."
        actions={
          messages.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                reset();
                setCreatingAnalysis(null);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              New chat
            </Button>
          ) : undefined
        }
      />

      <div className="flex min-h-[40vh] flex-col gap-4">
        {!hydrated ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : messages.length === 0 ? (
          <EstherEmptyState
            onPick={(prompt) => send(prompt)}
            onUseSample={() => {
              setAttachment({
                name: "northwind-brief.txt",
                text: ESTHER_SAMPLE_BRIEF,
              });
              setInput("Estimate this brief and propose a timeline.");
            }}
          />
        ) : (
          messages.map((m) => (
            <EstherMessage
              key={m.id}
              message={m}
              creating={
                m.role === "assistant" &&
                m.kind === "analysis" &&
                m.analysis === creatingAnalysis
              }
              onCreateProposal={handleCreateProposal}
              onStartDiscovery={handleStartDiscovery}
            />
          ))
        )}
        {thinking ? <EstherTypingBubble /> : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-3 z-10">
        <EstherComposer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          platform={platform}
          onPlatformChange={setPlatform}
          attachmentName={attachment?.name ?? null}
          onAttach={handleAttach}
          onClearAttachment={() => setAttachment(null)}
          disabled={thinking}
        />
      </div>
    </div>
  );
}
