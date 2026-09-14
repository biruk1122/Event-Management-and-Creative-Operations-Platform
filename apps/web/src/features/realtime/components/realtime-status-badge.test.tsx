import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { REALTIME_STATUSES, statusLabel } from "../lib/realtime-types";
import { RealtimeStatusBadge } from "./realtime-status-badge";

describe("RealtimeStatusBadge", () => {
  it.each(REALTIME_STATUSES)("renders the label for %s", (status) => {
    render(<RealtimeStatusBadge status={status} />);
    expect(screen.getByText(statusLabel(status))).toBeInTheDocument();
  });
});
