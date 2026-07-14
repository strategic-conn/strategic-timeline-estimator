import type { Metadata } from "next";

import { AppAtmosphere } from "@/components/layouts/app-atmosphere";
import { ModeToggle } from "@/components/mode-toggle";

export const metadata: Metadata = {
  title: "Account",
};

export default function AuthConfirmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-svh flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <AppAtmosphere variant="auth" />
      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
        <ModeToggle />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center">{children}</div>
    </div>
  );
}
