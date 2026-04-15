import type { Metadata } from "next";

import { ModeToggle } from "@/components/mode-toggle";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="absolute right-4 top-4 md:right-6 md:top-6">
        <ModeToggle />
      </div>
      {children}
    </div>
  );
}

