"use client";

import * as React from "react";
import { Building2, CalendarOff, Lock, Star, User } from "lucide-react";
import { HourlyRatesCard } from "@/components/features/settings/HourlyRatesCard";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { AdminTeamTimeOffSection } from "@/components/features/settings/AdminTeamTimeOffSection";
import { ProfileForm } from "@/components/features/settings/ProfileForm";
import { TimeOffSettingsSection } from "@/components/features/settings/TimeOffSettingsSection";
import { ZohoConnectionCard } from "@/components/features/settings/ZohoConnectionCard";
import { MemberSkillsEditor } from "@/components/features/skills/MemberSkillsEditor";
import {
  Card,
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

export function SettingsClient() {
  const selfId = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const isAdmin = useAuthStore((s) => s.user.role) === "admin";
  const { canViewHourlyRates } = usePermissions();
  // Land on Workspace after the Zoho OAuth redirect (?zoho=...), or on the
  // tab a link asks for (?tab=workspace — the checklist's "Connect Zoho").
  const [defaultTab] = React.useState(() => {
    if (typeof window === "undefined") return "profile";
    const params = new URLSearchParams(window.location.search);
    if (params.has("zoho")) return "workspace";
    const tab = params.get("tab");
    const tabs = ["profile", "skills", "timeoff", "security"];
    if (canViewHourlyRates) tabs.push("workspace");
    return tab && tabs.includes(tab) ? tab : "profile";
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile, skills and time off — plus workspace settings for admins and managers."
      />

      <Tabs defaultValue={defaultTab} className="w-full gap-6">
        <TabsList
          {...tourAnchor("settings.tabs")}
          className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-muted/50 p-1 shadow-sm backdrop-blur-sm sm:justify-center dark:bg-muted/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="profile"
            className="h-auto min-h-11 shrink-0 justify-center gap-2 px-3 py-2.5 text-xs sm:min-h-10 sm:text-sm"
          >
            <User className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Profile</span>
          </TabsTrigger>
          <TabsTrigger
            value="skills"
            className="h-auto min-h-11 shrink-0 justify-center gap-2 px-3 py-2.5 text-xs sm:min-h-10 sm:text-sm"
          >
            <Star className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Skills</span>
          </TabsTrigger>
          <TabsTrigger
            value="timeoff"
            className="h-auto min-h-11 shrink-0 justify-center gap-2 px-3 py-2.5 text-xs sm:min-h-10 sm:text-sm"
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
              className="h-auto min-h-11 shrink-0 justify-center gap-2 px-3 py-2.5 text-xs sm:min-h-10 sm:text-sm"
            >
              <Building2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Workspace</span>
            </TabsTrigger>
          ) : null}
          <TabsTrigger
            value="security"
            className="h-auto min-h-11 shrink-0 justify-center gap-2 px-3 py-2.5 text-xs sm:min-h-10 sm:text-sm"
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
            </CardHeader>
            <CardContent>
              <MemberSkillsEditor profileId={selfId} editable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeoff" className="mt-0 outline-none">
          <Card {...tourAnchor("settings.timeoff")}>
            <CardContent className="space-y-0 pt-6">
              <TimeOffSettingsSection />
              <AdminTeamTimeOffSection />
            </CardContent>
          </Card>
        </TabsContent>

        {canViewHourlyRates ? (
          <TabsContent value="workspace" className="mt-0 outline-none">
            <div className="space-y-6" {...tourAnchor("settings.workspace")}>
              <HourlyRatesCard />
              {isAdmin ? <ZohoConnectionCard /> : null}
            </div>
          </TabsContent>
        ) : null}

        <TabsContent value="security" className="mt-0 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                Password change, active sessions, and two-factor authentication
                will be configured here with the backend.
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
