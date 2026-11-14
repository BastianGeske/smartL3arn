# Aufgabenqualität: Umsetzung und Erstellungsprompt

Stand: 13. November 2026. Grundlage ist das
[Review der Aufgabentypen](task-types-review-2026-11-13.md).

## Umsetzungsstand

Alle sechs Phasen sind umgesetzt und geprüft. Der [Promptvergleich](prompt-quality/README.md)
enthält 54 echte Modellantworten einschließlich einer gezielten Nachschärfung.
Die endgültigen 18 Decks sind importierbar und wurden am jeweiligen Quelltext geprüft.
Die App zeigt gemeinsame Qualitätsregeln im Editor und nach JSON-Import an und
kann gespeicherte Zuordnungen mit Vorschau in Einzelkarten aufteilen.
Die Verifikation steht im [Umsetzungsbericht](task-quality-validation.md).

## Entscheidung

Alle neun Typen bleiben verfügbar. Der Ablauf bei der Erstellung lautet:
**Lernziel → eigenständig bewertbare Karte → passender Typ → eindeutige Lösung → Qualitätsprüfung.**
Keine vorgeschriebene Typenmischung, keine neuen JSON-Felder und keine automatische
Umwandlung bestehender Karten. Eine einzelne manuelle Lernbewertung und ein
FSRS-Lernstand bleiben je Karte bestehen. Damit muss die Kartengröße bereits bei
der Erstellung zur gemeinsamen Bewertung passen.

Ein zusammengehöriger Rechenweg oder eine fachlich eindeutige Prozessfolge darf
mehrere Schritte haben. „Ein Lernziel“ bedeutet nicht zwangsläufig „ein einzelnes
Wort“. Entscheidend ist, ob die Teile sinnvoll gemeinsam beherrscht und bewertet
werden können. Eine beliebige Sammlung von Funktionen aus demselben Kapitel
reicht als Begründung für eine Sammelkarte nicht aus.

## Konkreter Lieferplan

Die folgenden Phasen wurden abgeschlossen; die Beschreibungen halten Lieferumfang
und Abnahmekriterien der Umsetzung fest. Die Phasen werden in dieser Reihenfolge
umgesetzt. Jede Phase liefert ein separat prüfbares Ergebnis.

### Phase 1 – Prompt mit einem festen Prüfsatz erproben

**Lieferumfang:** Sechs kurze Quelltexte mit dokumentierten Lernzielen:
unabhängige IDE-Funktionen, eine eindeutige Hierarchie, ein Ablauf mit parallel
möglichen Schritten, Fachbegriffe mit Synonymen, eine Rechnung mit Rundung und
wenig Stoff bei hoher gewünschter Kartenanzahl. Vorherige und neue Promptfassung
werden eingefroren und mit demselben Modell und denselben Einstellungen verglichen;
wegen variabler Ausgaben pro Fall drei Durchläufe je Fassung.

Ergebnisse samt Modell und Einstellungen aufbewahren und mit einer gemeinsamen
Prüfliste beurteilen: Quellenbezug, Lernzielgröße, Typwahl, Eindeutigkeit,
Erklärungen, Abdeckung und Importierbarkeit. Die fachliche Bewertung erfolgt
anhand des Quelltexts; ein Modellurteil allein reicht nicht.

**Abnahme:** Jedes erzeugte Deck ist importierbar. Keine erfundenen Fakten,
mehrdeutigen Lösungen oder unabhängigen Sammelziele bleiben in den akzeptierten
Beispielen. Wiederkehrende Fehler führen zu einer Promptkorrektur und einem
gezielten erneuten Vergleich der betroffenen Fälle. Keine Typenquote als Metrik.
Das Ergebnis dokumentiert praktische Qualität, keine Garantie für jeden Lernstoff.

### Phase 2 – Gemeinsame lokale Qualitätsprüfung implementieren

**Lieferumfang:** `src/domain/taskQuality.ts` mit den sechs Regeln aus der Tabelle
unten. Die Prüfung gibt strukturierte Hinweise mit Regelcode, Karten-ID und
betroffenem Feld zurück; Darstellung und Übersetzung bleiben in der Oberfläche.
Unvollständige, technisch ungültige Entwürfe werden zuerst von der vorhandenen
Validierung behandelt. Die Hinweise beurteilen ausschließlich erkennbare Merkmale.

**Abnahme:** Grenzfälle an den Richtwerten, mehrere gleichzeitige Hinweise,
fehlende Erklärungen und die beiden Mehrfachauswahlfälle sind geprüft. Die Funktion
verändert weder Karten noch Lernstände. Gültige Altdecks bleiben importierbar.

### Phase 3 – Typwahl und Hinweise im Karteneditor integrieren

**Lieferumfang:** Eine kurze Lernzielhilfe je Typ unter dem Typwähler; Hinweise
nahe am betreffenden Feld in `CardEditorModal.vue` / `TaskConfigEditor.vue`.
Bei Mehrfachauswahl mit einer richtigen Option kann der Nutzer bewusst zu
Einfachauswahl wechseln; Optionen und richtige ID bleiben erhalten.
Keine automatische Typänderung beim Schreiben.

**Abnahme:** Hinweise aktualisieren sich beim Bearbeiten und verschwinden nach
Behebung. Speichern bleibt bei redaktionellen Hinweisen möglich; echte
Validierungsfehler verhindern weiterhin ungültige Karten. Tastaturbedienung,
Mobilansicht und Hell-/Dunkelmodus werden an den neuen Hinweisen geprüft.

### Phase 4 – Import um eine bearbeitbare Qualitätsübersicht ergänzen

**Lieferumfang:** Nach technischer Importprüfung dieselbe Hinweisfunktion auf die
normalisierten Karten anwenden. Die Import-Rückmeldung nennt betroffene Karten,
fasst Hinweise zusammen und führt zur jeweiligen Bearbeitung. Die Hinweise
erscheinen gesammelt, nicht als Meldung pro Karte; kein zusätzlicher Pflichtdialog.
Die Verknüpfung verwendet die endgültigen importierten Karten-/Stapel-IDs.

**Abnahme:** Gültige Decks mit Hinweisen werden vollständig importiert. Defektes
JSON zeigt weiterhin den technischen Fehler. Ein Link öffnet genau die betroffene
Karte; große Decks erzeugen keine Flut einzelner Meldungen. Der Import verändert
bestehende Karten und Lernstände nicht als Nebenwirkung der Qualitätsprüfung.

### Phase 5 – Zuordnungen kontrolliert in Einzelkarten aufteilen

**Lieferumfang:** Aktion im Editor mit bearbeitbaren Fragen-/Antwortentwürfen je
Paar, übernommenem nötigem Kontext und Vorschau des Originals. Standardmäßig
bleibt das Original erhalten; ein Ersetzen ist eine ausdrückliche Entscheidung.
Vor dem Speichern alle neuen Karten gemeinsam validieren. Die Bibliothek speichert
die bestätigte Änderung als zusammengehörigen Vorgang, sodass ein Speicherfehler
nicht zu einem halbfertigen Satz Einzelkarten oder verlorenem Original führt.

**Abnahme:** Abbrechen erzeugt keine Karten. Übernehmen erzeugt pro ausgewähltem
Paar eine neue Karte mit eigener ID und neuem Lernstand. Kontext und Erklärungen
sind vor dem Speichern bearbeitbar. Originalerhalt, bewusstes Ersetzen und Fehler
beim Speichern sind geprüft. Keine Änderung aktiver Lernsitzungen während des
Aufteilens; die Aktion bleibt außerhalb einer aktiven Sitzung.

### Phase 6 – Gesamtablauf abnehmen und dokumentieren

**Lieferumfang:** Durchlauf „Lernstoff → Prompt → JSON-Import → Hinweise bearbeiten
→ lernen“ und „bestehende Zuordnung → Einzelkarten → getrennte Wiederholung“.
Aufgabentyp-Dokumentation und Prompt verweisen auf die tatsächlich verfügbaren
Funktionen; geplante Funktionen werden erst nach Umsetzung als verfügbar beschrieben.

**Abnahme:** Produktionsbuild, passende Komponenten-/Import-/Persistenztests und
visuelle Prüfung der geänderten Ansichten bestanden. Keine neuen JSON-Pflichtfelder,
keine automatische Umschreibung alter Decks, keine übernommenen Sammel-Lernstände.

**Abgeschlossen:** Promptvergleich, gemeinsame App-Hinweise, Aufteilungsassistent
und Gesamtabnahme. Die folgenden Abschnitte erläutern die umgesetzten Regeln.

## 1. Jetzt umgesetzt: Erstellungsprompt

Die [kopierbare Vorlage](flashcard-prompt.md) enthält jetzt:

- Zwei interne Arbeitsdurchgänge: Lernziele/Kartengröße planen, danach erstellen
  und vor der Ausgabe überarbeiten. Die Ausgabe bleibt ausschließlich Deck-JSON.
- Einen Entscheidungsbaum für alle neun Typen mit konkreten Ausschlusskriterien.
- Kurzantwort, Erklärung und Rechnen als direkte Wahl für passende Abrufziele.
  Auswahlfragen prüfen gezielt Unterschiede; Formatvielfalt ist kein eigenes Ziel.
- Redaktionelle Richtwerte: Zuordnung meist 3–5 Paare, Lücken meist 1–2, Reihenfolge
  meist 3–6 Elemente. Das sind Orientierungshilfen, keine neuen Importgrenzen.
- Erklärungen für Auswahl und Wahr/Falsch; bei falschen Aussagen die richtige
  Fassung. Mehrfachauswahl enthält mehrere richtige und mindestens eine falsche Option.
- Eine Prüfung auf unabhängige Teilziele, überladene Aufgaben, Dubletten,
  fehlende Synonyme, uneindeutige Reihenfolgen und unpassende Aufgabentypen.
- Die gewünschte Kartenanzahl als Obergrenze. Bei zu viel Stoff werden Lernziele
  priorisiert, statt unabhängige Inhalte in Sammelkarten zu verstecken.
- Die tatsächlichen Bewertungsgrenzen: Freitext lokal selbst bewerten;
  strukturierte Aufgaben bleiben auch im KI-Modus lokal geprüft. Synonyme und
  zulässige Reihenfolgen lassen sich dort nicht durch die KI nachträglich retten.

### Beispiel: Die IDE-Zuordnung aus Screens

Sieben separat lernbare Bedienelemente müssen nicht auf eine Zuordnungskarte.
Bei der Aufteilung wird jede Funktion eigenständig gefragt. Dieser Ausschnitt
illustriert drei Karten; weitere Funktionen würden entsprechend eigene,
quellengestützte Karten bekommen:

```json
{
  "name": "IDE – einzelne Funktionen",
  "cards": [
    {
      "front": "Was macht die Funktion Überprüfen mit einem Sketch?",
      "back": "Sie übersetzt den Sketch, ohne ihn auf das Board zu übertragen.",
      "task": { "kind": "short_text" }
    },
    {
      "front": "Welche beiden Schritte führt die Funktion Hochladen mit einem Sketch aus?",
      "back": "Sie übersetzt den Sketch und überträgt ihn auf das Board.",
      "task": { "kind": "short_text" }
    },
    {
      "front": "In welchem Bereich der IDE erscheinen Fehler und Warnungen beim Übersetzen?",
      "back": "Im Ausgabe-Fenster.",
      "task": { "kind": "short_text" }
    }
  ]
}
```

Die gemeinsame Folge „übersetzen und übertragen“ bleibt auf der zweiten Karte,
weil sie die eine Funktion beschreibt. Daraus entstehen nicht künstlich zwei
Karten. Auch eine zusätzliche Zuordnung aller drei Funktionen wäre für dieses
kleine Deck eine unnötige Wiederholung derselben Lernziele.

Die Automatisierungspyramide aus dem anderen Screen ist anders zu beurteilen:
Soll die vollständige Hierarchie abgerufen werden, passt eine Reihenfolge mit
klarer Richtung. Soll die Abgrenzung zwischen Beispielen und Ebenen geprüft
werden, kann eine kompakte Zuordnung passen. Soll nur die Ebene einer SPS
abgerufen werden, genügt eine einzelne offene Frage. Nicht alle Varianten
vorsorglich zum gleichen Lernziel erzeugen.

## 2. Implementiert: Hinweise beim Erstellen und Importieren

**Implementiert.** Gemeinsame, rein lokale Qualitätsprüfung
in `src/domain/taskQuality.ts`, getrennt von der technischen Validierung in
`shared/tasks.mjs`. Sie bekommt bereits normalisierte Karten und liefert Hinweise
mit Regelcode, Karten-ID und gegebenenfalls betroffenen Elementen zurück.
Der Karteneditor und der JSON-Import verwenden dieselben Regeln und Übersetzungen.

| Erkennbarer Fall | Hinweis und angebotener nächster Schritt |
| --- | --- |
| Zuordnung mit mehr als 5 Paaren | „Viele Paare teilen einen Lernstand. Prüfe, ob einzelne Funktionen eigene Karten brauchen.“ Karte im Editor öffnen. |
| Lückentext mit mehr als 2 Lücken | „Gehören alle Lücken zu einem gemeinsamen Lernziel?“ Lücken prüfen oder Karte aufteilen. |
| Reihenfolge mit mehr als 6 Elementen | „Langer Ablauf. Prüfe eine sinnvolle Abgrenzung und die eindeutige Reihenfolge.“ Kriterien in der Frage prüfen. |
| Auswahl-/Wahr-Falsch-Aufgabe ohne Erklärung | „Ergänze die Begründung; erkläre bei einer falschen Aussage die richtige Fassung.“ Erklärungsfeld fokussieren. |
| Mehrfachauswahl mit genau einer richtigen Option | „Passt Einfachauswahl besser?“ Typwechsel anbieten, richtige ID erhalten. |
| Mehrfachauswahl mit ausschließlich richtigen Optionen | „Alle Optionen sind richtig. Prüfe eine offene Frage oder fachlich sinnvolle Ablenker.“ Editor öffnen. |

Die Hinweise stehen im Editor nahe am betroffenen Feld; Speichern bleibt möglich.
Beim Import werden sie nach erfolgreicher technischer Prüfung zusammengefasst,
mit betroffenen Karten und einem Weg zum Bearbeiten. Ein gültiges Deck darf wegen
eines redaktionellen Richtwerts nicht abgelehnt werden. Alte Decks bleiben gültig.
Dafür muss der Import keine zusätzlichen Schemafelder oder KI-Anfragen einführen.

Der technische Prüfer kann fehlende Erklärungen und Elementzahlen erkennen.
Er kann aus „5 Paaren“ nicht ableiten, ob sie fachlich zusammengehören; ebenso wenig
kann er generell beweisen, dass eine Reihenfolge eindeutig oder ein Ablenker
plausibel ist. Diese Hinweise werden entsprechend als Prüfanlass formuliert.

Eine knappe Hilfe unter dem Typwähler erklärt jeweils Lernziel und Einschränkung,
z. B. „Zuordnung: eindeutige Beziehungen eines gemeinsamen Systems. Alle Paare
teilen sich einen Lernstand.“ Die ausführliche redaktionelle Regel steht im Prompt.

## 3. Implementiert: Unterstütztes Aufteilen bestehender Karten

**Implementiert.** Mit einer bewussten Aktion „In
Einzelkarten aufteilen“ im Editor beginnen, zunächst nur für Zuordnungen.
Jedes Paar kann als Entwurf für eine offene Frage dienen. Der Nutzer ergänzt
den Kontext und prüft die Frage, bevor neue Karten entstehen. Eine bloße Vorlage
„Was passt zu X?“ ist außerhalb der Sammelkarte oft nicht verständlich genug.

- Die Vorschau zeigt Original und neue Fragen/Antworten zusammen.
- Neue Karten bekommen neue IDs und neue Lernstände. Der bisherige Lernstand der
  Sammelkarte wird nicht auf jede Teilkarte kopiert; er misst keine Einzelbeherrschung.
- Die Originalkarte wird erst nach einer bewussten Entscheidung ersetzt/entfernt;
  kein stilles Löschen oder automatisches Umschreiben alter Decks beim Import.
- Lückentexte und Reihenfolgen nicht mechanisch aufteilen: dabei gehen Kontext
  oder das gemeinsame Lernziel leicht verloren.

Eine automatische Teilaufgabenplanung mit eigenen FSRS-Zuständen ist dafür nicht
nötig. Sie würde neue persistente Lernobjekte, Bewertungsregeln und Migrationen
benötigen. Zunächst werden echte Einzelkarten erstellt, wo getrennte Lernstände
gebraucht werden.

## Abnahme und sinnvolle Reihenfolge

1. **Prompt jetzt:** Bestehende Formatbeispiele und das Aufteilungsbeispiel müssen
   sich mit `normalizeTask`/`normalizeDeck` verarbeiten lassen. JSON-Schema und
   technische Grenzen bleiben kompatibel. Diese Strukturprüfung wurde ausgeführt.
2. **Prompt inhaltlich prüfen:** Mit denselben Quellabschnitten gegentesten:
   unabhängige IDE-Funktionen, eine echte Hierarchie, eine Reihenfolge mit
   parallel möglichen Schritten, Begriffslücken mit Synonymen und Rechnungen
   mit Rundung. Pro Ergebnis Lernzielgröße, Typwahl, Eindeutigkeit, Erklärungen,
   Abdeckung und Importierbarkeit beurteilen. Keine feste Typenquote als Erfolgskriterium.
   Der [Generierungsvergleich](prompt-quality/README.md) wurde mit sechs Fällen,
   drei Wiederholungen je Fassung und einer nachgeschärften Endfassung ausgeführt.
3. **App-Hinweise:** Erst die gemeinsame Hinweisfunktion mit Grenzfällen und
   gültigen Altdecks prüfen, dann im Editor und Import darstellen. Hinweise dürfen
   technische Importfehler nicht verdecken und keinen Lernstand verändern.
4. **Aufteilen:** Vorschau, bewusstes Übernehmen, Kontext und neue Lernstände prüfen.
   Keine automatische Migration bestehender Sammelkarten.

Der laufende Betrieb verwendet dieselben Qualitätsregeln für Editor und Import.
Die redaktionellen Richtwerte sind weiterhin keine technischen Importgrenzen.
