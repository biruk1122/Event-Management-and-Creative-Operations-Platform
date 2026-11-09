// `zod/mini` keeps the same rules as `zod` at a fraction of the size (EVE-233
// bundle budget).
import * as z from "zod/mini";

/**
 * Client-side shape check for the sign-in form. The API performs the
 * authoritative validation; this only keeps obviously incomplete submissions
 * from leaving the browser and drives inline field messages.
 */
export const loginSchema = z.object({
  email: z.string().check(
    z.trim(),
    z.minLength(1, "Enter your email address."),
    z.refine((value) => z.email().safeParse(value).success, {
      message: "Enter a valid email address.",
    }),
  ),
  password: z.string().check(z.minLength(1, "Enter your password.")),
});

export type LoginValues = z.infer<typeof loginSchema>;
