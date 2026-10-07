# Meldungen und Fehlerzustände

Aktionsfehler erscheinen in einer gemeinsamen Meldungsanzeige: auf Desktop unten rechts, auf kleinen Displays oberhalb der Navigation und innerhalb der Safe Areas. Bei geöffneten Karten- oder Stapel-Editoren wird Platz unter dem Dialog reserviert, damit Meldungen die Dialogaktionen nicht überdecken.

## Verhalten

- Erfolgsmeldungen verschwinden nach 2,6 Sekunden; Aktionsfehler nach acht Sekunden.
- Aktionsmeldungen lassen sich schließen. Hover und Tastaturfokus pausieren die verbleibende Anzeigedauer unabhängig voneinander.
- Identische Meldungen werden zusammengefasst. Höchstens drei Meldungen sind sichtbar; Fehler erhalten Vorrang vor Erfolgen. Bei geöffneten Editoren ist höchstens eine Meldung sichtbar, damit der Dialog nutzbar bleibt. Vorübergehend verdeckte Meldungen pausieren.
- Bibliotheks-Ladefehler und ungelöste Speicherfehler sind dauerhaft sichtbar und nicht schließbar. Speicherfehler verschwinden nach erfolgreicher Speicherung; Ladefehler verhindern weiterhin das Überschreiben der Originaldaten.
- Meldungen erhalten keinen automatischen Fokus. Fehler verwenden `role="alert"`, Erfolge `role="status"`; Schließen-Schaltflächen sind beschriftet und auch bei geöffneten Dialogen mit der Tastatur erreichbar.

## Angeschlossene Abläufe

Importfehler, Backup- und Kartenexportfehler, Diagnose-Log-Exportfehler sowie Fehler beim Speichern von Sprache, Design und Lernkonfiguration verwenden die gemeinsame Anzeige. Importmeldungen verwenden ausschließlich bekannte, lokalisierte Fehlerkategorien; technische Ausnahmen werden nicht als Produkttext ausgegeben. Fehler beim Importieren und beim anschließenden Speichern werden getrennt behandelt.

Fehlgeschlagene Löschungen, direkte Kartenänderungen und neue/importierte Karten oder Stapel werden zurückgenommen. Es erscheint keine Erfolgsmeldung. Neue Karten und Stapel können ohne Duplikate erneut gespeichert werden. Die bereits vorhandene Stapelbild-Auswahl bleibt erhalten.

Karten- und Stapel-Editoren bleiben bei einem Speicherfehler geöffnet und behalten die Eingaben; zusätzlich bleibt der Fehler im Dialog sichtbar. Lernfortschritt bleibt bei einem Speicherfehler im Arbeitsspeicher und wird bei der nächsten erfolgreichen Speicherung mitgespeichert. Eine abgebrochene native Teilen-Aktion erzeugt weder eine Fehlermeldung noch eine falsche Export-Erfolgsmeldung.

Pflichtfeldfehler, KI-Auswertungsfehler, API-Schlüsselprobleme und Fehler beim Laden der Verbrauchsdaten bleiben bei ihren bisherigen Korrektur- beziehungsweise Wiederholen-Möglichkeiten.

## Schnittstellen

Der UI-Store bietet weiterhin `showToast(key, params)` für bestehende Aufrufer sowie `showError`, `dismissNotification`, `pauseNotification` und `resumeNotification`. Meldungen tragen eine Kennung, einen Typ und einen Übersetzungsschlüssel. Die Bibliothek stellt zusätzlich den strukturierten Zustand `persistenceIssue` (`load`, `save` oder `null`) bereit; die vorhandene `saveError`-Schnittstelle bleibt erhalten.

`setLanguage` meldet mit einem booleschen Rückgabewert, ob die Sitzungswahl dauerhaft gespeichert wurde. `saveExport` unterscheidet `exported` von `cancelled`; andere Fehler werden an den Aufrufer weitergereicht. Importfehler verwenden einen typisierten, lokalisierten Schlüssel statt beliebiger Ausnahmetexte.

## Verifikation am 06.10.2026

- `npm run test`: 56 Electron-Tests und 137 Frontend-Tests bestanden.
- Typecheck und Produktionsbuild bestanden; `git diff --check` bestanden.
- Neue Regressionen prüfen Anzeigedauer, Pause, Schließen, Zusammenfassen, Priorität, verborgen wartende Meldungen, Fokus, Originaldatenerhalt, Wiederholen ohne Duplikate, Lernfortschritt, Einstellungen, Exportfehler und Abbruch.
- `electron scripts/check-notifications.cjs`: künstliche Import- und Einstellungsfehler, fehlgeschlagene Löschung, erfolgreiche Fehlerbehebung sowie acht Layoutzustände bestanden. Aufnahmen bei 320×568, 393×852, 852×393 und 1280×900 liegen unter `design-audit/notifications-2026-10-06`, jeweils mit und ohne Editor. Angenäherte Safe Areas wurden berücksichtigt; Navigation und Dialogaktionen werden nicht überdeckt. Kleine Hochformat-, Querformat- und Desktop-Aufnahmen wurden visuell geprüft.
- Der finale Web-Build wurde nach iOS kopiert. Index, Web-Assets und Stapelbilder wurden byteweise verglichen.

Die Layoutprüfung nutzt Chromium/Electron und simulierte Safe Areas. Ein vollständiger iOS-Build sowie die tatsächliche WKWebView, Bildschirmtastatur und Screenreader-Bedienung auf einem Gerät wurden nicht geprüft.
