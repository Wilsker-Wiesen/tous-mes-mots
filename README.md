# Tous mes mots – persönlicher Vokabeltrainer Französisch

Eine schnelle, offline nutzbare Web-App, um den eigenen französischen Wortschatz (C1/C2: Lesewortschatz,
Umgangssprache, Argot, Wendungen) in beiden Richtungen abzufragen. Planung mit FSRS, Lernzustand nur lokal
auf dem Gerät, keine Konten, kein Server.

> Stand: Oktober 2026, Version 0.1. Umgesetzt: Import (Schritt 1) und Abfrage „Erkennen“ mit FSRS (Schritt 2).
> Produktionsrichtung, Filter, Tippmodus, Export und Deployment folgen.

## Daten

Die Vokabelliste ist eine CSV außerhalb des Repositories und die einzige Quelle der Wahrheit; die App liest sie
nur. Weder die CSV noch die daraus erzeugte `public/data/cards.json` werden eingecheckt. Tests nutzen eine kleine,
selbst erstellte Beispieldatei (`src/import/fixtures/beispiel.csv`).

Jede Zeile erhält eine stabile ID (`sha1` aus Lemma und Richtung), damit der Lernzustand einen erneuten Import
übersteht. Details: [DECISIONS.md](DECISIONS.md).

## Schnellstart

Voraussetzung: Node ≥ 22.12.

```bash
npm install
npm run dev           # App unter http://localhost:5173 (vorher einmal npm run import)
npm test              # Unit-Tests (CSV, IDs, Diff, Antwortvergleich)
npm run import:check  # Diff-Protokoll gegen den letzten Import, ohne zu schreiben
npm run import        # CSV → public/data/cards.json
npm run import -- --csv /pfad/zur/datei.csv
npm run build         # PWA nach dist/
npm run preview       # gebaute PWA lokal ansehen
```

Bedienung: Leertaste oder Antippen deckt auf, 1–4 bewertet (Nochmal, Schwer, Gut, Leicht), Z nimmt zurück.

Standardpfad der CSV: `~/Documents/Vokabeln & Definitionen/Vokabeln/Französisch-Vokabeln/woerterbuch_neu.csv`,
überschreibbar mit `--csv` oder der Umgebungsvariable `TMM_CSV`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/core/` | Datenformat, Normalisierung, Planer (FSRS-6 über `ts-fsrs`), Warteschlange, Ereignisse – ohne Browser- oder Node-Abhängigkeit |
| `src/storage/` | Lernzustand und Ereignisprotokoll in IndexedDB |
| `src/app/` | Oberfläche (Vanilla TypeScript) |
| `src/import/` | CSV-Leser, ID-Vergabe, Diff (nur Node) |
| `scripts/` | Kommandozeile für den Import |
| `docs/recherche/` | Konzept zur Lernmechanik mit Quellen |

## Lizenz

MIT, siehe [LICENSE](LICENSE).
