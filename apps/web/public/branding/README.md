# Lela source artwork

`lela-creative-management-logo.png` is the unchanged company logo recovered from
local commit `74e05e788c28a4b4c5a8221dbf7df5ffd28d32e4` for EVE-215. Its geometric
emblem and wordmark match the user's supplied reference.

- Source bytes: 174,067.
- SHA-256: `75b3659e956b31cb3f1210c4726f9491052a33305757dd88f54bedcff165ab52`.
- Black artwork on a white canvas; do not assume transparency or stretch it.
- Keep original proportions. Use a light backing on dark surfaces.
- Do not substitute the script logo shown in the separate login layout reference.

`lela-login-logo.webp` is the EVE-217 right-sized encoding of that source at
416x632 dimensions, retaining original artwork and proportions. Login preloads it at high priority
to avoid delaying its largest paint behind application scripts on slow networks.
Run `node scripts/optimize-lela-login-logo.mjs` to reproduce it and compare decoded
RGBA pixels with the deterministic half-size PNG rendering. Full/compact SVG
viewports are unchanged; SVG image coordinates remain 832x1264 so both sources
use the same crop geometry. The source PNG remains untouched.

- Full/compact derivatives, if created, must record reproducible crop bounds and
  undergo visual comparison; do not redraw or generate an approximate logo.

The source swatch binaries are not imported. On 2026-10-08 the user explicitly
approved the proposed design anchors, peach `#EAB79F` and burgundy `#421C2B`, instead
of requiring source pixel sampling. These are approved design choices, not sampled
values. See `docs/product/lela-visual-foundation.md` for the decision and ledger.

`lela-sidebar-logo.webp` and `login-page.webp` are resized/compressed encodings
of two provided raster assets (the sidebar brand mark and the login hero
background photo) that were committed at their original, far larger resolution
and tripped the `quality:budgets` CI gate (per-image and total public-image
limits). The sidebar mark is displayed at 2rem (32px) wide
(`shell.css`'s `.shell-brand-mark`), so it is re-encoded losslessly (it has
alpha) at 128x164 - 4x headroom for high-DPI screens. The login hero photo is
a cover-fit decorative background capped at a 34rem-wide panel
(`auth-shell.module.css`'s `.hero`), so it is re-encoded as a lossy WebP at
1200x600 - no alpha, photographic content. Run
`node scripts/optimize-lela-branding-assets.mjs` to reproduce both from their
original source files (`lela-sidebar-logo.png`, `login page.png` - no longer
committed; keep a local copy of the originals if either needs to be
re-derived at a different size).
