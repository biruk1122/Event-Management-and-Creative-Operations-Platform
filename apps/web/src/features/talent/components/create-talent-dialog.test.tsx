import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeTalent } from "../test-data";
import { CreateTalentDialog } from "./create-talent-dialog";

type DialogProps = ComponentProps<typeof CreateTalentDialog>;

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    managers: [],
    onCreate: vi.fn(async () => ({
      status: "success" as const,
      talent: makeTalent({ id: "tal-9", fullName: "New Person" }),
    })),
    onUploadPhoto: vi.fn(async () => true),
    onCreated: vi.fn(),
    ...overrides,
  } satisfies DialogProps;
  render(<CreateTalentDialog {...props} />);
  return props;
}

const photo = new File(["png"], "portrait.png", { type: "image/png" });

describe("CreateTalentDialog", () => {
  it("defaults to the Artist type and the Available status", () => {
    renderDialog();

    expect(
      screen.getByRole("combobox", { name: "Talent type" }),
    ).toHaveTextContent("Artist");
    expect(screen.getByRole("radio", { name: /^available/i })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /unavailable/i }),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /inactive/i })).not.toBeChecked();
  });

  it("saves the status the user picks", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(screen.getByLabelText(/full name/i), "New Person");
    await user.click(screen.getByRole("radio", { name: /inactive/i }));
    await user.click(screen.getByRole("button", { name: "Create talent" }));

    await waitFor(() => expect(props.onCreate).toHaveBeenCalledTimes(1));
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ availability: "INACTIVE" }),
    );
  });

  it("requires a full name before anything is sent", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("button", { name: "Create talent" }));

    expect(await screen.findByText("Enter a name.")).toBeVisible();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("rejects a social media link that is not a web address", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(screen.getByLabelText(/full name/i), "New Person");
    await user.type(
      screen.getByLabelText("Social media links"),
      "javascript:alert(1)",
    );
    await user.click(screen.getByRole("button", { name: "Create talent" }));

    expect(
      await screen.findByText("Use an http or https address."),
    ).toBeVisible();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("creates the profile with every shown field, then uploads the photo", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.type(screen.getByLabelText(/full name/i), "New Person");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Phone"), "+1 555 0100");
    await user.type(
      screen.getByLabelText("Social media links"),
      "https://www.instagram.com/new",
    );
    await user.type(screen.getByLabelText("Biography"), "Works in film.");
    await user.upload(screen.getByLabelText("Choose a profile photo"), photo);
    await user.click(screen.getByRole("button", { name: "Create talent" }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "New Person",
        type: "ARTIST",
        email: "new@example.com",
        phone: "+1 555 0100",
        biography: "Works in film.",
        managerId: null,
        availability: "AVAILABLE",
        socialLink: {
          label: "instagram.com",
          url: "https://www.instagram.com/new",
        },
      }),
    );
    expect(props.onUploadPhoto).toHaveBeenCalledWith("tal-9", photo);
    expect(props.onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tal-9" }),
      null,
    );
  });

  it("refuses a file that is not a PNG, JPG or WEBP image", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const props = renderDialog();

    const pdf = new File(["pdf"], "contract.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Choose a profile photo"), pdf);

    expect(
      await screen.findByText("Choose a PNG, JPG or WEBP image."),
    ).toBeVisible();
    expect(props.onUploadPhoto).not.toHaveBeenCalled();
  });

  it("keeps the saved profile and says so when the photo does not upload", async () => {
    const user = userEvent.setup();
    const props = renderDialog({
      onUploadPhoto: vi.fn(async () => false),
    });

    await user.type(screen.getByLabelText(/full name/i), "New Person");
    await user.upload(screen.getByLabelText("Choose a profile photo"), photo);
    await user.click(screen.getByRole("button", { name: "Create talent" }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(props.onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tal-9" }),
      "Talent created, but the photo did not upload. Add it from the profile.",
    );
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });
});
