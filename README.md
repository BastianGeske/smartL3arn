# smartL3arn

A desktop flashcard app for long-term retention. It combines the FSRS-5 spaced-repetition scheduler with an optional Smart Study mode that layers evidence-based learning techniques (active recall by typing, confidence calibration, elaborative interrogation, interleaving, and a Pomodoro timer) on top of the standard review loop.

Built as an Electron app; the same `app.js` also runs in a plain browser using `localStorage`, and ships as a native iOS and Android app via Capacitor (same web assets, also `localStorage`-backed).

---

## Table of contents

- [What it is for](#what-it-is-for)
- [Features](#features)
- [Install and run](#install-and-run)
- [Building distributables](#building-distributables)
- [Mobile builds (iOS and Android)](#mobile-builds-ios-and-android)
- [Usage walkthrough](#usage-walkthrough)
- [Smart Study mode](#smart-study-mode)
- [Import formats](#import-formats)
  - [JSON](#json)
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
- Color-coded feedback band: perfect (>=97%), close (>=82%), partial (>=50%), wrong (<50%)
- Suggested rating button highlighted based on similarity
- Confidence-vs-result calibration feedback
- Why-prompt elaborations stored per card (latest three kept)
- Four-button Smart Study queue control: Good leaves the session and rests for one Smart Study session, Easy leaves the session and rests for two Smart Study sessions, Hard is re-queued once, Again is re-queued up to two retries
- Again/Hard cards stay eligible for every Smart Study session
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

Requirements: Node.js 18 or newer, npm.

```bash
npm install
npm start          # launch the Electron app (dev)
```

The app window opens directly. Data is persisted to your OS user-data folder (see [Data storage](#data-storage)).

You can also open `index.html` in a plain browser. In that mode data is stored in `localStorage` instead of a file.

## Building distributables

```bash
npm run build      # macOS DMG (arm64; x64 if signing/build env permits)
npm run build:win  # Windows NSIS installer + portable .exe
npm run build:all  # both
```

Output goes to `dist/`. The bundled app icon is `build/icon.png` (1024x1024); electron-builder converts it to `.icns` and `.ico` automatically.

## Mobile builds (iOS and Android)

The same `index.html` / `style.css` / `app.js` run unchanged inside a Capacitor WebView. `scripts/copy-web.mjs` mirrors the root web assets into `www/` (the root files stay the single source of truth shared with the Electron build), then Capacitor copies `www/` into the native projects.

Requirements:
- **iOS**: macOS with Xcode (and CocoaPods).
- **Android**: Android Studio (which bundles the Android SDK), or the command-line SDK tools with `ANDROID_HOME` set. Java 17+.

```bash
npm run ios        # copy web assets, sync, open the project in Xcode
npm run android    # copy web assets, sync, open the project in Android Studio
```

Lower-level steps if you only need part of the pipeline:

```bash
npm run cap:copy            # copy-web + cap copy ios
npm run cap:sync            # cap:copy + cap sync ios
npm run cap:copy:android    # copy-web + cap copy android
npm run cap:sync:android    # cap:copy:android + cap sync android
```

Native projects live in `ios/` and `android/`; Capacitor config is `capacitor.config.json` (appId `com.smartl3arn.app`, webDir `www`).

**Status bar / safe area.** `env(safe-area-inset-*)` resolves to `0` in Capacitor's iOS WebView, so the Dynamic Island / status-bar clearance is handled natively via the `@capacitor/status-bar` plugin instead: `setupStatusBar()` in `app.js` takes the status bar out of overlay mode (`setOverlaysWebView({ overlay: false })`) so the native layer insets the web view, and `syncStatusBarStyle()` matches the bar background/text to the active light or dark theme (wired into the theme toggle). The same code path applies on Android.

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
├── main.js              # Electron main process; IPC, window, dock icon, data migration
├── preload.js           # contextBridge: exposes window.db.load / window.db.save
├── index.html           # Single page, mounts on #app
├── style.css            # All styles (light + dark themes)
├── app.js               # Renderer logic: state, routing, render, FSRS, Smart Study
├── build/
│   └── icon.png         # 1024x1024 app icon (electron-builder picks up automatically)
├── scripts/
│   └── copy-web.mjs     # mirrors root web assets into www/ for Capacitor
├── capacitor.config.json# Capacitor config (appId, appName, webDir: www)
├── www/                 # generated web bundle Capacitor copies into the native apps
├── ios/                 # Capacitor iOS project (Xcode)
├── android/             # Capacitor Android project (Android Studio)
├── package.json
└── README.md
```

`app.js` is intentionally a single file with section banners (`// ===== ... =====`); no bundler is needed.
