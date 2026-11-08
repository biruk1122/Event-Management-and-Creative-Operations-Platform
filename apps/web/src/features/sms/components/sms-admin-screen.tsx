"use client";

import { useState } from "react";
import { SmsHistoryPanel } from "./sms-history-panel";
import { SmsSettingsPanel } from "./sms-settings-panel";

type Tab = "settings" | "history";

export function SmsAdminScreen({ canUpdate }: { canUpdate: boolean }) {
  const [tab, setTab] = useState<Tab>("settings");
  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="SMS administration"
        className="flex gap-2 border-b"
      >
        {(
          [
            ["settings", "Settings"],
            ["history", "History"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`sms-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`sms-panel-${value}`}
            className={`px-3 py-2 text-sm ${tab === value ? "border-b-2 font-semibold" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`sms-panel-${tab}`}
        aria-labelledby={`sms-tab-${tab}`}
      >
        {tab === "settings" ? (
          <SmsSettingsPanel canUpdate={canUpdate} />
        ) : (
          <SmsHistoryPanel canUpdate={canUpdate} />
        )}
      </div>
    </div>
  );
}
