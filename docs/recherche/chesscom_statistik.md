# chess.com als Vorbild für Statistik in „Tous mes mots“

> Stand: 2026-10-31. Konfidenzmarker: **[Sicher]** = steht so in der verlinkten, in dieser Sitzung abgerufenen Quelle; **[Wahrscheinlich]** = starke Schlussfolgerung aus Quellen; **[Schätzung]** = eigene Übertragung auf Tous mes mots. Alle Quellen wurden am 2026-10-31 per Abruf geprüft, außer wo „nicht verifiziert“ steht. Hilfeartikel von chess.com ändern sich häufig. Einzelheiten der Oberfläche können deshalb veraltet sein.

## Kurzfazit

chess.com legt zu jedem Spiel ein unveränderliches Rohdatum ab (Partie mit PGN, Zeitstempel, Ratings danach, Ergebnis, Endgrund). Darauf sitzen drei Schichten:
1. **laufend fortgeschriebene Zustandswerte** (aktuelles Rating + Rating-Deviation, Bestwert mit Datum und Link zur Partie, Sieg/Niederlage/Remis-Zähler),
2. **nachträglich berechnete Analysen** (Engine-Genauigkeit, Zugklassifikation, Spielphasen),
3. **aggregierte Auswertungen über Zeitfenster und Kategorien** (Stats-Seite, Insights, Advanced Stats).

Für einen Vokabeltrainer mit einem einzigen Nutzer lohnt sich vor allem die Kombination aus „Bestwert mit Beleg“, „Verlauf mit wählbarem Zeitraum“, „Vergleich mit der eigenen Vorperiode“ und „Aufschlüsselung nach Kategorien mit Mindestanzahl“. Perzentile, Ranglisten und Freundesvergleiche lassen sich nicht übertragen. **[Schätzung]**

---

## 1. Kennzahlen und ihre Definition

### 1.1 Rating je Modus (Glicko)
- chess.com verwendet das **Glicko-System**. Wie stark sich das Rating nach einer Partie ändert, hängt von drei Dingen ab: vom Ratingabstand zum Gegner, vom Vertrauen in das eigene Rating und vom Vertrauen in das gegnerische Rating. Dieses Vertrauen misst die **Rating Deviation (RD)**. Je höher die RD, desto größer der Ausschlag. **[Sicher]** – https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com
- Nach längerer Spielpause steigt die RD, und die nächste Partie bewegt das Rating stärker. **[Sicher]** – ebd.
- **Jede Zeitklasse hat ein eigenes Rating** (Bullet, Blitz, Rapid, Daily, Varianten). Live- und Daily-Ratings werden nie ineinander übernommen. Eine neue Zeitklasse startet mit dem Rating der nächstgelegenen Live-Zeitklasse und nicht bei null. In den ersten Partien schwankt das Rating dann stark. **[Sicher]** – ebd.
- Einen formalen „Provisional“-Status mit RD-Schwelle nennt der Hilfeartikel nicht. Die Schwelle von 110 RD stammt von Lichess und lässt sich nicht auf chess.com übertragen. **[Sicher, dass im Artikel nicht genannt]** – ebd.
- Das **Puzzle-Rating** folgt laut chess.com derselben „Glicko-style“-Logik wie Partien. Bei der Umstellung im Oktober 2025 fielen Inflationsboni weg (z. B. mindestens +5 pro gelöster Aufgabe, Teilpunkte). Alle Spieler und Aufgaben wurden auf Basis von rund 17 Mrd. historischen Versuchen neu bewertet. **[Sicher]** – https://www.chess.com/news/view/announcing-new-puzzles-rating-system
- Auch **Aufgaben haben ein eigenes Rating**. Es wird nach einer Weile „gesperrt“ und ändert sich danach nicht mehr. Bei „pending“-Aufgaben verliert man keine Punkte. Laut älterem Hilfetext spielt auch die Lösungszeit hinein. **[Sicher für Hilfetext; ob die Zeitkomponente nach 2025 noch gilt: nicht verifiziert]** – https://support.chess.com/en/articles/8602396-how-do-puzzle-ratings-work (nur über Suchergebnis-Auszug, Seite nicht vollständig abgerufen)

### 1.2 Bestwert, Verlauf, Bilanz
- Die Stats-API liefert pro Spielart `last` (Rating, Datum, RD), `best` (Rating, Datum, **Link zur Partie**, in der der Bestwert erreicht wurde) und `record` (win/loss/draw, bei Daily zusätzlich `time_per_move` und `timeout_percent` der letzten 90 Tage). **[Sicher]** – https://www.chess.com/news/view/published-data-api; Beispiel: https://api.chess.com/pub/player/hikaru/stats
- Auf der Stats-Seite stehen je Zeitklasse: aktuelles Rating, Veränderung im gewählten Zeitraum (Standard 90 Tage), Zahl der Partien, Perzentil, Verlaufsgraph, Höchstwert, Rang unter Freunden und ein Filter Weiß/Schwarz/alle. „Highlights“ sind Höchstwert mit Datum, bester Sieg (Gegner und dessen Rating) und längste Siegesserie. Außerdem gibt es den durchschnittlichen Gegner-Rating, getrennt nach Sieg, Remis und Niederlage. **[Sicher]** – https://support.chess.com/en/articles/8705902-what-does-my-stats-page-show
- Der Zeitraum des Graphen lässt sich auf 7 Tage, 30 Tage, 90 Tage, 1 Jahr oder „gesamt“ einstellen. **[Sicher]** – https://support.chess.com/en/articles/8705347-how-can-i-see-my-opening-stats (Kalender-Dropdown), Stats-Artikel ebd.

### 1.3 Genauigkeit (Accuracy, CAPS2)
- Accuracy misst, wie nah die eigenen Züge an der besten Engine-Antwort auf die tatsächlichen Züge des Gegners liegen. Seit CAPS2 liegen die meisten Werte etwa zwischen 50 und 95. Die Skala soll sich bewusst wie eine **Schulnote** anfühlen. Unter dem alten CAPS landeten schwächere Spieler im einstelligen Bereich, was entmutigend wirkte. **[Sicher]** – https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined
- Die genaue Formel ist nicht veröffentlicht. CAPS- und CAPS2-Werte lassen sich nicht direkt vergleichen. **[Sicher]** – ebd.; Sekundärquelle: https://saychess.substack.com/p/what-chess-players-need-to-know-about (nicht vollständig abgerufen)
- Ein transparentes Gegenmodell veröffentlicht Lichess: Zuerst wird die Engine-Bewertung über eine logistische Kurve in eine Gewinnwahrscheinlichkeit umgerechnet. Die Genauigkeit eines Zuges fällt exponentiell mit dem Verlust an Gewinnwahrscheinlichkeit. Für die Partie werden ein volatilitätsgewichteter Mittelwert und ein **harmonischer Mittelwert** gemittelt. Der harmonische Mittelwert bestraft einzelne grobe Fehler stark. **[Sicher]** – https://lichess.org/page/accuracy
- **Game Review** klassifiziert Züge nach dem „Expected Points“-Modell: Aus Spielerrating und Engine-Bewertung wird eine Gewinnerwartung (0 bis 1) geschätzt. Der Verlust an dieser Erwartung entscheidet über die Kategorie (Best, Excellent, Good, Inaccuracy, Mistake, Blunder). „Brilliant“, „Great“ und „Miss“ haben Sonderregeln. Die Schwellen hängen vom Rating ab, bei Anfängern ist das System großzügiger. **[Sicher in der Logik; genaue Schwellen nicht verifiziert]** – https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-and-etc (über Suchauszug)

### 1.4 Puzzle Rush, Streaks, Ranglisten
- **Puzzle Rush:** In 3 oder 5 Minuten möglichst viele Aufgaben lösen. Nach drei Fehlern ist Schluss. Im „Survival“-Modus gibt es kein Zeitlimit, aber dieselbe Drei-Fehler-Regel. Rush beeinflusst das Puzzle-Rating nicht. Nach jedem Lauf vergleicht eine Zusammenfassung das Ergebnis mit früheren Läufen, und eine Liste der Aufgaben lässt sich nacharbeiten. Der Bestwert steht im Profil. **[Sicher]** – https://support.chess.com/en/articles/8608686-how-do-puzzles-work-on-chess-com
- Die API speichert für Puzzle Rush `best` und `daily` mit `score` und `total_attempts`, also Treffer **und** Versuche. **[Sicher]** – https://www.chess.com/news/view/published-data-api
- **Streaks:** Gezählt werden aufeinanderfolgende Tage mit einer qualifizierenden Aktivität (Partie, Daily-Zug, Puzzles, Lektionen, Game Review). Zwei ausgelassene Tage pausieren die Serie, erst am dritten verfällt sie. Dargestellt wird sie als Flamme, die mit der Länge die Farbe wechselt. **[Sicher]** – https://www.chess.com/news/view/announcing-streaks. Der Hilfeartikel bezeichnet das Feature zeitweise als deaktiviert. Eine News von 2026 behandelt es dagegen als aktiv. Der aktuelle Status ist **nicht verifiziert**. – https://support.chess.com/en/articles/9714718-what-are-streaks, https://www.chess.com/news/view/international-chess-day-2026-rewards
- **Ranglisten** setzen ein Konto von mindestens 7 Tagen, 20 Partien der Spielart und mindestens eine Partie in den letzten 90 Tagen voraus. Wer inaktiv ist, fällt heraus. **[Sicher]** – https://support.chess.com/en/articles/8705280-what-are-leaderboards
- Das **Perzentil** gibt den Anteil der Mitglieder mit gleichem oder niedrigerem Rating an. Es setzt ebenfalls Mindestbedingungen voraus. **[Sicher]** – https://support.chess.com/en/articles/8572866-what-does-percentile-mean (über Suchauszug)

---

## 2. Darstellung der Langzeitentwicklung

- **Verlaufsgraph** mit festen Zeitfenstern (7/30/90 Tage, 1 Jahr, gesamt). Standard ist 90 Tage, dazu kommt die Veränderung im Zeitraum als Zahl (+/−). **[Sicher]** – Stats-Artikel (s. o.)
- Der **Bestwert mit Datum** wird immer unter dem Graphen gezeigt. In der API hängt der Link zur auslösenden Partie daran. **[Sicher]**
- **Vergleich mit der eigenen Vergangenheit:** In Insights stellt der Tab „Past Performance“ den gewählten Zeitraum der **gleich langen Vorperiode** gegenüber. **[Sicher]** – https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com
- **Vergleich mit anderen:** Das sind der Tab „Similar Players“, das Perzentil, der Freundesrang und „Peers“-Werte bei Eröffnungen. **[Sicher]** – ebd. und Opening-Stats-Artikel
- **Zeitgewichtung:** Advanced Stats gewichten neuere Partien stärker, ältere verlieren allmählich an Einfluss. Die Kategorie-Ratings sind also gleitende, abklingende Werte und keine Lebenszeitmittel. **[Sicher]** – https://support.chess.com/en/articles/15451190-how-do-i-use-advanced-stats
- Ein Klick auf eine Eröffnungskennzahl öffnet einen **90-Tage-Trendgraphen**. **[Sicher]** – Opening-Stats-Artikel
- **Jahresrückblick („Year in Chess“, seit Januar 2024):** Er zeigt Zahl der Partien, längste Serien, besten Sieg, „besten Schachfreund“ und weitere Werte. Vorher gab es eine Rückblick-E-Mail. **[Sicher]** – https://www.chess.com/article/view/chesscom-update-january-2024. Wie die aktuelle Ausgabe genau aussieht, ist **nicht verifiziert**.

---

## 3. Insights: Schwächen nach Kategorien

Insights (Diamond-Mitgliedschaft) wertet die Partien im Hintergrund aus und benachrichtigt den Nutzer, sobald die Ergebnisse fertig sind. Filtern lässt sich nach Spielart, Zeitklasse und Zeitraum. **[Sicher]** – https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com

**Einschlusskriterien:** mindestens 10 Halbzüge, nur Standardschach, nicht abgebrochen, nicht gegen den Computer. **[Sicher]** – ebd. Eine Mindestzahl an Partien pro Kategorie nennt der Artikel nicht. **[Sicher, dass nicht genannt]**

**Bereiche** **[Sicher]**, ebd.:
| Bereich | Inhalt | Analogie für Tous mes mots **[Schätzung]** |
|---|---|---|
| Games | Partien und Durchschnittsgenauigkeit im Zeitverlauf, Genauigkeit nach Zugnummer, Ergebnisse nach Gegnerstärke, Endgründe, „Game Shapes“, Spielphasen (wo endet die Partie, Genauigkeit je Phase) | Abrufquote im Verlauf; Quote nach „Kartenalter“/Wiederholungsnummer; Quote nach vorhergesagter Abrufwahrscheinlichkeit (≈ Gegnerstärke) |
| Openings | Top-10-Eröffnungen je Farbe, Ergebnisse, „Mastery“ = Anzahl Buchzüge bis zum Verlassen der Theorie | Top-Sachfelder/Lektionen; Richtung FR→DE vs. DE→FR (≈ Farbe) |
| Tactics | gefundene vs. verpasste Gabeln, Fesselungen, Matts; hängende Figuren | Fehlertypen: Genus, Faux amis, Präpositionen, Register |
| Moves | Zugqualität mit Trend, Genauigkeit je Figur, Rochadezeitpunkt | Quote je Wortart |
| Calendar | Partien, Genauigkeit, Ergebnisse nach Tageszeit und Wochentag (Profil-Zeitzone) | Abrufquote nach Tageszeit/Wochentag |
| Geography | Herkunftsländer der Gegner | entfällt |

Die Insights-Ankündigung zeigt außerdem **Gewinn-/Verlustquoten nach Zeitklasse**, **Phasengenauigkeit** (z. B. Abfall im Mittelspiel) und **hängende Figuren nach Figurentyp** als Anteil am Gesamtwert. **[Sicher]** – https://www.chess.com/news/view/chesscom-releases-new-insights-feature

**Opening Stats:** Pro Eröffnung zeigen sie Partien, Gewinnquote, **Genauigkeit nur in der Eröffnungsphase** und den Peers-Wert ähnlich starker Spieler. Jede Eröffnung erhält eine „Note“ im Vokabular der Zugklassifikation (z. B. „Excellent“, „Inaccuracy“), je nach Abstand zu den Peers. Games mit weniger als 10 Zügen und Varianten fallen heraus. **[Sicher]** – https://support.chess.com/en/articles/8705347-how-can-i-see-my-opening-stats

**Advanced Stats:** Ein eigenes **Rating je Kompetenzbereich** (Openings, Tactics, Strategy, Endgames) pro Zeitklasse, jeweils mit Auf-/Ab-Pfeil, Fortschrittsgraph und Note gegenüber Gleichstarken. **[Sicher]** – Advanced-Stats-Artikel

Was sich methodisch übertragen lässt **[Schätzung]**:
1. Die Kategorie-Kennzahl wird immer **relativ** angezeigt. chess.com vergleicht mit Peers. Tous mes mots hat keine Peers und vergleicht stattdessen mit dem eigenen Gesamtdurchschnitt oder der FSRS-Vorhersage. Die beste „Schwäche“-Kennzahl ist daher **beobachtete minus vorhergesagte Abrufquote** je Kategorie, weil sie den Schwierigkeitsmix herausrechnet.
2. **Einschlusskriterien und Phasentrennung:** chess.com bewertet die Eröffnungsgenauigkeit getrennt von der Gesamtpartie. Analog sollten Triage-Ereignisse (Erstkontakt) nicht mit Review-Ereignissen vermischt werden.
3. **Top-N plus Drilldown:** Insights zeigt nur die zehn häufigsten Eröffnungen und bietet dazu den Sprung ins Partiearchiv. Analog zeigt Tous mes mots die Top-Sachfelder und springt in die Kartenliste.

---

## 4. Motivation vs. Vanity – und was übertragbar ist

| Element | Wirkung bei chess.com | Übertragbar? **[Schätzung]** |
|---|---|---|
| Rating je Modus mit Unsicherheit (RD) | Gutes Signal für Fortschritt, das Inaktivität und Unsicherheit ehrlich abbildet **[Wahrscheinlich]** | **Ja.** Als Spielrating gegen Wörter, deren Schwierigkeit als „Gegner“ dient, oder schlichter als geglätteter Wert |
| Bestwert mit Datum und Beleg | Starker Anker, „Rekord“ ist nachprüfbar | **Ja**, für Spiele (60 s, Sudden Death) und längste Serien |
| Verlauf mit Zeitfensterwahl + Δ-Zahl | Macht langfristige Entwicklung sichtbar | **Ja**, Kernansicht |
| Vergleich mit Vorperiode | Motiviert ohne Wettbewerb | **Ja**, ideal für Einzelnutzer |
| CAPS2-Skala „wie Schulnote“ | Bewusst so gestaltet, dass niedrige Werte nicht entmutigen **[Sicher]** (Accuracy-Artikel) | **Ja, als Prinzip.** Skalen so wählen, dass typische Werte im mittleren bis oberen Bereich liegen |
| Streak mit Kulanz (2 Tage) | Fördert Gewohnheit, Kulanz verhindert Frust **[Sicher]** zur Regel | **Ja, gedämpft.** Kalender-Heatmap statt reiner Flamme, kleine Kulanz |
| Perzentil, Rangliste, Freundesrang | Sozialer Vergleich | **Nein** (ein Nutzer) |
| Similar Players / Peers | Normierung durch Vergleichsgruppe | Ersatz durch FSRS-Vorhersage |
| „Whimsical“ Stats (Gegnerländer, Tageszeit) | Unterhaltsam, teils Vanity **[Wahrscheinlich]** | Tageszeit: **ja, als nützlich**; Rest: nein |
| Year in Chess | Emotionaler Rückblick, geringer Erkenntniswert **[Wahrscheinlich]** | **Ja, billig**, weil alles aus den Ereignissen ableitbar ist |
| Reine Zählwerte (Partien gesamt) | Vanity, wenn ohne Qualitätsbezug **[Wahrscheinlich]** | Nur als Kontext neben Quoten |

Kritisch: Ein Rating ist nur so gut wie seine Gegnerstärke. Bei chess.com bewerten sich Spieler gegenseitig. In Tous mes mots fehlt der Gegner, und die Kartenschwierigkeit kommt ihrerseits aus FSRS. Ein „Wort-Elo“ wäre deshalb zirkulär, wenn beide Seiten aus denselben Daten lernen. Für die Spiele ist ein **robustes Leistungsmaß** (gleitender Median der letzten N Läufe plus Bestwert) wahrscheinlich ehrlicher als ein Glicko-Rating. **[Schätzung]**

---

## 5. Technisches Vorgehen

- **Rohdaten:** pro Partie PGN (alle Züge, bei Live-Partien mit Uhrzeiten), Start- und Endzeit, `time_class`, `time_control`, `rules`, Ratings beider Spieler **nach** der Partie, Ergebnis-Code (win, checkmated, timeout, resigned, agreed, repetition, …), ECO-Link und, sofern berechnet, `accuracies`. Die Partien sind in **Monatsarchiven** gruppiert (`/games/{YYYY}/{MM}`), dazu gibt es eine Liste aller Monate (`/games/archives`). **[Sicher]** – https://www.chess.com/news/view/published-data-api
- **Vorberechnet und materialisiert:** Stats-Objekt (`last`, `best`, `record`, `tournament`, Taktik- und Lektions-Höchst- und Tiefstwerte, Puzzle-Rush-Bestwert). Dass diese Werte inkrementell beim Partieende fortgeschrieben werden, ist eine starke Vermutung, weil `best` den Link zur auslösenden Partie trägt und `timeout_percent` ein festes 90-Tage-Fenster hat. **[Wahrscheinlich]**
- **Nachgelagert und asynchron:** Accuracy erscheint nur, „sofern zuvor berechnet“. Insights verarbeitet die Partien im Hintergrund und benachrichtigt den Nutzer danach. Teure Analysen laufen also als Batch auf den unveränderlichen Rohdaten. **[Sicher]** für beides – API-Doku; Insights-Artikel
- **Caching:** Die API arbeitet mit ETag/Last-Modified und 304-Antworten. Die meisten Daten werden höchstens alle 12 bzw. 24 Stunden aktualisiert (die Doku nennt beide Werte). Ranglisten liefern die Top 50 je Kategorie. **[Sicher]** – API-Doku
- **Zeitzone:** Kalenderstatistiken verwenden die Zeitzone aus dem Profil. **[Sicher]** – Insights-Artikel

Übertragung auf IndexedDB **[Schätzung]**:
- `review_event` und `game_event` bleiben die einzige Wahrheit (append-only). Das entspricht der Partie im Archiv.
- Ein kleiner **`stats_snapshot`-Store** wird bei jedem Ereignis inkrementell fortgeschrieben: Bestwerte mit `event_id`, Zähler, aktuelle Serie, letzter Spielwert. Das entspricht dem Stats-Objekt.
- **Tagesaggregate** (`daily_rollup`: Datum × Modus × Richtung → n, gewusst, Summe der Vorhersagen, Median der Antwortzeit) bilden die Grundlage für Heatmap, Verlauf und Vorperiodenvergleich. Sie lassen sich jederzeit aus den Ereignissen neu aufbauen.
- **Kategorieauswertungen** (Wortart, Register, Sachfeld) werden on-the-fly beim Öffnen der Ansicht berechnet. Bei einem Nutzer mit einigen zehntausend Ereignissen geht das schnell genug, und neu zugeordnete Metadaten sind sofort berücksichtigt.
- Zeitzone und Tagesgrenze werden explizit gespeichert, z. B. ein „Lerntag“, der um 4 Uhr wechselt.
- Analog zum Wechsel von CAPS zu CAPS2 und zur Neubewertung der Puzzles 2025 gilt: Wer Algorithmen wechselt (FSRS-Version), versioniert die gespeicherten Vorhersagen und rechnet sie bei Bedarf neu, statt alte und neue Werte zu vermischen.

---

## 6. Übertragungsliste für Tous mes mots

Legende Daten: **E** = aus bestehenden Ereignissen ableitbar; **M** = braucht Kartenmetadaten (Wortart, Register, Sachfeld), die laut `metadaten_und_statistik.md` geplant sind; **N** = neues Feld nötig. Alle Einträge sind **[Schätzung]**.

| # | Ansicht | Daten | Prio | Begründung |
|---|---|---|---|---|
| 1 | **Abrufquote im Verlauf** (Review-Modus, 7/30/90 Tage/1 Jahr/gesamt, Δ zur Vorperiode) | E: review_event (mode=review, Bewertung, Zeit) | Hoch | Entspricht Rating-Graph und „Past Performance“, die zentrale Langzeitkurve |
| 2 | **Kalibrierung: beobachtet vs. vorhergesagt** (Quote je Vorhersage-Bucket und als Zeitreihe) | E: predicted_R, Bewertung | Hoch | Ersetzt den „Peers“-Vergleich und zeigt, ob FSRS passt |
| 3 | **Kalender-Heatmap** (Ereignisse/Tag, Farbe = Quote) mit Serie und Kulanztag | E: Zeitstempel; N: Lerntag-Grenze/Zeitzone | Hoch | Streak-Logik von chess.com, aber informativer als eine Flamme |
| 4 | **Rekordtafel** der Spiele (Bestwert 60 s und Sudden Death mit Datum und Link zum Lauf; längste Serie; meiste Reviews/Tag) | E: game_event, Bestwerte | Hoch | „best“ mit Beleg, starker Motivator |
| 5 | **Spielform-Verlauf** (gleitender Median der letzten 10 Läufe + Einzelpunkte + Bestwertlinie, je Spiel) | E: game_event | Hoch | Ehrlicher als Glicko ohne Gegner, zeigt den echten Trend |
| 6 | **Schwächen nach Wortart/Register/Sachfeld** (beobachtet − vorhergesagt, mit n und Mindestanzahl z. B. ≥ 30) | E + M | Hoch | Direkte Insights-Vorlage, relativ statt absolut |
| 7 | **Richtung FR→DE vs. DE→FR** (Quote, Antwortzeit, Verlauf) | E: Richtung | Mittel | Analogon zu Weiß/Schwarz |
| 8 | **Bestandsentwicklung** (Karten nach Stabilitätsklassen über die Zeit, gestapelte Fläche) | E: Stabilität nach | Mittel | Langzeitstruktur. „Lernstand“ statt Aktivität |
| 9 | **Triage-Bilanz** (aussortiert/neu/bekannt pro Woche) | E: mode=triage | Mittel | Getrennte „Eröffnungsphase“, nicht mit Review vermischen |
| 10 | **Antwortzeit-Verteilung** (Median je Kategorie, Trend; schnell+richtig vs. langsam+richtig) | E: Antwortzeit | Mittel | Wie Zeitverbrauch/Phasen, zeigt Automatisierung |
| 11 | **Hartnäckige Wörter** (Top-N mit den meisten Fehlschlägen bzw. dem niedrigsten Stabilitätszuwachs, mit Drilldown) | E | Mittel | Entspricht „hängenden Figuren“ und Partiearchiv-Drilldown |
| 12 | **Tageszeit/Wochentag** (Quote nach Stunde und Tag) | E: Zeitstempel | Niedrig | Insights-Calendar, nützlich für die Lernplanung |
| 13 | **Fehlertypen** (Genus, Akzent, Faux ami, Präposition) | N: Fehlertyp pro Fehlversuch (oder automatischer Vergleich der Eingabe) | Niedrig | Analogon zu Tactics, erfordert neue Erfassung |
| 14 | **Jahres-/Monatsrückblick** (Zahl der Wörter, Rekorde, bestes Sachfeld, längste Serie) | E + M | Niedrig | Emotional, kostet fast nichts, da aus Rollups ableitbar |
| 15 | **Kompetenz-„Rating“ je Sachfeld** mit Abklingen (zeitgewichtete Abrufquote, Pfeil ↑/↓) | E + M | Niedrig | Nach dem Vorbild von Advanced Stats. Erst bauen, wenn Nr. 6 sich bewährt hat |

**Gestaltungsregeln aus chess.com** **[Schätzung]**: einheitliche Zeitfensterauswahl auf allen Ansichten; jede Zahl mit n; Bestwerte immer mit Datum und Beleg; kleine n ausblenden oder grau darstellen; Kategorien relativ zur Erwartung färben; Skalen so wählen, dass typische Werte nicht entmutigen; teure Auswertungen im Hintergrund, Rohdaten unveränderlich.
