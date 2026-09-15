import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConversationFilters } from "./conversation-filters";

/** A stateful host so the controlled search input accumulates keystrokes. */
function StatefulFilters({
  onSearchChange,
}: {
  onSearchChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <ConversationFilters
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        onSearchChange(value);
      }}
    />
  );
}

describe("ConversationFilters", () => {
  it("passes typed search text to the handler", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<StatefulFilters onSearchChange={onSearchChange} />);

    await user.type(screen.getByLabelText("Search"), "gala");

    expect(onSearchChange).toHaveBeenLastCalledWith("gala");
  });
});
