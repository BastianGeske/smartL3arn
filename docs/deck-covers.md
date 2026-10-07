# Stapelbilder

Stapel lassen sich in der Bibliothek über das Drei-Punkte-Menü löschen. Die Anwendung fragt vor dem Löschen nach einer Bestätigung.

Unter **Name & Bild ändern** kann ein Stapel umbenannt und sein Bild gewählt werden. Neue Stapel bieten dieselbe Auswahl. Die Auswahl wird erst mit **Speichern** beziehungsweise **Stapel erstellen** übernommen; **Abbrechen** verwirft die Auswahl. Das Bild bleibt beim Neustart und im JSON-Backup erhalten. Es werden nur lokale, fest definierte Motive geladen.

Die drei ursprünglichen Bilder bleiben erhalten. Zehn zusätzliche Bilder wurden am 06.10.2026 mit dem eingebauten Imagegen-Werkzeug erzeugt, jeweils mit den ursprünglichen Bildern als Stilreferenzen. Die Assets liegen unter `build/design/deck-<id>.png`; das gemeinsame Verzeichnis der Motive liegt in `shared/deck-covers.mjs`.

## Generierungs-Prompts

Gemeinsamer Prompt, ergänzt mit Farbpalette und Formen aus der Tabelle:

> Create ONE landscape deck cover background for a flashcard learning app. Match the visual design of the supplied existing covers: tactile linen / fibrous paper grain, refined flat cut-paper collage, large restrained abstract shapes, subtle tonal layering, no realistic objects, no writing or typography, no logos, no icons, no frames. Wide landscape approximately 1.65:1. Full bleed [palette] palette; [shapes]. Left 40 percent is calm uninterrupted textured color, reserving space for the app's own white icon. Shapes reach beyond canvas edges on the right. Avoid overly ornate or busy details and avoid strong 3D effects. This is a new matching background, do not reproduce the exact source composition.

| ID | Palette | Shapes |
|---|---|---|
| navy | deep navy and ocean blue | broad overlapping waves flowing across the right half |
| rose | muted rose pink and burgundy | large overlapping circular petals concentrated on the right |
| sage | sage green and forest green | wide paper leaf shapes fanning upward on the right |
| sky | sky blue and azure | soft oversized arcs like a sunrise concentrated on the right |
| terracotta | warm terracotta and burnt orange | large layered rounded arches on the right |
| indigo | indigo blue and lavender | broad folded diagonal paper ribbons sweeping up on the right |
| mint | fresh mint and dark turquoise | overlapping flowing organic leaf curves on the right |
| sand | warm sandy beige and ochre | broad curved dune-like paper layers on the right |
| coral | soft coral and warm red | large radiating semicircular fan shapes on the right |
| graphite | slate gray and graphite with pale silver | broad overlapping geometric paper folds on the right |

Referenzbilder: `build/design/deck-violet.png`, `build/design/deck-teal.png`, `build/design/deck-apricot.png`.

## Prüfung

`npm run test` prüft unter anderem Auswahl und Abbrechen, neue Stapel, Wiederöffnen, Backup-Import, lokale Bild-IDs und das Löschen mit stabilen Bildern der verbleibenden Stapel.

`electron scripts/check-deck-covers.cjs` prüft den vollständigen Ablauf mit künstlichen Daten und Speicher im Arbeitsspeicher bei 320×568, 393×852, 852×393 und 1280×900. Screenshots werden unter `design-audit/deck-covers-2026-10-06` gespeichert. Die Prüfung erfolgt in Chromium; eine Prüfung auf einem echten iOS-Gerät bleibt separat erforderlich.

Ergebnis am 06.10.2026: 56 Electron-Tests und 113 Frontend-Tests bestanden. Typecheck, Produktionsbuild und die UI-Prüfung bestanden. Alle 13 Bilder laden; Dialog und Speichern-Schaltfläche liegen innerhalb des sichtbaren Bereichs, ohne horizontales Seitenüberlaufen. Die Screenshots des kleinen Hochformats, des Querformats und der bis zum letzten Bild gescrollten Auswahl wurden visuell geprüft. Der finale Build wurde nach iOS kopiert; Web-Assets und alle 13 Bilder wurden byteweise verglichen.
