# Umgesetzte Korrekturen

Stand: 05.10.2026. Der ursprüngliche Prüfbericht dokumentiert den Zustand vor den Änderungen.

## Layout und Dropdowns

- Aktionsmenüs verwenden die gemeinsame Komponente `AppMenu`: Sie öffnen je nach Platz oberhalb oder unterhalb des Auslösers, bleiben innerhalb der sichtbaren Fläche einschließlich Safe Areas und berücksichtigen die untere Navigation. Lange Menüs scrollen intern.
- Klick außerhalb, Escape, Tab und Auswahl schließen das Menü. Pfeiltasten, Home und End bewegen den Fokus. Beim Öffnen eines weiteren Menüs schließt das vorherige.
- Seitliche Safe Areas, Dialoghöhe bei verändertem sichtbarem Viewport und schmale API-Filter wurden korrigiert. Tabellenüberschriften und Bibliothekskennzahlen erhalten ausreichend Platz.
- Der finale Web-Build wurde nach `ios/App/App/public` kopiert. Index und sämtliche Asset-Dateien wurden byteweise mit dem Build verglichen.

## Sicherheit

- Desktop-Builds enthalten künftig keinen eingebetteten API-Schlüssel. Die Laufzeit ignoriert Schlüssel aus alten gebündelten Konfigurationsdateien und nutzt Laufzeitkonfiguration oder verschlüsselten lokalen Speicher.
- Gemeinsame Datenvalidierung begrenzt Import- und Bibliotheksgrößen, prüft Felder und Zahlen und übernimmt ausschließlich erlaubte Eigenschaften. Gefährliche und doppelte IDs werden ersetzt; Statistikzugriffe verwenden eigene Objekteigenschaften.
- Ungültige gespeicherte Bibliotheken werden als Ladefehler angezeigt und vor automatischem Überschreiben geschützt. Desktop-Schreibvorgänge verwenden eine temporäre Datei mit restriktiven Dateirechten.
- CSV-Export neutralisiert Zellen, die als Tabellenformeln ausgeführt werden könnten.
- Electron-IPC akzeptiert nur das lokale Hauptfenster und dessen Hauptframe. Fremde Navigation, neue Fenster, Webviews und Berechtigungsanfragen werden blockiert; der Renderer läuft in der Sandbox.
- Die native iOS-KI-Schnittstelle baut die erlaubte Bewertungsanfrage selbst aus begrenzten Textfeldern auf. Frei gewählte API-Payloads werden nicht mehr aus dem Webview weitergereicht. Desktop und iOS begrenzen parallele KI-Anfragen.

## Verifikation

- `npm run test`: 56 Electron-Tests und 106 Frontend-Tests bestanden.
- `npm run build:web`: Typecheck und Produktionsbuild bestanden.
- Native Swift-Regressionsprüfung: 25 Prüfungen bestanden.
- Echte Electron-IPC-Prüfung mit temporären Daten: Laden/Speichern, Validierung, Erhalt der Originaldaten und Ablehnung eines fremden Fensters bestanden.
- Electron-Smoke-Test bestanden; zusätzliche Sicherheitsregressionen des Audits bestanden.
- Je 60 Layoutaufnahmen von korrigiertem Web-Build und kopierten iOS-Assets bei 320×568, 393×852 und 852×393: keine erkannten Überlappungen; alle geprüften geöffneten Aktionsmenüs innerhalb der nutzbaren Fläche und außerhalb der Navigation. Absichtlich horizontal scrollbar gehaltene Tabellen erzeugen einzelne geometrische Safe-Area-Kandidaten.
- `git diff --check` bestanden.

## Verbleibende Grenzen

Ein vollständiger iOS-Build und eine Prüfung auf einem iPhone beziehungsweise in WKWebView wurden nicht durchgeführt: Xcode ist hier nicht installiert. Die Renderprüfung verwendet Chromium und angenäherte Safe-Area-Werte; native Auswahlfenster, VoiceOver und die tatsächliche Bildschirmtastatur bleiben auf einem Gerät zu prüfen.

Der bereits im bestehenden Desktop-Release enthaltene API-Schlüssel ist durch Codeänderungen nicht zurückzuholen. Er muss beim Anbieter widerrufen und gegebenenfalls ersetzt werden; alte verteilte Installationsdateien müssen durch einen neu gebauten Release ersetzt werden. Vorhandene Release-Dateien wurden nicht verändert.
