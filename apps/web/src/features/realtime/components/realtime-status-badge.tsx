import {
  LoaderCircle,
  ShieldOff,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

import {
  statusLabel,
  type RealtimeConnectionStatus,
} from "../lib/realtime-types";

const BADGE_VARIANT: Record<
  RealtimeConnectionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  disabled: "secondary",
  connecting: "outline",
  connected: "default",
  reconnecting: "outline",
  denied: "destructive",
  error: "destructive",
};

function StatusIcon({ status }: { status: RealtimeConnectionStatus }) {
  switch (status) {
    case "connecting":
    case "reconnecting":
      return <LoaderCircle aria-hidden="true" className="animate-spin" />;
    case "connected":
      return <Wifi aria-hidden="true" />;
    case "denied":
      return <ShieldOff aria-hidden="true" />;
    case "error":
      return <TriangleAlert aria-hidden="true" />;
    case "disabled":
      return <WifiOff aria-hidden="true" />;
  }
}

export function RealtimeStatusBadge({
  status,
}: {
  status: RealtimeConnectionStatus;
}) {
  return (
    <Badge variant={BADGE_VARIANT[status]}>
      <StatusIcon status={status} />
      {statusLabel(status)}
    </Badge>
  );
}
