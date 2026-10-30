# „Tous mes mots“: FSRS planen, Abrufe ehrlich zählen

**Kurzfassung.** Für „Tous mes mots“ empfiehlt sich als Planer FSRS über die MIT-lizenzierte Bibliothek `ts-fsrs`: Im offenen Benchmark mit rund 10.000 Anki-Nutzern schlägt FSRS das SM-2-Verfahren, Leitner und Duolingos HLR auf allen Kennzahlen deutlich, und SM-2 schneidet sogar schlechter ab als eine konstante Durchschnittsprognose [Sicher]. Geplant wird pro Wort und Richtung (FR→DE, DE→FR) je eine eigene Karte [Wahrscheinlich]. Eingetippte Antworten und Flip-Karten mit strenger, binärer Selbstbewertung treiben den Plan; Multiple Choice dient als günstige Einstiegsstufe und zählt nur eingeschränkt, weil Wiedererkennen leichter ist als freier Abruf und Raten 25 % Treffer bringt [Wahrscheinlich]. Bekannte Wörter sortiert ein schneller Triage-Modus in einen Zustand „ausgemustert“ mit seltenen Stichproben aus; ein „Easy“ in FSRS reicht dafür nicht, weil es nach FSRS-6-Standard nur etwa 8 Tage Anfangsstabilität ergibt [Sicher]. Spiele und Feldquiz bleiben vom Plan getrennt und melden nur Fehler bei reifen Wörtern als Prüfsignal zurück [Wahrscheinlich]. Fundament von allem ist ein unveränderliches Ereignisprotokoll jeder Abfrage, aus dem sich Kartenzustände, FSRS-Neuoptimierung, Facettenstatistiken (z. B. Schwächen nach Wortart) und Verwechslungsanalysen jederzeit neu berechnen lassen [Wahrscheinlich]. Wichtigste Unsicherheiten: FSRS-7 ist erst seit wenigen Monaten verfügbar und nur vom Entwicklerteam selbst gebenchmarkt, mehrere Primärquellen (Anki-Handbuch online, SuperMemo, lexique.org, UCLouvain, Bjork-Lab) waren in der Recherche nicht erreichbar, und fast alle lernpsychologischen Befunde stammen von Anfängern; für Experten wie den Zielnutzer fehlen Studien.

**Legende.** [Sicher] = harte Evidenz aus abgerufener Primär- oder Fachquelle. [Wahrscheinlich] = starke Schlussfolgerung aus Evidenz. [Schätzung] = Lückenschluss, Designvorschlag ohne direkte Evidenz. **Umstritten** und **Nicht verifiziert** werden ausdrücklich markiert.

---

## 0 Quellenlage

- Nicht erreichbar waren unter anderem docs.ankiweb.net, forums.ankiweb.net, aclanthology.org (teilweise), supermemo.com/supermemo.guru, lexique.org, cental.uclouvain.be, kaikki.org, research.duolingo.com, ncbi.nlm.nih.gov (teilweise), bjorklab.psych.ucla.edu und resolve.cambridge.org. Das Anki-Handbuch wurde stattdessen aus seinem GitHub-Quelltext gelesen [Sicher].
- Viele lernpsychologische Befunde beruhen auf Abstracts oder Sekundärzusammenfassungen; einzelne Zahlen (etwa Rowlands Moderatoren) sind deshalb vor dem Zitieren zu prüfen [Sicher].
- Benchmark- und Bibliotheksangaben wurden direkt aus GitHub-Repositorien und der npm-Registry gelesen (Stand 28./29.10.2026) und sind entsprechend belastbar [Sicher].

---

## 1 FSRS schlägt SM-2, Leitner und HLR auf 350 Millionen Reviews

### 1.1 Benchmarkbefund

Der offene `srs-benchmark` wertet 9.999 Anki-Sammlungen mit 349.923.850 Reviews aus (ohne Wiederholungen am selben Tag); trainiert wird auf älteren, getestet auf neueren Reviews ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher]. Ausgewählte Werte (niedriger ist besser bei Log Loss und RMSE(bins), höher bei AUC):

| Verfahren | Parameter | Log Loss | RMSE(bins) | AUC | Quelle |
|---|---|---|---|---|---|
| FSRS-7 (Recency-Gewichtung) | 34 | 0,3370 | 0,0593 | 0,7220 | aktuelles README |
| FSRS-6 | 21 | 0,3460 | 0,0653 | 0,7034 | aktuelles README |
| FSRS-7 Standardparameter | 0 | 0,3620 | 0,0910 | 0,7029 | aktuelles README |
| Konstante Durchschnittsprognose (AVG) | 0 | 0,3945 | 0,1034 | 0,4997 | aktuelles README |
| HLR (Duolingo) | 3 | 0,4694 | 0,1275 | 0,6369 | aktuelles README |
| Anki-SM-2 (Standard) | 0 | 0,616 | 0,1724 | 0,6133 | README-Stand Mai 2025 |
| SM-2 (Original) | 0 | 0,722 | 0,2031 | 0,6026 | README-Stand Mai 2025 |

Quellen: [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark); [srs-benchmark, Stand 2e1a76a5](https://github.com/open-spaced-repetition/srs-benchmark/blob/2e1a76a5d66d5e245a68d0140b9c80a0965016e2/README.md).

- **SM-2** liegt unter der konstanten Baseline [Sicher]. Einschränkung: SM-2 liefert keine Abrufwahrscheinlichkeit; der Benchmark muss eine Vergessenskurve anhängen, deren Methode nicht dokumentiert ist. Ein Teil des schlechten Werts geht vermutlich auf diese Abbildung zurück [Wahrscheinlich]. Dazu kommt das bekannte „Ease Hell“ von SM-2, bei dem wiederholte Fehler den Leichtigkeitsfaktor dauerhaft drücken ([Anki-Handbuch, deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher].
- **HLR** verbesserte bei Duolingo den mittleren absoluten Fehler gegenüber Leitner um mindestens 45 % auf 12,9 Mio. Lernspuren; die A/B-Tests maßen allerdings nur Engagement ([Settles & Meeder 2016](https://github.com/duolingo/halflife-regression/blob/master/settles.acl16.pdf)) [Sicher]. Der Vorteil beruht auf nutzerübergreifenden Lexem-Merkmalen, die eine Ein-Nutzer-App nicht hat; als Einzelnutzer-Modell liegt HLR unter AVG [Wahrscheinlich].
- **Leitner** ist ein Spezialfall von HLR mit festen Kästen ([Settles & Meeder 2016](https://github.com/duolingo/halflife-regression/blob/master/settles.acl16.pdf)) [Sicher]. Ein reiner Leitner-Baseline ist im srs-benchmark nicht enthalten [Sicher]. Als Planer ungeeignet, als anschauliche Visualisierung (Kästen 1-5 als Stabilitätsstufen) brauchbar [Schätzung].
- **SuperMemo**: Im kleinen Vergleich (19 Sammlungen) schlug FSRS-6 SM-17 in 83,3 % der Sammlungen beim Log Loss ([fsrs-vs-sm17](https://github.com/open-spaced-repetition/fsrs-vs-sm17)) [Sicher]. Für SM-18 bis SM-20 gibt es keinen öffentlichen Benchmark; ein „SM-20 (2026)“ ist **nicht verifiziert**.
- Nur neuronale Modelle (GRU, LSTM, RWKV) schlagen FSRS-7; RWKV nutzt nutzer- und kartenübergreifende Merkmale, die eine Ein-Nutzer-App nicht reproduzieren kann ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher].
- **Umstritten bzw. eingeschränkt:** Alle FSRS-7-Zahlen stammen vom Entwicklerteam selbst; eine unabhängige Prüfung fehlt [Sicher]. Die Werbeaussage „20-30 % weniger Reviews als SM-2“ beruht laut eigener Notiz auf Simulation ([ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)) [Sicher].

### 1.2 FSRS-Versionen

FSRS modelliert Schwierigkeit D (1-10), Stabilität S (Tage, bis die Abrufwahrscheinlichkeit von 100 % auf 90 % fällt) und Abrufbarkeit R; Intervalle werden so gewählt, dass R auf die gewünschte Retention fällt (Standard 0,90) ([ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS); [The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)) [Sicher].

| Version | Parameter | Neuerung |
|---|---|---|
| v4 | 17 | Grundmodell, Potenz-Vergessenskurve |
| 4.5 | 17 | steilere Kurve vor S, flachere danach |
| 5 | 19 | Formel für Wiederholungen am selben Tag, exponentielle Anfangsschwierigkeit |
| 6 | 21 | trainierbarer Kurvenexponent (nutzerindividuelle Kurvenform), abnehmender Gewinn bei Wiederholungen am selben Tag |
| 7 (2026) | 34 | gebrochene Intervalle, zweispuriges Gedächtnis (`stabilityFast`), Kurve mit 8 Parametern |

Quellen: [The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm); [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark); [ts-fsrs CHANGELOG](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/CHANGELOG.md) [Sicher].

- FSRS-7 ist laut Benchmark „die einzige Version“, die für Wiederholungen am selben Tag realistische Wahrscheinlichkeiten liefert; mit solchen Reviews fällt FSRS-6 unter die AVG-Baseline ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher].
- Eine vollständige Formelspezifikation von FSRS-7 wurde nicht gefunden; das Wiki deckt nur bis FSRS-6 ab [Sicher].
- Anki selbst nutzt Stand 29.10.2026 noch FSRS-6 (fsrs-rs 6.6.2 ohne FSRS-7-Bezug im Anki-Scheduler) ([anki Cargo.toml](https://github.com/ankitects/anki/blob/main/Cargo.toml)) [Sicher]. Ein Forenthread vom Juni 2026 bestätigt das laut Suchausschnitt; **nicht verifiziert**, Forum unerreichbar ([Anki-Forum](https://forums.ankiweb.net/t/when-will-anki-integrate-fsrs-7/69997)).

### 1.3 Personalisierung und Datenbedarf

- Optimierung lohnt messbar: FSRS-7 mit Standardparametern 0,3620 Log Loss, optimiert 0,3370 ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher].
- fsrs-rs gibt unter 8 Trainingseinheiten die Standardwerte zurück und passt bei FSRS-6 unter 64 nur die Anfangsstabilitäten an; FSRS-7 trainiert ohne Vortraining direkt ab den Standardwerten ([fsrs-rs training.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/training.rs)) [Sicher]. Das sind Code-Schwellen, keine Empfehlungen.
- Anki-Handbuch: unter „einigen hundert“ Reviews zu wenig Daten; monatliches Optimieren genügt ([deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher].
- Ein Parametersatz pro Nutzer: Parameter pro Deck schnitten schlechter ab (0,3489 gegenüber 0,3401) ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher].
- Gewünschte Retention ist der zentrale Lastregler; oberhalb 90 % steigt die Last schnell, oberhalb 97 % wird sie „überwältigend“ ([deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher]. Eine veröffentlichte numerische Last-Retention-Kurve fehlt [Sicher].
- Lernschritte unter einem Tag; mehrfaches Wiederholen am selben Tag trägt laut Handbuch wenig zum Langzeitgedächtnis bei ([deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher].

### 1.4 Bibliotheken für eine reine Client-App

| Paket | Lizenz | Stand | Rolle |
|---|---|---|---|
| `ts-fsrs` 6.0.0 | MIT (Abhängigkeit `srs-kit`: BSD-3) | npm 28.10.2026 | Planer FSRS-3 bis FSRS-7, Standard FSRS-7, `version: 'FSRS-6'` wählbar |
| `@open-spaced-repetition/binding` (WASM/WASI) 0.6.0 | MIT | 28.10.2026 | Optimierer im Browser, Web Worker nötig |
| `fsrs-browser` 6.6.0 | BSD-3 | 13.06.2026 | älterer Optimierer im Browser |
| `fsrs-rs` 6.6.2 | BSD-3 | 28.10.2026 | Rust-Referenz (Anki) |

Quellen: [npm ts-fsrs](https://registry.npmjs.org/ts-fsrs); [ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs); [binding README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md); [fsrs-browser](https://github.com/open-spaced-repetition/fsrs-browser); [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) [Sicher].

- `ts-fsrs` bietet `preview`, `review`, `rollback`, `forget`, `retrievability`, Middleware für gewünschte Retention (auch pro Note), Fuzzing, Höchstintervalle, Lernschritte (Standard 1 min, 10 min), Leech-Sperre und `Reschedule` zum Nachspielen der Historie; das Paket ist tree-shakeable ([ts-fsrs README](https://github.com/open-spaced-repetition/ts-fsrs)) [Sicher].
- Der WASI-Optimierer empfiehlt Cross-Origin-Isolation (COOP/COEP-Header) ([binding README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md)) [Sicher]. GitHub Pages setzt keine eigenen Header; ein Service-Worker-Workaround ist **nicht verifiziert** [Wahrscheinlich]. `fsrs-browser` trainierte laut Autor 24.394 Reviews in 3,5 s ([fsrs-browser](https://github.com/open-spaced-repetition/fsrs-browser)) [Sicher].
- Bundle-Größen (minifiziert, gzip) wurden nicht gemessen; npm-Entpackgrößen (861 KB bzw. 1,58 MB) sagen darüber wenig [Sicher].
- Für den Modellwechsel muss die FSRS-7-Gedächtnisrepräsentation laut Migrationshinweisen aus der vollständigen Review-Historie neu aufgebaut werden; das macht ein lückenloses Protokoll ab Tag eins zur Pflicht [Wahrscheinlich].

---

## 2 Abrufformate: Recall treibt den Plan, Multiple Choice stützt ihn

### 2.1 Evidenz zum Testing-Effekt

- Abruf schlägt Wiederlesen mit etwa g ≈ 0,50 (Rowland 2014, 159 Effektgrößen); Feedback, längere Verzögerung und Recall-Formate verstärken den Effekt ([Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf)) [Sicher für die Richtung; Moderatorenzahlen nur aus Sekundärquellen, **nicht verifiziert**].
- **Umstritten:** Rowland findet Recall-Übungen wirksamer als Wiedererkennen; Adesope et al. (2017, 118 Studien inkl. Unterricht) finden Multiple Choice nicht schwächer und gemischte Formate am wirksamsten ([Adesope et al. 2017](https://journals.sagepub.com/doi/10.3102/0034654316689306); [Learning Scientists](https://www.learningscientists.org/blog/2017/2/9-1)) [Sicher, dass sich die Metaanalysen widersprechen].
- Wer bereits gewusste Wörter weiter abfragt, behält deutlich mehr: rund 80 % gegenüber 33-36 %, wenn gewusste Items aus dem Test fielen ([Karpicke & Roediger 2008](https://www.brucehayes.org/Teaching/papers/2008_Roediger_Karpicke_Science.pdf)) [Sicher]. Ein einziges „gewusst“ darf eine Karte also nie endgültig erledigen [Wahrscheinlich].
- Nakata: Eintippen in der produktiven Richtung trainiert Orthografie besonders; für die bloße Form-Bedeutungs-Verknüpfung sind Wiedererkennensformate effizienter; rund fünf Abrufe pro Sitzung wirkten besser als ein bis drei ([LINGUIST List](https://linguistlist.org/issues/24/3797); [Nakata 2017, SSLA](https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E)) [Sicher, auf Abstract-Ebene].
- Fast alle Studien nutzen Anfänger und unbekannte Wörter; die Übertragung auf einen Experten mit teils bekanntem Wortschatz ist offen [Sicher].

### 2.2 Flip-Karte mit Selbstbewertung

- Verdeckter Abruf (Antwort denken, dann aufdecken) wirkt bei einfachen Items etwa so gut wie offener ([Smith et al. 2013, via Frontiers](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01018/pdf)) [Wahrscheinlich]. Eine Metaanalyse von 2025 (18 Studien, N = 2.560) findet einen kleinen Vorteil des offenen Abrufs, g = 0,17, erklärt durch vorzeitig abgebrochene Suche ([Educational Psychology Review 2025](https://link.springer.com/article/10.1007/s10648-025-10040-4)) [Sicher].
- Hauptrisiko ist Selbstüberschätzung: Sie führt dazu, dass Items zu früh aus der Übung fallen ([Dunlosky & Rawson 2012, via Koriat](https://newiipdm.haifa.ac.il/wp-content/uploads/2015/05/2012-Koriat-LI.pdf); [Kornell & Bjork 2008](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Kornell_Bjork_2008_Memory.pdf)) [Wahrscheinlich; Kornell & Bjork nur über Abstract].
- Binäre Bewertung kostet in FSRS wenig: FSRS-6 „binär“ (Hard/Easy als Good) 0,3508 Log Loss gegenüber 0,3455 bei vier Stufen ([srs-benchmark, Stand 2e1a76a5](https://github.com/open-spaced-repetition/srs-benchmark/blob/2e1a76a5d66d5e245a68d0140b9c80a0965016e2/README.md)) [Sicher].
- Einzige harte Regel: Vergessenes muss als „Again“ zählen. Wer bei Nichtwissen „Hard“ drückt, bläht alle Intervalle auf ([deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher].
- Für Ehrlichkeit: Aufdecken erst nach kurzer Denkpause (1-2 s), Zielwort mit Genus und Schreibung anzeigen, strenge Definition „wusste ich = genaue Form, Genus und Schreibung“ [Schätzung]. Ein dritter Knopf „teilweise“ (Bedeutung richtig, Form falsch) wäre für einen Experten häufig nützlich; er wird intern als „Again“ mit Fehlertyp oder als „Hard“ verbucht [Schätzung].

### 2.3 Multiple Choice mit vier Optionen

- Multiple Choice erzeugt einen echten Testing-Effekt, pflanzt aber Ablenker als falsches Wissen ein; mehr Ablenker verstärken das ([Roediger & Marsh 2005](https://scholars.duke.edu/publication/677292)) [Sicher]. Der Nutzen überwiegt insgesamt die Kosten ([Marsh et al. 2007, via PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4094137)) [Wahrscheinlich].
- Sofortiges wie verzögertes Feedback steigert richtige Antworten und reduziert Ablenker-Übernahmen ([Butler & Roediger 2008](https://pubmed.ncbi.nlm.nih.gov/18491500/)) [Sicher].
- Psychometrisch sind drei gute Optionen so gut wie vier oder fünf, weil vierte und fünfte Ablenker selten funktionieren ([Rodriguez 2005, via BMC Med Educ](https://pmc.ncbi.nlm.nih.gov/articles/PMC3004925)) [Sicher]. Vier Optionen lohnen nur mit drei plausiblen Ablenkern (Ratequote 25 % statt 33 %) [Wahrscheinlich].
- Weder FSRS noch `ts-fsrs` kennt Gewichte pro Review ([ts-fsrs CHANGELOG](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/CHANGELOG.md)) [Sicher]. Die Behandlung von MC-Ergebnissen ist deshalb eine eigene Designentscheidung (siehe 2.6) [Sicher].
- Studien zur Ablenker-Übernahme speziell beim L2-Wortschatz fehlen [Sicher].

### 2.4 Eintippen

- Produktiver Abruf durch Tippen trainiert Schreibung, Akzente und Genus; für den Zielnutzer ist das das diagnostischste Format [Wahrscheinlich, gestützt auf [Nakata/LINGUIST List](https://linguistlist.org/issues/24/3797)].
- Toleranzregeln und Fehlertypen (Akzent, Artikel/Genus, Orthografie, falsches Lemma, Auslassung) lassen sich per Diff halbautomatisch bestimmen [Schätzung]. Bewertung: falsches Lemma oder Auslassung = „Again“; Akzent- oder Genusfehler bei richtigem Lemma = „Again“ im strengen Modus, „Hard“ im milden Modus, Fehlertyp immer protokolliert [Schätzung].

### 2.5 Richtungen getrennt planen

- Übung wirkt vor allem in der geübten Richtung; Transfer in die Gegenrichtung ist partiell ([Webb, Dissertation](https://ir.wgtn.ac.nz/handle/123456789/23701); [PMC12649351](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12649351/)) [Wahrscheinlich].
- Produktives Lernen (Muttersprache → Fremdsprache) gilt als langfristig wirksamer (Schneider, Healy & Bourne 2002); **nur sekundär zitiert** ([Emelyanova](https://espeap.junis.ni.ac.rs/index.php/espeap/article/download/1287/632)).
- Anki behandelt beide Richtungen als eigene Karten und verschiebt die Geschwisterkarte auf den nächsten Tag; Karten in der Lernphase werden nicht verschoben ([studying.md](https://github.com/ankitects/anki-manual/blob/main/src/studying.md); [deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Sicher].
- Studien zur Interferenz zwischen Geschwisterkarten fehlen; dass das beste Benchmarkmodell (RWKV) Geschwisterinformation nutzt, spricht für ein echtes Signal [Wahrscheinlich].
- Welche Richtung produktiv ist, hängt von der Erstsprache ab. Bei deutscher Erstsprache des Nutzers ist DE→FR produktiv; das ist in der App einzustellen [Schätzung zur Erstsprache].

### 2.6 Abbildung der Formate auf FSRS-Noten

| Format | Ergebnis | FSRS-Note | Begründung |
|---|---|---|---|
| Flip-Karte | wusste ich / wusste ich nicht | Good / Again | binär kostet wenig [Sicher] |
| Eintippen | korrekt / Formfehler / falsch | Good / Hard oder Again / Again | Hard ist ein Bestehen [Sicher]; Zuordnung des Formfehlers [Schätzung] |
| Multiple Choice | falsch | Again | Fehler sind aussagekräftig [Wahrscheinlich] |
| Multiple Choice | richtig | Good nur bei junger Karte (S < 21 Tage), sonst kein Planeffekt | Wiedererkennen und Raten überschätzen Wissen [Schätzung] |
| Spiel, Feldquiz außerhalb Fälligkeit | beliebig | kein Review, nur Prüfsignal bei Fehlern | siehe Abschnitte 5 und 6 [Wahrscheinlich] |

„Easy“ aus schnellen Antworten abzuleiten ist riskant, weil FSRS Easy als starkes Signal behandelt [Wahrscheinlich].

### 2.7 Antwortzeit als Nebensignal

- Latenz spiegelt die momentane Abrufschwierigkeit und misst dauerhafte Speicherstärke nur unzuverlässig ([PMC4480221](https://pmc.ncbi.nlm.nih.gov/articles/PMC4480221); [APS 2017](https://www.psychologicalscience.org/conventions/archive/2017annual/paper/6198/)) [Wahrscheinlich]. FSRS nutzt keine Antwortzeit ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)) [Sicher].
- Latenz protokollieren, relativ zum eigenen Median je Format und Richtung normieren, langsam-korrekt höchstens als „Hard“ werten [Schätzung]. Eine geprüfte latenzbasierte Intervallanpassung existiert nicht [Sicher].

---

## 3 Bekannte Wörter in ein bis zwei Sekunden aussortieren

### 3.1 Befunde

- „Easy“ beim ersten Sehen ergibt in FSRS-6 standardmäßig rund 8,3 Tage Anfangsstabilität (FSRS-5: 15,7) ([The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)) [Sicher]. Bekannte Wörter kämen damit binnen Wochen wieder [Wahrscheinlich].
- Anki bietet „Aussetzen“ und „Fälligkeit setzen“ mit Zufallsbereich (z. B. `60-90`), um Wiederkehrwellen zu verteilen ([browsing.md](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/browsing.md)) [Sicher]. LingQ trennt „Known“ (aus der Wiederholung) von „Learned“ (weiter in der Wiederholung) ([LingQ Support](https://lingq-support.groovehq.com/help/understanding-lingq-statistics)) [Sicher].
- Lingvists frequenzbasierte Einstufung soll schwach korrelieren; **nur sekundär belegt** ([alllanguageresources](https://www.alllanguageresources.com/?p=4275)).
- Ja/Nein-Checklisten (Meara) sind schnell; Korrekturformeln gegen Überschätzung (h−f, cfg, Δm, I_SDT) haben alle bekannte Schwächen ([JALT SRB 16(2)](https://teval.jalt.org/sites/default/files/SRB-16-2-Full.pdf); [Beeckmans et al.](https://difusion.ulb.ac.be/vufind/Record/ULB-DIPOT:oai:dipot.ulb.ac.be:2013/243818/TOC)) [Sicher].
- IRT-Einstufung (Duolingo English Test) schätzt eine Fähigkeit, keine Einzelwortentscheidungen ([Settles et al. 2020](https://aclweb.org/anthology/2020.tacl-1.17.pdf)) [Wahrscheinlich].

### 3.2 Folgerungen für den Experten

- Pseudowörter sind beim Experten sinnlos; das reale Risiko ist die Überschätzung der **deutschen Entsprechung oder genauen Bedeutung**. Ersatz für die Fehlalarmprüfung sind Stichproben-Audits [Wahrscheinlich].
- Triage in der Abfragerichtung bewerten, die später geübt wird [Wahrscheinlich].
- Frequenz nur zum Ordnen der Triage nutzen (seltene Wörter zuerst sind informativer), nie zum stillen Ausmustern [Wahrscheinlich]. Polysemie und faux amis machen Massen-Ausmusterung riskant [Wahrscheinlich].

### 3.3 Vorgeschlagener Triage-Modus [Schätzung, nicht empirisch validiert]

1. Eine Karte pro Bildschirm, französisches Lemma mit Wortart und Genus; Tasten/Wischen: → bekannt, ← unbekannt, ↓ unsicher; Rückgängig-Taste; Blöcke à 50.
2. **Bekannt** → Zustand `retired`, Audit zufällig in 90-365 Tagen; höchstens etwa 5 Audits pro Tag; bestandenes Audit verlängert den Abstand um das Zwei- bis Dreifache, verfehltes macht eine normale Lernkarte daraus.
3. Sofortkalibrierung: etwa jede zehnte „bekannt“-Antwort deckt die deutsche Seite auf oder fragt das Genus ab; Fehlerquote über etwa 10 % → Hinweis, langsamer zu triagieren.
4. Langsames „bekannt“ (über etwa 3 s) → „unsicher“.
5. **Unsicher** → normale Lernwarteschlange; **unbekannt** → Lernwarteschlange mit hoher Priorität.
6. Massenaktion „Rest dieses Frequenzbands/Tags als bekannt“ nur nach einer Serie bekannter Antworten und immer mit Audits.

### 3.4 Fokus auf schwache Wörter

- Rückstau nach Abrufbarkeit R sortieren (niedrigstes R zuerst), Tagesgrenzen für neue Wörter und Reviews setzen, keine Massen-Umplanung ([deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)) [Wahrscheinlich].
- Leech-Erkennung über **jüngste** Fehler; Ankis Lebenszeit-Zählung (Standard 8 Fehler) wird dafür kritisiert ([Memorex-Doku](https://hexdocs.pm/memorex/anki-deck-settings.html); [HN](https://news.ycombinator.com/item?id=22387727)) [Wahrscheinlich]. **Umstritten:** ob Ankis Standardaktion „Aussetzen“ oder „nur markieren“ ist.
- Eigener Modus „Schwache Wörter“: hohe FSRS-Schwierigkeit D, Leeches, Verwechslungspaare; außerhalb der Fälligkeit als Übung ohne Planeffekt [Schätzung].

---

## 4 Ablenker: gleiche Wortart, gleiches Frequenzband, keine Synonyme

### 4.1 Befunde

- Der Vocabulary Size Test (Nation & Beglar) nutzt Ablenker gleicher Wortart und meist aus demselben 1000er-Frequenzband ([VST-Spezifikation](https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-tests/the-vocabulary-size-test/Vocabulary-Size-Test-information-and-specifications.pdf)) [Sicher].
- Syntagmatisch verwandte Ablenker machen Items am schwersten, paradigmatische mittel, unverwandte am leichtesten ([Language Testing in Asia](https://link.springer.com/doi/10.1186/2229-0443-3-16)) [Sicher].
- Konkurrierende, plausible Ablenker lösen Abruf von Wissen über die falschen Optionen aus und verbessern späteren Abruf verwandter Inhalte ([Little & Bjork 2014](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf)) [Wahrscheinlich; Host gesperrt, nur Suchausschnitt]. Sie erhöhen zugleich das Risiko der Ablenker-Übernahme ([Roediger & Marsh 2005](https://scholars.duke.edu/publication/677292)) [Sicher]. Feedback löst diesen Zielkonflikt [Wahrscheinlich].
- Automatische Generierung kombiniert Embedding-Ähnlichkeit, Frequenz, Schreibähnlichkeit und Kookkurrenz ([Susanti et al. 2018](https://link.springer.com/10.1186/s41039-018-0082-z); [ESPOL-Review zu Jiang & Lee](https://rte.espol.edu.ec/index.php/tecnologica/en/article/view/1161); [PeerJ-Review 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11623049/)) [Sicher]. Hauptfehler: Synonyme landen als „falsche“ Option [Wahrscheinlich].

### 4.2 Rezept für FR↔DE [Schätzung, Extrapolation]

1. **Harte Filter:** gleiche Wortart; bei Nomen gleiches Genus (der Artikel verrät sonst die Lösung); ähnliche Länge, ähnliches Frequenzband, möglichst gleiches Register.
2. **Ausschlussfilter:** jede Übersetzung oder jedes Synonym des Zielworts aus der eigenen Liste entfernen.
3. **Mischung der drei Plätze:** ein Nachbar aus dem semantischen Feld (Kohyponym, kein Synonym), ein Formnachbar (Paronym: *poisson/poison*, *conjecture/conjoncture*; Levenshtein ≤ 2), ein faux ami, sofern vorhanden (*brave* / brav), sonst ein plausibles, klar verschiedenes Wort.
4. **Schwierigkeit staffeln:** leichtere Ablenker für neue Karten, Paronyme und faux amis für reife.
5. **Feedback:** bei falscher Wahl die Bedeutung des gewählten Ablenkers zeigen; Paar als Verwechslungspaar protokollieren.

Empirische Studien zu französischen Paronymen oder FR-DE-faux-amis als Ablenker fehlen [Sicher].

---

## 5 Spiele bleiben ein eigener Bereich ohne Einfluss auf Intervalle

### 5.1 Befunde

- Tempo ist eine reale Dimension lexikalischen Wissens („lexical facility“ = Umfang + Geschwindigkeit) ([Harrington-Vortrag](https://www.kansai-u.ac.jp/fl/0628%E5%A4%96%E5%9B%BD%E8%AA%9E%E6%95%99%E8%82%B2%E5%AD%A6%E7%A0%94%E7%A9%B6%E7%A7%91%20%E5%AD%A6%E8%A1%93%E8%AC%9B%E6%BC%94%E4%BC%9A.pdf)) [Wahrscheinlich]. Dass Zeitdruck selbst neue Wörter lehrt, ist schwach belegt [Sicher].
- **Umstritten:** ob der Variationskoeffizient der Reaktionszeiten Automatisierung misst ([Segalowitz & Segalowitz 1993](https://cambridge.org/core/journals/applied-psycholinguistics/article/assessing-the-development-of-automaticity-in-second-language-word-recognition/58465581E3C8C24144D881FD8F1ACD52) dafür, [Hulstijn et al. 2009](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/automatization-in-second-language-acquisition-what-does-the-coefficient-of-variation-tell-us/554D00B8D979BD1CFF17774087D14326) dagegen).
- Gamification-Reviews: überwiegend positive, oft kurzlebige Effekte; Wettbewerb kann schaden ([Zhang & Hasim 2023](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.1030790/full)) [Sicher]. Effektgrößen für Wortschatz wurden nicht ermittelt [Sicher].
- Anki-Filterdecks planen standardmäßig um, lassen sich aber auf Vorschau ohne Planeffekt schalten ([filtered-decks.md](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/filtered-decks.md)) [Sicher].
- Zusätzliche Abrufe am selben Tag würden als Reviews die Stabilität verzerren; FSRS-6 dämpft sie nur ([The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)) [Wahrscheinlich].
- Ob Quizlet Match oder Memrise-Speed-Review den Plan beeinflussen, ist **nicht verifiziert**.

### 5.2 Gestaltung [Schätzung, außer markiert]

- Spiele als Flüssigkeitstraining für bekannte, reife Wörter (Nations Fluency-Strand; Primärtext **nicht abgerufen**) [Wahrscheinlich].
- Kein FSRS-Review aus Spielen [Wahrscheinlich]. Einzige Rückmeldung: Fehler bei reifer oder ausgemusterter Karte → nächste Fälligkeit bzw. Audit auf morgen ziehen, ohne Lapse. Richtige Antworten bleiben ohne Wirkung.
- Eigenes Protokoll `game_event` (Item, Modus, korrekt, Latenz), getrennt vom Review-Protokoll.
- Wertung bei Wahr/Falsch-Sprints +1/−1, damit Raten nicht gewinnt; persönliche Bestwerte statt Serien- oder Wettbewerbsdruck.
- Formate nach Abrufart priorisieren (Eintippen > MC > Wahr/Falsch): 60-Sekunden-Sprint DE→FR getippt, MC-Sprint mit Feld-Ablenkern, Genus-Sprint *le/la* (für einen Muttersprachler eher bei seltenen oder epizönen Nomen sinnvoll), faux-amis-Unterscheidung. Vergleichsstudien zwischen Spielformaten fehlen [Sicher].
- Spielauswahl aus schwachen oder kürzlich verfehlten Karten plus Zufallsstichprobe ausgemusterter Karten.

---

## 6 Semantische Felder: gemischt planen, Felder gezielt kontrastieren

### 6.1 Befunde

- Neue Wörter in engen semantischen Sets zu lernen erzeugt Interferenz und Verwechslungsfehler ([Finkbeiner & Nicol 2003](https://researchers.mq.edu.au/en/publications/semantic-category-effects-in-second-language-word-learning/); [Erten & Tekin 2008](https://acikerisim.comu.edu.tr/items/7a90a159-d648-49ff-aabb-94a7b47c4a5e/full); [Tinkham 1997, via TPLS](https://tpls.academypublication.com/index.php/tpls/article/view/9073)) [Wahrscheinlich, Abstract-Ebene].
- Nakata & Suzuki (2019): kein signifikanter Unterschied im Nachtest, aber mehr Interferenzfehler bei verwandten Wörtern; Abstände halfen unverwandten Wörtern stärker ([Semantic Scholar](https://www.semanticscholar.org/paper/EFFECTS-OF-MASSING-AND-SPACING-ON-THE-LEARNING-OF-Nakata-Suzuki/104e3d0a627265c079c28c52c713bad875ac35cd)) [Sicher].
- Kontext in Geschichten mildert die Interferenz weitgehend ([Bolger & Zapata 2011](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-9922.2010.00624.x)) [Sicher].
- Reihenfolge für Neulernen: thematisch (Szene „au café“) ≥ unverwandt > semantisch ([TPLS](https://tpls.academypublication.com/index.php/tpls/article/view/9073)) [Wahrscheinlich]. **Umstritten:** Hippner-Page (2000) und Liu (2003) fanden keinen Unterschied ([AIJCR](https://www.aijcrnet.com/journals/Vol_2_No_2_February_2012/26.pdf)).
- Interleaving hilft über diskriminativen Kontrast ([Birnbaum et al. 2013](https://link.springer.com/article/10.3758/s13421-012-0272-7)); Lernende halten Blocken trotzdem für wirksamer ([Kang, UNH](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-interleaved-training-and-category-learning-kang.pdf)) [Sicher]. **Umstritten:** eine Reanalyse mit Forced Choice stellt die Robustheit in Frage ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13380076/)).
- Die Schlüsselstudie zum Einfluss des Sprachniveaus (Papathanasiou 2009) und Studien zur Wiederholung bekannter Wörter durch Fortgeschrittene wurden **nicht gefunden bzw. nicht verifiziert**.

### 6.2 Gestaltung [Schätzung]

- Zwei getrennte Gruppierungsachsen: `sachgebiet` (semantisches Feld, Hyponymie) und `szene` (thematische Situation).
- Standard-Warteschlange über Felder gemischt.
- Feldquiz als Wahlmodus für bekannte bzw. reife Wörter (Kontrasttraining *poire/pomme/prune*). Fällige Karten zählen dort als normale Reviews; nicht fällige als Übung ohne Planeffekt, Fehler nur als Prüfsignal.
- Neue Nahsynonyme desselben Felds nicht am selben Tag einführen.
- Verwechslungsprotokoll: Antwortet der Nutzer mit einem anderen Feldmitglied, wird das Paar gespeichert und später als Kontrastpaar angeboten.
- Feldvorschläge halbautomatisch aus WOLF (Hyperonyme, CeCILL-C) und JeuxDeMots (thematische Relationen, Lizenz **nicht verifiziert**), Bestätigung per Tastendruck ([INRIA WOLF](https://almanach.inria.fr/software_and_resources/WOLF-fr.html); [LinuxFr 2008](https://linuxfr.org/news/jeuxdemots-un-jeu-en-ligne-pour-produire-des-donnees-lexicales)).

---

## 7 Metadaten: 30 Spalten nach UD und Hausmann, mehrwertig erweiterbar

### 7.1 Grundlagen

- Morphosyntax nach Universal Dependencies: 17 Wortarten (UPOS), `Gender`, `Number`, `VerbForm` u. a. ([UD Features](https://universaldependencies.org/docs/u/feat/index.html); [UFAL-Folien](https://ufal.mff.cuni.cz/~zabokrtsky/courses/npfl124/www/slides/dz01-morpho.pdf)) [Sicher].
- Diasystematische Markierung nach Hausmann (diaphasisch, diastratisch, diatopisch, diachron, diatechnisch); diamedial (gesprochen/geschrieben) ergänzt Landau ([Lexis PUCP](https://revistas.pucp.edu.pe/index.php/lexis/article/download/5363/5361); [Lexikos](https://lexikos.journals.ac.za/pub/article/view/1306/813)) [Sicher]. Lernerwörterbücher kombinieren mehrere Marken pro Eintrag, also mehrwertige Felder ([GEMA](https://ejournal.ukm.my/gema/article/view/6553)) [Wahrscheinlich].
- Register hängt an der einzelnen Bedeutung (*caisse* ist nur als „Auto“ familiär) [Wahrscheinlich].

### 7.2 Spaltenschema [Wahrscheinlich als Struktur, Einzelwerte Schätzung]

Mehrwertige Felder mit `|` getrennt, kontrollierte Codes.

| Gruppe | Spalten |
|---|---|
| Identität | `id` (stabil, nie neu vergeben), `fr`, `de` [M], `lemma_fr`, `upos`, `mwe_typ` (keine/Kompositum/Kollokation/Funktionsverbgefüge/Idiom/Routineformel), `ipa`, `nb_syll` |
| Nomen | `genus` (m/f/épicène/bedeutungsabhängig wie *le/la livre*), `genus_kontrast_de` (FR-Genus ≠ DE-Genus, z. B. *la mer*/das Meer), `plural_irreg` |
| Verb | `verbgruppe` (1er/2e/3e + Unterklasse), `auxiliar` (avoir/être/beide), `pronominal`, `rektion` (*téléphoner à qn* / jdn anrufen) |
| Diasystematik [M] | `register` (soutenu, littéraire, courant, familier, populaire, très familier, argot, vulgaire, verlan), `diastratisch`, `diatopisch` (Belgique, Suisse, Québec …), `diachron` (vieilli, néologisme), `diamedial` (oral/écrit), `domaine`, `konnotation` (péjoratif, ironique) |
| Semantik | `sachgebiet` [M], `szene` [M], `polysemie_n`, `faux_ami` (keiner/total/partiell) + `faux_ami_note`, `wortfamilie` |
| Frequenz und Niveau | `freq_films`, `freq_livres` (pro Million, Lexique lemmabasiert), `zipf` (log10(pro Million) + 3), `freq_band`, `cefr` |
| Pflege | `status` je Feld (auto/auto-unsicher/geprüft/manuell), `geprüft_am`, `anmerkung`, `tags` [M] (Lektion, Kurs) |

- In der App normalisiert als `item_tag(item_id, facet, value, source, confidence, verified, gültig_ab)`; neue Facetten brauchen so keine Schemaänderung [Wahrscheinlich].
- Die Zipf-Formel stammt aus van Heuven et al. 2014; **nicht abgerufen**.
- Die Beispiele zu faux amis stammen aus Expertenwissen der Notizen und sind zu prüfen.

### 7.3 Automatische Vorbefüllung

| Ressource | Liefert | Lizenz | Status |
|---|---|---|---|
| Lexique 3.83 | Wortart, Genus, Numerus, Silben, Frequenz Film/Buch, Verbinfo, Morphologie (~140.000 Wörter) | CC BY-SA 4.0 | laut pylexique; lexique.org **nicht abgerufen** |
| GLÀFF | Form, Lemma, Morphosyntax, IPA (aus Wiktionnaire) | CC BY-SA 3.0 | [Sicher] |
| Wiktextract/kaikki | IPA, Genus, Registermarken pro Bedeutung (en.wiktionary) | **nicht verifiziert** | Host unerreichbar |
| FLELex | GER-Niveau A1-C2, 14.236 bzw. 17.871 Lemmata | CC BY-NC 3.0 US | [Sicher]; Download unerreichbar |
| Morphalou | Flexionsformen (~60.940 Nomen) | nach Lizenzannahme frei; Version 3 **unklar** | |
| WOLF | Synsets, Hyperonyme | CeCILL-C | [Sicher] |
| spaCy `fr_core_news_sm` | POS 96,18 % im Kontext | MIT (Annahme) | Genauigkeit [Sicher] |

Quellen: [pylexique](https://pylexique.readthedocs.io/en/latest/readme.html); [OSF-Wiki](https://osf.io/479um/wiki); [GLÀFF ACL L14-1469](https://aclanthology.org/L14-1469/); [kaikki](https://kaikki.org/dictionary/French/meaning/f/fo/fon.html); [FLELex ACL L14-1083](https://aclanthology.org/L14-1083/); [UCLouvain OER](https://oer.uclouvain.be/jspui/handle/20.500.12279/582); [ORTOLANG Morphalou](https://repository.ortolang.fr/api/content/morphalou/1/documentation.pdf); [INRIA WOLF](https://almanach.inria.fr/software_and_resources/WOLF-fr.html); [HF spaCy](https://huggingface.co/spacy/fr_core_news_sm).

- Reihenfolge: exakter Lookup in Lexique (Homographen mit allen Kandidaten und Status „auto-unsicher“), dann GLÀFF/Wiktextract für IPA und Register, spaCy nur für Mehrwortausdrücke; bei isolierten Lemmata schlägt Lexikon-Lookup den Tagger [Wahrscheinlich].
- Register, faux amis und Bedeutungszuordnung brauchen manuelle Prüfung [Wahrscheinlich]. Eine freie, maschinenlesbare FR-DE-faux-amis-Liste wurde nicht gefunden [Sicher].
- Deutsche Seite (Genus für `genus_kontrast_de`): de.wiktionary per Wiktextract; DWDS-Lizenz **nicht geprüft** [Schätzung].

---

## 8 Statistik braucht ein unveränderliches Ereignisprotokoll

### 8.1 Was nützt, was blendet

- Anki zeigt echte Retention nach Zeitraum und Reife („mature“ = Intervall ≥ 21 Tage) und warnt vor verrauschten Tageswerten; mit FSRS soll echte Retention nahe der gewünschten liegen ([Anki Manual: Statistics](https://docs.ankiweb.net/manual/stats); Seite **nicht direkt abgerufen**, Angaben über Suchergebnisse) [Wahrscheinlich].
- Streaks verleiten dazu, die Kennzahl zu optimieren; wer ihn verliert, bricht häufiger ab (Sekundärquelle zu einer JCR-Studie, **Original nicht geprüft**) ([The Decision Lab](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification)).
- Dashboard-Forschung ist überwiegend explorativ, kontrollierte Wirkungsnachweise fehlen ([Bodily & Verbert 2017](https://lirias.kuleuven.be/retrieve/467439); [Schwendimann et al. 2017](https://infoscience.epfl.ch/record/220672)) [Sicher].
- Clozemaster-Nutzer vermissen Statistiken auf Wortebene ([Clozemaster-Forum](https://forum.clozemaster.com/t/unique-cloze-words-statistics-that-would-be-especially-useful-to-me/13191)) [Sicher].
- Handlungsleitend: Retention je Facette, Lastprognose, Leech-Liste, Verteilung von S und D, Frequenzband-Abdeckung, Kalibrierung. Vanity: Streak-Länge, Punkte, „Wörter gesehen“, Review-Summen, „% gemeistert“ ohne Retentionsbezug [Wahrscheinlich].

### 8.2 Analyseansichten (priorisiert) [Schätzung als Katalog]

1. **Retention je Facette** bei fälligen Reviews, getrennt nach jung/reif: Zeilen `upos`, `register`, `sachgebiet`, `freq_band`, `cefr`, `genus`, `genus_kontrast_de`, `faux_ami`, `mwe_typ`, `verbgruppe`, `auxiliar`, Richtung, Format; Spalten n Reviews, n Items, Retention, 95-%-Wilson-Intervall, Abweichung vom Gesamtwert.
2. **Adjustierte Schwächen:** beobachtet minus FSRS-erwartetes R je Facette, oder logistisches Modell `korrekt ~ facette + zipf + richtung + format + log(intervall)`. Damit wird „Adverbien schwach“ von „Adverbien selten“ getrennt.
3. **Leech-Liste** je Facette mit Übungsknopf.
4. **Verwechslungspaare** aus MC-Fehlwahlen und Tippfehlern (Genus, Paronym, faux ami, Synonym).
5. **Fehlertypologie beim Tippen** (Akzent, Artikel, Orthografie, Lemma, Auslassung).
6. **Latenzverteilung** je Facette (Median/IQR, Ausreißer über 60 s kappen).
7. **Kalibrierungsplot:** beobachtete Trefferquote über verstrichener Zeit gegen FSRS-Vorhersage.
8. **Lastprognose** 30 Tage.
9. **Abdeckung** der 1.000/2.000/5.000 häufigsten Lemmata der eigenen Liste (R ≥ 0,9 oder S ≥ 21 Tage), auch textgewichtet; gilt nur für die eigene Liste.
10. **Aktive Tage der letzten 30** statt Streak; Kalender-Heatmap.
11. **Fortschritt je GER-Niveau.**

### 8.3 Statistische Fallstricke [Wahrscheinlich]

- Kleine n: Werte erst ab etwa 30 Reviews bzw. 10 Items zeigen, sonst ausgrauen; Shrinkage (Beta-Binomial) zum Gesamtmittel.
- Konfundierung (Simpson-Paradox): Frequenz, Länge, Polysemie und Kartenalter korrelieren mit Wortart und Register; stratifizieren oder adjustieren.
- Selektionseffekt: Der Planer hält Retention nahe am Ziel, Facettenunterschiede werden gedämpft; Lapses pro Item, D und S je Facette sind aussagekräftiger.
- Abhängige Beobachtungen (viele Reviews je Item) auf Item-Ebene aggregieren.
- Mehrfachvergleiche über rund 15 Facetten: nur deutliche, stabile Abweichungen hervorheben.
- MC und Tippen nie roh vergleichen.

### 8.4 Datenmodell [Wahrscheinlich]

- `item(id, fr, de, …Metadaten…, schema_version)`
- `item_tag(item_id, facet, value, source, confidence, verified_by, verified_at, gültig_ab)`
- `card(id, item_id, direction, state[new|learning|review|retired], fsrs_state, audit_due)`
- `review_event(id, card_id, item_id, direction, format, ts_shown, ts_answered, latency_ms, rating, correct, typed_answer, error_type, options_shown[], chosen_option_item_id, R_pred, S_before, D_before, elapsed_days, session_id, mode[review|triage|audit|feldquiz], scheduler_version, app_version)`
- `game_event(id, item_id, card_id, game_mode, correct, latency_ms, ts, session_id)`
- `triage_event(id, item_id, direction, decision, latency_ms, audit_shown, audit_result, ts)`

Grundsätze: nur anhängen, nie ändern; Kartenzustand ist aus dem Protokoll ableitbar (`Reschedule` in ts-fsrs), umgekehrt nicht; Metadaten per `item_id` joinen und versionieren; Export als JSON (vollständige Sicherung) und CSV (Analyse in R/Python) ([Anki-Forum: Retrievability im Log](https://forums.ankiweb.net/t/store-retrievability-in-review-logs/65374.md); [ankiR](https://cran.r-universe.dev/ankiR/doc/manual.pdf)). Ein normierter Standard (xAPI/Caliper) wurde nicht recherchiert [Sicher].

---

## 9 Führende Apps: Anki setzt den Maßstab, andere optimieren Engagement

| App | Stärke | Schwäche | Evidenz |
|---|---|---|---|
| Anki | FSRS mit Retentionsregler, Tagesgrenzen, Geschwister-Verschiebung, Leeches, offener Export, solide Statistiken | Einrichtungsaufwand, Rückstau nach Pausen, Leech-Zählung über Lebenszeit | Handbuch (GitHub) [Sicher]; Kritik aus Blogs/HN [Wahrscheinlich] |
| Quizlet | adaptiver Lernmodus innerhalb der Sitzung | keine echte Langzeitplanung, begrenzter Export | Sekundärvergleiche [Wahrscheinlich] |
| Duolingo | HLR, Engagementmechaniken | Streaks belohnen Aktivität vor Behalten | Paper [Sicher]; Streak-Effekt sekundär |
| Clozemaster | Satzkontext | feste Intervalle 1/10/30/180 Tage (sekundär, **nicht verifiziert**), Fortschritt pro Satz statt Wort | Forum [Sicher] |
| LingQ | Trennung „Known“/„Learned“ | | Support-Doku [Sicher] |
| Lingvist | frequenzbasierte Kurse | schwache Einstufung (sekundär) | [Schätzung] |
| RemNote, Mochi | SRS in Notizen; Markdown-Export (Mochi) | Algorithmus bei Mochi **umstritten** (FSRS oder SM-2) | Sekundärquellen |

Quellen: [deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md); [study-genius 2026](https://study-genius-ai.hatolabs.com/blog/anki-vs-quizlet-vs-remnote-vs-mochi-2026); [jormemo 2026](https://jormemo.com/blog/best-spaced-repetition-apps); [prismo](https://prismo-app.com/best-spaced-repetition-apps/); [my-senpai](https://my-senpai.com/insights/why-people-quit-anki.html); [LingQ Support](https://lingq-support.groovehq.com/help/understanding-lingq-statistics).

- Gemeinsame Fehlermuster: Rückstau, Ease Hell, Leeches, zu lange Sitzungen, Gamification gegen Behalten [Wahrscheinlich].
- Formulierungsleitlinien: Matuschak („How to write good prompts“) und Gwerns Literaturübersicht sprechen für kurze, eindeutige Prompts mit einer Bedeutung pro Karte ([Matuschak](https://notes.andymatuschak.org/z2ySBuuMjHwuewNBi65YmXD); [Gwern](https://gwern.net/anti-spaced-repetition)) [Wahrscheinlich]. Wozniaks „Twenty rules“ (u. a. „Combat interference“) waren **nicht abrufbar**.
- Nicht recherchiert bzw. **nicht verifiziert**: Ankis Load Balancer und „Easy Days“, WaniKani-Stufen, Memrise heute, SuperMemo SM-18 ff.

---

## Schlussfolgerung

Der Planer ist mit FSRS praktisch gelöst; die eigentliche Schwierigkeit liegt beim Messen, denn FSRS ist nur so gut wie die Noten, die er erhält. Für einen Experten, der vieles kennt, entscheiden drei Weichen über die Qualität: ehrliche, strenge Selbstbewertung; die Trennung von Abrufen, die zählen (fällige Recall-Reviews), und solchen, die nur üben (Spiele, Feldquiz, MC bei reifen Karten); und ein Ausmusterungsweg, der bekannte Wörter wirklich fernhält und doch stichprobenartig prüft [Wahrscheinlich].

Das Ereignisprotokoll ist zugleich Versicherung und Forschungsinstrument. Es erlaubt, später auf FSRS-7 oder einen optimierten Parametersatz umzusteigen, ohne Daten zu verlieren, und es macht die App für einen Sprachwissenschaftler zu einem eigenen Korpus: Verwechslungspaare, Genusfehler, Schwächen nach Register oder faux-ami-Status sind Befunde, die keine der führenden Apps in dieser Form liefert [Schätzung].

---

## Designentscheidungen für Version 1

1. **Planer: `ts-fsrs` 6.x mit `version: 'FSRS-6'`, Standardparameter.** FSRS-6 ist ausgereift, formal dokumentiert und in Anki erprobt; FSRS-7 erschien in `ts-fsrs` erst am 28.10.2026 und ist nur vom eigenen Team gebenchmarkt. Wechsel zu FSRS-7 nach etwa drei Monaten prüfen; das Protokoll macht ihn verlustfrei möglich. Gegenargument: FSRS-7 schneidet schon mit Standardparametern besser ab. [Wahrscheinlich]
2. **Gewünschte Retention 0,90 als einziger sichtbarer Regler** (Bereich 0,80-0,95), mit einfacher Lastanzeige. [Sicher für Standard und Lastanstieg]
3. **Keine Optimierung in V1;** ab einigen hundert bis etwa 1.000 Reviews Optimierer (WASM im Web Worker oder `fsrs-browser`) in V1.x, monatlich, ein Parametersatz pro Nutzer. [Wahrscheinlich]
4. **Zwei Karten pro Eintrag (FR→DE, DE→FR), Geschwister bis zum Folgetag verschieben;** produktive Richtung startet einige Tage nach der rezeptiven. Erstsprache in den Einstellungen festlegen. [Wahrscheinlich]
5. **Flip-Karte binär „wusste ich / wusste ich nicht“ → Good/Again,** Aufdecken nach kurzer Denkpause, Lösung mit Genus und Schreibung, strenge Definition auf dem Bildschirm. [Wahrscheinlich]
6. **Eintippen als bevorzugtes Recall-Format für die produktive Richtung,** automatische Fehlertypisierung; Lemma falsch = Again, Formfehler je nach Modus Again oder Hard. [Schätzung]
7. **Multiple Choice mit vier Optionen in beiden Richtungen als Einstiegs- und Wechselformat:** Fehler = Again, Treffer = Good nur bei junger Karte (S < 21 Tage), danach ohne Planeffekt; immer Feedback mit Bedeutung des gewählten Ablenkers. [Schätzung]
8. **Ablenker nach festem Rezept:** gleiche Wortart, gleiches Genus bei Nomen, ähnliches Frequenzband; Synonym-/Übersetzungsfilter gegen die eigene Liste; ein Feldnachbar, ein Formnachbar, ein faux ami falls vorhanden; schwerer mit wachsender Reife. [Wahrscheinlich für Filter, Schätzung für Mischung]
9. **Triage-Modus mit drei Ausgängen und Zustand `retired`,** Audits zufällig in 90-365 Tagen, höchstens 5 pro Tag, Sofortkalibrierung bei jeder zehnten Antwort, langsames „bekannt“ wird „unsicher“. [Schätzung]
10. **Fokus auf Schwache:** Rückstau nach niedrigstem R, Tagesgrenzen für neue Wörter und Reviews, Leech-Kriterium über jüngste Fehler (z. B. 4 Fehler in den letzten 10 Reviews), eigener Übungsmodus „Schwache Wörter“. [Schätzung für Schwelle]
11. **Spiele (60-Sekunden-Sprint getippt und MC, Genus-Sprint) als eigener Bereich ohne FSRS-Reviews;** Fehler bei reifen oder ausgemusterten Karten ziehen die Fälligkeit auf morgen; +1/−1-Wertung; persönliche Bestwerte statt Streak. [Wahrscheinlich]
12. **Semantische Felder:** Standardwarteschlange gemischt; Feldquiz als Wahlmodus (fällige Karten zählen, übrige nur Übung); keine neuen Nahsynonyme desselben Felds am selben Tag; Verwechslungspaare protokollieren. [Wahrscheinlich]
13. **CSV-Schema nach Abschnitt 7.2,** stabile `id`, mehrwertige Felder mit `|`, Status je Feld; intern normalisiert als `item_tag`. Vorbefüllung aus Lexique 3.83 und GLÀFF, FLELex nur privat. [Wahrscheinlich]
14. **Ereignisprotokoll ab Tag eins** (`review_event`, `triage_event`, `game_event`), nur anhängen, Zeitstempel sekundengenau, Format, Richtung, Latenz, Optionen, gewählter Ablenker, R/S/D vor dem Review, Scheduler-Version. Speicherung in IndexedDB, Export und Import als JSON, Analyseexport als CSV. [Wahrscheinlich]
15. **Statistik V1:** Retention je Facette mit Wilson-Intervall und Mindest-n, Abweichung von FSRS-Erwartung, Leech- und Verwechslungsliste, Lastprognose, Frequenzband-Abdeckung, aktive Tage. Keine Punkte, Ligen oder Streak-Zähler. [Wahrscheinlich]

---

## Offene Punkte / zu prüfen

**Lizenzen**
- Lexique 3.83: CC BY-SA 4.0 nur über pylexique bestätigt; Lizenzseite auf lexique.org prüfen. Share-alike greift bei Weitergabe der CSV.
- FLELex: CC BY-NC 3.0 US; bei kommerzieller Nutzung oder Veröffentlichung mit UCLouvain klären.
- GLÀFF: CC BY-SA 3.0, Namensnennung festhalten.
- Wiktextract/kaikki und Wiktionary-Daten: Lizenz (vermutlich CC BY-SA/GFDL) nicht bestätigt; prüfen, ob eine fr.wiktionary-Extraktion verfügbar ist.
- JeuxDeMots: CC BY-SA 2.0 nur aus einer Quelle von 2008.
- Morphalou 3.x, DWDS-API: Lizenz offen.
- WOLF: CeCILL-C bestätigt; Aktualität (Stand etwa 2014) beachten.
- `srs-kit` (BSD-3) als Abhängigkeit von `ts-fsrs` in die Lizenzhinweise aufnehmen.

**Nicht verifizierte Quellen und Befunde**
- Anki-Handbuch online (docs.ankiweb.net), u. a. Statistikseite, Load Balancer, Easy Days, Leech-Standards (8 Fehler; Standardaktion umstritten).
- Rowland 2014: Moderatorenzahlen nur sekundär.
- Little & Bjork 2014, Kornell & Bjork 2008: Bjork-Lab-Host gesperrt, nur Abstracts.
- Schneider, Healy & Bourne 2002; Griffin & Harley 1996; Papathanasiou 2009; Tinkham 1993; Waring 1997: nicht oder nur sekundär gefunden.
- Cepeda et al. 2006/2008, Dunlosky et al. 2013, Pyc & Rawson 2009: nicht abgerufen, vorerst nicht zitieren.
- Wozniaks „Twenty rules“, SuperMemo SM-18 bis SM-20: supermemo.com gesperrt.
- Clozemaster-Intervalle, Memrise-/Quizlet-Planverhalten, Lingvist-Einstufung, Mochi-Algorithmus.
- FSRS-7: keine unabhängige Prüfung, keine vollständige Formelspezifikation; Integration in Anki offen.
- JCR-Studie zu Streaks nur über The Decision Lab.

**Technisch zu messen**
- Bundle-Größe von `ts-fsrs` 6 (nur FSRS-6-Modell) und des WASM-Optimierers.
- Ob `binding-wasm32-wasip1` ohne COOP/COEP läuft; Hosting-Plan entsprechend wählen.
- Umrechnung SM-2/Leitner-Intervall in Wahrscheinlichkeit im Benchmark.

**Fachlich zu klären**
- Erstsprache des Nutzers und damit die produktive Richtung.
- Strenger oder milder Modus für Akzent- und Genusfehler.
- Ob ein dritter Bewertungsknopf „teilweise“ die Kalibrierung verbessert; dazu existiert keine Studie.

---

## Quellen

**Algorithmen, Benchmarks, Bibliotheken**
- srs-benchmark: https://github.com/open-spaced-repetition/srs-benchmark
- srs-benchmark, README-Stand Mai 2025 (2e1a76a5): https://github.com/open-spaced-repetition/srs-benchmark/blob/2e1a76a5d66d5e245a68d0140b9c80a0965016e2/README.md
- srs-benchmark, README-Stand Nov. 2024 (ceb7d340): https://github.com/open-spaced-repetition/srs-benchmark/blob/ceb7d34018ad842d56862ac6bb90eb1030c0b498/README.md
- The Metric (fsrs4anki-Wiki): https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Metric
- ABC of FSRS: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS
- The Algorithm (awesome-fsrs-Wiki): https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- Spaced Repetition Algorithm: A Three-Day Journey: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/Spaced-Repetition-Algorithm:-A-Three%E2%80%90Day-Journey-from-Novice-to-Expert
- Research resources (awesome-fsrs-Wiki): https://github.com/open-spaced-repetition/awesome-fsrs/wiki/Research-resources
- awesome-fsrs: https://github.com/open-spaced-repetition/awesome-fsrs
- fsrs-vs-sm17: https://github.com/open-spaced-repetition/fsrs-vs-sm17
- ts-fsrs (GitHub): https://github.com/open-spaced-repetition/ts-fsrs
- ts-fsrs CHANGELOG: https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/CHANGELOG.md
- ts-fsrs (npm): https://registry.npmjs.org/ts-fsrs
- srs-kit: https://github.com/open-spaced-repetition/ts-fsrs/tree/main/packages/srs-kit
- binding README: https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md
- binding-wasm32-wasi (npm): https://registry.npmjs.org/@open-spaced-repetition%2Fbinding-wasm32-wasi
- fsrs-browser: https://github.com/open-spaced-repetition/fsrs-browser
- fsrs-browser (npm): https://registry.npmjs.org/fsrs-browser
- fsrs-rs: https://github.com/open-spaced-repetition/fsrs-rs
- fsrs-rs training.rs: https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/training.rs
- fsrs-rs cost_adr.rs: https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/cost_adr.rs
- fsrs4anki-helper: https://github.com/open-spaced-repetition/fsrs4anki-helper
- Anki Cargo.toml: https://github.com/ankitects/anki/blob/main/Cargo.toml
- Anki-Handbuch deck-options.md: https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md
- Anki-Handbuch studying.md: https://github.com/ankitects/anki-manual/blob/main/src/studying.md
- Anki-Handbuch browsing.md: https://raw.githubusercontent.com/ankitects/anki-manual/main/src/browsing.md
- Anki-Handbuch filtered-decks.md: https://raw.githubusercontent.com/ankitects/anki-manual/main/src/filtered-decks.md
- Anki Manual: Statistics: https://docs.ankiweb.net/manual/stats
- Anki-Forum, FSRS-7-Integration: https://forums.ankiweb.net/t/when-will-anki-integrate-fsrs-7/69997
- Anki-Forum, Retrievability im Log: https://forums.ankiweb.net/t/store-retrievability-in-review-logs/65374.md
- Anki-Forum, Retention vs. gewünschte Retention: https://forums.ankiweb.net/t/anki-retention-rate-not-matching-desired-retention/69356
- Anki-Forum, CMRR: https://forums.ankiweb.net/t/about-minimum-recommended-retention-cmrr/54501
- Anki-Forum, FSRS erreicht Retention nicht: https://forums.ankiweb.net/t/fsrs-not-achieving-desired-retention-after-2-months/60504
- Anki-Forum, Leech-Erkennung: https://forums.ankiweb.net/t/automated-leech-detection/56887.md
- Settles & Meeder 2016 (HLR): https://github.com/duolingo/halflife-regression/blob/master/settles.acl16.pdf ; DOI https://doi.org/10.18653/v1/P16-1174
- halflife-regression README: https://github.com/duolingo/halflife-regression
- Ye, Su & Cao 2022 (SSP-MMC): https://doi.org/10.1145/3534678.3539081 ; https://github.com/maimemo/SSP-MMC
- Su et al. 2023 (TKDE): https://doi.org/10.1109/TKDE.2023.3251721
- Upadhyay et al. 2021: https://doi.org/10.1038/s41539-021-00105-8
- Pavlik & Anderson 2005: https://doi.org/10.1207/s15516709cog0000_14

**Abrufformate, Multiple Choice, Ablenker, Latenz**
- Rowland 2014: https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf
- studycardsai (Sekundärquelle): https://studycardsai.com/blog/active-recall-statistics
- Adesope et al. 2017: https://journals.sagepub.com/doi/10.3102/0034654316689306 ; https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/
- Learning Scientists Blog: https://www.learningscientists.org/blog/2017/2/9-1
- Karpicke & Roediger 2008: https://www.brucehayes.org/Teaching/papers/2008_Roediger_Karpicke_Science.pdf ; https://www.purdue.edu/uns/x/2008a/080214KarpickeTest.html
- Soderstrom et al.: https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/11/soderstorm_kerr.pdf
- Nakata 2017 (SSLA): https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E
- Nakata, Dissertation (LINGUIST List): https://linguistlist.org/issues/24/3797
- Nakata (IRAL): https://www.degruyterbrill.com/document/doi/10.1515/iral-2015-0022/html?lang=en
- Frontiers 2017 (zu Smith et al. 2013): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01018/pdf
- Tauber et al. 2018: https://profiles.wustl.edu/en/publications/does-covert-retrieval-benefit-learning-of-key-term-definitions/
- Metaanalyse verdeckter/offener Abruf 2025: https://link.springer.com/article/10.1007/s10648-025-10040-4
- Kornell & Bjork 2008: https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Kornell_Bjork_2008_Memory.pdf
- Kornell & Bjork 2007: https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/Kornell_RBjork_2007.pdf
- Koriat 2012 (zu Dunlosky & Rawson 2012): https://newiipdm.haifa.ac.il/wp-content/uploads/2015/05/2012-Koriat-LI.pdf
- Metacognition & Learning 2016: https://link.springer.com/article/10.1007%2Fs11409-016-9159-5
- Webb, Dissertation: https://ir.wgtn.ac.nz/handle/123456789/23701 ; https://openaccess.wgtn.ac.nz/articles/thesis/Investigating_the_Effects_of_Learning_Tasks_on_Vocabulary_Knowledge/16945963
- Webb 2005 (SSLA): https://cambridge.org/core/journals/studies-in-second-language-acquisition/article/receptive-and-productive-vocabulary-learning-the-effects-of-reading-and-writing-on-word-knowledge/DDF362AE7B13D1949B1CD591DA2F3414
- Emelyanova (zu Schneider et al. 2002): https://espeap.junis.ni.ac.rs/index.php/espeap/article/download/1287/632
- CU Boulder (Schneider et al.): https://experts.colorado.edu/display/pubid_52638
- Transfer in Learning New Vocabulary: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12649351/
- Roediger & Marsh 2005: https://scholars.duke.edu/publication/677292 ; https://profiles.wustl.edu/en/publications/the-positive-and-negative-consequences-of-multiple-choice-testing/
- Review zu Marsh et al. 2007: https://pmc.ncbi.nlm.nih.gov/articles/PMC4094137
- Butler & Roediger 2008: https://pubmed.ncbi.nlm.nih.gov/18491500/
- Butler, Karpicke & Roediger 2007: https://profiles.wustl.edu/en/publications/the-effect-of-type-and-timing-of-feedback-on-learning-from-multip/
- Little & Bjork 2014: https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf
- Rodriguez 2005 (über BMC Med Educ): https://pmc.ncbi.nlm.nih.gov/articles/PMC3004925 ; https://boris.unibe.ch/2246/1/1472-6920-10-85.pdf
- Vocabulary Size Test, Spezifikation: https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-tests/the-vocabulary-size-test/Vocabulary-Size-Test-information-and-specifications.pdf
- Kremmel & Schmitt (VLT): https://www.norbertschmitt.co.uk/_files/ugd/5f2482_b8772b41a50141508cc0c3bc4716f057.pdf
- Schmitt, Schmitt & Clapham 2001: https://journals.sagepub.com/doi/10.1177/026553220101800103
- Ablenker-Verwandtschaft (Language Testing in Asia): https://link.springer.com/doi/10.1186/2229-0443-3-16
- Susanti et al. 2018: https://link.springer.com/10.1186/s41039-018-0082-z ; https://rptel.apsce.net/index.php/RPTEL/article/view/2018-13015
- ESPOL-Review (Jiang & Lee): https://rte.espol.edu.ec/index.php/tecnologica/en/article/view/1161
- PeerJ-Review automatische Ablenkergenerierung 2024: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11623049/
- APS 2017 (Latenz): https://www.psychologicalscience.org/conventions/archive/2017annual/paper/6198/
- WUSTL-Thesis (Latenz): https://openscholarship.wustl.edu/etd/1147
- U. Montana (Latenzverteilungen): https://umimpact.umt.edu/en/publications/item-repetition-and-retrieval-processes-in-cued-recall-analysis-o/
- Bjork-Rahmen (PMC4480221): https://pmc.ncbi.nlm.nih.gov/articles/PMC4480221
- SuperMemo Guru, Fluency-Mythos: https://supermemo.guru/wiki/Myth:_High_fluency_reflects_high_memory_strength
- SuperMemo Guru, Two components of memory: https://supermemo.guru/wiki/Two_components_of_memory

**Triage, Frequenz, Spiele**
- LingQ Statistik: https://lingq-support.groovehq.com/help/understanding-lingq-statistics
- LingQ Known Words: https://lingq-support.groovehq.com/help/how-do-i-increase-my-known-words
- Lingvist-Folien (nicht abgerufen): https://www.slideshare.net/slideshow/lingvist-statistical-methods-in-language-learning/72735203
- alllanguageresources (Lingvist): https://www.alllanguageresources.com/?p=4275
- Settles, LaFlair & Hagiwara 2020: https://aclweb.org/anthology/2020.tacl-1.17.pdf
- McCarthy et al. 2021: https://aclweb.org/anthology/2021.emnlp-main.67.pdf
- JALT SRB 16(2): https://teval.jalt.org/sites/default/files/SRB-16-2-Full.pdf
- Notion-Zusammenfassung Δm (sekundär): https://sixth-count-113.notion.site/_-9e7f354f9cd64bca9174b14ac55b4f1a
- Shillaw 1996: https://www.lognostics.co.uk/vlibrary/shillaw1996.doc
- Meara 1991: https://lognostics.co.uk/vlibrary/meara1991.doc
- Beeckmans et al. 2001: https://difusion.ulb.ac.be/vufind/Record/ULB-DIPOT:oai:dipot.ulb.ac.be:2013/243818/TOC
- Language Testing (Spiegel): https://https-sage-cnpereading-com-443.webvpn1.xju.edu.cn/doi/10.1177/0265532211433033
- Tanabe (Reading in a Foreign Language): https://scholarspace.manoa.hawaii.edu/bitstream/10125/66717/1/28_1_10125_66717_tanabe.pdf
- Harrington-Vortrag: https://www.kansai-u.ac.jp/fl/0628%E5%A4%96%E5%9B%BD%E8%AA%9E%E6%95%99%E8%82%B2%E5%AD%A6%E7%A0%94%E7%A9%B6%E7%A7%91%20%E5%AD%A6%E8%A1%93%E8%AC%9B%E6%BC%94%E4%BC%9A.pdf
- Segalowitz & Segalowitz 1993: https://cambridge.org/core/journals/applied-psycholinguistics/article/assessing-the-development-of-automaticity-in-second-language-word-recognition/58465581E3C8C24144D881FD8F1ACD52
- Hulstijn et al. 2009: https://www.cambridge.org/core/journals/applied-psycholinguistics/article/automatization-in-second-language-acquisition-what-does-the-coefficient-of-variation-tell-us/554D00B8D979BD1CFF17774087D14326
- J Psycholinguistic Research 2024: https://link.springer.com/article/10.1007/s10936-024-10099-0
- ISELT (4/3/2): https://iselt.journals.umz.ac.ir/article_6115_a74342f1d9a4fc0038137af632c65621.pdf
- J. of Language Studies (Tikrit): https://jls.tu.edu.iq/index.php/JLS/article/download/1089/1023/2499
- MSU-Dissertation: https://d.lib.msu.edu/etd/48649
- PMC4232218: https://pmc.ncbi.nlm.nih.gov/articles/PMC4232218
- Zhang & Hasim 2023: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.1030790/full ; https://eprints.um.edu.my/38887
- Dehghanzadeh & Dehghanzadeh 2020: https://elt.tabrizu.ac.ir/article_10676.html
- Gamified Tools FLL (PMC10135444): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10135444/
- Mobile/Gamification (PMC8157183): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8157183/

**Semantische Felder, App-Vergleich, UX**
- Tinkham (IDEALS): https://ideals.illinois.edu/items/19069
- TPLS 2024: https://tpls.academypublication.com/index.php/tpls/article/view/9073 ; https://tpls.academypublication.com/index.php/tpls/article/download/9073/7369/28431
- AIJCR 2012: https://www.aijcrnet.com/journals/Vol_2_No_2_February_2012/26.pdf
- Finkbeiner & Nicol 2003: https://researchers.mq.edu.au/en/publications/semantic-category-effects-in-second-language-word-learning/ ; https://experts.arizona.edu/en/publications/semantic-category-effects-in-second-language-word-learning/
- Erten & Tekin 2008: https://acikerisim.comu.edu.tr/items/7a90a159-d648-49ff-aabb-94a7b47c4a5e/full
- Bolger & Zapata 2011: https://onlinelibrary.wiley.com/doi/10.1111/j.1467-9922.2010.00624.x ; https://eric.ed.gov/?id=EJ928534
- Nakata & Suzuki 2019: https://www.semanticscholar.org/paper/EFFECTS-OF-MASSING-AND-SPACING-ON-THE-LEARNING-OF-Nakata-Suzuki/104e3d0a627265c079c28c52c713bad875ac35cd ; https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/effects-of-massing-and-spacing-on-the-learning-of-semantically-related-and-unrelated-words/F58BA8D70385603B9C42E408BFCB8A10
- LINGUIST List, Replikationsaufruf: https://linguistlist.org/issues/36/1763/
- Nation 2000 (Zusammenfassungen): https://skyteach.ru/2020/01/03/learning-vocabulary-in-lexical-sets-by-paul-nation/ ; https://www.theteflacademy.com/blog/the-truth-about-lexical-sets/ ; https://ilt.atu.ac.ir/article_1362.html?lang=fa
- HKU-Thesis: https://hub.hku.hk/handle/10722/146088
- Asian EFL Journal: https://www.asian-efl-journal.com/main-editions-new/thematic-clustering-in-second-language-vocabulary-learning-scenarios-versus-mental-scenes-development/
- Applied Linguistics Review 2021: https://www.degruyterbrill.com/document/doi/10.1515/applirev-2020-0102/html
- Azaruniv-Studie: https://pajouhesh.azaruniv.ac.ir/_Pages/Research.aspx?Id=25498
- Kang (UNH, Interleaving): https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-interleaved-training-and-category-learning-kang.pdf
- Birnbaum et al. 2013: https://link.springer.com/article/10.3758/s13421-012-0272-7
- Donenfeld, Kaldy & Blaser (Reanalyse): https://pmc.ncbi.nlm.nih.gov/articles/PMC13380076/ ; https://pubmed.ncbi.nlm.nih.gov/42329512/
- SSLLT-Review: https://pressto.amu.edu.pl/index.php/ssllt/article/view/35602
- Nakata 2023: https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12553
- WOLF: https://almanach.inria.fr/software_and_resources/WOLF-fr.html ; https://almanach.inria.fr/software_and_resources/WOLF-en.html ; https://aclanthology.org/2008.jeptalnrecital-long.18.pdf
- omw-data: https://github.com/mcyph/omw-data/blob/main/index.toml
- JeuxDeMots: https://linuxfr.org/news/jeuxdemots-un-jeu-en-ligne-pour-produire-des-donnees-lexicales ; https://doaj.org/article/b6cc1aebfb874515bc3c40195223d3f8
- Memorex (Anki-Einstellungen): https://hexdocs.pm/memorex/anki-deck-settings.html
- decksflashcards (Leeches): https://decksflashcards.com/guides/anki-leech-cards
- decksflashcards (Relearning): https://decksflashcards.com/guides/anki-relearning-steps
- HN-Diskussion Leeches: https://news.ycombinator.com/item?id=22387727
- MemoForge: https://memoforge.app/blog/right-sizing-daily-load-anki-new-card-limits-ease-leech-settings/
- Wisconsin LCTL Guide: https://wisc.pb.unizin.org/lctlresources/chapter/anki-part-ii-how-to-manage-forgetting/
- Mindomax: https://www.mindomax.com/bury-vs-suspend-anki ; https://www.mindomax.com/best-spaced-repetition-apps-2026-anki-alternatives
- study-genius 2026: https://study-genius-ai.hatolabs.com/blog/anki-vs-quizlet-vs-remnote-vs-mochi-2026
- jormemo 2026: https://jormemo.com/blog/best-spaced-repetition-apps
- prismo: https://prismo-app.com/best-spaced-repetition-apps/
- mnemobooks: https://mnemobooks.com/spaced-repetition-apps-compared-which-one-actually-helps-you-learn/
- my-senpai: https://my-senpai.com/insights/why-people-quit-anki.html
- Gwern, Anti-Spaced Repetition: https://gwern.net/anti-spaced-repetition
- Gwern-Review (LessWrong): https://www.lesswrong.com/posts/ZCRtnwGbcbpYP8t6h/spaced-repetition-review-my-entry ; https://stafforini.com/works/branwen-2009-spaced-repetition-efficient/
- Matuschak: https://notes.andymatuschak.org/z2ySBuuMjHwuewNBi65YmXD ; https://notes.andymatuschak.org/z7AeS1H6h8GRAaZ9ZuqumphVu1LNM323rdS6u ; https://notes.andymatuschak.org/The_mnemonic_medium_supplies_expert-authored_prompts_to_remove_the_burden_of_prompt-writing
- Wozniak, Twenty rules (nicht abgerufen): https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge

**Metadaten, Ressourcen, Statistik**
- UFAL-Folien: https://ufal.mff.cuni.cz/~zabokrtsky/courses/npfl124/www/slides/dz01-morpho.pdf
- CJVT UD-Guide: https://wiki.cjvt.si/books/07-universal-dependencies-FPQ/page/introduction-to-tags
- UD Features: https://universaldependencies.org/cs/feat/index.html ; https://universaldependencies.org/docs/u/feat/index.html ; https://universaldependencies.org/u/pos/ ; https://universaldependencies.org/u/feat/
- IDS (Hausmann): https://pub.ids-mannheim.de/autoren/divers/703.html
- De Gruyter HSK 5: https://www.degruyterbrill.com/isbn/9783110963496
- Lexis (PUCP): https://revistas.pucp.edu.pe/index.php/lexis/article/download/5363/5361
- Lexikos: https://lexikos.journals.ac.za/pub/article/view/1306/813
- Schöntag 2009: https://www.hausarbeiten.de/document/64385
- GEMA: https://ejournal.ukm.my/gema/article/view/6553
- pylexique: https://pylexique.readthedocs.io/en/latest/readme.html ; https://pylexique.readthedocs.io/en/stable/usage.html ; https://pypi.python.org/pypi/pylexique
- Lexique 4 README: https://lexique.org/databases/Lexique400/README-Lexique.txt
- OSF-Wiki Lexique: https://osf.io/479um/wiki
- README Lexique (Spiegel): https://a3nm.net/git/lexique/file/README-Lexique.txt.html
- Lexique-Notebook: https://nbviewer.jupyter.org/github/emk/lexique-experiments/blob/master/French%2520Vocabulary%2520Frequency%2520with%2520Lexique.ipynb
- Lexique3 auf Hugging Face: https://huggingface.co/datasets/FrancophonIA/Lexique3/viewer/default/train
- FLELex: https://aclanthology.org/L14-1083/ ; https://hal-amu.archives-ouvertes.fr/hal-01758123v1 ; https://oer.uclouvain.be/jspui/handle/20.500.12279/582 ; https://cental.uclouvain.be/cefrlex/flelex/download/ ; https://cental.uclouvain.be/cefrlex/bibliography/
- GLÀFF: https://aclanthology.org/L14-1469/ ; https://huggingface.co/datasets/datasets-CNRS/GLAFF/blob/main/data/README.txt
- Morphalou: https://repository.ortolang.fr/api/content/morphalou/1/documentation.pdf ; https://www.culture.gouv.fr/content/download/124893/1380273
- kaikki: https://kaikki.org/dictionary/French/meaning/f/fo/fon.html ; https://kaikki.org/dictionary/French/meaning/b/bi/bip.html
- spaCy: https://huggingface.co/spacy/fr_core_news_sm ; https://huggingface.co/spacy/fr_core_news_lg/tree/main ; https://huggingface.co/explosion/fr_udv25_frenchsequoia_trf
- spacy-lefff: https://github.com/sammous/spacy-lefff
- ankiR: https://cran.r-universe.dev/ankiR/doc/manual.pdf
- Anki-Forum, Helper-Stats: https://forums.ankiweb.net/t/integration-of-the-helper-add-on-stats/43643.md
- Anki-Forum, True Retention: https://forums.ankiweb.net/t/learning-step-and-review-interval-retention-support-thread/3743?page=3
- WaniKani Community: https://community.wanikani.com/t/12746 ; https://community.wanikani.com/t/the-level-15-curse/30145?page=7 ; https://community.wanikani.com/t/critical-items-list/50447 ; https://community.wanikani.com/t/do-i-have-too-many-leeches/28155 ; https://community.wanikani.com/t/ios-android-web-wanilog-modern-wanikani-stats/74139?page=2
- Clozemaster-Forum: https://forum.clozemaster.com/t/more-stats-difference-between-mastered-in-total-section-and-100-mastered/55141 ; https://forum.clozemaster.com/t/unique-cloze-words-statistics-that-would-be-especially-useful-to-me/13191 ; https://forum.clozemaster.com/t/i-have-played-100-but-mastered-only-1-6-what-to-do/68096
- Clozemaster Punkte: https://docs.clozemaster.com/article/103-how-do-points-work
- Lingvist: https://lingvist.com/help/where-can-i-check-how-many-words-there-are-in-the-course-that-i-am-studying/ ; https://lingvist.com/course-frequencies/english-course
- Gamification-Studie Spanischlernende: https://repositorio.21.edu.ar/bitstreams/d2e2d14e-48d1-4484-8018-ee81adfda8fd/download
- The Decision Lab, Streak Creep: https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
- U-High Midway: https://uhighmidway.com/22290/features/duo-dedication-app-serves-as-a-game-rather-than-an-education/
- Gulf Today: https://gulftoday.ae/Opinion/2023/11/06/The-language-app-you-just-cant-put-down
- Jabbari, Zarrinabadi & Amini: https://repository.essex.ac.uk/41011/1/Jabbari%2C%20Zarrinabadi%2C%20%26%20Amini%20%28accepted%20copy%29.pdf
- Bodily & Verbert 2017: https://www.bibsonomy.org/bibtex/ef4b7b5452ceb827db97c169000aa612 ; https://lirias.kuleuven.be/retrieve/467439 ; https://lirias.kuleuven.be/retrieve/467451
- Schwendimann et al. 2017: https://infoscience.epfl.ch/record/220672 ; https://portaldelaciencia.uva.es/documentos/63a75ae39ac45918ff1f9e5a
