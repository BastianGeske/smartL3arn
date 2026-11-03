# Aufgabentypen und Antwortformate

Im Karteneditor legt **Aufgabentyp** die Darstellung und das Antwortfeld fest.
Smart Study verwendet die interaktiven Felder, wenn **Antwort eingeben** aktiv ist.
Der Standardmodus und Smart Study ohne Antworteingabe zeigen die Aufgaben und
anschließend die Musterlösung. Die Lernbewertung bleibt immer manuell.

| `task.kind` | Eingabe und Lösungskonfiguration |
| --- | --- |
| `short_text` | Einzeilige Antwort; `back` ist die Musterantwort. |
| `long_text` | Mehrzeilige Erklärung; `back` ist die Musterantwort. |
| `calculation` | `answer.kind`: `number`, `fraction`, `quantity` oder `formula`. |
| `single_choice` | `options: [{id, text}]`, genau eine ID in `correctIds`. |
| `multiple_choice` | `options: [{id, text}]`, alle richtigen IDs in `correctIds`. |
| `true_false` | `correct: true` oder `false`. |
| `cloze` | Platzhalter `{{ID}}` in `front`; `gaps: [{id, kind, answer}]`. |
| `matching` | `pairs: [{id, left, right}]`; eine ID bezeichnet das richtige Paar. |
| `ordering` | `items: [{id, text}]`; `correctOrder` enthält jede ID genau einmal. |

## Mathematik

- `number`: `value` als Zeichenkette, optional `tolerance` als nichtnegative absolute Toleranz.
- `fraction`: ganzzahlige `numerator` und `denominator` als Zeichenketten; der Nenner muss ungleich null sein. Lernende können auch eine Dezimalzahl eingeben.
- `quantity`: `pairs: [{value, unit}]` enthält alle erlaubten Wert-Einheit-Paare; optional `tolerance`. Beispielsweise sind `5 m` und `500 cm` beide richtig, wenn beide hinterlegt sind. Andere Umrechnungen werden nicht automatisch angenommen. Groß-/Kleinschreibung der Einheit bleibt relevant.
- `formula`: `value` enthält LaTeX. Der visuelle Editor bietet eine Symboltastatur; der LaTeX-Modus bearbeitet denselben Inhalt und zeigt eine Vorschau.

Die Symboltastatur folgt dem Hell-/Dunkelmodus der App. Fehlermeldungen bleiben
darüber sichtbar. Reicht die Bildschirmhöhe nicht für Tastatur und Formel,
schließt sie mit einem Hinweis; die Eingabe bleibt erhalten und LaTeX ist verfügbar.

Dezimalkomma und Dezimalpunkt sind gleichwertig. Werte und Brüche werden exakt
verglichen, einschließlich Vorzeichen und großer Zahlen. Ohne Toleranz gilt ein
exakter Vergleich; `1/3` ist beispielsweise nicht gleich `0.333`. Wissenschaftliche
Notation ist möglich; Eingaben werden auf 2048 Zeichen und Exponenten bis ±1000
begrenzt. Die App führt keine eingegebenen Programme oder beliebigen Ausdrücke aus.

Text mit `\(...\)` stellt eingebettete Formeln dar; `\[...\]` stellt Formelblöcke
dar. Einzelne Dollarzeichen bleiben Text, damit Geldbeträge lesbar bleiben.
Ungültiges LaTeX wird sichtbar als Quelle dargestellt.

Rechenaufgaben können `solutionSteps: [{kind: "text" | "math", value}]` enthalten.
Lernende können ihren eigenen Rechenweg aus Text- und Formelzeilen ergänzen.
Im KI-Modus wird dieser unabhängig vom Ergebnis geprüft. Für Formeln und
Rechenwege ohne KI ist eine Selbstbewertung erforderlich. Ergebnis und Rechenweg
erhalten getrenntes Feedback; eine andere gültige Lösungsmethode ist zulässig.
KI-Eingaben sind auf 4000 UTF-16-Zeichen je Feld begrenzt. Bei Fehlern bleiben
alle Eingaben erhalten. Für Formel und Rechenweg wird zusammen eine Anfrage gesendet.

## Import, Speicherung und Export

[Beispieldeck für alle Typen](task-types.example.json) über **Import JSON** importieren.
`front` und `back` sind weiterhin erforderlich. Bei strukturierten Aufgaben sind
die Daten in `task` maßgeblich; `back` wird als lesbare Musterlösung daraus erzeugt.
`explanation` ergänzt die Musterlösung. Bei Textaufgaben steht die Musterantwort
weiterhin direkt in `back`.

Jede Lücke benötigt eine eindeutige ID und mindestens einen passenden Platzhalter
in `front`. `gaps[].kind` ist `text` oder `number`; `alternatives` kann zusätzliche
gültige Antworten enthalten. Textlücken verwenden einen normalisierten Vergleich,
Zahlenlücken einen mathematischen Vergleich.

IDs müssen eindeutig sein. Eine Aufgabe darf höchstens 50 Elemente enthalten.
Sortiertexte sowie linke und rechte Zuordnungsbegriffe müssen jeweils eindeutig
sein; dafür werden äußere Leerzeichen entfernt und Unicode-Zeichen mit NFKC
normalisiert. Doppelte Beschriftungen werden auch beim Import abgelehnt.
Unbekannte Aufgabentypen und ungültige Konfigurationen werden beim Import abgelehnt.
Bestehende Karten ohne `task` bleiben Textkarten mit ihren bisherigen Lernständen.
Neue Typdaten bleiben nach Neustarts und beim JSON-Export/-Import erhalten.

JSON ist das vollständige Austauschformat. CSV und Anki-TXT exportieren eine
lesbare Frage einschließlich Optionen und eine Musterlösung; ein erneuter Import
erzeugt Textkarten. Dabei werden interaktive Typdaten nicht übernommen.

Optionen, Zuordnungen und Reihenfolgen werden pro Versuch gemischt. Während
Eingabe und Wiederholungsanfragen bleibt ihre Reihenfolge stabil. Enter prüft
einzeilige Eingaben; Strg/Cmd+Enter prüft auch mehrzeilige Eingaben. Sortieraufgaben
lassen sich mit den Aufwärts-/Abwärts-Schaltflächen vollständig per Tastatur lösen.

## Technische Prüfung

`npm test` prüft Bewertung, Import/Export, Editor und Eingabekomponenten.
Nach `npm run build:web` prüft `npm run test:tasks:ui` alle zwölf Antwortformate
im echten Electron-Fenster auf Desktop- und Mobilgröße. Der Test verwendet ein
isoliertes Profil, Beispieldaten und eine simulierte KI. Aufnahmen liegen unter
`design-evidence/task-types/`; externe Netzwerkanfragen werden im Test blockiert.

`npm run test:design` prüft zusätzlich alle Hauptansichten auf sieben Größen bis
400 % Zoom, einschließlich Editor, Tastatur und Fehlermeldung gleichzeitig.
Ergebnisse und geprüfte Screenshots stehen im [Design Review](design-review-task-types-2026-10-14.md).
