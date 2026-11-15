# Vorhandene Stapel per Zusatz-JSON überarbeiten und ergänzen

Öffne den gewünschten Stapel und wähle **Stapelaktionen → Per JSON überarbeiten / ergänzen**.
Wähle die Zusatzdatei aus, prüfe die Vorschau mit **Vorher / Nachher** und klicke auf
**Änderungen übernehmen**. Bis dahin wird nichts gespeichert; **Abbrechen** verwirft die Vorschau.

Für die Erstellung mit einem KI-Werkzeug gibt es eine vollständige, kopierbare
[Promptvorlage für Aktualisierungen](flashcard-update-prompt.md). Übergib ihr den
JSON-Export dieses Stapels, den Änderungsauftrag und bei Bedarf neuen Lernstoff.

Die Zusatzdatei ist entweder ein Karten-Array oder ein Objekt mit einem `cards`-Array.
Du kannst auch einen bearbeiteten einzelnen JSON-Stapelexport verwenden. Vollständige
Backups mit `decks` werden weiterhin über die Bibliothek importiert.

```json
{
  "cards": [
    {
      "id": "short",
      "back": "Berlin ist die Hauptstadt Deutschlands und zugleich ein eigenes Bundesland."
    },
    {
      "front": "Wie heißt die Hauptstadt Frankreichs?",
      "back": "Paris"
    }
  ]
}
```

Die erste Zeile überarbeitet die Karte mit ID `short`, die zweite ergänzt eine neue
Karte, sofern diese Frage noch nicht existiert. Die [Beispieldatei](json-supplements.example.json)
passt zum [Aufgabentypen-Beispielstapel](task-types.example.json): Importiere diesen zuerst
über die Bibliothek und anschließend die Zusatzdatei im geöffneten Stapel.

Für eigene Stapel findest du die Karten-IDs unter **Stapelaktionen → JSON exportieren**.
Eine bestehende Frage lässt sich zuverlässig ändern, wenn du ihre bisherige ID mitgibst.

| Feld / Zuordnung | Verhalten |
|---|---|
| `id` vorhanden | Die Karte mit genau dieser ID wird überarbeitet. Eine unbekannte ID legt eine neue Karte an und benötigt `front` und `back`. |
| Keine `id` | Zuordnung über den exakt gleichen `front`-Text, einschließlich Großschreibung und Leerzeichen. Ohne Treffer wird eine neue Karte angelegt. |
| Mehrere Karten mit gleichem Fragetext | Ohne ID wird die gesamte Datei abgelehnt. Verwende die ID der gewünschten Karte. |
| Mehrere Einträge für dieselbe Karte | Die gesamte Datei wird abgelehnt. Fasse die Änderungen in einem Eintrag zusammen. |
| `front` / `back` | Ersetzt das jeweilige Feld. Bei bestehenden Karten dürfen unveränderte Felder fehlen. Neue Karten benötigen beide Texte. |
| `task` fehlt | Die bisherige Aufgabenkonfiguration bleibt erhalten. |
| `task` als Objekt | Ersetzt die vollständige Aufgabenkonfiguration; kein Zusammenführen einzelner Unterfelder. |
| `task: null` | Entfernt den Aufgabentyp und macht die Karte zur Textkarte. Gib dafür die gewünschte Textantwort als `back` mit. |

Zusatzinhalte werden nicht automatisch an bestehende Antworten angehängt. Wenn du eine
Antwort erweitern möchtest, enthält `back` die vollständige gewünschte neue Antwort.
Bei strukturierten Aufgaben bestimmt `task` die Lösung; der lesbare Antworttext wird
daraus neu erzeugt. Ergänzende Erklärungen gehören in `task.explanation`, Rechenwege
in `task.solutionSteps`. Das vollständige Format steht unter [Aufgabentypen](task-types.md).

Lernstand, Fälligkeit, Statistik, eigene Erklärungen und Sitzungsverlauf vorhandener Karten
bleiben erhalten. Neue Karten starten ohne Lernverlauf, auch wenn die Zusatzdatei fremde
Lerndaten enthält. Stapelname und Bild bleiben erhalten; Karten werden nicht gelöscht.
Unveränderte Einträge werden in der Vorschau gezählt und übersprungen. Wiederholtes
Importieren derselben Datei erzeugt keine weiteren Karten, solange die zugehörigen IDs
oder Fragetexte gleich bleiben und eindeutig sind.

Die gesamte Datei wird vorab geprüft und gemeinsam gespeichert. Bei ungültigen Daten
oder einem Speicherfehler wird nichts übernommen. Wenn sich der Karteninhalt seit der
Vorschau geändert hat, importiere die Datei erneut. Während einer laufenden Lernsitzung
ist das Überarbeiten gesperrt. Die bestehenden Grenzen gelten weiter: 10 MiB je Datei,
20.000 Zeichen pro Frage/Antwort und insgesamt 100.000 Karten in der Bibliothek.
