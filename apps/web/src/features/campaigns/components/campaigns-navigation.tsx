"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { canReadCampaigns } from "../lib/campaign-access";

export function CampaignsNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data != null && canReadCampaigns(access.data);
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav
      aria-label="Campaign platform"
      className="flex flex-wrap gap-4 px-5 py-3"
    >
      <Link href="/campaigns" className="text-sm underline underline-offset-4">
        Campaigns
      </Link>
      <Link
        href="/campaigns?type=MARKETING"
        className="text-sm underline underline-offset-4"
      >
        Marketing campaigns
      </Link>
    </nav>
  );
}
