"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";

/**
 * Back for a detail dialog that a listing opened. It closes the dialog it sits
 * in, so the listing keeps its search, filters and page. It works from any depth
 * inside the dialog, so the header can live in a child component.
 */
export function DialogBackButton() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline" size="sm">
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        Back
      </Button>
    </DialogClose>
  );
}
