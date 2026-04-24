"use client";

import { Toaster } from "@/components/ui/sonner";

/**
 * Global feedback: one Sonner instance for the whole app (theme-aware via ui/sonner).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        richColors
        expand={false}
        duration={4000}
        offset={16}
        mobileOffset={{
          bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      />
    </>
  );
}
