import { cn } from "@/lib/utils";

export type AppAtmosphereVariant = "marketing" | "app" | "auth";

const VARIANT_ORBS: Record<
  AppAtmosphereVariant,
  { top: string; bottom: string; grid: string }
> = {
  marketing: {
    top: "bg-primary/[0.18] dark:bg-primary/[0.12]",
    bottom: "bg-chart-2/[0.14] dark:bg-chart-3/[0.12]",
    grid: "opacity-[0.45] dark:opacity-[0.35]",
  },
  app: {
    top: "bg-primary/[0.11] dark:bg-primary/[0.09]",
    bottom: "bg-chart-2/[0.09] dark:bg-chart-3/[0.08]",
    grid: "opacity-[0.32] dark:opacity-[0.26]",
  },
  auth: {
    top: "bg-primary/[0.09] dark:bg-primary/[0.07]",
    bottom: "bg-chart-2/[0.07] dark:bg-chart-3/[0.06]",
    grid: "opacity-[0.28] dark:opacity-[0.22]",
  },
};

/**
 * Decorative grid + gradient orbs (landing + authenticated shell).
 * Keep behind content with `relative z-10` on interactive regions.
 */
export function AppAtmosphere({
  variant = "app",
  className,
}: {
  variant?: AppAtmosphereVariant;
  className?: string;
}) {
  const v = VARIANT_ORBS[variant];
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div
        className={cn(
          "absolute -top-28 right-[-12%] h-[min(28rem,70vw)] w-[min(28rem,70vw)] rounded-full blur-3xl",
          v.top
        )}
      />
      <div
        className={cn(
          "absolute bottom-[-35%] left-[-15%] h-[min(26rem,65vw)] w-[min(26rem,65vw)] rounded-full blur-3xl",
          v.bottom
        )}
      />
      <div
        className={cn(
          "absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[44px_44px]",
          v.grid
        )}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  );
}
