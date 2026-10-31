# Entscheidungen

Grundlage: `Vokabeltrainer_Briefing_fuer_Claude_Code.md` (Stand 30.10.2026, gilt vorrangig) und
`docs/recherche/Vokabeltrainer Lernmechanik Konzept.md`. Konfidenz: [Sicher] / [Wahrscheinlich] / [Schätzung].

## Rahmen

- **Name und Repo:** App „Tous mes mots“, lokaler Ordner `~/Developer/Vokabeltrainer` (laut Briefing),
  GitHub `Wilsker-Wiesen/tous-mes-mots`, öffentlich, MIT-Lizenz wie die übrigen Portfolio-Projekte.
- **Schichten:** `src/core/` (Typen, Normalisierung, später Planer und Ereignisprotokoll) ist frei von DOM und Node
  und kann so später von einer nativen App oder einem Sync-Server genutzt werden. `src/import/` und `scripts/`
  laufen nur in Node. Die Oberfläche kommt in Schritt 2 hinzu.
- **Erstsprache Deutsch** angenommen, damit ist `de-fr` die produktive Richtung. Noch von Jan zu bestätigen.

## Schritt 1: Import (30.10.2026)

- **Keine Vokabeldaten im Repo.** Die CSV liegt außerhalb, und auch `public/data/cards.json` ist per `.gitignore`
  ausgeschlossen, weil sie denselben Inhalt hat. *Abweichung vom Briefing* („cards.json darf ins Repo“): Hier gilt
  Jans späterer Rahmen (öffentliches Repo, Urheberrecht bei Lehrwerkseinträgen ungeklärt). Folge für Schritt 5:
  Das Deployment braucht einen Weg, die Daten ohne öffentlichen Commit auszuliefern (z. B. lokal bauen und nur
  `dist/` hochladen, oder Daten per Datei-Import in die App laden). [Sicher für das Risiko, Lösung offen]
- **Tests mit eigener Beispiel-CSV** `src/import/fixtures/beispiel.csv` (zehn Zeilen, selbst formuliert, gleiche
  Kodierung: BOM, `;`, CRLF, `QUOTE_MINIMAL`). Enthält die Fälle aus Briefing Abschnitt 2: Kollision `au besoin`,
  `essuyer` in beiden Richtungen, Synonyme mit `;`, Femininendung, Klammerzusätze, nummerierte Bedeutungen.
- **Recherche:** Nur das Konzeptdokument wird eingecheckt; die Rohnotizen bleiben lokal, bis Jan sie auf Zitate
  durchgesehen hat. Ordner `quellen/` ebenfalls lokal.
- **ID genau nach Briefing:** `sha1(normalizeKey(Französisch) + "|" + Richtung)`, 12 Hex-Zeichen, Kollision
  `-2`, `-3` nach Dateireihenfolge. `normalizeKey` = NFC, Kleinschreibung, Whitespace. Bewusst **keine** weitere
  Vereinheitlichung (etwa typografischer Apostroph ’ → '), weil das Briefing die Formel festlegt. Folge: Ersetzt die
  Chat-Sitzung ' durch ’, entsteht eine neue Karte. [Sicher]
- **Karten-ID** = `<item-id>/fr-de` bzw. `<item-id>/de-fr`. Damit gehören beide Karten über das Präfix zur Zeile.
- **Bekannte Grenze der Suffixe:** Wird bei einem Duplikat die *erste* Zeile gelöscht, rückt die zweite auf die
  Basis-ID und übernimmt deren Lernzustand; die `-2`-ID verwaist. Betrifft aktuell 3 Paare, Folge harmlos
  (Bedeutungen sind ähnlich). Im Test dokumentiert. [Sicher]
- **Spalte `Quelle` wird nicht übernommen** (laut Briefing irrelevant, enthält lokale Pfade). Eine Änderung nur
  an `Quelle` zählt deshalb nicht als „geändert“.
- **Diff-Protokoll:** Vergleichsstand ist die vorhandene `cards.json`.
  - *neu*: ID nicht im alten Stand; *geändert*: gleiche ID, andere Felder (`de`, `notiz`, `sicherheit` …),
    Lernzustand bleibt; *entfernt*: ID fehlt jetzt.
  - *verwaist*: Jede entfernte ID kommt mit Datum in `cards.json → orphans`. Die App behält Lernzustand für Waisen
    und löscht ihn erst, wenn die ID dort nicht mehr steht. Nach 90 Tagen streicht der Import die Waise
    („endgültig gelöscht“). Taucht die ID wieder auf (Korrektur rückgängig), gilt der alte Zustand wieder.
  - *vermutlich korrigiert*: Für eine entfernte ID sucht der Import unter den neuen Einträgen einen Nachfolger
    (gleiche Richtung und gleiches Deutsch, sonst gleiches Lemma ohne Klammern/Akzente). Nur als Hinweis; der
    Lernzustand wird **nicht** übertragen, wie im Briefing vorgesehen. [Schätzung, ob das reicht]
  - Ausgabe auf der Konsole; `npm run import:check` ist ein Probelauf ohne Schreiben.
- **Strukturfehler brechen ab** (falsche Kopfzeile, Spaltenzahl, leeres Französisch, unbekannte Richtung); dann
  wird nichts geschrieben. Unbekannte `Sicherheit` nur als Warnung, behandelt als `eigen?`.
- **Startkarte:** DE→FR-Zeilen beginnen mit `de-fr`, FR→DE-Zeilen mit `fr-de` (Reihenfolge in `directions`).
  Expressions bekommen nur `fr-de`, auch die 53 Expressions mit Richtung DE→FR.
- **Antwortnormalisierung schon jetzt in `src/core/normalize.ts`** (Briefing verlangt Tests dafür): Akzente,
  Groß-/Kleinschreibung, Klammerzusätze, Artikel (le, la, les, l', un, une, des, du) und Platzhalter (qn, qc,
  qqch …) zählen nicht; Varianten an `;`, `1./2.`, ` / ` und Kommas, außer vor Femininendung (`effronté, -e`).
  Die Zerlegung an ` / ` akzeptiert auch Teilstücke („son jeu“ aus „abattre ses cartes / son jeu“); vertretbar,
  weil das Ergebnis nur ein Bewertungsvorschlag ist. [Wahrscheinlich]
- **Eigener CSV-Leser** (40 Zeilen, getestet) statt Bibliothek: Format ist fest und einfach.
- **Werkzeuge:** TypeScript, Vitest, tsx (Versionen siehe Abschnitt Node unten).

## Schritt 2: Minimale Abfrage (30.10.2026)

- **Ordner** heißt jetzt `~/Developer/Tous mes mots` (von Jan umbenannt); Briefing nennt noch `Vokabeltrainer`.
- **Oberfläche in Vanilla TypeScript** mit einer kleinen `h()`-Hilfsfunktion, kein Framework. Drei Ansichten:
  Start, Abfrage, Ende. Dunkelmodus folgt der Systemeinstellung. Knöpfe unten im Daumenbereich, keine Animationen.
- **Planer:** `ts-fsrs` 6.0.0 mit `version: 'FSRS-6'`, Standardparameter, gewünschte Retention 0,90, Fuzzing an,
  Lernschritte 1 min/10 min (Standard). Planer-Kennung `ts-fsrs@6.0.0 FSRS-6` steht in jedem Ereignis.
  [Wahrscheinlich, siehe Konzept, Designentscheidung 1]
- **Vier Bewertungen** nach Briefing; Knöpfe zeigen das voraussichtliche Intervall. Tasten: Leertaste/Enter
  aufdecken, 1–4 bewerten, Z oder Rückschritt = rückgängig, Esc beenden. Antippen der Karte deckt auf.
- **Nur Erkennen (`fr-de`)** in Schritt 2. Weil die zweite Richtung erst bei Stabilität der Startkarte > 7 Tage
  freigeschaltet wird, erscheinen DE→FR-Zeilen (Startkarte `de-fr`) erst mit Schritt 3. Aktuell abfragbar:
  3.240 Karten = 3.187 FR→DE-Zeilen plus 53 Expressions mit Richtung DE→FR (sie haben nur `fr-de`). [Sicher, nachgezählt]
- **Warteschlange:** fällige Lernschritte (nach Fälligkeit), dann fällige Reviews mit niedrigster
  Abrufwahrscheinlichkeit zuerst (Konzept 3.4), dann neue Karten bis zum Tageslimit (Standard 20, auf der
  Startseite in 5er-Schritten einstellbar). Höchstens 50 Karten pro Sitzung. Neue Karten in stabiler,
  gestreuter Reihenfolge (FNV-Hash der Karten-ID) statt alphabetisch, damit Formnachbarn wie
  *essorer/essuyer* nicht aufeinander folgen. [Schätzung für die Zahlen]
- **Lerntag beginnt um 4 Uhr** (wie Anki), für Tageslimit und Geschwister-Verschiebung.
- **Geschwister-Verschiebung:** Ist die andere Richtung heute schon bewertet, wartet die Karte bis morgen (Konzept 2.5).
- **In der Sitzung:** Karten, deren nächster Lernschritt in ≤ 20 Minuten fällig ist, kommen in derselben Sitzung
  wieder; ist die Hauptschlange leer, werden sie vorgezogen.
- **Rückgängig** über Ereignis `undo` (verweist auf die zurückgenommene Bewertung). Das Protokoll wird nie
  verändert; der Kartenzustand wird auf den Stand davor gesetzt.
- **Ereignis `review`** enthält: Karte, Item, Richtung, Format `flip`, Modus, Bewertung, Zeitpunkt des Zeigens,
  Zeit bis zum Aufdecken, Zeit bis zur Bewertung, Zustand davor und danach (Status, S, D, Fälligkeit),
  vorhergesagte Abrufwahrscheinlichkeit, verstrichene Tage, Sitzung, Planer, Retention, App-Version.
  Damit sind Statistik und ein späterer Wechsel zu FSRS-7 möglich (Konzept 8.4).
- **Speicher:** IndexedDB über `idb` (klein, statt Dexie): `cards` (Zustand), `events` (Protokoll), `meta`
  (Einstellungen). Zustand und Ereignis werden in einer Transaktion geschrieben.
- **Waisen beim Start:** Zustände, deren Zeile weder in `items` noch in `orphans` steht, werden gelöscht;
  Waisen bleiben gespeichert, werden aber nicht abgefragt.
- **Node (Stand 31.10.2026):** lokal Node 26.13.0 LTS aus dem offiziellen Archiv (Prüfsumme gegen nodejs.org
  geprüft) unter `~/.local/opt`, verlinkt nach `/usr/local/bin`. Homebrew baut für Intel-Macs keine fertigen Pakete
  mehr und hätte Node samt LLVM und Rust aus dem Quelltext übersetzt. Projekt auf Vite 8, Vitest 5 und
  `vite-plugin-pwa` 2 angehoben; `engines` verlangt Node ≥ 22.12, die CI nutzt Node 22. Produktions-Build läuft jetzt
  auch lokal; Offline-Betrieb mit gestopptem Server geprüft. [Sicher]
- **PWA:** `vite-plugin-pwa`, automatische Aktualisierung, alle Dateien inklusive `data/cards.json` im
  Offline-Cache. `base: './'`, damit dieselbe Ausgabe lokal und unter `/tous-mes-mots/` funktioniert.
  Symbol: eigenes SVG, PNGs mit `sips` erzeugt.

## Gestaltung (31.10.2026, nach Jans Rückmeldung)

- **Farben:** helle und dunkle Violetttöne statt Ocker; auch die Bewertungsknöpfe (Nochmal rosé, Schwer
  lavendelgrau, Gut violett, Leicht blauviolett). Geprüft wird vorrangig im hellen Modus.
- **Hauptknopf plastisch und hell** (Verlauf, violetter Rahmen, Schatten, Eindrück-Effekt) statt vollflächig
  dunkelviolett, das Jan zu kräftig war.
- **Karte als gerahmtes Feld:** Vorderseite oben, Rückseite in abgesetztem Bereich mit Überschrift „Deutsch“.
  Hauptbedeutung fett und groß, nummerierte Bedeutungen mit Ziffernmarke, Klammerkontext klein und grau,
  Wendungen „x = y“ in eigenen Kästen, Notiz als Fußzeile.
- **Karteikarte (Standardprogramm):** Die Abfrage sieht aus wie eine klassische Karteikarte: fast weißes Papier mit
  kaum sichtbarer Struktur, feine bläuliche Linierung auf beiden Seiten, zwei schräg liegende Karten als Stapel
  dahinter (Jan: „nicht so pergamentig dunkel“). Die Rückseite beginnt mit einer violetten Kopflinie (statt der
  üblichen roten), die Bedeutungen liegen im Zeilenraster (32 px, iPad 40 px) auf den Linien. Papier bleibt auch im
  Dunkelmodus hell, nur gedämpft.
- **Kopfzeile:** Schließen-Symbol, Fortschrittsbalken mit „erledigt/offen“, Rückgängig-Symbol (auf dem iPad mit
  Beschriftung). Die Tastenlegende unter den Knöpfen ist entfallen; Tasten funktionieren weiter.
- **iPad:** ab 700 px Breite größere Schrift und Abstände, Inhalt bis 820 px breit, hoch- und querformat geprüft.
- **App-Symbol „Lettern-Kacheln“** (Jans Wahl aus zehn Entwürfen): TOUS, MES, MOTS senkrecht in drei Spalten,
  jeder Buchstabe auf einem Plättchen mit Kante, die MOTS-Spalte violett mit weißer Schrift. Bewusst ohne
  SVG-Filter, damit `sips` die PNGs direkt erzeugen kann. Das T-Shirt-Symbol ist verworfen.

## Abfrage neu: Umdrehen und zwei Antworten (31.10.2026, Jans ausdrücklicher Wunsch)

*Weicht vom Briefing ab* (vier Bewertungen) und folgt dem Konzept (binär, Triage). Jans Wort geht vor.

- **Karte antippen dreht sie um** (kurze 3D-Drehung, ca. 0,25 s; bei „Bewegung reduzieren“ ohne Animation).
  Kein Aufdecken-Knopf mehr. Leertaste/Enter drehen ebenfalls.
- **Zwei Antworten:** „Wusste ich nicht“ / „Wusste ich“; auf der umgedrehten Karte auch per Wischen
  (links/rechts, ab 90 px), Tasten ← → oder 1 2. Unter jedem Knopf steht, wann die Karte wiederkommt.
- **Sortierphase:** Neue Karte gewusst → Zustand `retired`, erste Stichprobe zufällig nach 90–365 Tagen;
  bestandene Stichprobe ×2,5 (höchstens 10 Jahre), verfehlte → normale Lernkarte. Neue Karte nicht gewusst →
  FSRS „Nochmal“, kommt nach ca. 1 Minute in derselben Sitzung wieder und dann in kurzen Abständen.
  Bei Lernkarten: gewusst = FSRS „Gut“, nicht gewusst = „Nochmal“ (binär kostet laut Benchmark wenig). [Wahrscheinlich]
- **Tagesbudget nur für nicht gewusste neue Wörter** (Standard 20), damit man die 4000 Wörter zügig sortieren kann,
  ohne dass der Lernstapel explodiert. Stichproben höchstens 5 pro Tag. Sitzung 50 Karten, danach „Weiter“.
- **Zweite Richtung** wird auch freigeschaltet, wenn die Startkarte aussortiert ist.
- Ereignisse tragen jetzt `mode` = `triage` | `audit` | `review`, Bewertung 1 oder 3.

## Schritt 3: Produktionsrichtung, Filter, Tippmodus (31.10.2026)

- **Richtungswahl** auf der Startseite: FR → DE, DE → FR oder beide (gespeichert). DE → FR enthält zunächst die
  790 Zeilen mit Richtung DE→FR (ohne Expressions); die Gegenrichtung jeder anderen Zeile kommt dazu, sobald die
  Startkarte stabil (> 7 Tage) oder aussortiert ist. [Sicher, nachgezählt]
- **Vorderseite DE → FR:** alle deutschen Bedeutungen untereinander, die erste groß, damit klar ist, welche Lesart
  gemeint ist. Rückseite: französisches Lemma mit Genus und Klammerzusätzen (Genus nur hier sichtbar, Briefing 5).
- **Filter** (einklappbar, Punkt zeigt aktive Filter): Lemmasuche in beiden Sprachen (Akzente egal, Klammer-
  inhalte durchsuchbar, nur für die laufende Nutzung), „eigen?“ ausblenden, nur Wendungen.
- **Tippmodus** (Schalter, nur DE → FR): Eingabefeld mit französischer Tastaturvorgabe, Autokorrektur aus;
  Enter prüft und dreht um. Vergleich über `matchesAnswer` (Akzente, Artikel, Klammern, Platzhalter egal,
  Synonyme einzeln). Ergebnis „passt“ / „weicht ab“ markiert nur den vorgeschlagenen Knopf; Enter übernimmt den
  Vorschlag, die Entscheidung bleibt beim Nutzer (Briefing 4). Ereignis mit `format: 'typed'` und Eingabe.
- Akzentfehler gelten derzeit als „passt“ (Briefing: Akzente egal). Strenger Modus mit Fehlertypen (Konzept 2.4)
  ist vorgemerkt. [Schätzung, ob Jan das will]

## Spiele (31.10.2026)

Jan wünschte einen Modus „in kurzer Zeit möglichst viele Wörter“ und einen Sudden-Death-Modus; Gestaltung
selbst entschieden. Das Briefing schließt Gamification (Punkte, Abzeichen, Serien) aus; Spiele gibt es hier auf
Jans ausdrücklichen Wunsch, aber ohne Abzeichen oder Serien, nur mit einem nüchternen Bestwert.

- **Format Multiple Choice**, französisches Wort auf der Karteikarte, vier deutsche Antworten (erste Bedeutung).
  Ein Tipp pro Wort ist auf iPhone und iPad am schnellsten; Tippen wäre für 60 s zu langsam. Tasten 1–4.
- **60 Sekunden:** richtig +1, falsch −1 (Raten lohnt nicht, Konzept 5.2). **Sudden Death:** 5 s pro Wort,
  erster Fehler oder Zeitablauf beendet das Spiel; gezählt wird die Serie.
- **Ablenker:** gleiche grobe Wortklasse aus den CSV-Klammerzusätzen ((m), (f), adj./-e, Verb, Wendung), ähnliche
  Länge; nie ein Wort, das eine Bedeutung mit dem Ziel teilt, keine doppelten Antworttexte. Feldnachbarn,
  Formnachbarn und faux amis (Konzept 4.2) brauchen Metadaten, die die CSV noch nicht hat. [Schätzung]
- **Wortauswahl:** gesehene Wörter, sobald es mindestens 30 sind; vorher alle.
- **Kein Einfluss auf die Planung**, außer: Fehler bei einem aussortierten oder gefestigten Wort (Stabilität
  ≥ 21 Tage) zieht dessen nächste Abfrage auf morgen vor (Konzept 5.2). Jeder Zug wird als `game`-Ereignis
  protokolliert (Wort, Optionen, Wahl, Antwortzeit).
- **Ende:** Ergebnis, Bestwert, Liste der nicht gewussten Wörter mit Bedeutung.

## Schritt 4: Sicherung und Melden (31.10.2026)

- **Seite „Daten & Sicherung“** (Startseite unten; rot umrandet, wenn es Lernstand gibt und die letzte Sicherung
  älter als 7 Tage ist oder fehlt).
- **Sicherung** = eine JSON-Datei mit Kartenständen, vollständigem Protokoll, Bestwerten, Einstellungen und
  Meldungen (Format `tous-mes-mots-backup`, Version 1). Auf iPhone/iPad über das Teilen-Menü (Dateien, AirDrop,
  iCloud Drive), am Mac als Download. Nach dem Sichern fordert die App dauerhaften Speicher an
  (`navigator.storage.persist`), damit Safari die Daten nicht nach längerer Pause löscht. [Wahrscheinlich, ob
  Safari zustimmt, hängt u. a. vom Home-Bildschirm ab]
- **Einlesen führt zusammen statt zu überschreiben:** Ereignisse werden über ihre ID vereinigt (das Protokoll
  bleibt nur-anhängend), je Karte gewinnt der Stand mit der jüngsten Antwort, Bestwerte als Maximum. Vor dem
  Übernehmen zeigt die App, was sich ändert; zweimal dieselbe Datei ändert nichts. Damit lassen sich auch iPhone
  und iPad abwechselnd abgleichen, ohne Server. Einstellungen werden nicht überschrieben.
- **Prüfung beim Einlesen:** fremde, kaputte oder neuere Dateien werden mit klarer Meldung abgelehnt, nichts wird
  halb übernommen (eine Transaktion).
- **Melden:** auf der Rückseite jeder Karte („Melden“, Taste M): Grund (Bedeutung falsch, unvollständig,
  Schreibung, Sonstiges; bei `eigen?` ist „Bedeutung falsch“ vorgewählt) und freie Notiz. Gemeldete Karten zeigen
  „gemeldet“. Export als `meldungen-JJJJ-MM-TT.json` mit Französisch + Richtung (darüber findet die Chat-Sitzung
  die Zeile), Deutsch, Grund, Notiz, Zeilennummer; danach „Liste leeren“. Die App ändert die CSV nie (Briefing 6).
- **Protokoll als CSV** (Semikolon, UTF-8 mit BOM) für Numbers, Excel, R oder Python (Konzept 8.4).
- **Datenbank Version 2** mit eigenem Speicher für Meldungen; Upgrade von Version 1 behält alle Daten (getestet).

## Statistik-Kapitel (31.10.2026)

Grundlage: Recherche `docs/recherche/chesscom_statistik.md` (Vorbild chess.com). Eigener Bereich, erreichbar über
„Statistik“ auf der Startseite.

- **Keine eigene Statistik-Tabelle:** Alles wird beim Öffnen aus dem Ereignisprotokoll berechnet (`src/core/stats.ts`),
  zurückgenommene Bewertungen zählen nicht. Bei einigen zehntausend Ereignissen schnell genug; ein inkrementeller
  Schnappschuss wie bei chess.com kommt erst, wenn es spürbar langsam wird. [Wahrscheinlich]
- **Zeitfenster** 7 T / 30 T / 90 T / 1 J / Alles, jeweils mit Vergleich zum gleich langen Zeitraum davor.
- **Sechs Ansichten:** Bestand (gestapelter Balken: gewusst, gefestigt ≥ 21 T, jung, lernend, unsortiert);
  Abrufquote im Verlauf (Linie je Tag/Woche/Monat, Ziellinie, Sortierphase getrennt); Aktivität (Kalender der
  letzten 26 Wochen); Schwächen nach Kategorie (beobachtet minus FSRS-Erwartung, Wilson-Intervall im Tooltip,
  graue Werte unter 30 Abfragen, dazu „beim ersten Sehen gewusst“ je Kategorie); Kalibrierung (erwartet gegen
  gewusst, Zehntelklassen); Rekorde und Spielform (Bestwerte mit Datum, letzte 20 Läufe, Median der letzten 10).
- **Kategorien** derzeit: Richtung, Wortart (grob aus den Klammerzusätzen), Sicherheit, Format (umgedreht/getippt).
  Register, Sachfeld, Frequenz folgen, sobald die CSV diese Spalten hat.
- **Weggelassen:** Ranglisten, Perzentile, strenge Serien. Aktive Tage am Stück dulden einen freien Tag.
- **Diagramme** als eigenes SVG ohne Bibliothek, in tatsächlicher Breite gezeichnet (gleiche Schriftgröße auf
  iPhone und iPad); eine Farbe (Violett-Stufen) für Mengen, Rosé/Violett nur für unter/über Erwartung;
  Werte stehen immer auch als Zahl daneben, Tooltips per `<title>`.
- **Speicherort:** Version 1 lokal plus Datei-Sicherung (Schritt 4). Für späteren Sync steht Jans kostenloses
  Cloudflare-Konto bereit (Worker mit Durable Objects/SQLite wie in `parteigesicht/server`). [Sicher]

## Schritt 5: Deployment (31.10.2026)

Jan entschied: Cloudflare mit Passwort (statt öffentlicher GitHub Pages ohne Wortliste).

- **Cloudflare Worker mit statischen Dateien** (`wrangler.toml`, `worker/index.ts`), kostenloser Workers-Plan auf
  Jans Konto: `https://tous-mes-mots.wilsker-wiesen.workers.dev`. `run_worker_first`: jede Anfrage läuft zuerst
  durch die Passwortprüfung, auch `data/cards.json` und der Rückfragenkatalog.
- **Passwort** als Cloudflare-Secret `APP_PASSWORD`, gesetzt von Jan selbst (`npx wrangler secret put APP_PASSWORD`);
  ohne Secret antwortet der Worker mit 503 (geschlossen statt offen). Sitzungs-Cookie = HMAC aus dem Passwort,
  `HttpOnly; Secure; SameSite=Lax`, 400 Tage; ein neues Passwort meldet alle Geräte ab. Vergleich in konstanter
  Zeit, 0,8 s Verzögerung nach falschem Passwort, kein offener Redirect, `noindex`, `robots.txt` sperrt alles.
- **Ohne Anmeldung erreichbar** nur Anmeldeseite, Manifest und Symbole (für „Zum Home-Bildschirm“).
- **iPhone:** Die Home-Bildschirm-App hat unter iOS einen eigenen Cookie-Speicher; dort einmal anmelden. Danach
  startet die App auch offline aus dem Service-Worker-Cache. `/login` ist vom Navigations-Fallback ausgenommen.
- **Veröffentlichen lokal** mit `npm run deploy` (CSV importieren, Rückfragen kopieren, bauen, hochladen), weil
  Wortliste und Katalog nur auf Jans Mac liegen. Die CI baut und testet weiterhin, veröffentlicht aber nicht.
- Wrangler 4 im Projekt; die Anmeldung bei Cloudflare (OAuth) besteht bereits von parteigesicht.

## Rückfragen-Modus (31.10.2026)

Grundlage: `private/rueckfragen/README.md` und `katalog.json` der Chat-Sitzung (bleiben lokal, nie im Repo).

- **Daten:** `npm run rueckfragen` kopiert Katalog, `antworten_bisher.json` und Bilder nach
  `public/data/rueckfragen/` (gitignoriert, online hinter dem Passwort). Ohne Katalog erscheint der Bereich nicht.
- **Eine Frage pro Karte**, Gruppen `singles`, `g1`–`g7` (159 Fragen); `auto` und `skipped` nur Information.
  Originaltext (Treffer hervorgehoben, mit Umgebung und Zeilennummer) und Bild stehen immer auf der Karte;
  Bild antippen vergrößert.
- **Vorbelegt** beim ersten Öffnen mit den 16 Antworten aus `antworten_bisher.json`; danach gelten nur noch die
  in der App gespeicherten (sonst käme eine bewusst zurückgenommene Antwort wieder).
- **Startwerte** laut README: Einzelfragen mit dem Vorschlag aus `cur`, sonst nichts gewählt. Prüfung vor dem
  Speichern (z. B. „Falsch“ verlangt die richtige Fassung, bei Mehrfachbedeutungen muss eine bleiben).
- **Bedienung:** Ansicht „Offen“ (Übersprungenes ans Ende) oder „Alle“, Filter nach Gruppe, Fortschrittsbalken,
  „Speichern & weiter“, „Überspringen“, „Antwort zurücknehmen“; Tasten Enter, ←/→, 1–9. Ohne Punkte (Briefing).
- **Begag-Annotationen:** „Nicht aufnehmen“ entfernt die Antwort (README: nichts gewählt = nicht aufnehmen).
- **Export** exakt im README-Format: ein Objekt pro beantworteter Frage, Schlüssel = id, Felder
  `id, picks, removed, verdict, text, del, ts`; Datei `rueckfragen_antworten_JJJJ-MM-TT.json`.
- Antworten liegen in IndexedDB und reisen in der Sicherung mit (`questionAnswers`; beim Einlesen gewinnt die
  jüngere Antwort je Frage).

## Widersprüche Briefing ↔ Konzept (Briefing gilt)

| Punkt | Briefing | Konzept | Umsetzung |
|---|---|---|---|
| Bewertung | vier Stufen (Nochmal, Schwer, Gut, Leicht), Tasten 1–4 | binär Good/Again | **binär**, auf Jans ausdrücklichen Wunsch (31.10.2026) |
| Zweite Karte | wird freigeschaltet, wenn die erste stabil ist (z. B. S > 7 Tage) | Geschwister nur auf Folgetag verschieben | Freischaltung nach Stabilität, zusätzlich Geschwister-Verschiebung |
| Expressions | nur `fr-de` | zwei Karten pro Eintrag | nur `fr-de` |
| Spiele | „keine Gamification (Punkte, Abzeichen, Serien)“ | 60-s-Sprint mit +1/−1-Wertung und Bestwerten | 60 Sekunden und Sudden Death auf Jans Wunsch; ohne FSRS-Effekt, nur Bestwert, keine Abzeichen oder Serien |
| Metadaten | sechs Spalten, CSV wird nur von der Chat-Sitzung gepflegt | 30 Spalten nach UD/Hausmann | vorerst nur vorhandene Spalten; zusätzliche Facetten (Wortart, Register …) erst, wenn die Chat-Sitzung sie in die CSV aufnimmt oder als separate Datei liefert |
| `cards.json` | darf ins Repo | – | bleibt lokal (siehe oben, Jans Rahmen) |
