# Plattformprüfung vom 6. Oktober 2026

Geprüft wurde der aktuelle Arbeitsstand einschließlich der noch nicht committeten Stapelbilder und Benachrichtigungen. Die gemeinsame Vue-Oberfläche, die Speicher- und KI-Schnittstellen, die nativen Einstiegspunkte, Plugin-Registrierungen, Ressourcen und Build-Konfigurationen wurden für Android, iOS, macOS und Windows abgeglichen. Die Prüfung bescheinigt keine Fehlerfreiheit und ersetzt keine Tests auf den Zielgeräten.

## Stand nach den Fixes am 7. Oktober 2026

Die App bleibt für private Nutzung; Store-Veröffentlichung und zusätzliche KI-Anbindungen für Android/Windows sind nicht vorgesehen.

- Die iOS-Datenschutzdatei ist als Target-Ressource eingebunden. Neue Installationen wählen KI nur mit eingerichtetem Schlüssel; gespeicherte Entscheidungen und eine Auswahl während des Statusabrufs bleiben erhalten. Zehn reguläre Komponentenfälle decken Erststart, Fehler und Wiederöffnung ab.
- Android verwendet einen echten Gerätetest für Paket-ID, WebView, Vue-Start und die drei nativen Plugins. Der Rechentest und die falsche Paket-ID sind entfernt. Monochrome Launcher-Icons, ein gemeinsamer XML-Splash und die Manifest-Reihenfolge sind korrigiert.
- `package.json` liefert Version `1.0.3` und `nativeBuildNumber: 2` an Android und beide iOS-Konfigurationen. `version:sync` ist idempotent; `release:prepare` erhöht Patch-Version und Build-Nummer einmal. Die Versionsprüfungen bestätigen auch Wiederherstellung nach einem unterbrochenen Schreibvorgang und den einmaligen `build:all`-Hook.
- Das alte Release einschließlich DMG liegt unter `.artifact-quarantine/legacy-release-1.0.3`; Quarantäneverzeichnis und Versionsverzeichnis haben Modus `0700` und sind Git-ignoriert. **Der Kontoinhaber muss den alten Schlüssel weiterhin bei OpenRouter widerrufen.** Quarantäne bestätigt keinen Widerruf und ersetzt keine Aktualisierung zuvor kopierter Pakete.
- README und Build-Anleitung beschreiben jetzt den tatsächlichen Funktionsumfang und die gemeinsame Versionierung.
- Neue private Pakete wurden unter `out/platform-fixes-2026-10-06/` erstellt: macOS arm64 App und DMG, Windows x64 NSIS-Installer und portable EXE. Die Paketprüfung bestätigt jeweils alle Laufzeitmodule, alle 13 Stapelbilder und keine eingebetteten Schlüssel oder `.env`-Dateien. Sie sind Prüfbuilds der aktuellen Version; die Release-Vorbereitung wurde am echten Projekt nicht ausgeführt.
- 66 Node/Electron-Tests und 147 Frontend-Tests bestehen, ebenso Typecheck, Web-Build, Electron-Smoke-Test und 25 Swift-Journalprüfungen. Android-Debug-App und neues Gerätetest-Paket kompilieren. Der neue Android-Gerätetest besteht im API-36.1-Emulator (Android 16): ein Test, keine Fehler, keine übersprungenen Fälle. Lint meldet 0 Fehler und 5 Warnungen; die ursprünglichen Icon-, Splash- und Manifest-Befunde sind behoben.

Die verbleibenden Android-Lint-Warnungen betreffen verfügbare Gradle-/Bibliotheksupdates und drei generierte beziehungsweise native Ressourcen (`config.xml`, `package_name`, `custom_url_scheme`). Daraus folgt kein zusätzlicher Funktionsdefekt; Abhängigkeiten wurden für diese Fixes nicht pauschal aktualisiert.

Der abschließende Android-Build verwendete diese Tasks mit JDK 21 und dem lokalen Android-SDK:

```sh
./gradlew :app:clean :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:connectedDebugAndroidTest --no-daemon --console=plain
```

Nach Entfernung des lokalen Rechen-Vorlagentests meldet `testDebugUnitTest` erwartungsgemäß `NO-SOURCE`; die native Startprüfung läuft in `connectedDebugAndroidTest`.

Die [Android-Startseite im Emulator](../design-audit/platform-completeness-2026-10-06/android-home.png) wurde zusätzlich im leeren Bibliothekszustand bei 1080 × 2400 Pixeln kontrolliert. In diesem Zustand überlappen die Bedienelemente nicht; andere Dialoge und Gerätegrößen sind damit nicht vollständig geprüft.

Die folgenden Befunde und Prüfresultate dokumentieren den ursprünglichen Auditstand; sie sind keine Liste noch offener Code-Fixes.

## Befunde der ursprünglichen Prüfung

### 1. iOS: Datenschutzdatei für Filesystem fehlt

Im App-Projekt existiert keine `PrivacyInfo.xcprivacy`; auch die Ressourcenphase in `ios/App/App.xcodeproj/project.pbxproj:145` bindet keine solche Datei ein. `@capacitor/filesystem` ist als Swift-Package-Abhängigkeit eingebunden und wird beim Export verwendet.

Für dieses Plugin verlangt die [offizielle Capacitor-Dokumentation](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements) die Deklaration von `NSPrivacyAccessedAPICategoryFileTimestamp`, mit `C617.1` als empfohlenem Grund. Das ist eine offene Voraussetzung für die App-Store-Einreichung. Die tatsächlich verwendeten APIs und Gründe müssen in einer App-Datenschutzdatei deklariert und diese im Xcode-Target als Ressource eingebunden werden.

### 2. iOS: Erster Smart-Study-Start wählt KI auch ohne Schlüssel

`src/views/SmartSetupView.vue:85` setzt beim ersten Öffnen auf iOS den Modus auf `openrouter`, ohne `aiStatus.configured` zu prüfen. In einer neuen Release-Installation ohne Keychain-Schlüssel ist KI nicht eingerichtet. `start()` bricht dann in derselben Datei bei Zeile 149 ab und fokussiert das Schlüsselfeld. Lokales Lernen funktioniert erst nach manueller Auswahl von „Lokal“.

Eine isolierte Komponentenprüfung mit simuliertem iOS-Status reproduzierte diesen Ablauf: zunächst lokaler Modus, anschließend automatisch KI, und keine Navigation zur Sitzung nach dem Startklick. Der Audit-Reproduktionsfall wurde durch die regulären Regressionstests in `src/views/SmartSetupView.test.ts` ersetzt. Die korrigierte automatische KI-Auswahl erfolgt nur bei eingerichtetem Schlüssel und respektiert gespeicherte sowie aktuelle bewusste Entscheidungen.

### 3. Android: Gerätetest enthält die falsche Paket-ID

`android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24` erwartet `com.getcapacitor.app`. Die App-ID ist laut `android/app/build.gradle:7` jedoch `com.smartl3arn.app`. Dieser Test würde auf dem Zielgerät an seiner Assertion scheitern. Der lokale Java-Test prüft ausschließlich `2 + 2`; er liefert keine Aussage über App-Funktionen. Die native Android-Testabdeckung ist damit unvollständig.

### 4. Mobile Versionierung ist nicht an den Release-Ablauf angebunden

Desktop verwendet derzeit `package.json`-Version `1.0.3`; die Desktop-Build-Skripte erhöhen diese automatisch. Android hat weiterhin `versionName "1.0"` und `versionCode 1` (`android/app/build.gradle:10`). iOS hat `MARKETING_VERSION = 1.0` und `CURRENT_PROJECT_VERSION = 1` in Debug und Release (`ios/App/App.xcodeproj/project.pbxproj:323` und `:346`).

Unabhängige Plattformversionen sind möglich, aber der vorhandene Ablauf aktualisiert die mobilen Build-Nummern nicht. Für wiederholte Store-Veröffentlichungen fehlt damit ein dokumentierter oder automatisierter Schritt zur Vergabe neuer Build-Nummern.

### 5. Ein alter macOS-Release enthält weiterhin einen API-Schlüssel

`release/1.0.3/mac-arm64/smartL3arn.app/Contents/Resources/openrouter-build-config.json` enthält ein nicht leeres Schlüssel-Feld. Der Schlüssel selbst wurde bei der Prüfung weder ausgegeben noch in diesen Bericht übernommen. Die aktuellen Build-Hooks und Credential-Resolver sind bereits korrigiert; die neu erzeugten macOS- und Windows-Pakete enthalten nur die Modellkonfiguration, keine `.env`-Dateien und keinen eingebetteten Schlüssel.

Bereits verteilte alte Pakete behalten ihren auslesbaren Schlüssel. Den betroffenen Schlüssel beim Anbieter widerrufen und alte verteilte Pakete durch einen aktuellen Build ersetzen. Das alte Release wurde während dieser Prüfung nicht verändert.

### 6. README widerspricht dem aktuellen KI-Verhalten

`README.md:282` behauptet noch, Desktop-Pakete würden den Projektschlüssel einbetten. Der aktuelle Code und die Paketprüfung belegen das Gegenteil. `README.md:250` beschreibt außerdem einen lokalen KI-Fallback, obwohl API-Fehler die Antwort für einen erneuten Versuch erhalten und nicht lokal bewerten. Diese Stellen müssen dem aktuellen Verhalten angepasst werden.

### 7. Android: kleinere Ressourcenlücken

Der Lint-Bericht enthält 0 Fehler und 16 Warnungen. Beide adaptiven Launcher-Icons besitzen kein `monochrome`-Element; die Darstellung als thematisiertes Icon ist damit unvollständig. Außerdem meldet Lint unterschiedliche dichteunabhängige Größen der Landscape-Splash-Bilder, doppelte beziehungsweise ungenutzte Ressourcen und die Reihenfolge des Internet-Berechtigungseintrags im Manifest. Das sind keine Compilerblocker. Hinweise auf neuere Bibliotheksversionen sind für sich kein Beleg für fehlende Funktionen oder Sicherheitslücken.

## Plattformumfang

| Funktion | Android | iOS | macOS | Windows |
| --- | --- | --- | --- | --- |
| Gemeinsame Oberfläche, Stapel, Karten, lokale Lernbewertung | vorhanden | vorhanden | vorhanden | vorhanden |
| 13 Stapelbilder im aktuellen Webpaket | nach Synchronisierung vollständig | vollständig | vollständig im Paket | vollständig im Paket |
| Persistenz der Bibliothek | WebView-localStorage | WebView-localStorage | lokale JSON-Datei über IPC | lokale JSON-Datei über IPC |
| Export | Filesystem und native Share-Funktion | Filesystem und native Share-Funktion | Chromium-Download | Chromium-Download |
| KI-Bewertung | keine native KI-Brücke | NativeAi mit Keychain | Electron mit sicherem Schlüsselspeicher | Status meldet nicht verfügbar |
| KI-Verbrauch und Verbindungslogs | keine native KI-Brücke | natives Journal | Electron-Journal | IPC vorhanden, KI-Einrichtung in der Oberfläche deaktiviert |

Die Einschränkungen von Android und Windows sind im Code ausdrücklich angelegt: `src/services/ai.ts:40` wählt die native Brücke ausschließlich für iOS; `main.js:127` meldet KI nur unter macOS als verfügbar. Es besteht daher keine vollständige KI-Funktionsgleichheit zwischen den vier Plattformen. Das ist getrennt von fehlenden Dateien oder einem Compilerfehler zu betrachten.

## Android-Vorbereitung während der Prüfung

Zu Beginn enthielt Android einen älteren Webstand mit nur drei Stapelbildern. Außerdem fehlten `app/src/main/assets/capacitor.plugins.json` und `capacitor-cordova-android-plugins/cordova.variables.gradle`. Ein direkter Gradle-Build scheiterte am fehlenden Gradle-Skript; ohne die Plugin-Datei kann die Standard-`MainActivity` die drei zusätzlichen Plugins nicht registrieren.

Die vorgesehene Vorbereitung mit `node_modules/.bin/cap sync android` wurde durchgeführt. Sie kopierte den aktuellen Webstand, alle 13 Stapelbilder und registrierte Filesystem, Share und StatusBar. Alle Dateien aus `web-dist` stimmen danach byteweise mit Androids `public`-Verzeichnis überein. Die Synchronisierung änderte keine getrackten nativen Quelldateien. Auch iOS stimmt byteweise mit dem aktuellen Web-Build überein.

Für Android wurde das mit Android Studio gelieferte JDK 21 verwendet. Das systemweite JDK ist Version 26. Benötigte Gradle-Abhängigkeiten und die bereits lizenzierte SDK-Plattform 36 wurden für den Build geladen.

## Ausgeführte Prüfungen im ursprünglichen Audit

| Prüfung | Ergebnis |
| --- | --- |
| `npm run test` | 56 Electron-Tests und 137 Frontend-Tests bestanden |
| `npm run build:web` | Typecheck und Produktionsbuild bestanden |
| Electron-Smoke-Test | Bibliothek, Standardlernen, Smart Study, lokale Bewertung, API-Verbrauch und Logexport bestanden; keine Renderer-Fehler |
| Echter Electron-IPC-Test | Laden/Speichern, Datenvalidierung, Erhalt vorhandener Daten bei Fehlern und Abweisung einer fremden Fensterinstanz bestanden |
| Native Swift-Journal-/Anfrageprüfungen | 25 Prüfungen bestanden |
| Isolierte iOS-Erststart-Reproduktion | bestehendes Fehlverhalten bestätigt: KI ohne Schlüssel aktiviert, Sitzungsstart blockiert |
| iOS-Plist und Xcode-Projektdatei | `plutil -lint` bestanden; benötigte lokale Referenzdateien vorhanden |
| macOS arm64 | unsigniertes App-Verzeichnis erfolgreich gebaut; erwartete Laufzeitdateien und alle 13 Bilder im ASAR vorhanden |
| Windows x64 | NSIS-Installer und portable EXE erfolgreich gebaut, einschließlich regulärer Icon- und Versionsverarbeitung; Signaturen für den Prüfbuild deaktiviert |
| Desktop-Paketinhalt | keine fehlenden geprüften Laufzeitmodule, keine `.env`-Dateien, kein Schlüssel in der Build-Konfiguration |
| Android nach Capacitor-Synchronisierung | Debug-APK und Gerätetest-APK gebaut; lokaler Vorlagentest bestanden; Lint: 0 Fehler, 16 Warnungen |
| Android-APK-Inhalt | alle Webdateien byteweise identisch zum aktuellen Build, alle 13 Stapelbilder und alle drei Plugin-Registrierungen vorhanden |
| `git diff --check` | bestanden |

Die ursprünglichen Prüfpakete wurden unter `/tmp/smartl3arn-platform-audit-mac` und `/tmp/smartl3arn-platform-audit-win` erzeugt. Die Desktop-Version wurde dabei nicht erhöht. Das alte Release blieb bei der ursprünglichen Prüfung erhalten und wurde während der anschließenden Fixes quarantänisiert.

Die Android-Prüfung verwendete nach der Synchronisierung diese Gradle-Tasks mit dem Android-Studio-JDK 21 und dem lokalen Android-SDK:

```sh
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleDebugAndroidTest --no-daemon --console=plain
```

Die korrigierten iOS-Erststartfälle sind separat ausführbar:

```sh
node_modules/.bin/vitest run src/views/SmartSetupView.test.ts
```

## Grenzen der Prüfung

Auf diesem Rechner ist nur Apples Command Line Tools installiert, kein vollständiges Xcode und kein iOS-SDK. Daher wurden weder die gesamte UIKit/Capacitor-App noch ein iOS-Archiv kompiliert; die 25 Swift-Prüfungen decken das eigenständige Journal und die Anfragevalidierung ab. Die iOS-Komponentenreproduktion verwendet eine simulierte Brücke.

Windows wurde auf macOS paketiert, nicht auf einem Windows-System ausgeführt. macOS Intel/x64 und ein signiertes beziehungsweise notarisiertes DMG wurden nicht gebaut; das neue private arm64-DMG wurde mit deaktivierter Signatur erstellt. Signatur, reale iOS-Tastatur- und Safe-Area-Interaktionen, native Share-Dialoge, VoiceOver/TalkBack und Wiederherstellung nach Prozessende sind nicht durch diesen Bericht als bestanden bestätigt. Ein Android-Release-/Store-Build wurde nicht erzeugt. Der erfolgreiche Android-Gerätetest belegt den App-Start und die Plugin-Registrierung im API-36.1-Emulator; weitere Android-Versionen und physische Geräte wurden nicht geprüft.
