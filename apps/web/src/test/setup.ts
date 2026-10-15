import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom implements neither pointer capture nor scrollIntoView; Radix primitives
// (Select, Popover, …) call both. These no-op shims let those components open
// and navigate under `userEvent` in component tests.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no ResizeObserver; Radix's Checkbox indicator sizing depends on
// it. A no-op observer is enough for components that never read a size.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no matchMedia; the theme/sidebar preference hooks and the
// dashboard chart kit's reduced-motion hook all read it. A stub reporting
// "no match" (light theme, motion not reduced) is enough for components
// that never simulate a media-query change.
if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
