"use client";

import Link from "next/link";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ProposalAccessDenied() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-muted">
          <FileText className="size-7 text-muted-foreground" aria-hidden />
        </div>
        <CardTitle>Proposals are restricted</CardTitle>
        <CardDescription className="text-balance">
          Only admins and managers can create and export client quotes. Contact
          a manager if you need a proposal prepared.
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
