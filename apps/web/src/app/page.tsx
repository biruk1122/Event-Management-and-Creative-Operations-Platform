import { redirect } from "next/navigation";
import { entryAccess } from "@/features/auth/lib/entry-access";

export default async function Home() {
  const access = await entryAccess();
  redirect(access ? "/dashboard" : "/login?next=/");
}
