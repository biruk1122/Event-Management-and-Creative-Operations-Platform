import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateMeetingForm } from "./create-meeting-form";
import type { AssignableMeetingPerson } from "../api/meetings-gateway";

const PEOPLE: AssignableMeetingPerson[] = [
  {
    id: "person-1",
    email: "pat@example.test",
    firstName: "Pat",
    lastName: "One",
  },
  {
    id: "person-2",
    email: "robin@example.test",
    firstName: "Robin",
    lastName: "Two",
  },
];

function setup(
  options: {
    people?: AssignableMeetingPerson[];
    peopleUnavailable?: boolean;
  } = {},
) {
  const onCreate = vi.fn();
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(
    <CreateMeetingForm
      onCreate={onCreate}
      onCreated={onCreated}
      onCancel={onCancel}
      people={options.people ?? PEOPLE}
      peopleUnavailable={options.peopleUnavailable ?? false}
    />,
  );
  fireEvent.change(screen.getByLabelText("Meeting title"), {
    target: { value: "Weekly planning" },
  });
  fireEvent.change(screen.getByLabelText("Start time"), {
    target: { value: "2026-10-20T09:00" },
  });
  fireEvent.change(screen.getByLabelText("End time"), {
    target: { value: "2026-10-20T10:00" },
  });
  fireEvent.change(screen.getByLabelText("Location"), {
    target: { value: "Studio A" },
  });
  return { onCreate, onCreated, onCancel };
}

async function selectMeetingType(
  user: ReturnType<typeof userEvent.setup>,
  name: "In person" | "Online" | "Hybrid",
) {
  await user.click(screen.getByRole("combobox", { name: "Meeting type" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("CreateMeetingForm", () => {
  it("has no Agenda field and keeps Description", () => {
    setup();
    expect(screen.getByLabelText("Description (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Agenda/)).not.toBeInTheDocument();
  });

  it("creates an online meeting with no link field and no venue location", async () => {
    const user = userEvent.setup();
    const { onCreate, onCreated } = setup();
    onCreate.mockResolvedValue({ id: "new-meeting" });
    await selectMeetingType(user, "Online");
    expect(
      screen.getByText(/self-hosted Jitsi video room/),
    ).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ id: "new-meeting" }),
    );
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONLINE" }),
    );
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("location");
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("agenda");
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("onlineLink");
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("generateMeetLink");
  });

  it("rejects invalid date ordering and whitespace-only titles", () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "2026-10-20T08:00" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    expect(screen.getByRole("alert")).toHaveTextContent("end time after");
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "2026-10-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Meeting title"), {
      target: { value: "   " },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("requires a location for physical and hybrid meetings", () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    expect(screen.getByRole("alert")).toHaveTextContent("location");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("preserves fields and allows retry after an API rejection", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    onCreate.mockRejectedValue(
      new Error("You do not have permission to create meetings."),
    );
    await user.click(screen.getByRole("button", { name: "Create meeting" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
    expect(screen.getByLabelText("Meeting title")).toHaveValue(
      "Weekly planning",
    );
    expect(
      screen.getByRole("button", { name: "Create meeting" }),
    ).toBeEnabled();
  });

  it("blocks duplicate submissions while saving", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    onCreate.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Create meeting" }));
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("allows cancellation without creating a meeting", async () => {
    const user = userEvent.setup();
    const { onCreate, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("searches, selects, and removes participants as chips", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    onCreate.mockResolvedValue({ id: "new-meeting" });
    const search = screen.getByLabelText("Participants (optional)");
    await user.type(search, "pat");
    expect(screen.queryByText("Robin Two")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Pat One" }));
    expect(search).toHaveValue("");
    expect(screen.getByText("Pat One")).toBeInTheDocument();
    // Selecting someone removes them from the candidate list.
    await user.click(search);
    expect(
      screen.queryByRole("button", { name: "Pat One" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Pat One" }));
    expect(screen.queryByText("Pat One")).not.toBeInTheDocument();

    // Removing the chip blurred the search field, closing the dropdown.
    await user.click(search);
    await user.click(await screen.findByRole("button", { name: "Robin Two" }));
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ participantIds: ["person-2"] }),
    );
  });

  it("creates with no participants when none are selected", async () => {
    const { onCreate } = setup();
    onCreate.mockResolvedValue({ id: "new-meeting" });
    fireEvent.submit(screen.getByRole("form", { name: "Create meeting" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ participantIds: [] }),
    );
  });

  it("explains when the user directory is unavailable instead of showing an empty picker", () => {
    setup({ people: [], peopleUnavailable: true });
    expect(
      screen.getByText("The user directory is unavailable for your role."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Participants (optional)"),
    ).not.toBeInTheDocument();
  });
});
