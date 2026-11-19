# Lernabläufe nach dem Forschungsabgleich

Die fünf Befunde aus dem [Abgleich vom 10. November 2026](lernstrategien-abgleich-2026-11-10.md) sind umgesetzt:

- Lokale freie Textantworten verwenden Selbstbewertung anhand der Musterlösung. Auch identischer Wortlaut ist kein automatisches fachliches Richtigkeitsurteil. Strukturierte Aufgaben und die optionale KI liefern weiterhin Inhaltsbewertungen.
- Die Sicherheitsanzeige stellt die gewählte Sicherheit einem vorhandenen Prüfergebnis neutral gegenüber. Bei Selbstbewertung erscheint nur die gewählte Sicherheit; es gibt keine Einzelfall-Kalibrationsnote.
- FSRS-5 berücksichtigt Wiederholungen am selben Kalendertag, gedämpfte Schwierigkeitsänderungen und begrenzte Vergessensstabilität. Gewichte und 90 % Zielbehalten bleiben erhalten. Bestehende Intervalle werden erst bei einer regulären Bewertung aktualisiert.
- Beide Modi beachten nach Nochmal/Schwer zehn Minuten Abstand, auch nach Neustart oder Moduswechsel. Andere verfügbare Karten können währenddessen bearbeitet werden. Ist keine verfügbar, endet die Sitzung mit dem nächsten Übungszeitpunkt. Nochmal erlaubt maximal zwei Zusatzversuche und Schwer einen innerhalb der Sitzung.
- Die Deckmischung heißt „Stapel mischen“. Die Oberfläche empfiehlt verwandte Themen oder Aufgabentypen und erklärt den Fall eines einzelnen Stapels.

## Daten und Kompatibilität

`cardStats.practiceAvailableAt` ist ein optionaler Unix-Zeitstempel in Millisekunden. Speicherung und JSON-Import/-Export erhalten ihn. Fehlende Werte in alten Backups bedeuten sofortige Verfügbarkeit. Veraltete `smartBlockedUntil`-/`smartSkipUntilSession`-Felder begründen keine neue Sperre.

Reguläre Wiederholungen und vorgemerkte Lernschritte aktualisieren FSRS. Freiwilliges Zusatzüben erhält sämtliche Scheduler-Felder und bestehende Vormerkungen; die Sitzung wird in den Statistiken mit `practice: true` gekennzeichnet. Fehler beim Zusatzüben können den nächsten freiwilligen Versuch verzögern, erzeugen aber keine reguläre Lernvormerkung.

Der Zehn-Minuten-Abstand ist ein Produktstandard, kein behauptetes universelles Forschungsoptimum. Karten-IDs, bestehende Lernstände und manuelle Lernbewertungen bleiben erhalten. Neue Telemetrie oder externe Anfragen entstehen nicht.

## Prüfung

- Vollständige Testsuite: 70 Electron-/Shared-Tests und 308 Vitest-Tests.
- Typecheck und Produktionsbuild über `npm run build:web`.
- Isolierter Electron-Test mit Beispieldaten und simulierter KI: zwölf Aufgabenformate in Desktop- und Mobilbreite, einschließlich Zusatzüben, Sperrfrist und Moduswechsel; keine externen Asset-Anfragen.
- Native iOS-KI-Journal-Prüfung: 31 Checks. Ein vollständiger iOS-/Android-Gerätebuild ist damit nicht abgedeckt.

Die historischen Reproduktionen im Forschungsabgleich beschreiben den Zustand vor diesen Änderungen. Die neuen Regressionstests prüfen insbesondere das falsche Quadrat-Beispiel, Paraphrasen, FSRS-Referenzwerte, Kalendergrenzen, gespeicherte Sperrfristen, begrenzte Zusatzversuche, Speicherfehler und Sitzungszeitlimits.

## Erstlernen im Lernpfad

Ein Lernziel beginnt mit einer Erklärung und einem ausgearbeiteten Beispiel. Die angeleitete Übung gibt konkrete Hilfe. Beim anschließenden Abruf bearbeitet der Lernende eine neue Anwendung. Wer dabei einen Hinweis braucht, kann ihn sofort nutzen und erhält eine andere Prüfvariante. Bereits erreichte Ziele bleiben erhalten.

Die Freigabe verlangt einen selbstständigen Nachweis für jedes Pflichtziel. Ein unmittelbarer Erfolg belegt die Anwendung in dieser Aufgabe. Für späteres Wiederholen lassen sich gezielt Karten in einen Stapel übernehmen. Die spätere Bewertung im Stapel steuert deren Fälligkeit.
