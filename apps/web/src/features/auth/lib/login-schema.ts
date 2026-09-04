import { z } from "zod";

/**
 * Client-side shape check for the sign-in form. The API performs the
 * authoritative validation; this only keeps obviously incomplete submissions
 * from leaving the browser and drives inline field messages.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .refine((value) => z.email().safeParse(value).success, {
      message: "Enter a valid email address.",
    }),
  password: z.string().min(1, "Enter your password."),
});

export type LoginValues = z.infer<typeof loginSchema>;
