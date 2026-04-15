import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ComingSoonProps = {
  /** Main page heading (e.g. Projects). */
  heading: string;
  /** One-line summary under the heading. */
  short: string;
  /** Longer explanation of what will live here. */
  description: string;
};

export function ComingSoon({ heading, short, description }: ComingSoonProps) {
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {heading}
          </CardTitle>
          <Badge variant="secondary">Coming soon</Badge>
        </div>
        <CardDescription className="text-sm font-medium leading-snug text-foreground">
          {short}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
