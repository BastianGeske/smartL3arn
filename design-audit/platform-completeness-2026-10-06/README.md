# Plattformprüfung und Fixes

Der vollständige Bericht mit historischem Audit und aktuellem Fixstand liegt unter [docs/platform-completeness-2026-10-06.md](../../docs/platform-completeness-2026-10-06.md).

Der ursprüngliche Test reproduzierte den fehlerhaften iOS-Erststart. Er wurde durch zehn reguläre Regressionstests in `src/views/SmartSetupView.test.ts` ersetzt und ist Teil von `npm test`.

Der native Android-Starttest besteht im API-36.1-Emulator (Android 16). Die [Startseite im Emulator](android-home.png) zeigt den leeren Bibliothekszustand bei 1080 × 2400 Pixeln ohne überlappende Bedienelemente. Der Screenshot ersetzt keine Prüfung sämtlicher Dialoge, Gerätegrößen oder Plattformen.

Neue private Desktop-Prüfpakete liegen im ignorierten Verzeichnis `out/platform-fixes-2026-10-06/`. Das alte Release ist unter `.artifact-quarantine/legacy-release-1.0.3` gesichert und muss außer Gebrauch bleiben. Der API-Schlüssel muss vom Kontoinhaber bei OpenRouter widerrufen werden; dieser externe Schritt ist nicht als erledigt bestätigt.
