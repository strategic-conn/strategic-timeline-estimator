import { z } from "zod";

export const profileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters"),
  email: z.string().trim().email("Enter a valid email address"),
  avatar_url: z
    .string()
    .refine((val) => {
      const v = val.trim();
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:";
      } catch {
        return false;
      }
    }, "Use a valid https:// image URL or leave blank"),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
