import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MailCheck className="size-4" aria-hidden="true" />
          </span>
          Registration is invite-only
        </CardTitle>
        <CardDescription>
          You can&apos;t create an account here. New members join by invitation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ask an admin on your team to invite you. You&apos;ll get an email with a
          link to set your password and finish setting up your account.
        </p>

        <Button asChild className="w-full">
          <Link href="/login">
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
