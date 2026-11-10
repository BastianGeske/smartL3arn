# Lernstrategien und Abgleich mit smartL3arn

Umsetzungsstand: Die hier dokumentierten Befunde wurden anschließend bearbeitet; Details und Prüfungen stehen in [Lernabläufe nach dem Forschungsabgleich](learning-policy.md). Die folgenden Reproduktionen dokumentieren den ursprünglichen Zustand.

Stand: 10. November 2026. Geprüft wurde der aktuelle lokale Arbeitsstand einschließlich vorhandener, noch nicht committeter Änderungen.

Die App unterstützt zentrale wirksame Lernprinzipien. Ein klarer didaktischer Gegenlauf liegt jedoch in der lokalen Textbewertung: Zeichenähnlichkeit wird als inhaltliche Richtigkeit ausgegeben. Zusätzlich ist die als FSRS-5 bezeichnete Implementierung unvollständig. Weitere Befunde betreffen die Abstände beim erneuten Üben, die Konfidenzrückmeldung und die begrenzte Umsetzung von Interleaving.

## Einordnung der 25 Ansätze

Eine wissenschaftlich belastbare, universelle Rangliste der 25 wirksamsten Strategien existiert nicht. Wirkung hängt von Vorwissen, Lernziel, Material, Vergleichsmethode und Zeitpunkt der Prüfung ab. Effektgrößen aus unterschiedlichen Metaanalysen bilden keine gemeinsame Rangliste. Die folgende Auswahl umfasst 25 relevante, empirisch gestützte Lernansätze und Gestaltungsprinzipien; einige überschneiden sich. Besonders Abrufübungen und verteiltes Üben sind breit gestützte Ausgangspunkte. [Dunlosky et al., 2013](https://acs.ist.psu.edu/ist521/dunloskyRMNW13.pdf)

„Breit gestützt“ und „kontextabhängig“ sind hier qualitative Anwendungseinordnungen, keine formelle GRADE-Bewertung. „Fehlt“ bezeichnet eine mögliche Erweiterung und keinen Widerspruch. Die Multimedia-Prinzipien sind Regeln zur Materialgestaltung, keine eigenständigen Gedächtnistricks.

| Nr. | Strategie / Prinzip | Wirksame Anwendung und Grenze | Bezug zum aktuellen Projekt | Forschung |
|---|---|---|---|---|
| 1 | Aktiver Abruf / Retrieval Practice | Wissen ohne sichtbare Lösung abrufen; breit gestützt. | Antworteingabe in Smart Study standardmäßig aktiv. Klassische Karten erlauben gedanklichen oder mündlichen Abruf. | [Yang et al., 2021](https://pubmed.ncbi.nlm.nih.gov/33683913/) |
| 2 | Verteiltes Üben / Spacing | Wiederholungen zeitlich verteilen; geeignete Abstände hängen vom Behaltensziel ab. | Fälligkeitssystem vorhanden; kurzfristige Wiederholungen können die Abstände umgehen, siehe B3. | [Cepeda et al., 2006](https://escholarship.org/content/qt3rr6q10c/qt3rr6q10c.pdf) |
| 3 | Successive Relearning | Erfolgreichen Abruf über mehrere getrennte Sitzungen wiederherstellen; kombiniert Abruf und Spacing. | Grundsätzlich möglich. Ein festes, über Tage überprüftes Erfolgskriterium existiert nicht. | [Rawson & Dunlosky, 2022](https://journals.sagepub.com/doi/10.1177/09637214221100484) |
| 4 | Interleaving | Verwandte Aufgabenkategorien mischen, um passende Verfahren unterscheiden zu lernen; stark materialabhängig. | Deckwechsel umgesetzt; keine Auswahl nach fachlicher Ähnlichkeit, siehe B5. | [Brunmair & Richter, 2019](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf) |
| 5 | Korrektives, informatives Feedback | Fehler und richtige Lösung verständlich rückmelden; Qualität und Informationsgehalt zählen. | Musterlösung, Teilbewertungen und KI-Feedback vorhanden; lokale Texturteile können sachlich falsch sein, siehe B1. | [Wisniewski et al., 2020](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.03087/full) |
| 6 | Eigene Fehler untersuchen und korrigieren | Eigene Fehlannahmen mit korrekter Rückmeldung bearbeiten; Fehler allein garantieren keinen Nutzen. | Eigene Antwort und Musterlösung werden gegenübergestellt. Ein gezielter Korrekturversuch wird nicht verlangt. | [Metcalfe, 2017](https://www.annualreviews.org/content/journals/10.1146/annurev-psych-010416-044022) |
| 7 | Selbsterklärung / Self-Explanation | Zusammenhänge oder Lösungsschritte selbst erklären; Nutzen hängt von Aufgabe und Unterstützung ab. | Warum-Feld und eigener Rechenweg vorhanden; freies Warum-Feld wird gespeichert, aber nicht bewertet. | [Bisra et al., 2018](https://link.springer.com/article/10.1007/s10648-018-9434-x) |
| 8 | Elaborative Warum-Fragen | Begründen, warum eine Aussage zutrifft, und Vorwissen aktivieren; fachlich richtige Verknüpfungen sind entscheidend. | Optionales „Warum ist das richtig?“ vorhanden. | [Dunlosky et al., 2013](https://acs.ist.psu.edu/ist521/dunloskyRMNW13.pdf) |
| 9 | Generieren statt nur lesen | Antworten oder Beziehungen selbst erzeugen; Generieren ist kein Beleg ihrer Richtigkeit. | Freitext, Lücken und Berechnungen unterstützen dies. | [Bertsch et al., 2007](https://pubmed.ncbi.nlm.nih.gov/17645161/) |
| 10 | Vorfragen / Pretesting | Vor dem Lernen einen Antwortversuch machen und danach die richtige Antwort studieren; Nutzen vor allem für die vorab erfragten Inhalte. | Neue Karten werden vor ihrer Lösung gezeigt. Kein eigener Vorfragen-Lernmaterial-Ablauf. | [St Hilaire et al., 2024](https://pubmed.ncbi.nlm.nih.gov/37640836/) |
| 11 | Ausgearbeitete Beispiele | Besonders bei neuem Stoff nachvollziehbare Lösungen studieren und anschließend selbst lösen. | Musterrechenwege unterstützt; kein eigener Einstieg mit Beispielen vor Übungsaufgaben. | [Barbieri et al., 2023](https://doi.org/10.1007/s10648-023-09745-1) |
| 12 | Hilfen schrittweise abbauen / Fading | Von vollständigen Lösungen über ergänzbare Teillösungen zum selbstständigen Lösen wechseln. | Kein adaptiver Abbau von Lösungsschritten. | [Renkl et al., 2000](https://escholarship.org/content/qt81b9j9hs/qt81b9j9hs_noSplash_ef3e30a960524adc5157ece2d6fa3130.pdf) |
| 13 | Fälle und Gegenbeispiele vergleichen | Gemeinsamkeiten und Unterschiede gezielt herausarbeiten; bloßes Nebeneinander genügt nicht. | Mit passenden Text-/Erklärungskarten möglich; Prompt nennt Abgrenzungen und typische Fehler. | [Alfieri et al., 2013](https://www.tandfonline.com/doi/abs/10.1080/00461520.2013.775712) |
| 14 | Anwendung und Transfer üben | Prinzipien mit Anwendungs- und Schlussfolgerungsfragen abrufen; Transfer entsteht nicht automatisch aus Faktenabfragen. | Prompt fordert Anwendung und Ursache/Wirkung. Keine automatische Variantenbildung. | [Pan & Rickard, 2018](https://pubmed.ncbi.nlm.nih.gov/29733621/) |
| 15 | Anderen etwas erklären / Learning by Teaching | Stoff für andere aufbereiten und verständlich erklären; konkrete Erkläraktivität ist relevant. | Mit Erklärungskarten möglich; kein eigener Lehrmodus. | [Kobayashi, 2019](https://doi.org/10.1111/jpr.12221) |
| 16 | Peer Instruction | Erst selbst antworten, dann Begründungen diskutieren und erneut individuell anwenden. | Kein eigener gemeinsamer Diskussionsablauf. | [Smith et al., 2009](https://pubmed.ncbi.nlm.nih.gov/19119232/) |
| 17 | Concept Maps selbst konstruieren | Begriffe durch ausdrücklich benannte Beziehungen verknüpfen; kein bloßes Dekorieren von Notizen. | Kein Concept-Map-Editor. | [Schroeder et al., 2018](https://doi.org/10.1007/s10648-017-9403-9) |
| 18 | Lernendes Zeichnen / Drawing-to-Learn | Prozesse oder Beziehungen selbst skizzieren; Aufgabe und Unterstützung beeinflussen den Nutzen. | Keine Zeicheneingabe. Papier kann außerhalb der App genutzt werden. | [Cromley et al., 2020](https://link.springer.com/article/10.1007/s10956-019-09807-6) |
| 19 | Passende sprachliche und bildliche Darstellung | Erklärungen mit fachlich hilfreichen Abbildungen verbinden; kein Beleg für feste visuelle oder auditive „Lerntypen“. | Karten sind im Wesentlichen Text und Mathematik; kein ausgewiesener Abbildungsworkflow. | [IES-Praxisleitfaden, 2007](https://ies.ed.gov/ncee/wwc/Docs/PracticeGuide/20072004.pdf) |
| 20 | Sinnvolle Segmentierung | Komplexen Stoff in zusammenhängende, selbst steuerbare Abschnitte gliedern. | Karten sind selbst getaktet; Prompt fordert abgegrenzte Lernziele. | [Rey et al., 2019](https://doi.org/10.1007/s10648-018-9456-4) |
| 21 | Räumliche und zeitliche Nähe zusammengehöriger Informationen | Beschriftung und Abbildung bzw. Erklärung und zugehörige Darstellung eng verbinden. | Für zukünftige visuelle Karten relevant; aus dem Quellcode allein keine abschließende Layoutbewertung. | [Noetel et al., 2022](https://journals.sagepub.com/doi/10.3102/00346543211052329) |
| 22 | Signalisieren relevanter Strukturen | Wesentliche Beziehungen in Lehrmaterial gezielt kenntlich machen; Lösungshinweise vor dem Abruf vermeiden. | Strukturierte Aufgaben und Rechenschritte vorhanden; Signalisierung innerhalb des Lernstoffs hängt vom Karteninhalt ab. | [Noetel et al., 2022](https://journals.sagepub.com/doi/10.3102/00346543211052329) |
| 23 | Kohärenz / Irrelevantes reduzieren | Unnötige Zusatzinformationen aus Lernmaterial entfernen, wenn sie die Verarbeitung belasten. | Prompt fordert knappe, zielbezogene Karten. Kein beobachteter vollständiger Gegenlauf. | [Noetel et al., 2022](https://journals.sagepub.com/doi/10.3102/00346543211052329) |
| 24 | Metakognitives Überprüfen | Einschätzung mit belastbaren Ergebnissen und Kriterien vergleichen; Nutzen ist aufgabenabhängig. | Konfidenzabfrage vorhanden, Rückmeldung methodisch zu grob, siehe B4. | [Monitoring-Metaanalyse, 2024](https://link.springer.com/article/10.1007/s10648-024-09936-4) |
| 25 | Selbstreguliertes Lernen | Konkretes Ziel setzen, Vorgehen planen, Fortschritt prüfen und Strategie anpassen; Einzelkomponenten wirken nicht überall gleich. | Deckwahl und Zeitplanung vorhanden; kein vollständiger Ziel-Reflexions-Zyklus. | [Donker et al., 2014](https://www.sciencedirect.com/science/article/pii/S1747938X13000420) |

## Befunde mit konkreten Fundstellen

Die Forschung begründet die Lernprinzipien. Die Bewertung ihrer Umsetzung in smartL3arn ist eine eigene Ableitung aus dem Quellcode und den unten beschriebenen Reproduktionen, keine Wirksamkeitsstudie der App.

### B1 — Hohe Priorität: Textähnlichkeit wird als fachliche Richtigkeit ausgegeben

**Einstufung: klarer Konflikt mit verlässlichem korrektivem Feedback und verständnisorientiertem Lernen.**

`evaluateResponse()` schickt klassische Textkarten sowie `short_text` und `long_text` in denselben Zeichenvergleich: [tasks.ts](../src/domain/tasks.ts#L112). Der normalisierte Levenshtein-Abstand wird über feste Schwellen in `correct`, `mostly_correct`, `partially_correct` und `incorrect` umgewandelt: [answerSimilarity.ts](../src/domain/study/answerSimilarity.ts#L42). Die Ansicht zeigt diese Kategorien als „Richtig“, „Überwiegend richtig“ usw. an: [SmartStudyView.vue](../src/views/SmartStudyView.vue#L319), [de.ts](../src/i18n/de.ts#L274).

Am tatsächlichen Code reproduziert:

| Musterantwort | Eingabe | Ausgabe |
|---|---|---|
| Ein Quadrat hat vier gleich lange Seiten und vier rechte Winkel. Seine Innenwinkelsumme beträgt 360 Grad. | Ein Quadrat hat vier gleich lange Seiten und **drei** rechte Winkel. Seine Innenwinkelsumme beträgt 360 Grad. | **„Richtig“**, 97,09 % Textähnlichkeit |
| Insulin senkt den Blutzuckerspiegel. | Insulin **erhöht** den Blutzuckerspiegel. | **„Überwiegend richtig“**, 86,11 % |
| Insulin senkt den Blutzuckerspiegel. | Das Hormon verringert die Glukosekonzentration im Blut. | **„Falsch“**, 29,63 % |

Damit kann die App eine zentrale Fehlvorstellung bestätigen und eine sinngleiche Antwort abwerten. Ein Hinweis „lokale Übereinstimmung“ unter dem Urteil löst den Widerspruch zwischen Messgröße und Bedeutungsurteil nicht. Die Dokumentation benennt die Grenze korrekt; die Produktdarstellung geht darüber hinaus. Falsches Feedback steht der Fehlerkorrektur entgegen. [Metcalfe, 2017](https://www.annualreviews.org/content/journals/10.1146/annurev-psych-010416-044022)

**Empfohlene Korrektur:** Bei freien Textantworten lokal nur Textübereinstimmung ausgeben und eine ausdrückliche Selbstbewertung anhand der Musterlösung ermöglichen. Ohne Inhaltsprüfung kein sachliches Richtig/Falsch-Urteil und keine daraus abgeleitete Konfidenzbewertung. Exakte Fachbegriffe können mit hinterlegten akzeptierten Antworten geprüft werden. Ein bloßer Wechsel zu einer anderen Ähnlichkeitsschwelle reicht nicht.

### B2 — Hohe Priorität: Als FSRS-5 bezeichnete Implementierung lässt zwei wesentliche Regeln aus

**Einstufung: bestätigte technische Abweichung vom angegebenen Algorithmus; kein Beweis, dass Spacing insgesamt unwirksam umgesetzt wird.**

[README.md](../README.md#L3) nennt FSRS-5. Die Implementierung enthält 19 Gewichte, verwendet die beiden letzten aber nicht. `scheduleCard()` nutzt bei Wiederholungen am selben Tag dieselben langfristigen Recall-/Forget-Formeln wie bei zeitlich entfernten Wiederholungen: [fsrs.ts](../src/domain/scheduling/fsrs.ts#L70). Da `fsrsRetrievability(0, S)` genau 1 ist, bleibt die Stabilität bei einem erfolgreichen Wiederabruf am selben Tag unverändert.

Außerdem fehlt in `fsrsNextDifficulty()` der FSRS-5-Faktor `(10 - D) / 9` zur linearen Dämpfung der Schwierigkeitsänderung: [fsrs.ts](../src/domain/scheduling/fsrs.ts#L32).

Die veröffentlichte FSRS-5-Spezifikation beschreibt sowohl die gesonderte Same-Day-Formel `S′ = S × exp(w17 × (G - 3 + w18))` als auch die lineare Dämpfung. [Offizielle Algorithmusbeschreibung](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)

Mit den **im Projekt vorhandenen** Gewichten reproduziert, ohne einen Austausch der Parameter zu unterstellen:

| Fall | Aktueller Code | FSRS-5-Formel mit denselben Gewichten |
|---|---|---|
| Neue Karte „Gut“, danach am selben Tag „Leicht“ | Stabilität bleibt 3,1262 | Stabilität etwa 7,3771 |
| Dieselbe zunächst mit „Gut“ gelernte Karte danach „Schwer“ | Schwierigkeit 6,1888 | Schwierigkeit etwa 5,7097 |

Das betrifft normale Lernabläufe, weil beide Stores Wiederholungen am selben Tag zulassen. Langfristige Intervalle und Schwierigkeitszustände können abweichen; das Ausmaß auf reale Lernergebnisse ist damit noch nicht quantifiziert.

**Empfohlene Korrektur:** Entweder eine vollständig geprüfte FSRS-5-Implementierung verwenden oder die vorhandene Variante korrekt bezeichnen und gezielt validieren. Same-Day-Behandlung und Difficulty-Dämpfung mit unabhängigen Referenzfällen abgleichen.

### B3 — Mittlere Priorität: Wiederholungen können unmittelbar aufeinander folgen

**Einstufung: bedingter Gegenlauf zu Spacing; freiwilliges Zusatzüben allein ist kein vollständiger Widerspruch.**

Im Standardmodus werden „Nochmal“-Karten in die Lernwarteschlange aufgenommen; weitere „Nochmal“-Bewertungen hängen die Karte erneut an, ohne Zeit- oder Kartenabstand: [study.ts](../src/stores/study.ts#L71). Bei einer einzelnen schwierigen Karte kann dieselbe Karte sofort immer wieder erscheinen.

Smart Study hängt „Nochmal“ bis zu zweimal und „Schwer“ einmal an das Ende der Queue: [smartStudy.ts](../src/stores/smartStudy.ts#L30), [smartStudy.ts](../src/stores/smartStudy.ts#L424). Bei kleinen Queues garantiert „am Ende“ ebenfalls keinen Abstand. Außerdem werden bei fehlenden fälligen Karten sämtliche Karten als freiwillige Übung angeboten: [standardQueue.ts](../src/domain/study/standardQueue.ts#L29), [smartQueue.ts](../src/domain/study/smartQueue.ts#L97).

Reproduktion: Eine am 10. November mit „Gut“ bewertete neue Karte ist erst am 13. November fällig, steht beim erneuten Start aber sofort wieder in beiden Übungsqueues. Smart Study kennzeichnet das als `practice` und die Oberfläche als freiwilliges Üben; dieser Unterschied ist bereits sinnvoll vorhanden.

Das Risiko besteht in massierten Abrufen direkt nach sichtbarer Lösung: kurzfristige Verfügbarkeit wird leicht mit dauerhafter Beherrschung verwechselt. Die Forschung stützt zeitlich verteiltes Üben; sie liefert keinen universellen Mindestabstand für jede Wiederholung. Frühe Lernschritte und kurzfristige Prüfungsvorbereitung können sinnvoll sein. [Cepeda et al., 2006](https://escholarship.org/content/qt3rr6q10c/qt3rr6q10c.pdf)

**Empfohlene Korrektur:** Für erneute Fehlversuche einen sinnvollen Abstand über andere Karten oder eine zeitliche Freigabe ermöglichen. Bei kleinen Queues bewusst später fortsetzen lassen. Erfolg direkt nach Lösungseinsicht und verzögerten Abruf in der Bewertung unterscheiden.

### B4 — Mittlere Priorität: „Gut eingeschätzt“ ist keine belastbare Kalibrationsmessung

**Einstufung: methodisch irreführende Rückmeldung, verstärkt durch B1.**

`calibrationMatch()` ordnet jede einzelne Antwort deterministisch zu: [answerSimilarity.ts](../src/domain/study/answerSimilarity.ts#L108). „Unsicher + falsch“ wird als passend und „Unsicher + richtig“ als abweichend ausgegeben: [SmartStudyView.vue](../src/views/SmartStudyView.vue#L350), [de.ts](../src/i18n/de.ts#L285). Diese Zuordnungen wurden direkt reproduziert.

Eine unsicher gegebene Antwort darf richtig sein. Unsicherheit ist keine Vorhersage, dass die Antwort zwingend falsch sein muss. Bei einer probabilistischen Einschätzung lässt sich Kalibration erst über eine Folge von Vorhersagen und Ergebnissen beurteilen. Die drei aktuellen Kategorien haben zudem keine definierten Wahrscheinlichkeiten. Das angezeigte Signal ist daher ein grober Einzelfallvergleich, keine validierte Messung von Kalibration. Dass Monitoring-Interventionen hilfreich sein können, belegt diese konkrete Zuordnung nicht. [Monitoring-Metaanalyse, 2024](https://link.springer.com/article/10.1007/s10648-024-09936-4)

**Empfohlene Korrektur:** Neutral etwa „Richtig trotz Unsicherheit“ formulieren. Wiederkehrende Über- oder Unterschätzung über mehrere Versuche auswerten, mit belastbarer Richtigkeitsprüfung. Konfidenz und fachlichen Lernerfolg getrennt darstellen.

### B5 — Niedrigere Priorität: Deckwechsel deckt Interleaving nur teilweise ab

**Einstufung: begrenzte Umsetzung, kein vollständiger Forschungswiderspruch.**

`buildSmartQueueFromBuckets()` zieht reihum eine Karte je Deck: [smartQueue.ts](../src/domain/study/smartQueue.ts#L59). Die App kennt dabei keine fachliche Verwandtschaft, verwechselbaren Konzepte oder Aufgabenkategorien. Innerhalb eines einzelnen Decks ändert der Interleaving-Schalter die Mischlogik nicht; die Karten sind dort bereits innerhalb von Prioritätsgruppen zufällig sortiert.

Die Forschung zeigt materialabhängige Vorteile des Mischens, insbesondere beim Unterscheiden ähnlicher Kategorien. Beliebige Abwechslung zwischen völlig fremden Fächern ist nicht mit diesem Befund gleichzusetzen. [Brunmair & Richter, 2019](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)

**Empfohlene Korrektur:** Die konkrete Funktion als Deckmischung erklären. Für fachliches Interleaving verwandte Themen bzw. Aufgabenkategorien bewusst kombinieren; eine spätere Erweiterung könnte Themenmarkierungen nutzen. Die vorhandene deutsche Beschreibung „Mische die ausgewählten Stapel“ ist bereits angemessen zurückhaltend.

## Was nicht als vollständiger Widerspruch zählt

- **Karte umdrehen ohne Texteingabe:** Gedanklicher und mündlicher Abruf sind möglich. Eine verpflichtende Texteingabe ist keine allgemeine Voraussetzung für Retrieval Practice.
- **Auswahl- und Wahr/Falsch-Aufgaben:** Sie können Lernziele sinnvoll prüfen. Der Prompt bevorzugt eigenständigen Abruf und verlangt plausible Ablenker und Begründungen. Ihr Vorhandensein ist kein Gegenbeweis zu wirksamem Lernen.
- **Warum-Frage nach der Lösung:** Selbsterklärung darf beim Studieren einer Lösung stattfinden. Der Zeitpunkt ist für sich genommen kein Fehler. Ungeprüfte Erklärungen begrenzen allerdings die Rückmeldung.
- **Warum-Frage standardmäßig ausgeschaltet:** Kein allgemeiner Widerspruch. Mehr zusätzliche Prompts sind nicht automatisch besser; gerade bei ausgearbeiteten Mathematikbeispielen zeigt die Forschung unterschiedliche Effekte. [Barbieri et al., 2023](https://doi.org/10.1007/s10648-023-09745-1)
- **Manuelle FSRS-Bewertung:** Selbstbewertung ist bei Karteikarten sinnvoll und kann fehlerhaftes KI-Feedback korrigieren. Problematisch bleibt eine irreführende vorausgehende Rückmeldung.
- **25 Minuten Lernen und 7 Minuten Pause:** Eine mögliche Zeiteinteilung. Die wissenschaftlichen Belege zu Abruf und Spacing validieren dieses exakte Verhältnis nicht. Im Projekt ist es optional; ein universelles Optimum wird nicht nachgewiesen.
- **Fehlende Zeichnungen, Concept Maps oder Peer Instruction:** Erweiterungsmöglichkeiten; eine Karteikarten-App muss nicht alle 25 Ansätze umsetzen.
- **Begrenzte Zahl von Fehlversuchen in Smart Study:** Kann die Sitzungsbelastung begrenzen. Nicht erfolgreich abgerufene Karten bleiben über `smartNeedsPractice` vorgemerkt. Eine endende Sitzung behauptet hier nicht ausdrücklich vollständige Beherrschung.

Der Prompt in [flashcard-prompt.md](flashcard-prompt.md#L28) passt insgesamt gut zu verständnisorientiertem Lernen: abgegrenzte Lernziele, eigenständiger Abruf, Warum-/Wie-Fragen, Anwendungen, Abgrenzungen und nachvollziehbare Rechenwege. Seine Warnung vor lokaler Zeichenähnlichkeit ist korrekt, behebt aber B1 in der App nicht.

## Prüfung und Grenzen

- Quellcodeprüfung: README, Prompt, Aufgabenmodell und Bewertung, beide Lernstores, beide Queues, Scheduler, Einstellungen, deutsche Produkttexte und Lernansichten.
- Direkte Ausführung der tatsächlichen Projektmodule über Vites SSR-Modullader: falsches Quadrat-Beispiel als `correct`, gegenteiliges Textbeispiel als `mostly_correct`, Paraphrase als `incorrect`, Konfidenzzuordnung, Same-Day-Stabilität, fehlende Difficulty-Dämpfung und sofortige Verfügbarkeit einer künftig fälligen Karte bestätigt. Die Wiederholungsreihenfolge der Stores wurde im Quellcode nachvollzogen.
- Vorhandene Tests ausgeführt: `vitest run src/domain/study/answerSimilarity.test.ts src/domain/study/queues.test.ts src/domain/scheduling/fsrs.test.ts src/stores/smartStudy.test.ts` — **4 Dateien, 89 Tests bestanden**. Bestandene Tests belegen keine didaktische Validität; die beschriebenen Fälle werden damit nicht ausgeschlossen.
- Keine Änderungen am App-Code, keine Veränderung von Nutzerdaten, keine Live-KI-Anfragen. Neu erstellt wurde nur dieser Bericht.
- Kein visueller UI-Audit und keine Lernergebnisstudie mit Teilnehmenden. Öffentlich zugängliche Forschungsartikel, Metaanalysen und Abstracts wurden gezielt recherchiert; dies ist keine vollständige systematische Literaturübersicht bis November 2026. Wo Volltexte nicht zugänglich waren, wurden keine darüber hinausgehenden Detailbefunde unterstellt.

Empfohlene Reihenfolge: zuerst B1 korrigieren, anschließend B2 mit Referenzfällen absichern, danach Wiederholungsabstände und Konfidenzrückmeldung verbessern. Weitere Lernformate sind nachrangig gegenüber verlässlichen Bewertungen und korrekter zeitlicher Planung.
