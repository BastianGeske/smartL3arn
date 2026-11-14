# Promptvergleich für Aufgabenqualität

Am 13. November 2026 wurden sechs feste künstliche Quelltexte mit jeweils drei
Durchläufen je Promptfassung geprüft. Modell: `anthropic/claude-opus-5.5`,
Temperatur `0.2`, maximal `3500` Ausgabetokens pro Anfrage. Alle 54 Antworten
wurden unverändert gespeichert, auf valides Deck-JSON geprüft und gegen die
jeweiligen Quelltexte durchgesehen. Es wurden keine persönlichen Decks gesendet.

## Ergebnis

| Fall | Vorherige Vorlage: Karten pro Durchlauf | Erste Überarbeitung | Endgültige Vorlage | Inhaltliche Prüfung der endgültigen Antworten |
| --- | --- | --- | --- | --- |
| IDE-Funktionen | 8 / 8 / 8 | 6 / 6 / 7 | 6 / 6 / 6 | Alle sechs Funktionen einzeln abgedeckt, keine Sammelzuordnung oder zusätzliche Abfrage desselben Lernziels. |
| Gesamthierarchie | 4 / 4 / 4 | 1 / 1 / 2 | 1 / 1 / 1 | Eine Sortieraufgabe mit eindeutiger Richtung und korrekter vollständiger Reihenfolge. |
| Paralleler Ablauf | 4 / 4 / 4 | 3 / 4 / 4 | 3 / 3 / 3 | Keine erzwungene Gesamtordnung. Gemeinsame Voraussetzung, unabhängige mittlere Schritte und gemeinsame Abschlussbedingung korrekt erfasst. |
| Begriffe mit Synonymen | 4 / 4 / 4 | 4 / 4 / 4 | 2 / 2 / 2 | Zwei Begriffe einschließlich ihrer Synonyme, keine zusätzliche Synonymkarte. Die endgültigen Antworten wählen Freitext; eine generierte Textlücke wird in diesem Vergleich daher nicht geprüft. |
| Rechnen und Rundung | 3 / 3 / 3 | 3 / 3 / 3 | 2 / 2 / 2 | Strecke 7,5 m sowie 10/3 mit Ergebnis 3,33 und Toleranz 0,005. Richtige Formate, nachvollziehbare Rechenwege und keine zusätzliche Formelabfrage außerhalb des geforderten Ziels. |
| Einziger Signalzustand | 5 / 6 / 5 | 1 / 1 / 2 | 1 / 1 / 1 | Eine belegte Signal-Bedeutungs-Beziehung; keine erfundenen weiteren Zustände, keine Umkehrungsdubletten. |

Alle 18 endgültigen Decks sind importierbar; sie enthalten zusammen 45 Karten.
Die vorherige Vorlage erzeugte in denselben 18 Fällen 85 Karten. Weniger Karten
sind für sich genommen kein Qualitätsnachweis: Entscheidend war die vollständige
Abdeckung der vorgegebenen Lernziele ohne redundante oder unbelegte Zusatzfragen.
Die technischen Prüfungen bestanden auch bei den älteren Fassungen; die gefundenen
Probleme waren überwiegend inhaltliche Aufteilung und Wiederholung.

Die erste Überarbeitung erzeugte teilweise noch Definition plus separate
Synonymfrage, Gesamthierarchie plus Einzelpositionsfrage oder beide Richtungen
einer einzigen Signalbeziehung. Die endgültige Vorlage verlangt deshalb zuerst
den kleinsten Satz unterschiedlicher Lernziele und prüft diese Fälle ausdrücklich.
Außerdem erklärt sie: Nicht im Quelltext beschriebene Zustände sind unbekannt,
nicht automatisch falsch. Diese Regel verhindert vermeintlich eindeutige
Richtig/Falsch-Urteile über unbelegte Inhalte.

Die Durchsicht ist eine quellengebundene Produktprüfung, keine verblindete Studie
oder Garantie für andere Inhalte und Modelle. Speziell die Korrektheit von
Erklärungen und die Größe eines Lernziels bleiben Gegenstand menschlicher Prüfung.
Für technische Lückentext-Alternativen bestehen zusätzlich die vorhandenen Domain-,
Import- und Eingabetests; im endgültigen generierten Prüfsatz wurden sie nicht
mit einem erzwungenen Typenanteil künstlich hergestellt.

## Reproduzierbarkeit

- [Prüffälle und Kriterien](cases.json)
- Eingefrorene [vorherige Vorlage](prompts/baseline.md),
  [erste Überarbeitung](prompts/initial-revised.md) und
  [endgültige Vorlage](prompts/final.md).
- `runs/`: 18 Baseline-, 18 erste überarbeitete und 18 endgültige Antworten.
  Jeder Datensatz enthält angefordertes/zurückgegebenes Modell, Einstellungen,
  Datum, Laufzeit, Tokenmetadaten, Abbruchgrund und vollständigen Antworttext.
  Dateinamen `final-…` bezeichnen die endgültige Vorlage.
- [Manifest mit Dateiprüfsummen](manifest.json)
- `scripts/evaluate-card-prompts.mjs`: wiederaufnehmbarer Runner. Ohne `--run`
  werden keine Anfragen gesendet. Er liest ausschließlich die künstlichen
  Quelltexte und zuvor eingefrorene Promptdateien.

Für einen neuen Vergleich einen frischen Ergebnisordner mit `baseline.md` und
`revised.md` anlegen und den Modellzugang über Umgebungsvariablen konfigurieren:

```sh
node --env-file=.env scripts/evaluate-card-prompts.mjs --run --output=design-evidence/prompt-quality-neuer-vergleich
```

Mit `--variant=revised` wird nur die neue Fassung geprüft. Die Modellwahl stammt
aus `OPENROUTER_MODEL`; Kosten entstehen gemäß dem gewählten Anbieter. Keine
Zugangsdaten in Ergebnisordner, Dokumentation oder Versionsverwaltung übernehmen.
