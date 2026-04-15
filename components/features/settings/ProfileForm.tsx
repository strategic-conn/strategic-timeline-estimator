"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  profileFormSchema,
  type ProfileFormValues,
} from "@/lib/validations/profile.schema";
import { deriveInitials } from "@/lib/utils/initials";
import { useAuthStore } from "@/store/auth-store";

function userToFormValues(u: {
  name: string;
  email: string;
  avatar_url?: string;
}): ProfileFormValues {
  return {
    name: u.name,
    email: u.email,
    avatar_url: u.avatar_url ?? "",
  };
}

export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onBlur",
    defaultValues: userToFormValues(user),
  });

  React.useEffect(() => {
    reset(userToFormValues(useAuthStore.getState().user));
  }, [user.id, user.name, user.email, user.avatar_url, user.role, reset]);

  const avatarWatch = watch("avatar_url");
  const nameWatch = watch("name");

  const onSubmit = (data: ProfileFormValues) => {
    updateProfile({
      name: data.name.trim(),
      email: data.email.trim(),
      avatar_url: data.avatar_url?.trim() || undefined,
    });
    reset(userToFormValues(useAuthStore.getState().user));
    toast.success("Profile updated", {
      description: "Saved locally for this demo session.",
    });
  };

  const previewUrl = (avatarWatch ?? "").trim() || user.avatar_url;
  const previewName = (nameWatch ?? "").trim() || user.name;
  const initialsPreview = deriveInitials(previewName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          Name, email, and photo are stored in this browser for the demo. A real build
          will sync with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /auth/me</code> and
          update endpoints.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2 sm:w-36">
              <Avatar className="size-24 ring-2 ring-border">
                {previewUrl ? (
                  <AvatarImage src={previewUrl} alt="" />
                ) : null}
                <AvatarFallback className="text-lg font-semibold">
                  {initialsPreview}
                </AvatarFallback>
              </Avatar>
              <p className="max-w-36 text-center text-xs text-muted-foreground">
                Preview updates as you type the image URL or name.
              </p>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  aria-invalid={errors.name ? "true" : undefined}
                  {...register("name")}
                />
                {errors.name ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={errors.email ? "true" : undefined}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-avatar">Avatar image URL</Label>
                <Input
                  id="profile-avatar"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  autoComplete="off"
                  aria-invalid={errors.avatar_url ? "true" : undefined}
                  {...register("avatar_url")}
                />
                {errors.avatar_url ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.avatar_url.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional. Use an <span className="font-mono">https://</span> link to a
                    square image.
                  </p>
                )}
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">User ID</p>
                  <p className="font-mono text-sm tabular-nums">{user.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Role</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {user.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Switch from the{" "}
                      <Link href="/dashboard" className="underline underline-offset-2">
                        sidebar
                      </Link>{" "}
                      for the demo, or ask an admin on{" "}
                      <Link href="/team" className="underline underline-offset-2">
                        Team
                      </Link>
                      .
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Initials after save: </span>
                <span className="font-mono font-semibold text-foreground">
                  {initialsPreview}
                </span>
                <span className="block pt-1">
                  Derived from your display name (updates when you save if the name
                  changed).
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isSubmitting}
              onClick={() => reset(userToFormValues(user))}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={!(avatarWatch ?? "").trim()}
              onClick={() => setValue("avatar_url", "", { shouldDirty: true })}
            >
              Clear avatar URL
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
