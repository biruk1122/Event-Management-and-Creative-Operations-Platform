---
name: ui-ux-design
description: Design or review user-facing interfaces for this platform. Use for layouts, visual hierarchy, interaction states, responsive behavior, accessibility, or shadcn/ui composition; not for invisible backend work.
---

# UI/UX Design

Create modern, clean, professional SaaS interfaces that make dense operational work easy to scan
and act on.

## Design priorities

- Establish a clear page title, primary action, content hierarchy, and predictable navigation.
- Use restrained color, consistent spacing, readable line lengths, and existing Tailwind tokens.
- Compose accessible shadcn/ui primitives before creating new primitives.
- Design mobile-first, then verify tablet and desktop layouts without hiding essential actions.
- Meet WCAG 2.2 AA: semantic structure, visible focus, keyboard access, labels, contrast, target
  size, reduced-motion support, and announcements for important dynamic changes.
- Provide deliberate loading, empty, error, disabled, permission-denied, success, and destructive
  confirmation states where applicable.
- Preserve user-entered data when recoverable errors occur and give specific recovery guidance.
- Avoid decorative complexity, excessive gradients, dense card grids, or animation that competes
  with operational content.

## Workflow

Read `../../../apps/web/AGENTS.md`; consult
`../../../docs/architecture/technical-architecture.md` when the interface changes application
boundaries. Inspect adjacent screens and existing tokens before editing. Clarify the user's task
and the highest-risk states, then implement the smallest coherent interface. Use realistic
content in tests and previews without turning mock data into a production dependency.

Verify keyboard traversal, screen-width behavior, text wrapping, focus and error states, and
perceived loading behavior. Pair interface verification with the relevant frontend tests.
