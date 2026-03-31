import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Flame, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "todo" | "in_progress" | "in_review" | "done" | "blocked";

const statusVariant: Record<Status, React.ComponentProps<typeof Badge>["variant"]> = {
  todo: "outline",
  in_progress: "secondary",
  in_review: "secondary",
  done: "default",
  blocked: "destructive",
};

const dummy = {
  kpis: [
    { label: "Active projects", value: 3, icon: Flame },
    { label: "Tasks due soon", value: 7, icon: Timer },
    { label: "On-time delivery", value: "92%", icon: CheckCircle2 },
    { label: "Next milestone", value: "Thu", icon: CalendarClock },
  ],
  dueSoon: [
    { id: "T-1021", title: "Define MVP scope", project: "Client Portal", due: "Today", status: "in_progress" as const },
    { id: "T-1033", title: "Create wireframes", project: "Timeline Estimator", due: "Tomorrow", status: "in_review" as const },
    { id: "T-1040", title: "Set up CI lint step", project: "Internal Tools", due: "Fri", status: "todo" as const },
    { id: "T-1044", title: "Review API error format", project: "Timeline Estimator", due: "Mon", status: "blocked" as const },
  ],
  activity: [
    { at: "10:12", text: "You moved “Define MVP scope” to In progress." },
    { at: "09:40", text: "New comment on “Create wireframes”." },
    { at: "Yesterday", text: "Project “Client Portal” marked Active." },
  ],
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dummy.kpis.map((kpi) => (
          <Card key={kpi.label} size="sm">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center justify-between">
                <span>{kpi.label}</span>
                <kpi.icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {kpi.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Due soon</CardTitle>
            <CardDescription>
              The next tasks that will affect timelines if they slip.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dummy.dueSoon.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.id}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.project}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.due}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[t.status]}>{t.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/tasks" aria-label={`Open ${t.title}`}>
                          View <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Common next steps.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0">
              <Button asChild>
                <Link href="/projects">Create project</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/tasks">Add task</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/calendar">Schedule work</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Recent changes across your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-3">
                {dummy.activity.map((a, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="mt-1 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground">
                      {a.at}
                    </div>
                    <div className="text-sm leading-6">{a.text}</div>
                  </li>
                ))}
              </ul>
              <Separator className="my-4" />
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/reports">View reports</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

