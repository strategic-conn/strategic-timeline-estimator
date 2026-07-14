import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Esther — Coming Soon",
  description: "AI assistant for estimates, timelines, and proposals.",
};

export default function EstherPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="mx-auto w-full max-w-md text-center">
        <CardHeader className="items-center pb-4">
          <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-8 text-primary" aria-hidden />
          </div>
          <CardTitle className="text-xl">Esther is coming soon</CardTitle>
          <CardDescription className="text-balance">
            Esther turns a project brief into an hours estimate, a phased
            timeline, and a ready-to-edit proposal — all in one conversation.
            She&apos;s being polished and will be available shortly.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center border-t pt-4">
          <Button asChild>
            <Link href="/proposals">Go to the Estimator</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
