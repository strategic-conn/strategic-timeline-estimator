"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { AvatarCropperDialog } from "@/components/features/settings/AvatarCropperDialog";
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
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
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

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [cropFile, setCropFile] = React.useState<File | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  const canUpload = isSupabaseConfigured && !!user.authId;

  const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8 MB source (cropped output is small)

  // Selecting a file opens the cropper; upload happens on the cropped result.
  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file fires change again.
    e.target.value = "";
    if (!file || !user.authId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("That file isn't an image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image is too large", { description: "Keep it under 8 MB." });
      return;
    }
    setCropFile(file);
    setCropOpen(true);
  };

  const closeCropper = () => {
    setCropOpen(false);
    setCropFile(null);
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user.authId) return;
    setUploading(true);
    try {
      const supabase = createClient();
      // Owner-scoped folder — RLS requires the first path segment = auth.uid().
      const path = `${user.authId}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          upsert: true,
          cacheControl: "3600",
          contentType: "image/jpeg",
        });
      if (uploadError) {
        toast.error("Couldn't upload image", {
          description: parseSupabaseError(uploadError),
        });
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setValue("avatar_url", data.publicUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });
      closeCropper();
      toast.success("Photo uploaded", {
        description: "Save changes to apply it to your profile.",
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: ProfileFormValues) => {
    const name = data.name.trim();
    const avatar_url = data.avatar_url?.trim() || undefined;

    if (isSupabaseConfigured && user.authId) {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ name, avatar_url: avatar_url ?? null })
        .eq("id", user.authId);
      if (error) {
        toast.error("Couldn't save profile", {
          description: parseSupabaseError(error),
        });
        return;
      }
      // Email is managed by Supabase Auth — keep the store name/avatar in step.
      updateProfile({ name, avatar_url });
      reset(userToFormValues(useAuthStore.getState().user));
      toast.success("Profile updated");
      return;
    }

    updateProfile({
      name,
      email: data.email.trim(),
      avatar_url,
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
          {isSupabaseConfigured
            ? "Name and photo sync to your Supabase profile. Email is managed by your sign-in account."
            : "Name, email, and photo are stored in this browser for the demo."}
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
              {canUpload ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="size-4" aria-hidden />
                    Upload photo
                  </Button>
                  <p className="max-w-36 text-center text-xs text-muted-foreground">
                    PNG or JPG. Crop &amp; zoom before saving.
                  </p>
                </>
              ) : (
                <p className="max-w-36 text-center text-xs text-muted-foreground">
                  Preview updates as you type the image URL or name.
                </p>
              )}
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
                  readOnly={isSupabaseConfigured}
                  aria-invalid={errors.email ? "true" : undefined}
                  className={isSupabaseConfigured ? "bg-muted/50" : undefined}
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
                  <p className="truncate font-mono text-sm" title={user.authId ?? String(user.id)}>
                    {user.authId ?? user.id}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Role</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {user.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {isSupabaseConfigured ? (
                        "Set by an admin in the database."
                      ) : (
                        <>
                          Switch from the{" "}
                          <Link href="/dashboard" className="underline underline-offset-2">
                            sidebar
                          </Link>{" "}
                          for the demo, or ask an admin on{" "}
                          <Link href="/team" className="underline underline-offset-2">
                            Team
                          </Link>
                          .
                        </>
                      )}
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

      <AvatarCropperDialog
        open={cropOpen}
        file={cropFile}
        busy={uploading}
        onCancel={closeCropper}
        onCropped={handleCroppedUpload}
      />
    </Card>
  );
}
