# smartL3arn

A desktop flashcard app for long-term retention. It combines the FSRS-5 spaced-repetition scheduler with an optional Smart Study mode that layers evidence-based learning techniques (active recall by typing, confidence calibration, elaborative interrogation, interleaving, and a Pomodoro timer) on top of the standard review loop.

Built with Vue 3, TypeScript, Pinia, Vue Router, and Vite. The same compiled web app runs in Electron, a browser, and native iOS/Android shells through Capacitor.

---

## Table of contents

- [What it is for](#what-it-is-for)
- [Features](#features)
- [Install and run](#install-and-run)
- [Building distributables](#building-distributables)
- [Mobile builds (iOS and Android)](#mobile-builds-ios-and-android)
- [Usage walkthrough](#usage-walkthrough)
- [Smart Study mode](#smart-study-mode)
  - [OpenRouter answer evaluation](#openrouter-answer-evaluation)
- [Import formats](#import-formats)
  - [JSON](#json)
  - [AI prompt for high-quality flashcards](#ai-prompt-for-high-quality-flashcards)
  - [TXT and CSV](#txt-and-csv)
- [Export formats](#export-formats)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Data storage](#data-storage)
- [Project layout](#project-layout)

---

## What it is for

You write flashcards (front + back), the app schedules reviews so you see each card right before you would forget it. The FSRS-5 algorithm (the same scheduler used by modern Anki forks) computes the next due date from your rating history. Smart Study mode lets you opt in to additional cognitive techniques that research has shown to accelerate learning beyond passive review.

Typical use cases:
- Vocabulary (languages, medical terms, legal concepts)
- Definitions and formulas
- Anything you need to recall verbatim or fast

## Features

**Decks and cards**
- Create, rename, delete decks
- Add, edit, delete cards
- Inline cell editing in the browse view
- Sortable browse table (front, back, due date, interval, difficulty, fail percentage)
- Search filter

**Scheduling**
- FSRS-5 with default weights trained on around 700 million Anki reviews
- 90% desired retention target
- Four-button rating: Again, Hard, Good, Easy
- Predicted next interval shown on each rating button
- Per-card difficulty pill (easy, medium, hard)
- Per-card fail-rate statistics

**Standard study session**
- Due cards sorted into two priority groups: overdue first, then today-due
- Cards shuffled within each group to avoid memorising the order
- Within-group ordering is by difficulty (hardest first) before shuffling
- "Again" cards are re-queued in a learning phase at the end of the main queue
- Session statistics bar (live counts of Again / Hard / Good / Easy)
- Daily streak tracking (consecutive days with a session)
- "Study Again" button on the done screen only appears if cards are still due; otherwise it shows the next review date

**Smart Study mode (separate tab)**
- Multi-deck selection (interleave across decks in one session)
- Four optional techniques, toggle each on or off:
  - Active recall by typing the answer
  - Confidence calibration (Not sure / Maybe / Confident)
  - Elaborative why-prompt (free-text explanation)
  - Interleaving (round-robin across selected decks)
- Session length: 10 min, 25 min (Pomodoro), or no limit
- Live countdown timer in the header
- 25-minute Pomodoro sessions transition into a 7-minute active break timer before the next Smart Study session
- Typed-answer comparison with a similarity score (Levenshtein based, diacritics stripped, punctuation ignored)
- Optional semantic answer evaluation through OpenRouter in the macOS desktop app
- Secure local API-key storage through Electron and automatic local fallback on API errors
- Color-coded feedback band: perfect (>=97%), close (>=82%), partial (>=50%), wrong (<50%)
- Suggested rating button highlighted based on similarity
- Confidence-vs-result calibration feedback
- Why-prompt elaborations stored per card (latest three kept)
- Four-button Smart Study queue control: Good/Easy leave the session and rely on FSRS spacing; Hard is re-queued once, Again is re-queued up to two retries
- Again/Hard cards are marked for extra practice and stay eligible across Smart Study sessions until later rated Good/Easy
- Queue priority within each deck: overdue cards first, then extra-practice Again/Hard cards, then today's due/new cards; if nothing is due or flagged, Smart Study offers a voluntary practice round across the selected decks
- Session stats logged per deck (streak compatible)

**Import and export**
- JSON import (creates a new deck from an array or deck object)
- TXT and CSV import (comma or tab delimited)
- Two import entry points on Home: "Import JSON" and "Import TXT / CSV" both create a new deck
- "Import TXT / CSV" inside a deck appends cards to the open deck
- JSON and CSV export per deck

**UI**
- Light and dark theme (persisted)
- Keyboard shortcuts for study (space to flip, 1-4 to rate)
- Responsive layout

## Install and run

Requirements: Node.js 20.19 or newer, npm.

```bash
npm install
npm run dev        # Vite browser development server with hot reload
npm start          # production web build, then launch Electron
```

Electron data is persisted to your OS user-data folder (see [Data storage](#data-storage)). The browser development version uses `localStorage`.

Useful checks:

```bash
npm run typecheck  # Vue + TypeScript validation
npm test           # domain/unit tests
npm run test:smoke # hidden Electron flow test (requires a desktop session)
```

## Building distributables

```bash
npm run build      # macOS DMG (arm64; x64 if signing/build env permits)
npm run build:win  # Windows NSIS installer + portable .exe
npm run build:all  # both
npm run build:web  # web bundle only
```

The web bundle goes to `web-dist/`; packaged desktop releases go to `release/`. The bundled app icon is `build/icon.png` (1024x1024); electron-builder converts it to `.icns` and `.ico` automatically.

## Mobile builds (iOS and Android)

Vite creates the shared `web-dist/` bundle. Capacitor copies that same output into the native projects, so Electron, iOS, Android, and the browser use one renderer source.

Requirements:
- **iOS**: macOS with Xcode (and CocoaPods).
- **Android**: Android Studio (which bundles the Android SDK), or the command-line SDK tools with `ANDROID_HOME` set. Java 17+.

```bash
npm run ios        # copy web assets, sync, open the project in Xcode
npm run android    # copy web assets, sync, open the project in Android Studio
```

Lower-level steps if you only need part of the pipeline:

```bash
npm run cap:copy            # Vite build + cap copy ios
npm run cap:sync            # cap:copy + cap sync ios
npm run cap:copy:android    # Vite build + cap copy android
npm run cap:sync:android    # cap:copy:android + cap sync android
```

Native projects live in `ios/` and `android/`; Capacitor config is `capacitor.config.json` (appId `com.smartl3arn.app`, webDir `web-dist`).

**Status bar / safe area.** The native status bar is handled through `src/services/native.ts`, which disables WebView overlay and synchronizes its color/style with the active theme. The same code path applies on Android.

## Usage walkthrough

1. Click **New Deck**, give it a name.
2. Click **Browse** on the deck, then **+ Add Card** to add cards (or use **Import TXT / CSV** at the top to bulk-import).
3. From Home, click **Study (n)** to start a standard session, or click **Smart Study** in the header for a configurable session.
4. Press **Space** (or click the card) to flip; rate the card with the four buttons or keys **1**-**4**.

## Smart Study mode

The Smart Study tab is the recommended mode if you want to learn faster, not just review.

| Technique | What it does | Research origin |
|---|---|---|
| Active Recall (Typing) | You type the answer before revealing the back side. The app compares your answer to the correct one. | Roediger and Karpicke (2006); generation effect |
| Confidence Calibration | You rate certainty (Not sure / Maybe / Confident) before revealing, then see whether your judgement matched reality. | Dunlosky and Metcalfe; metacognition research |
| Elaborative Why-Prompt | After reviewing, you briefly type why the answer is correct. Saved to the card history. | Pressley et al.; Chi et al. (self-explanation) |
| Interleaving | Cards are pulled round-robin from every selected deck rather than block by block. | Rohrer and Pashler (2007) |
| Spacing (always on) | FSRS-5 schedules each card individually. | Cepeda et al.; Ebbinghaus |
| Pomodoro timer | Optional 10 or 25 minute focused session; 25-minute sessions require a 7-minute break before the next round. | Cirillo |

Each technique can be toggled independently in Smart Study setup. Preferences (selected decks, toggles, duration) persist in `localStorage` under `ankiweb_smart_config`.

### OpenRouter answer evaluation

For personal Electron use, copy `.env.example` to `.env` in the project root and fill in `OPENROUTER_API_KEY` locally. An empty `.env` is provided when setting up this workflow. Restart Electron after changing the file, then select **OpenRouter AI** in Smart Study's answer evaluation settings.

Credential precedence is: the `OPENROUTER_API_KEY` process environment variable, the local `.env` value, then the encrypted settings key. Blank values fall through to the next source. The UI identifies the active source without displaying the key. Removing a stored key does not remove an environment key.

Set `OPENROUTER_MODEL` to the OpenRouter model ID you want to use. The process environment takes precedence over `.env`; missing or blank values default to `openrouter/free`. Restart Electron after changing the model. The selected model must support the structured JSON response requested by the evaluator; incompatible responses use the existing local fallback.

When running a packaged macOS app, place `.env` at `~/Library/Application Support/smartL3arn/.env`. Project `.env` files are ignored by Git and explicitly excluded from packaged builds. Keys are read only by Electron's main process; do not use a `VITE_` prefix for credentials. Browser and mobile builds continue to use local evaluation.

The macOS desktop app can evaluate typed answers semantically instead of relying only on character similarity. Open **Smart Study**, find **Answer evaluation**, enter a personal OpenRouter API key, and choose **OpenRouter AI**. The key is validated before it is stored and is encrypted through Electron's OS-backed secure storage; it is never included in deck data or exports.

For each checked answer, the app sends only the deck name, current question, reference answer, and typed answer to the configured model (default: `openrouter/free`). The response reports whether the answer is correct, mostly correct, partially correct, or incorrect, with brief feedback. The result never selects an FSRS rating automatically. If OpenRouter is unavailable, times out, rejects the key, or reaches its rate limit, smartL3arn immediately uses the existing local comparison and labels the result as a fallback.

Browser, iOS, and Android builds continue to use local evaluation. OpenRouter's free tier is subject to provider availability and account rate limits.

## Import formats

### JSON

Two shapes are accepted by **Import JSON** on Home.

**1. Deck object** (recommended; matches the export format):

```json
{
  "name": "Spanish Vocabulary",
  "cards": [
    { "front": "casa",   "back": "house" },
    { "front": "perro",  "back": "dog"   },
    { "front": "libro",  "back": "book"  }
  ]
}
```

**2. Bare array of cards** (deck name is derived from the filename):

```json
[
  { "front": "casa",  "back": "house" },
  { "front": "perro", "back": "dog"   }
]
```

**3. Full backup** (from **Export All**): an object with a `decks` array. Every deck is restored with its cards, stats, and sessions. See [Export formats](#export-formats).

**Card object fields**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `front` | string | yes | - | Question side |
| `back` | string | yes | - | Answer side |
| `interval` | number | no | `0` | Days until next review |
| `repetitions` | number | no | `0` | Successful review streak |
| `easeFactor` | number | no | `2.5` | Legacy SM-2 ease (kept for compat) |
| `dueDate` | string | no | today | ISO date `YYYY-MM-DD` |

Cards missing `front` or `back` are skipped. Unknown fields are ignored. Card IDs are always generated fresh on import to avoid collisions.

### AI prompt for high-quality flashcards

Copy the following prompt into an AI assistant, replace the placeholders with your learning material, and save the generated response as a `.json` file. You can then import it through **Import JSON** on Home.

```text
Du bist ein Experte für Lernpsychologie, Active Recall und Spaced Repetition.

Erstelle aus dem unten angegebenen Lernstoff hochwertige Lernkarten für smartL3arn.

LERNSTOFF:
[Hier Text, Notizen, Skript oder Thema einfügen]

ZIELGRUPPE UND LERNZIEL:
[Zum Beispiel: Prüfungsvorbereitung im 2. Semester, grundlegendes Verständnis]

ANZAHL:
[Zum Beispiel: 30 Karten]

REGELN FÜR DIE KARTEN:

1. Prüfe zuerst, welche Inhalte wirklich prüfungs- und lernrelevant sind.
2. Jede Karte testet genau einen klar abgegrenzten Sachverhalt.
3. Formuliere die Vorderseite als eindeutige Frage mit genügend Kontext.
4. Die Antwort muss kurz, präzise und leicht eintippbar sein.
5. Verwende konkrete Fragen statt „Erkläre alles über …“.
6. Vermeide Ja/Nein-Fragen, triviale Fragen und reine Wiedererkennung.
7. Teile Listen oder komplexe Zusammenhänge in mehrere Karten auf.
8. Erstelle bei wichtigen Konzepten unterschiedliche Abrufarten:
   - Definition oder Bedeutung
   - Anwendung
   - Ursache und Wirkung
   - Vergleich beziehungsweise Abgrenzung
   - typischer Fehler oder Irrtum
9. Verwende umgekehrte Karten nur, wenn beide Abrufrichtungen sinnvoll sind.
10. Vermeide doppelte oder nahezu identische Karten.
11. Verwende Fachbegriffe korrekt und konsistent.
12. Nimm ausschließlich Informationen aus dem bereitgestellten Lernstoff. Erfinde keine Fakten.
13. Falls eine Antwort mehrere Formulierungen zulässt, nenne auf der Rückseite zuerst die kürzeste erwartete Antwort und danach höchstens eine knappe Erläuterung.
14. Sorge für eine ausgewogene Abdeckung des Lernstoffs und priorisiere zentrale Konzepte.
15. Formuliere alle Karten auf Deutsch, sofern der Lernstoff keine andere Sprache erfordert.

AUSGABEFORMAT:

Gib ausschließlich valides JSON aus – ohne Markdown-Codeblock, Einleitung, Kommentare oder nachfolgenden Text.

Verwende exakt diese Struktur:

{
  "name": "[Kurzer, sinnvoller Name des Kartendecks]",
  "cards": [
    {
      "front": "[Eindeutige Frage]",
      "back": "[Kurze, präzise Antwort]"
    }
  ]
}

QUALITÄTSPRÜFUNG VOR DER AUSGABE:

Kontrolliere intern jede Karte:
- Ist sie ohne zusätzlichen Kontext eindeutig?
- Prüft sie nur einen Sachverhalt?
- Erfordert sie aktives Erinnern?
- Ist die erwartete Antwort präzise?
- Ist sie inhaltlich durch den Lernstoff belegt?
- Überschneidet sie sich unnötig mit einer anderen Karte?

Entferne oder überarbeite alle Karten, die diese Kriterien nicht erfüllen.
```

### TXT and CSV

Both **Import TXT / CSV** entry points (Home or inside a deck) use the same parser.

**Rules**

- Two columns: `front`, `back`.
- Delimiter is auto-detected: if the first non-empty line contains a tab, tab is used; otherwise comma.
- Lines starting with `#` are treated as comments and skipped.
- Empty lines are skipped.
- For CSV, fields containing comma, quote, or newline must be wrapped in double quotes. Literal double quotes inside a quoted field are escaped by doubling them (`""`), per RFC 4180.
- No header row is expected; if you include one (e.g. `front,back`) it is parsed as a card and will appear in the deck.

**TXT example (tab delimited)**

```
# Spanish vocabulary
casa	house
perro	dog
libro	book
hola	hello
```

**CSV example (comma delimited)**

```csv
casa,house
"Hola, ¿qué tal?","Hi, how are you?"
"He said ""hi""","Said hello"
perro,dog
```

Imports made via **Home > Import TXT / CSV** create a new deck named after the file (underscores become spaces, extension stripped). Imports via **Browse > Import TXT / CSV** append cards to the currently open deck.

## Export formats

Per-deck exports live in the **Browse** view; a full backup of every deck lives on **Home**.

- **Export JSON** (Browse) writes the full deck object (including scheduling state) as `<deck_name>.json`, suitable for re-import.
- **Export CSV** (Browse) writes two columns (`front`, `back`) as `<deck_name>.csv`. Scheduling state is not exported.
- **Export TXT** (Browse) writes Anki-compatible tab-delimited `front<TAB>back`, one note per line, as `<deck_name>.txt`. Newlines inside a field become `<br>` (Anki renders HTML) and literal tabs become spaces. Import directly in Anki via *File > Import*.
- **Export All** (Home) writes every deck — with cards, per-card stats, and session history — as a single `smartL3arn_backup_<date>.json`. Re-import it with **Import JSON** on Home to restore the whole collection (decks are added, not merged; deck IDs are regenerated).

On Windows/macOS (Electron) and in a browser, exports download as a file. On iOS/Android the file is written to the app cache and the native **share sheet** opens, so you can save it to Files, Drive, email, etc. (via `@capacitor/filesystem` + `@capacitor/share`).

## Keyboard shortcuts

### API usage overview

Open **API-Verbrauch** in the app navigation to see local answer-evaluation requests, input/output tokens, cached/reasoning tokens, and OpenRouter-reported costs in USD. Filter by today, the last 7 or 30 days, or all time, and by model. The 10,000-request projection uses the average of requests with reported costs in the current selection and is explicitly an estimate.

Tracking starts with this feature; previous OpenRouter activity is not imported. Local answer checks and key validation are excluded. Failed API attempts are counted; usage returned for malformed evaluations is still included. Timeouts or missing provider data have unknown costs, rather than being treated as free. Counts and costs are taken from OpenRouter's [usage accounting response](https://openrouter.ai/docs/cookbook/administration/usage-accounting); no extra API calls are made for tracking. Payment fees and taxes are not included.

Metadata is stored separately from decks in `api-usage.jsonl` in Electron's user-data folder. It contains timestamps, model IDs, outcomes, token counts, and reported costs, never API keys, card text, or answers. Refresh the overview to load recent results. Browser/mobile versions show an explanation because their evaluation is local.

**Standard study**

| Key | Action |
|---|---|
| Space / Enter | Flip card |
| 1 | Rate Again |
| 2 | Rate Hard |
| 3 | Rate Good |
| 4 | Rate Easy |

**Smart Study (typing phase)**

| Key | Action |
|---|---|
| Enter | Submit typed answer |
| Shift+Enter | Newline in answer field |

**Smart Study (reviewing phase)**

| Key | Action |
|---|---|
| 1 / 2 / 3 / 4 | Rate Again / Hard / Good / Easy (disabled while the why-prompt textarea is focused) |

## Data storage

| Context | Location |
|---|---|
| Electron, macOS | `~/Library/Application Support/smartL3arn/ankiweb_data.json` |
| Electron, Windows | `%APPDATA%/smartL3arn/ankiweb_data.json` |
| Electron, Linux | `~/.config/smartL3arn/ankiweb_data.json` |
| Browser only | `localStorage` key `ankiweb_v1` |
| iOS / Android (Capacitor) | WebView `localStorage` key `ankiweb_v1` |

Other persisted keys:

| Key | Purpose |
|---|---|
| `ankiweb_smart_config` | Smart Study preferences (selected decks, toggles, duration) |
| `ankiweb_dark` | Dark mode flag (`"1"` or `"0"`) |

A one-time migration in `main.js` copies data from the pre-rename `Anki Web` userData folder into the new `smartL3arn` folder on first launch.

The on-disk shape mirrors the in-memory state:

```json
{
  "decks": [
    {
      "id": "abc123def",
      "name": "Spanish",
      "cards": [
        {
          "id": "card123",
          "front": "casa",
          "back": "house",
          "interval": 4,
          "repetitions": 3,
          "easeFactor": 2.5,
          "dueDate": "2026-06-01",
          "stability": 4.21,
          "difficulty": 5.3,
          "lastReview": "2026-05-28"
        }
      ],
      "cardStats": {
        "card123": {
          "reviews": 5,
          "again": 1,
          "hard": 1,
          "elaborations": [
            { "date": "2026-05-25", "text": "Spanish for house" }
          ]
        }
      },
      "sessions": [
        { "date": "2026-05-25", "reviewed": 12, "again": 1, "hard": 2, "good": 7, "easy": 2, "smart": true }
      ]
    }
  ]
}
```

The last 90 sessions per deck are retained for the streak indicator. The last 3 elaborations per card are retained.

## Project layout

```
.
├── main.js                 # Electron main process and async data IPC
├── preload.js              # safe contextBridge for renderer persistence
├── index.html              # Vite entry page
├── style.css               # shared design system and responsive styles
├── src/
│   ├── components/         # reusable Vue UI components and dialogs
│   ├── views/              # route-level Library, Browse, Study, and Smart Study screens
│   ├── stores/             # Pinia stores for data, settings, UI, and study sessions
│   ├── domain/             # framework-independent FSRS, queues, dates, parsing, and types
│   ├── services/           # storage adapters, native APIs, and import handling
│   ├── App.vue
│   ├── main.ts
│   └── router.ts
├── build/
│   └── icon.png            # application icon and Vite public asset
├── scripts/
│   └── smoke-electron.cjs  # isolated end-to-end renderer smoke test
├── capacitor.config.json   # Capacitor config (webDir: web-dist)
├── web-dist/               # generated Vite bundle (gitignored)
├── ios/                    # Capacitor iOS project (Xcode)
├── android/                # Capacitor Android project (Android Studio)
├── vite.config.mts
├── tsconfig.json
├── package.json
└── README.md
```

The `domain/` modules deliberately have no Vue or platform dependencies. They can be tested independently and are shared by the browser, Electron, and Capacitor flows.

## Prism UI

The library, card browser, Smart Study setup, both study modes, completion and
Pomodoro screens, API usage and editor dialogs share a violet theme, macOS system
typography and coordinated light/dark surfaces. Deck covers use local artwork in
`build/design/`; they require no network requests. Existing decks need no migration.

Start the desktop app with `npm start`. A browser preview runs with `npm run dev`;
Electron-only API and file capabilities still require the desktop app.

For isolated visual captures, run:

```sh
npm run build:web
./node_modules/.bin/electron scripts/design-preview-electron.cjs
```

This uses example decks, an in-memory Electron partition and mocked IPC. It never
writes to the real deck database or sends API requests. Captures go into the ignored
`design-evidence/` directory. Optionally place the selected mockup at
`design-evidence/reference-original.png` to generate normalized side-by-side
comparisons. Add `--preview` to keep the example window open after capture.

## Language / i18n

Open **Preferences → Language** (German: **Einstellungen → Sprache**) to choose
**System language**, **Deutsch** or **English**. Changes apply immediately and are
saved locally under `smartl3arn_language`. System language uses German for a German
system locale and English otherwise. Language changes update `html.lang`, plural
forms, date labels, number formatting and USD costs as well as visible controls,
accessibility labels, dialogs, notifications and error messages.

Translations live in `src/i18n/en.ts` and `src/i18n/de.ts`; use `t('section.key',
{ count, ... })` or `useI18n()` for new copy. Keys are checked by TypeScript and the
German catalog must contain every English key. Count-dependent messages use
`singular || plural` and `Intl.PluralRules`; interpolation is plain text, never HTML.
Use `formatNumber`, `formatCurrency`, and `formatDateLabel` for presentation.

User-entered deck names, cards and answers are preserved. Newly requested OpenRouter
feedback is requested in the selected UI language; already returned provider
feedback is not automatically translated. Preferences also contains the existing
light/dark appearance selection.
