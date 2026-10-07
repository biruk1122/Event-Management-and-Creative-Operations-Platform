import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardWorkspace, canEnter } from "@/features/dashboards";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Dashboard" };
export default async function DashboardPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fdashboard");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  return (
    <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="my-5 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <DashboardWorkspace
        access={data}
        audience={canEnter(data, "management") ? "management" : "employee"}
      />
    </main>
  );
}
