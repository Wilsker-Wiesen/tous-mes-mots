# Tous mes mots – persönlicher Vokabeltrainer Französisch

Eine schnelle, offline nutzbare Web-App, um den eigenen französischen Wortschatz (C1/C2: Lesewortschatz,
Umgangssprache, Argot, Wendungen) in beiden Richtungen abzufragen. Planung mit FSRS, Lernzustand nur lokal
auf dem Gerät, keine Konten, kein Server.

> Stand: Oktober 2026, Version 0.1. Umgesetzt ist Schritt 1 (Import); die Oberfläche folgt.

## Daten

Die Vokabelliste ist eine CSV außerhalb des Repositories und die einzige Quelle der Wahrheit; die App liest sie
nur. Weder die CSV noch die daraus erzeugte `public/data/cards.json` werden eingecheckt. Tests nutzen eine kleine,
selbst erstellte Beispieldatei (`src/import/fixtures/beispiel.csv`).

Jede Zeile erhält eine stabile ID (`sha1` aus Lemma und Richtung), damit der Lernzustand einen erneuten Import
übersteht. Details: [DECISIONS.md](DECISIONS.md).

## Schnellstart

```bash
npm install
npm test              # Unit-Tests (CSV, IDs, Diff, Antwortvergleich)
npm run import:check  # Diff-Protokoll gegen den letzten Import, ohne zu schreiben
npm run import        # CSV → public/data/cards.json
npm run import -- --csv /pfad/zur/datei.csv
```

Standardpfad der CSV: `~/Documents/Vokabeln & Definitionen/Vokabeln/Französisch-Vokabeln/woerterbuch_neu.csv`,
überschreibbar mit `--csv` oder der Umgebungsvariable `TMM_CSV`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/core/` | Datenformat und Normalisierung, ohne Browser- oder Node-Abhängigkeit |
| `src/import/` | CSV-Leser, ID-Vergabe, Diff (nur Node) |
| `scripts/` | Kommandozeile für den Import |
| `docs/recherche/` | Konzept zur Lernmechanik mit Quellen |

## Lizenz

MIT, siehe [LICENSE](LICENSE).
