import type { ProposalStatus } from "@/types/proposal.types";

export const PROPOSAL_STATUS_ORDER: ProposalStatus[] = [
  "draft",
  "sent",
  "approved",
  "rejected",
];

/** Label + badge color per status. `className` styles a shadcn Badge. */
export const PROPOSAL_STATUS_META: Record<
  ProposalStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className:
      "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  sent: {
    label: "Sent",
    className:
      "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  },
  approved: {
    label: "Approved",
    className:
      "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    className:
      "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
  },
};
