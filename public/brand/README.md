# Brand assets — placeholder

Product name is **DialDesk** (dialdesk.assorted.group), part of the
Assorted Group family. The build spec (section 2) references a full set of
pre-processed logo crops (`dialdesk-logo-64h.png`, `dialdesk-mark.png`,
favicon set, etc.) sampled from a supplied logo master `3.png`. That
master was not attached to this build, and dialdesk.assorted.group is not
reachable from this environment's network egress proxy, so this directory
is currently empty and the app renders a generated placeholder mark
(`src/components/brand/mark.tsx` / `src/app/icon.tsx`) instead — three
circles in the exact brand hexes (`#064288` / `#f87026` / `#76b049`),
standing in for the real three-gear mark.

To swap in the real assets:

1. Drop the files listed in spec section 2 into this directory using the
   exact names given there.
2. Replace usages of `<BrandMark />` / `<BrandLockup />` with `<img>` tags
   pointing at the real files (sidebar uses `dialdesk-logo-64h.png`
   expanded / `mark-32.png` collapsed; PDF/report headers use
   `dialdesk-logo-128h.png`).
3. Update `src/app/icon.tsx` (and add `apple-icon.tsx` if needed) to
   render the real mark instead of the placeholder circles.
4. Get the vector SVG source per the spec's open follow-up — raster crops
   are fine at the sizes given but won't scale into print.
