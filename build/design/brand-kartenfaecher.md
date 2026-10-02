# Kartenfächer logo

Selected direction: first displayed concept from the logo exploration.

- `brand-kartenfaecher.png`: transparent violet/lavender symbol for the navigation, displayed at 30px (27px on mobile).
- `../icon.png`: violet tile with the white/lavender symbol for Electron and the browser favicon.
- Wordmark remains live text; its accent uses the current primary theme color.

All raster assets were generated with the built-in Image Gen tool from the selected reference sheet. No text is embedded in the icons. `brand-kartenfaecher-ios.png` is the full-bleed iOS variant; its generation prompt preserves the card fan and replaces the rounded tile with an opaque edge-to-edge violet background because iOS applies its own corner mask.

Reference: `/Users/bastiangeske/.codex/generated_images/01a0fcc1-a104-7122-8c48-f3bc64e828e4/exec-9cff71b4-a3c4-41de-a769-b0836bb5f29e.png`.

## Asset prompts

Symbol: faithfully isolate the large violet three-card fan, preserve rounded corners, angles, curled-page negative spaces and violet/lavender color order. Center it on a transparent square canvas. No wordmark, tile, text or background.

App icon: faithfully reproduce the bottom-left violet rounded-square app icon with white/lavender three-card fan. Preserve silhouette, angles, rounded corners and curled-page cutouts. Transparent outside the tile, no text or shadows.

Native iOS/Android launcher assets are packaged by `swift scripts/generate-native-icons.swift`: opaque 1024px iOS icon, Android legacy and round icons at all five densities, and adaptive foregrounds with a violet background and safe inset.
