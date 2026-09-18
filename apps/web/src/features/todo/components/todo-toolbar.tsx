"use client";

import { Button } from "@/components/ui/button";

import {
  TODO_SMART_VIEWS,
  TODO_SMART_VIEW_LABELS,
  type TodoSmartView,
} from "../lib/todo-types";

export interface TodoToolbarProps {
  view: TodoSmartView;
  onChangeView: (view: TodoSmartView) => void;
  onCreate: () => void;
}

export function TodoToolbar({
  view,
  onChangeView,
  onCreate,
}: TodoToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="group"
        aria-label="To-do views"
        className="border-border flex flex-wrap gap-1 rounded-lg border p-1"
      >
        {TODO_SMART_VIEWS.map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="sm"
            variant={candidate === view ? "default" : "ghost"}
            aria-pressed={candidate === view}
            onClick={() => onChangeView(candidate)}
          >
            {TODO_SMART_VIEW_LABELS[candidate]}
          </Button>
        ))}
      </div>
      <Button type="button" onClick={onCreate}>
        Add to-do
      </Button>
    </div>
  );
}
