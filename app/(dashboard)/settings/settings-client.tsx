"use client";

import * as React from "react";
import { Building2, CalendarOff, Lock, Star, User } from "lucide-react";
import { HourlyRatesCard } from "@/components/features/settings/HourlyRatesCard";
import { HolidaysCard } from "@/components/features/settings/HolidaysCard";
import { SprintLengthCard } from "@/components/features/settings/SprintLengthCard";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { AdminTeamTimeOffSection } from "@/components/features/settings/AdminTeamTimeOffSection";
import { EmailNotificationsCard } from "@/components/features/settings/EmailNotificationsCard";
import { ProfileForm } from "@/components/features/settings/ProfileForm";
import { TwoFactorCard } from "@/components/features/settings/TwoFactorCard";
import { TimeOffSettingsSection } from "@/components/features/settings/TimeOffSettingsSection";
import { ZohoConnectionCard } from "@/components/features/settings/ZohoConnectionCard";
import { MemberSkillsEditor } from "@/components/features/skills/MemberSkillsEditor";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/auth-store";
import { tourAnchor } from "@/lib/tours/ids";
import { TourSettingsCard } from "@/components/features/tour/TourSettingsCard";
import { AppHelp } from "@/components/common/app-help";

export function SettingsClient({ requestedTab }: { requestedTab?: string }) {
  const selfId = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const isAdmin = useAuthStore((s) => s.user.role) === "admin";
  const { canViewHourlyRates } = usePermissions();
  // The tab a link asks for (?tab=security — the checklist's "Show me";
  // ?zoho=… → workspace, see page.tsx).
  const [defaultTab] = React.useState(() => {
    const tabs = ["profile", "skills", "timeoff", "security"];
    if (canViewHourlyRates) tabs.push("workspace");
    return requestedTab && tabs.includes(requestedTab) ? requestedTab : "profile";
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Account"
        help={<AppHelp section="page.settings" />}
        title="Settings"
        description="Your profile, skills and time off — plus workspace settings for admins and managers."
      />

      <Tabs defaultValue={defaultTab} className="w-full gap-6">
        {/* Two rows on a phone: as a scrolling strip with a hidden scrollbar,
            Workspace was cut in half and Security was off-screen entirely. */}
        <TabsList
          {...tourAnchor("settings.tabs")}
          className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border border-border/60 bg-muted/50 p-1 shadow-sm backdrop-blur-sm sm:flex sm:justify-center dark:bg-muted/30">
          <TabsTrigger
            value="profile"
            className="h-auto min-h-11 shrink-0 justify-center gap-1.5 px-1.5 py-2.5 text-xs sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <User className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Profile</span>
          </TabsTrigger>
          <TabsTrigger
            value="skills"
            className="h-auto min-h-11 shrink-0 justify-center gap-1.5 px-1.5 py-2.5 text-xs sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <Star className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Skills</span>
          </TabsTrigger>
          <TabsTrigger
            value="timeoff"
            className="h-auto min-h-11 shrink-0 justify-center gap-1.5 px-1.5 py-2.5 text-xs sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <CalendarOff className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Time off</span>
          </TabsTrigger>
          {/* Only roles with something in it: admin (rates + Zoho) and
              manager (rates, read-only). A member or viewer would land on an
              empty tab now the placeholder card is gone. */}
          {canViewHourlyRates ? (
            <TabsTrigger
              value="workspace"
              className="h-auto min-h-11 shrink-0 justify-center gap-1.5 px-1.5 py-2.5 text-xs sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Building2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Workspace</span>
            </TabsTrigger>
          ) : null}
          <TabsTrigger
            value="security"
            className="h-auto min-h-11 shrink-0 justify-center gap-1.5 px-1.5 py-2.5 text-xs sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <Lock className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="profile"
          className="mt-0 space-y-6 outline-none"
          {...tourAnchor("settings.profile")}
        >
          <ProfileForm />
          <EmailNotificationsCard />
          <TourSettingsCard />
        </TabsContent>

        <TabsContent value="skills" className="mt-0 outline-none">
          <Card {...tourAnchor("settings.skills")}>
            <CardHeader>
              <CardTitle>Your skills &amp; tech stack</CardTitle>
              <CardDescription>
                List the technologies you work with and rate your confidence
                (1–5 stars). This helps coordinators staff projects to the right
                people — and powers smarter assignment suggestions later.
              </CardDescription>
              <CardAction>
                <AppHelp section="settings.skills" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <MemberSkillsEditor profileId={selfId} editable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeoff" className="mt-0 outline-none">
          <Card className="relative" {...tourAnchor("settings.timeoff")}>
            <AppHelp section="settings.timeoff" corner />
            <CardContent className="space-y-0 pt-6 sm:pr-12">
              <TimeOffSettingsSection />
              <AdminTeamTimeOffSection />
            </CardContent>
          </Card>
        </TabsContent>

        {canViewHourlyRates ? (
          <TabsContent value="workspace" className="mt-0 outline-none">
            <div className="space-y-6" {...tourAnchor("settings.workspace")}>
              <HourlyRatesCard />
              <HolidaysCard />
              <SprintLengthCard />
              {isAdmin ? <ZohoConnectionCard /> : null}
            </div>
          </TabsContent>
        ) : null}

        <TabsContent
          value="security"
          className="mt-0 space-y-6 outline-none"
          {...tourAnchor("settings.security")}
        >
          <TwoFactorCard />
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Changing your password from here isn&apos;t wired yet — use
                &quot;Forgot password?&quot; on the sign-in page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sec-pass">Password</Label>
                <Input
                  id="sec-pass"
                  type="password"
                  disabled
                  placeholder="••••••••"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This app uses cookie-based sessions in production (
                <span className="font-mono">httpOnly</span>). No password UI is
                wired in this demo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
