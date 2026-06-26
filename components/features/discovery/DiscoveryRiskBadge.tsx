import { ShieldAlert } from "lucide-react";

import { RISK_LEVEL_META } from "@/lib/discovery/constants";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types/discovery.types";

export function DiscoveryRiskBadge({
  level,
  score,
  className,
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
}) {
  const meta = RISK_LEVEL_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      <ShieldAlert className="size-3" aria-hidden />
      {meta.label} risk
      {typeof score === "number" ? (
        <span className="tabular-nums opacity-80">· {score}</span>
      ) : null}
    </span>
  );
}
