"use client";

import { Building2, Lock, User } from "lucide-react";
import { Toaster } from "sonner";

import { ProfileForm } from "@/components/features/settings/ProfileForm";
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

export function SettingsClient() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Toaster position="bottom-right" richColors closeButton />
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and preview where workspace and security settings will live.
        </p>
      </header>

      <Tabs defaultValue="profile" className="w-full gap-6">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="size-3.5 sm:inline" aria-hidden />
            Profile
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-1.5">
            <Building2 className="size-3.5 sm:inline" aria-hidden />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Lock className="size-3.5 sm:inline" aria-hidden />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0 outline-none">
          <ProfileForm />
        </TabsContent>

        <TabsContent value="workspace" className="mt-0 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Placeholder layout — no API yet. Typical fields: workspace name, default
                timezone, week start, and notification defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Workspace display name</Label>
                <Input
                  id="ws-name"
                  disabled
                  placeholder="Acme Corp"
                  defaultValue="Demo workspace"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-tz">Default timezone</Label>
                <Input id="ws-tz" disabled placeholder="e.g. America/New_York" />
              </div>
              <p className="text-xs text-muted-foreground">
                These controls will wire to Laravel once endpoints exist. Profile changes
                above already persist locally for the signed-in demo user.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-0 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                Password change, active sessions, and two-factor authentication will be
                configured here with the backend.
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
                <span className="font-mono">httpOnly</span>). No password UI is wired in
                this demo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
