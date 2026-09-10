# smartL3arn Design-Audit

Datum: 3. August 2026  
Umfang: Library, Kartenverwaltung, Standard-Lernmodus, Smart Study und mobile Darstellung  
Ziel: Prüfen, ob das aktuelle Interface zeitgemäß, klar und zugänglich wirkt

## Gesamturteil

Ja – das Grunddesign ist zeitgemäß. Es wirkt ruhig, hochwertig und produktivitätsorientiert. Die klare Typografie, die zurückhaltende Farbpalette, großzügige Flächen und die fokussierten Lernansichten passen gut zu einer modernen Desktop- und Mobile-App.

Es ist aber noch nicht ganz auf Produktniveau: Zwei sichtbare Datenwidersprüche beschädigen das Vertrauen stärker als jede optische Feinheit. Außerdem priorisiert die Library „New deck“ stärker als die eigentlich zentrale Aufgabe, fällige Karten zu lernen. Insgesamt: visuell etwa 7,5/10; nach Behebung der Logik- und Priorisierungsprobleme klar darüber.

## Schritte und Befunde

### 1. Library – Desktop

Gesundheit: gut gestaltet, aber inhaltlich widersprüchlich.

![Library Desktop](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/01-library-desktop.png>)

- Stärke: Sehr klare Hierarchie, ruhige Dichte, konsistente Icons und gute Scanbarkeit.
- UX-Risiko: Oben stehen „3 cards ready for review“, die Decks zeigen gleichzeitig „Caught up“ und nur „Practice“. Das wirkt wie ein Vertrauensbruch.
- Priorisierung: „New deck“ ist die stärkste Aktion, obwohl Reviews anstehen. Für bestehende Nutzer sollte „Review 3“ die Hauptaktion sein.
- Politur: Das glänzende App-Icon wirkt älter und visueller lauter als das ansonsten reduzierte Interface.

### 2. Kartenverwaltung – Desktop

Gesundheit: kritisch wegen falscher Zuordnung, optisch ansonsten gut.

![Browse Desktop](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/02-browse-desktop.png>)

- Stärke: Gute Kombination aus Zusammenfassung, Suche, Sortierung und kompakter Tabelle.
- Kritisch: Die Tabellenüberschriften stimmen nicht mit den Inhalten darunter überein. Unter „Due“ steht die Vorderseite, unter „Front“ die Rückseite und unter „Back“ das Datum.
- Kritisch: „Due now: 0“ widerspricht dem rot markierten überfälligen Datum.
- Lesbarkeit: Lange Inhalte werden sinnvoll gekürzt, aber bei falschen Spaltenköpfen wird diese Effizienz zum Risiko.

### 3. Standard-Lernmodus – Desktop, Antwort

Gesundheit: sehr gut.

![Study Desktop Answer](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/03-study-desktop-answer.png>)

- Stärke: Exzellent fokussiert; Karte, Fortschritt und Bewertung sind sofort verständlich.
- Stärke: Die Serifenschrift trennt Lerninhalt sauber von der Bedienoberfläche.
- Stärke: Farben werden durch Text und Intervalle ergänzt, nicht allein zur Bedeutung verwendet.
- Politur: Der sehr große Leerraum ist hier funktional, kann auf kleineren Desktopfenstern aber etwas „unfertig“ wirken.

### 4. Smart-Study-Planer – Desktop

Gesundheit: gut, mit einem wichtigen Statusproblem.

![Smart Study Setup Desktop](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/04-smart-setup-desktop.png>)

- Stärke: Die drei Schritte und die dunkle Session-Zusammenfassung geben dem komplexen Setup klare Struktur.
- UX-Risiko: Der Planer zeigt „0 Due“ und „Scheduled review“, obwohl die Library drei fällige Karten meldet.
- Politur: Die linke Hälfte wirkt bei wenigen Decks leer, während rechts sehr viel visuelles Gewicht liegt.

### 5. Smart Study – Desktop

Gesundheit: gut.

![Smart Study Desktop](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/05-smart-study-desktop.png>)

- Stärke: Kontext, Timer, Frage, Selbsteinschätzung und Eingabe sind klar voneinander getrennt.
- Stärke: Die Oberfläche erklärt die Lernmethode durch ihre Struktur, ohne lange Hilfetexte.
- Risiko: Bei typischer Fensterhöhe liegt ein Teil der Session-Statistik unterhalb des sichtbaren Bereichs. Das ist nicht kritisch, erhöht aber die gefühlte Länge der Aufgabe.

### 6. Library – Mobile

Gesundheit: okay, aber zu wenig auf die Kernaufgabe fokussiert.

![Library Mobile](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/06-library-mobile.png>)

- Stärke: Gute Touch-Größen, klare Bottom-Navigation und saubere Karten.
- UX-Risiko: Titel, „New deck“ und vier Kennzahlen verbrauchen fast einen ganzen Screen, bevor das erste Deck vollständig sichtbar ist.
- Priorisierung: Auch mobil sollte die fällige Review-Aktion vor „New deck“ stehen.
- Politur: Die feste Navigation überlagert am unteren Rand sichtbar den nächsten Inhalt; ausreichender Scroll-Abstand sollte praktisch geprüft werden.

### 7. Kartenverwaltung – Mobile

Gesundheit: okay, aber sehr dicht.

![Browse Mobile](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/07-browse-mobile.png>)

- Stärke: Die Desktop-Tabelle wird sinnvoll in einzelne Karten umgebaut; horizontales Scrollen wird vermieden.
- Risiko: Suche, Zähler, Sortierung und Menü bilden vor den Karten einen sehr hohen Bedienblock.
- Risiko: Metadaten wie Due, Interval, Difficulty und Failrate stehen eng zusammen; für schnelles Bearbeiten funktioniert das, für gelegentliche Nutzer wirkt es technisch.

### 8. Standard-Lernmodus – Mobile, Frage

Gesundheit: sehr gut.

![Study Mobile Question](</Users/itz4resace/Desktop/Private Projekte/smartL3arn/design-audit/2026-08-03/08-study-mobile-question.png>)

- Stärke: Die wichtigste Aufgabe bleibt dominant und ablenkungsfrei.
- Stärke: Die große, fest positionierte Antwortaktion ist gut erreichbar.
- Stärke: Der Lernmodus wirkt auf Mobile reifer als die Verwaltungsansichten.

## Höchste Prioritäten

1. Fälligkeiten und Statusanzeigen über alle Screens konsistent machen.
2. Spaltenköpfe und Tabelleninhalte korrekt ausrichten.
3. In der Library bei fälligen Karten „Review n“ zur Hauptaktion machen und „New deck“ zurückstufen.
4. Den mobilen Kopfbereich und die Kennzahlen kompakter machen.
5. App-Icon und Branding an die ruhigere, hochwertigere UI-Sprache angleichen.

## Barrierefreiheit

Sichtbar positiv sind große mobile Ziele, klare Textlabels, deutliche Fokusflächen und Bewertungen, die nicht nur über Farbe kommunizieren. Kleine Versal- und Metatexte in Tabellen und Lernkopf sind mögliche Risiken bei Sehschwäche. Aus Screenshots allein lassen sich Tastaturreihenfolge, Screenreader-Ausgabe, Zoom/Reflow, tatsächliche Kontrastwerte und verdeckte Fokuszustände nicht abschließend beurteilen.
