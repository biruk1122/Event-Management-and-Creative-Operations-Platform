"use client";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useThemePreference } from "./theme-preference";

/** Icon button that flips the app between light and dark tokens. */
export function ThemeToggle() {
  const { dark, toggle } = useThemePreference();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle-button relative overflow-hidden"
    >
      <Sun
        aria-hidden="true"
        className="theme-toggle-sun absolute size-4.5 transition-all duration-300 ease-out"
      />
      <Moon
        aria-hidden="true"
        className="theme-toggle-moon absolute size-4.5 transition-all duration-300 ease-out"
      />
    </Button>
  );
}
