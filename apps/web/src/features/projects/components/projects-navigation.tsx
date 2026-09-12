"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { canReadProjects } from "../lib/project-access";

export function ProjectsNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data != null && canReadProjects(access.data);
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Project management" className="px-5 py-3">
      <Link href="/projects" className="text-sm underline underline-offset-4">
        Projects
      </Link>
    </nav>
  );
}
