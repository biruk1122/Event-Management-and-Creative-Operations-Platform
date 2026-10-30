"use client";

import { Button } from "@/components/ui/button";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleCheck,
  House,
  Star,
  Sun,
  UserRound,
} from "lucide-react";
import styles from "./todo-presentation.module.css";

import {
  TODO_SMART_VIEWS,
  TODO_SMART_VIEW_LABELS,
  type TodoSmartView,
} from "../lib/todo-types";

export interface TodoToolbarProps {
  view: TodoSmartView;
  onChangeView: (view: TodoSmartView) => void;
  counts: Record<TodoSmartView, number>;
}

const VIEW_ICONS = {
  ALL: House,
  MY_DAY: Sun,
  IMPORTANT: Star,
  UPCOMING: CalendarDays,
  WORK: BriefcaseBusiness,
  PERSONAL: UserRound,
  COMPLETED: CircleCheck,
};

export function TodoToolbar({ view, onChangeView, counts }: TodoToolbarProps) {
  return (
    <div data-work-toolbar className={styles.smartToolbar}>
      <div role="group" aria-label="To-do views" className={styles.smartViews}>
        {TODO_SMART_VIEWS.map((candidate) => {
          const Icon = VIEW_ICONS[candidate];
          return (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={candidate === view}
              onClick={() => onChangeView(candidate)}
            >
              <Icon aria-hidden="true" />
              {TODO_SMART_VIEW_LABELS[candidate]}
              <span className={styles.viewCount} aria-hidden="true">
                {counts[candidate]}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
