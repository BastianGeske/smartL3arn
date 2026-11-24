# smartL3arn

A flashcard app for long-term retention, with local deck storage, FSRS-5 spaced repetition, and an optional Smart Study mode for typed recall, confidence checks, explanations, interleaving, and timed sessions.

Built with Vue 3, TypeScript, Pinia, Vue Router, and Vite. The same compiled web app runs in Electron, a browser, and native iOS/Android shells through Capacitor.

The interface is available in German and English. OpenRouter answer evaluation is available in macOS Electron and native iOS. Browser, Windows and Android study flows use local evaluation. Decks and local study work without an OpenRouter account. Selecting AI evaluation never silently falls back to local grading on API errors. This project is maintained for private use; no store publication workflow is provided.

---

## Table of contents

- [What it is for](#what-it-is-for)
- [Features](#features)
- [Recent improvements](#recent-improvements)
- [Install and run](#install-and-run)
- [Building distributables](#building-distributables)
- [Mobile builds (iOS and Android)](#mobile-builds-ios-and-android)
- [Usage walkthrough](#usage-walkthrough)
- [Guided learning paths](#guided-learning-paths)
- [Smart Study mode](#smart-study-mode)
  - [Local answer assessment](#local-answer-assessment)
  - [OpenRouter answer evaluation](#openrouter-answer-evaluation)
    - [Set up OpenRouter in the app](#set-up-openrouter-in-the-app)
    - [Configure a local .env file](#configure-a-local-env-file)
    - [Choose a model](#choose-a-model)
    - [Troubleshooting](#troubleshooting)
    - [Connection logs](#connection-logs)
- [API usage overview](#api-usage-overview)
- [Import formats](#import-formats)
  - [JSON](#json)
  - [AI prompt for high-quality flashcards](#ai-prompt-for-high-quality-flashcards)
  - [TXT and CSV](#txt-and-csv)
- [Export formats](#export-formats)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Data storage](#data-storage)
- [Project layout](#project-layout)
- [Prism UI and app icons](#prism-ui-and-app-icons)
- [Language / i18n](#language--i18n)

---

## What it is for

Write flashcards with a question and reference answer. The app computes the next due date from your ratings using FSRS-5. Standard Study reviews one deck; Smart Study combines selected decks and optional learning techniques. Both modes let you choose every rating yourself.

Typical use cases:

- Vocabulary (languages, medical terms, legal concepts)
- Definitions and formulas
- Anything you need to recall verbatim or fast

## Features

**Decks and cards**

- Create, rename, delete decks
- Add, edit, delete cards
- Inline cell editing in the browse view
- Sortable browse table (front, back, due date, interval, difficulty), with a displayed fail percentage
- Search filter
- Typed tasks: short answers, explanations, calculations, single/multiple choice, true/false, blanks, matching, and ordering. Smart Study adapts its answer controls to each card; standard study displays the structured question and solution.
- Calculations support exact numbers and fractions, explicitly accepted value–unit pairs, and formulas with a visual symbol keyboard plus LaTeX input. AI can check working independently from the result. See [task types and JSON examples](docs/task-types.md).

**Scheduling**

- FSRS-5 with bundled default weights
- 90% desired retention target
- Four-button rating: Again, Hard, Good, Easy
- Standard Study rating buttons show the interval produced by the same scheduler that saves the review; for a new card, Again / Hard / Good / Easy are **1 / 1 / 3 / 15 days**
- Per-card difficulty pill (easy, medium, hard)
- Per-card fail-rate statistics

**Standard study session**

- Due cards sorted into two priority groups: overdue first, then today-due
- Cards shuffled within each group to avoid memorising the order
- Again/Hard cards can return in a learning phase, after at least ten minutes
- Session statistics bar (live counts of Again / Hard / Good / Easy)
- Daily streak tracking (consecutive days with a session)
- The completion screen offers **Study Again** if cards remain due, or **Practice again** plus the next review date when the deck is caught up
- When no cards are due, you can voluntarily practice the deck

**Smart Study mode (separate tab)**

- Multi-deck selection (interleave across decks in one session)
- Four optional techniques, toggle each on or off:
  - Active recall by typing the answer
  - Confidence check (Not sure / Maybe / Confident)
  - Elaborative why-prompt (free-text explanation)
  - Interleaving (round-robin across selected decks)
- Session length: 10 min, 25 min (Pomodoro), or no limit
- Live countdown timer in the header
- When a 25-minute Pomodoro timer expires, a 7-minute break is shown before the next Pomodoro round; completing the queue earlier finishes the session directly
- Free-text self-assessment against the reference answer; no correctness verdict based on text similarity
- Optional semantic answer evaluation through OpenRouter in macOS Electron and native iOS
- Secure local API-key storage through Electron or the iOS Keychain; AI errors preserve the answer for retry without local grading
- Content verdicts only for structured answers and AI checks; free text uses self-assessment
- Ratings remain manual; local or AI feedback never chooses or highlights a suggested rating
- Neutral comparison of stated confidence with a checked result
- Why-prompt elaborations stored per card (latest three kept)
- Four-button Smart Study queue control: Good/Easy leave the session; Hard permits one retry and Again two, each after at least ten minutes
- Again/Hard cards are marked for extra practice and stay eligible across Smart Study sessions until later rated Good/Easy
- Queue priority within each deck: overdue cards first, then extra-practice Again/Hard cards, then today's due/new cards; if nothing is due or flagged, Smart Study offers a voluntary practice round across the selected decks
- Each session randomizes cards within these priority groups (with a bias toward weaker cards) and the starting deck order; interleaving still alternates decks. The same queue logic runs on every platform.
- Session stats logged per deck (streak compatible)

**Import and export**

- JSON import (creates a new deck from an array or deck object)
- TXT and CSV import (comma or tab delimited)
- Two import entry points on Home: "Import JSON" and "Import TXT / CSV" both create a new deck
- "Import TXT / CSV" inside a deck appends cards to the open deck
- **Update / add via JSON** inside a deck previews updates to existing cards and new additions, then saves them together while preserving existing learning progress. See [JSON supplements (German guide)](docs/json-supplements.md).
- JSON, CSV, and Anki-compatible TXT export per deck; **Export All** creates a full JSON backup, including task definitions
- JSON deck and backup restoration preserve scheduling, statistics, explanations, and session history
- CSV header detection, quoted multiline fields, escaped quotes, and UTF-8 BOM support

**OpenRouter and usage**

- Optional semantic answer checks in macOS Electron and iOS, with encrypted in-app API-key storage or private build configuration
- Configured and actual model IDs, explicit AI failures and retry without silent local fallback
- API usage overview with model/date filters, token counts, reported USD costs, and an estimate for 10,000 evaluations
- Persistent connection diagnostics with an export button, HTTP/provider error codes, request phases, and durations

**UI**

- Active study sessions share a compact header with progress, timer and labeled rating counts. Smart Study groups deck/evaluation metadata and confidence selection inside the question card, with responsive layouts for narrow screens.
- Light and dark theme (persisted)
- Keyboard shortcuts for study (space to flip, 1-4 to rate)
- Responsive layout
- German, English, and system-language selection under **Preferences**
- Violet Prism UI with Kartenfächer branding and native app icons

## Recent improvements

- The [German flashcard prompt template](docs/flashcard-prompt.md) covers all interactive task types, calculation formats, cloze alternatives, units, tolerances, and reference working. JSON preserves these definitions; CSV/TXT re-import creates text cards.

- OpenRouter requests avoid unsupported sampling parameters, so strict structured-output routing works with models that do not accept `temperature`. Errors distinguish invalid keys, blocked requests, exhausted credits, and unavailable model providers.
- Persistent connection logs record request phases, durations, HTTP/provider/network codes, and app versions, with a privacy-filtered export under API Usage.
- CSV exports can be re-imported without turning the header into a card or losing quoted multiline content. An unclosed quoted field rejects the whole import with a translated error.
- Re-importing an individual JSON deck now retains card IDs, statistics, elaborations, extra-practice flags, and session history, matching full-backup restoration.
- Pure integer and decimal reference answers are checked exactly, including signs and values beyond floating-point precision.
- Standard Study interval previews now match the saved review schedule for all four ratings.
- The current UI includes manual ratings, localized settings and feedback, API usage reporting, and refreshed desktop/mobile branding.

## Install and run

Requirements: **Node.js 22.12 or newer**, npm, and a desktop session for Electron. This satisfies the installed Vite and Capacitor CLI requirements.

```bash
npm ci             # install the versions recorded in package-lock.json
npm run dev        # Vite browser development server with hot reload
npm start          # production web build, then launch Electron
```

Electron data is persisted to your OS user-data folder (see [Data storage](#data-storage)). The browser development version uses IndexedDB; it does not load your Electron decks or expose OpenRouter credentials. To launch Electron without rebuilding an existing web bundle, use `npm run start:electron`.

Useful checks:

```bash
npm run typecheck  # Vue + TypeScript validation
npm test           # Electron service tests, then Vitest domain/import tests
npm run build:web  # typecheck and build; required before the Electron smoke test
npm run test:smoke # hidden Electron flow test (requires a desktop session)
npm run test:tasks:ui # all answer formats in an isolated Electron profile
npm run test:quality:ui # import guidance, editing, splitting and study regression checks
```

Regression coverage includes CSV export/import, header handling and malformed CSV, JSON learning-data restoration, exact numeric answers, scheduler previews, OpenRouter timeouts, credential resolution, and API usage accounting. The smoke test uses example decks, an in-memory partition, and mocked IPC; it does not change your real deck database or call OpenRouter.

## Building distributables

```bash
npm run build      # macOS DMG targets for arm64 and x64
npm run build:win  # Windows NSIS installer + portable .exe
npm run build:all  # both
npm run build:web  # web bundle only
```

`package.json` is the shared source of the app version and `nativeBuildNumber` for Android and iOS (initial shared build number: 2). Each desktop release command (`build`, `build:win`, or `build:all`) runs `release:prepare` once: it increments the patch version and native build number, updates `package-lock.json`, and synchronizes Android and both iOS configurations. This creates no Git commit or tag. All targets in one `build:all` run share the same version and build number. Development starts, web builds and mobile copy/sync commands do not increment either value.

```sh
npm run version:sync     # copy current version/build number to Android and iOS; no increment
npm run release:prepare  # explicitly prepare the next shared version for a private mobile build
```

For a desktop package, use its normal `build` command directly; running `release:prepare` separately immediately before it would prepare another version. For several platform packages at one already-prepared version, invoke electron-builder directly after `build:web`. The preparation script validates all inputs before writing and restores changed files if a write fails. It accepts stable `major.minor.patch` versions and native build numbers from 1 to 9999.

The web bundle goes to `web-dist/`; packaged desktop releases go to `release/`. Build/signing prerequisites depend on the target platform. The desktop/browser artwork is `build/icon.png`; electron-builder converts it to platform icon formats. See [Prism UI and app icons](#prism-ui-and-app-icons) for native icon generation.

Desktop packaging includes only `OPENROUTER_MODEL` from the project's `.env` (build-process environment variables take precedence). Private API keys are never embedded in desktop packages, and legacy bundled keys are ignored. Users can enter a key in the app to store it with OS-backed encryption or configure a local runtime environment. Keys included in older installers remain extractable: replace those installers and revoke exposed keys with OpenRouter.

The old `release/1.0.3` app was moved to `.artifact-quarantine/legacy-release-1.0.3`, excluded from Git and protected with owner-only directory access. Its plaintext key has been removed from the configuration, and the old DMG containing that key has been deleted. The old app must not be reused as a current package. Local removal does not revoke a key: the account owner must revoke it in OpenRouter if still active. Updated private test packages are under `out/platform-fixes-2026-10-06/`.

Check an unpacked desktop package without printing credentials:

```sh
npm run check:artifacts -- /path/to/smartL3arn.app/Contents/Resources /path/to/win-unpacked/resources
```

The check requires model-only build configuration, no environment files, all expected runtime modules and all 13 deck covers.

Private iOS **Debug** builds also automatically include these two values from `.env` through an Xcode build phase, including when building directly in Xcode. The configuration lives in a native bundle resource, not in the WebView's JavaScript. A manually saved iOS Keychain key takes precedence; removing it restores the bundled key. Both the configured key and model update on the next build. Release/archive builds never embed this private configuration and remove any stale Debug copy. Keep `.env` out of Git and use a limited key: the bundled key is extractable from the app, so this is only intended for personal builds, not distribution.

To build only the Apple Silicon DMG:

```sh
npm run build -- --arm64
```

## Mobile builds (iOS and Android)

Vite creates the shared `web-dist/` bundle. Capacitor copies that same output into the native projects, so Electron, iOS, Android, and the browser use one renderer source.

Requirements:

- **iOS**: macOS with Xcode compatible with Capacitor 8. This project uses Swift Package Manager, rather than a CocoaPods project, and targets iOS 15 or newer.
- **Android**: Android Studio or command-line SDK tools with `ANDROID_HOME` set, **JDK 21**, and Android SDK 36. The project targets SDK 36 with a minimum SDK of 24.

```bash
npm run ios        # copy web assets, sync, open the project in Xcode
npm run android    # copy web assets, sync, open the project in Android Studio
```

Lower-level steps if you only need part of the pipeline:

```bash
npm run cap:copy            # version sync + Vite build + cap copy ios
npm run cap:sync            # cap:copy + cap sync ios
npm run cap:copy:android    # version sync + Vite build + cap copy android
npm run cap:sync:android    # cap:copy:android + cap sync android
```

Native projects live in `ios/` and `android/`; Capacitor config is `capacitor.config.json` (appId `com.smartl3arn.app`, webDir `web-dist`).

Both mobile preparation commands synchronize the existing app version and build number. Always run the full Capacitor sync after changing plugins; a direct native build cannot generate Capacitor's missing plugin registration files. The iOS target includes `PrivacyInfo.xcprivacy` for Filesystem's file-timestamp API reason (`C617.1`).

Android's device test starts `MainActivity`, checks the package ID and native Filesystem/Share/StatusBar registration, and waits for the Vue library to render. After `npm run cap:sync:android`, run `./gradlew :app:assembleDebug :app:lintDebug :app:assembleDebugAndroidTest` from `android/`; with a device or emulator connected, run `./gradlew :app:connectedDebugAndroidTest`. Android icons include a monochrome card fan; the launch screen uses one XML background and centered icon across densities.

**Status bar / safe area.** The native status bar is handled through `src/services/native.ts`, which disables WebView overlay and synchronizes its color/style with the active theme. The same code path applies on Android.

## Usage walkthrough

1. Click **New Deck**, give it a name.
2. Click **Browse** on the deck, then **+ Add Card** to add cards (or use **Import TXT / CSV** at the top to bulk-import).
3. From Home, click **Study (n)** to start a standard session, or click **Smart Study** in the header for a configurable session.
4. Press **Space** / **Enter** or click **Reveal answer**; rate the card with the four buttons or keys **1**-**4**.
5. Open **Preferences** (**Einstellungen**) to change language or appearance. Open **API Usage** (**API-Verbrauch**) to inspect recorded AI requests.

## Guided learning paths

Open **Library → Learning Paths** and import a learning path. You can import the example JSON linked below. **Copy authoring prompt** supplies a German prompt for turning your own source material into a path. If the material is insufficient, importing the generated report shows which information the author needs. The [prompt](docs/learning-path-prompt.md), [complete example](docs/learning-path.example.json) and [JSON Schema](docs/learning-path.schema.json) are included.

Each objective has a short explanation, a worked example, guided practice and independent checks. The current authoring prompt creates sets of three to six guided tasks and three to six self-check tasks, with extra cases for retry rounds. Guided practice shows specific feedback and worked solutions. The self-check collects detailed feedback until the end of the round. Passing requires at least 80% correct without help, rounded up to the next whole task. After a failed round, learners can revisit the explanation and guided practice or try a new round directly. Previously seen cases remain recorded across this return to practice, reloads and topic changes. A retry uses unseen cases first; round results label previously seen cases. [Example with practice and self-check rounds](docs/learning-path.rounds.example.json)

Use the chapter sidebar on desktop or **Topics** on a narrow screen to jump to any objective. The app saves each unfinished objective’s place and keeps voluntary practice drafts separate. Earlier imports retain their single-task flow and also show detailed feedback for new answers.

The first independent pass schedules the objective for the next local day. On return, choose up to three due objectives in the path or continue the lesson. The review prefers unused reserved cases and mixes objectives across chapters, including after completion. A correct unaided first answer increases the FSRS interval. A miss or help schedules another review the following day. You can practise a different case immediately. The outline shows the last review result, the time since previous practice and the next due date. Older passed objectives receive a baseline review on return. Existing lesson drafts and deck review schedules are preserved.

Every required objective has an offline check. On desktop and iOS, a written alternative can use the configured OpenRouter connection. Checking sends the current question, reference, criteria, path title and submitted answer. Every criterion needs evidence for an independent pass. Ambiguous or unavailable evaluation returns the learner to the local task with the written draft preserved. If the model accepts an author's known wrong or incomplete example, that written variant counts as practice on this device.

**Export learning content** shares the path without personal progress. **Import → Export All** in the library includes paths, drafts and progress in the personal backup. Reimporting identical content resumes the saved version. Changed content needs a new version and has separate progress. Learners can select review cards from completed objectives and add them to a deck once. Chapter completion does not rate cards or change their review dates.

Run `node scripts/evaluate-learning-path-prompt.mjs` to validate both bundled examples for import, initial progress and round structure locally. Add `--validate=FILE` to check generated JSON against the current authoring requirements or validate a missing-material report. These local checks do not assess content accuracy. Use `--run --code-only` for seven synthetic Python code-assessment cases (alternative solution, syntax, indentation, case, hardcoding, empty input and misleading comments). This sends provider requests and does not execute code. Passing `--run` compares baseline and revised prompts on the same four synthetic sources (factual recall, a procedure, confusable concepts and missing material) using the model and API key configured in the environment. Revised generations must include guided practice and self-check rounds; legacy import compatibility alone is insufficient. The live check uses a model assessment for answer accuracy, grounding, scaffolding, leakage and transfer, and checks three written rubric probes. Authors can set `written.practiceOnly` on unreliable rubrics before sharing the path.

Learning contacts, attempt history and failed rounds now survive backup/restore. Initial passing is separate from delayed retention: reviewing explanations, solutions or voluntary tasks on the same local day prevents interval growth. Skill groups target unresolved decisions; optional contrast groups mix related objectives within the same due date. Path structure reports show missing metadata without claiming semantic validation.

Code objectives can declare `requiredEvidence: "code"`; each written check then specifies `language`. Local alternatives only check foundations. AI code assessment does not execute programs. Learners explicitly start three billable rubric probes before graded code submission; validation is tied to content and the configured model. Incorrect probes permit practice feedback only. The code editor supports Tab/Shift+Tab, preserved line indentation, and Escape followed by Tab to leave the field.

### Evaluating delayed learning

For an opt-in pilot, randomly assign learners to the previous or revised flow with the same source material. Reserve two equivalent case sets outside both paths. At 7 and 30 days after the initial pass, give each group the same follow-up window (±1 and ±3 days respectively) and a previously unseen case. Record the first unaided answer before feedback, using the same answer key across groups. For each window report assigned, initially passed, returned, and independently correct counts, plus accuracy among returners. Compare both return rates and accuracy. These follow-ups require participant recruitment and consent.

## Smart Study mode

Use Smart Study to combine multiple decks and configure how you recall and review answers.

| Technique | What it does | Research origin |
|---|---|---|
| Active Recall (Typing) | You type the answer before revealing the back side. You compare local free-text answers with the reference; structured tasks and optional AI provide content feedback. | Roediger and Karpicke (2006); generation effect |
| Confidence check | You rate certainty (Not sure / Maybe / Confident) before revealing, then compare your certainty with the checked result, without a calibration score. | Dunlosky and Metcalfe; metacognition research |
| Elaborative Why-Prompt | After reviewing, you briefly type why the answer is correct. Saved to the card history. | Pressley et al.; Chi et al. (self-explanation) |
| Mix decks | Cards alternate across selected decks. Choose related topics or problem types; a single deck is already shuffled. | Rohrer and Pashler (2007) |
| Spacing (always on) | FSRS-5 schedules each card individually. | Cepeda et al.; Ebbinghaus |
| Pomodoro timer | Optional 10 or 25 minute focused session, or no limit; expiration of a 25-minute timer starts a 7-minute break. | Cirillo |

Each technique can be toggled independently in Smart Study setup. Preferences (selected decks, toggles, duration, and evaluation mode) persist in `localStorage` under `ankiweb_smart_config`. Answer feedback is separate from your rating: **Again**, **Hard**, **Good**, and **Easy** are always chosen manually. Session counts include repeated ratings of re-queued cards.

### Local answer assessment

Free text (legacy cards, `short_text`, `long_text`) is self-assessed against the reference answer. The app does not infer correctness from matching wording, including exact text matches. Formula answers and working also require self-assessment in local mode. AI mode can provide semantic feedback; failures preserve the input without switching evaluators.

Structured choices, true/false, cloze, matching, ordering, and numeric calculations use their declared solutions. Text gaps accept stored answers and alternatives. Numeric calculations support fractions, scientific notation, tolerances and declared value–unit pairs. See [task types](docs/task-types.md).

### Review and practice policy

Both modes delay another attempt after Again/Hard by ten minutes, persisted across restarts and mode changes. This is a product default, not a universal research optimum. Other available cards continue; if only delayed cards remain, the session finishes and shows the next available practice time. Again allows up to two extra attempts and Hard one per session. Unresolved regular learning steps remain flagged for later sessions.

Queue entries distinguish regular reviews, relearning steps and voluntary practice. Only regular reviews and relearning update FSRS. Voluntary practice preserves all scheduler fields and existing relearning flags; sessions are marked `practice` in JSON statistics. `cardStats.practiceAvailableAt` is an optional millisecond timestamp; old backups need no migration. Past intervals are not recalculated on upgrade.

FSRS-5 includes same-day stability updates and damped difficulty changes with the existing weights and 90% desired retention. Reference: [official algorithm, revision July 28, 2026](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm). Calendar-day elapsed time and day-based due dates remain in use.

### OpenRouter answer evaluation

OpenRouter compares the meaning of a typed answer with the current question and reference answer. It returns one of four verdicts with brief feedback in the selected UI language. It never sets an FSRS rating for you.

In AI mode, calculation results that match the stored solution are confirmed locally. A mismatch is sent to OpenRouter so it can recognize equivalent notation, written-out numbers, and unambiguous spelling differences; genuinely different values or signs must still be marked incorrect. If working is submitted with a mismatching result, AI checks the answer and working independently in one request. Other structured tasks remain local. Failed AI checks keep the draft available for retry without finalizing the local mismatch.

#### Set up OpenRouter in the app

1. Sign in to [OpenRouter](https://openrouter.ai/) and create a personal inference API key on the [API keys page](https://openrouter.ai/settings/keys). Use a regular API key, not a [management key](https://openrouter.ai/docs/guides/overview/auth/management-api-keys), which cannot call completion endpoints.
2. Start the macOS desktop app with `npm start`, or open the installed macOS/iOS app. `npm run dev` opens the browser version, where AI configuration is unavailable.
3. Open **Smart Study → Answer evaluation** (German: **Smart Study → Antwortbewertung**). Paste the key into **OpenRouter API key** and click **Validate and save** (**Prüfen und speichern**).
4. Confirm **Configured** (**Eingerichtet**) and the configured model, then select **OpenRouter AI** (**OpenRouter-KI**). Private iOS Debug builds use the bundled key automatically. A manually saved iOS Keychain key overrides the bundled key; Electron uses saved keys as fallbacks behind local runtime environment credentials; packaged keys are ignored.
   Use **Test connection** (**Verbindung testen**) to check API reachability and validate the active key without re-entering it. The result shows the response time or a specific error. This uses `GET /api/v1/key`, sends no learning content, and does not generate an AI evaluation or add a usage entry. It does not test model availability or sufficient credits for inference.
5. Select a deck, enable **Typed recall** (**Antwort eintippen**), and start a session. Type a non-empty answer and choose **Check answer** (or press Enter for a single-line field, Ctrl/Cmd+Enter for a multiline or formula field). AI feedback shows **OpenRouter** and, when supplied, the actual model ID. Errors keep your answer for retry and never silently grade it locally.
6. In Settings, open [API Usage](#api-usage-overview) and click **Refresh** to inspect the recorded request, tokens, and reported cost. A successful key validation alone does not prove the chosen model can produce the required response format; the first answer check verifies that.

The in-app key uses Electron's OS-backed secure storage (`openrouter-key.bin`) or the iOS Keychain. It is separate from deck data and exports. To stop using AI, select **Local** (**Lokal**). **Remove stored key** removes only the saved local copy; on iOS a bundled key then becomes active again. Revoke a key in OpenRouter to disable it at the provider.

#### Configure a local .env file

For source/development use, create `.env` beside `package.json`. If it does not exist, copy the example:

```sh
cp .env.example .env
```

If `.env` already exists, edit it instead of overwriting it. Replace the example's `OPEN_ROUTER_API_KEY` placeholder with your actual personal key:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-PASTE_YOUR_PERSONAL_KEY_HERE
OPENROUTER_MODEL=openrouter/free
```

Fully quit and restart Electron after changing `.env` or the model, then select **OpenRouter AI** in Smart Study. Closing the window alone may leave Electron running on macOS. Desktop builds embed only the model. Configure an installed macOS app through encrypted in-app key storage, or place a local runtime `.env` at `~/Library/Application Support/smartl3arn/.env` and restart.

On a fresh iOS installation, Smart Study selects AI only if the native bridge reports a configured key; otherwise it starts locally. Existing local/AI decisions and the older initialization marker are retained. A status lookup failure leaves a new installation usable locally and never silently changes an existing AI decision.

Keys are resolved in this order; empty or whitespace-only values fall through:

| Priority | Key source |
|---|---|
| 1 | `OPENROUTER_API_KEY` in the Electron process environment |
| 2 | `OPENROUTER_API_KEY` in the applicable local `.env` file |
| 3 | Encrypted key saved in Smart Study |

The UI groups the first two sources as an **environment key** and otherwise uses the encrypted settings key. Saving an in-app key stores an encrypted fallback when a local environment key is active. Desktop builds ignore all legacy bundled keys; the bundled source is used only for private iOS Debug builds.

An `.env` file stores its key as plain text; the in-app method uses encrypted storage. Repository `.env` files are ignored by Git and the files themselves are excluded from packages, and desktop packaging copies only the model into an app resource. Private iOS Debug builds still embed their development key and must not be distributed. Credentials are resolved in Electron's main process: never give them a `VITE_` prefix, which would expose them to the web build.

#### Choose a model

The model is configured with `OPENROUTER_MODEL`; there is no model picker in the current UI. Its precedence is the runtime process environment, then local `.env`, then the model embedded at build time, then **`openrouter/free`**. Changing a runtime value requires a full Electron restart; changing the project's build configuration requires a new package. Model configuration is independent of the key source.

- The default [Free Models Router](https://openrouter.ai/openrouter/free) chooses an available free model that supports the requested features. The actual returned model can differ between requests and is shown in feedback and usage history.
- For a fixed model, copy its exact ID from the [OpenRouter model catalog](https://openrouter.ai/models) into `OPENROUTER_MODEL`. Select a model/provider supporting [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs): the evaluator requests a strict JSON schema with `response_format.type = "json_schema"` and `provider.require_parameters: true`. A valid key alone does not guarantee model compatibility.
- Paid models need sufficient account credits and an appropriate key limit. Free-model availability and quotas can change; consult the current [credit and rate-limit documentation](https://openrouter.ai/docs/api_reference/limits) rather than relying on a fixed daily allowance.

#### What is sent and how errors work

Each AI answer check sends the deck name, current question, reference answer, and learner answer, alongside the evaluator instructions, evaluation scope, and selected feedback language. When a calculation includes learner working, the request also sends that working and any stored reference working from `solutionSteps`. Other cards, session history, confidence selections, and why-prompt elaborations are not sent. OpenRouter receives the API key for authentication and routes the evaluation to the selected provider.

Desktop and native iOS requests use a **60-second** timeout and allow **4,096 output tokens**. Authentication failures, rate limits, unavailable providers, timeouts, and malformed evaluations display an error and preserve the answer for retry. AI failures never trigger local fallback grading. Empty answers and **I don't know** do not make an API request. Select Local mode explicitly to use self-assessment for free text instead of AI evaluation.

#### Troubleshooting

| Symptom | What to check |
|---|---|
| AI configuration is unavailable | Use the macOS Electron app or native iOS app; browser and Android do not expose the AI bridge. |
| A key is saved, but checks remain local | Enable **Typed recall**, select **OpenRouter AI**, and submit a non-empty answer. The selected mode appears in the session. |
| Key rejected | Replace the example placeholder, check that the key is active, and use a regular inference key rather than a management key. |
| Request blocked | HTTP 403 indicates a permission, policy, or guardrail restriction. Check key/model/provider restrictions; it does not by itself mean the key is invalid. |
| Credits or spending limit exhausted | HTTP 402 indicates insufficient credits or an exhausted key spending limit. Check the OpenRouter balance and key limit. |
| No compatible model provider | HTTP 404 can mean that no provider supports all requested parameters. Check the model's supported parameters and structured-output support. The app keeps strict schema routing and avoids a fixed `temperature`, which some reasoning models do not support. |
| The app keeps using an old key or model | Check the displayed key source. Desktop runtime environment and local `.env` override encrypted storage; packaged keys are ignored. Private iOS Debug builds may still use a development bundle key. Restart after a runtime change, or rebuild after editing the project's `.env`. |
| Rate limit reached | Wait before retrying and check the current OpenRouter/provider quota. Consider another compatible available model. |
| OpenRouter unavailable | Export the connection logs and inspect the HTTP status, typed provider error, and network code. Check the connection and whether the configured model supports structured outputs. |
| Invalid evaluation or repeated timeouts | Export the connection logs. Desktop and iOS allow 4,096 output tokens and a 60-second deadline, leaving room for reasoning and the final JSON evaluation. Unsupported JSON schemas or truncated responses can still cause errors; retry or explicitly select local mode. |
| Card too long | Deck name, question, reference answer, typed answer, reference working, and learner working are each limited to 4,000 UTF-16 characters. Working lines and LaTeX delimiters count toward the combined working-field limit. Shorten the affected field. |
| Secure key storage unavailable | Check the OS secure-storage availability, or use the local `.env` configuration described above. |
| Usage shows `—` | The provider did not supply that information; it means unknown, not free. Refresh after the request finishes. |

#### Connection logs

The Electron app automatically records diagnostic metadata in `openrouter-debug.jsonl` in its user-data directory. On macOS this is `~/Library/Application Support/smartl3arn/openrouter-debug.jsonl`. Logs start with this version; earlier failures cannot be recovered retrospectively.

To investigate a failure, fully quit the old app, launch the new build, reproduce the failed answer check, and open **API Usage → Export connection logs** (**API-Verbrauch → Verbindungslogs exportieren**). The JSON Lines export includes the current log and its previous rotation. Each file is capped at approximately 1 MiB; older entries are replaced automatically.

Desktop requests have a `requestId` linking their request phases; entries include the app version, model, credential source, endpoint, durations, deadline, HTTP status and sanitized provider/network codes. iOS records one completion per attempted request with timestamp, actual model, credential source, operation, duration, HTTP status and normalized failure reason. API keys, authorization headers, deck names, questions, answers, feedback, raw provider payloads and arbitrary exception messages are excluded on both platforms. Log export reapplies a whitelist and does not make an API request.

| Log evidence | Meaning |
|---|---|
| `reason: "timeout"`, `durationMs` near 60000, `phase: "connect"` | The app's deadline expired before response headers arrived. |
| `reason: "timeout"`, `phase: "read-body"`, HTTP status present | Headers arrived, but the complete response body did not arrive before the deadline. |
| `networkCode: "ENOTFOUND"` or `"EAI_AGAIN"` | DNS resolution failed. |
| `networkCode: "ECONNRESET"` or `"UND_ERR_SOCKET"` | The connection was interrupted. |
| `reason: "invalid-response"`, `phase: "parse-evaluation"` | The body arrived, but the model's evaluation did not match the expected JSON schema. |
| HTTP 200 plus `apiErrorCode` / `apiErrorType` | OpenRouter reported a provider failure inside the response body. HTTP 200 alone does not prove success. |

The endpoints are `POST https://openrouter.ai/api/v1/chat/completions` for evaluations and `GET https://openrouter.ai/api/v1/key` for key validation, matching OpenRouter's [chat-completion reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) and [current-key reference](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key). Provider errors inside HTTP 200 responses and the distinction between 401, 402, and 403 follow the [error documentation](https://openrouter.ai/docs/api_reference/errors-and-debugging).

## API usage overview

Open **API Usage** (**API-Verbrauch**) in the navigation to see requests recorded by this macOS or iOS installation, the configured model and key source, successful/failed checks, input/output tokens, cached/reasoning tokens, and reported USD costs. Filter by today, the last 7 or 30 days, or all time, and by the actual returned model. Click **Refresh** to load completed requests; returning to the app refreshes the view too. On phones, history is shown as compact cards.

The 10,000-evaluation projection uses the average of requests with reported costs in the current selection. It is an estimate, not a quote or spending limit. Payment fees and taxes are excluded. Unknown costs remain unknown; reported zero cost is treated as free. Cached and reasoning tokens are subsets of the token counts and are not added twice.

Local checks and key validation are excluded. Failed API attempts are counted, and usage returned with a malformed evaluation is still captured. Tracking uses OpenRouter's [usage accounting response](https://openrouter.ai/docs/cookbook/administration/usage-accounting), without extra API requests. Historical activity from the OpenRouter account is not imported; this is not an account balance or complete billing dashboard.

The metadata journal, `api-usage.jsonl`, is separate from decks and contains timestamps, model IDs, outcomes, tokens, and reported costs, without card content, learner answers, or API keys. It is not included in deck backups. On iOS, both usage and diagnostic journals persist in Application Support/smartL3arn-AI; diagnostic logs are bounded and can be exported with the native share sheet. Tracking starts with this version and does not import earlier iPhone requests or activity on other devices.

Native journal regression checks (macOS with Xcode): `swiftc ios/App/App/NativeAiJournal.swift scripts/check-ios-ai-journal.swift -o /tmp/smartL3arn-native-ai-journal-tests && /tmp/smartL3arn-native-ai-journal-tests`.

## Import formats

### JSON

Three shapes are accepted by **Import JSON** on Home.

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
| `task` | object | no | text card | Typed question and solution configuration; see [task types](docs/task-types.md) |
| `id` | string | no | generated | Valid, unique IDs are retained in all three JSON shapes; missing, invalid, or duplicate IDs are regenerated |
| `interval` | number | no | `0` | Days until next review |
| `repetitions` | number | no | `0` | Successful review streak |
| `easeFactor` | number | no | `2.5` | Legacy SM-2 ease (kept for compat) |
| `dueDate` | string | no | today | ISO date `YYYY-MM-DD` |
| `stability` | number | no | unset | FSRS stability for a reviewed card |
| `difficulty` | number | no | unset | FSRS difficulty |
| `lastReview` | string | no | unset | Last review date, `YYYY-MM-DD` |

Cards require non-empty `front` and `back` strings (up to 20,000 characters each). Invalid card data, unknown task types, or invalid task configurations reject the import rather than silently skipping cards. Unknown card fields are ignored. Valid, unique card IDs are retained in deck objects, full backups, and bare arrays; missing, invalid, or duplicate IDs are regenerated. Deck objects and full backups can also restore `cardStats` for retained card IDs. Restoring to an empty library retains valid, unique deck IDs. Importing into a populated library creates additional decks with fresh IDs.

For structured tasks, `task` defines the correct solution and the importer regenerates readable `back` content from it. Put solution explanations in `task.explanation` and calculation working in `task.solutionSteps`; text tasks (`short_text` / `long_text`) continue to use `back` as the reference answer. JSON imports are limited to 10 MiB, 100,000 cards in total, and 1,000 decks in a full backup.

Optional deck-level `cardStats`, `sessions`, and `smartSessionSeq` are restored from deck objects and full backups. This retains review/failure statistics, elaborations, extra-practice flags, and learning history alongside the card scheduling fields.

To revise an existing deck, open it and choose **Deck actions → Update / add via JSON**. Supply a card array or a single object with a `cards` array. Entries match by `id`, or by exact `front` when no ID is supplied. Existing entries may omit unchanged fields; new entries require `front` and `back`. Provided content replaces the corresponding field, and a provided `task` replaces the whole task definition (`null` removes it). Unmatched entries become new cards. Review the before/after preview, then choose **Apply changes**. Updates preserve scheduling, statistics and deck history; additions start fresh. This flow never deletes cards or imports learning history. Ambiguous or duplicate targets reject the whole file. Full backups still belong to the Home import. See the [guide and example](docs/json-supplements.md).

For AI-generated updates, use the standalone **[German update prompt template](docs/flashcard-update-prompt.md)** with the existing deck’s JSON export and your requested changes. It preserves IDs for updates, omits IDs for additions, and outputs only changed or new cards. Import the result inside the existing deck through **Update / add via JSON**; if it returns `{"cards":[]}`, there is nothing to import.

### AI prompt for high-quality flashcards

The complete, copyable **[German flashcard prompt template](docs/flashcard-prompt.md)**
was checked against the current task schema and importer on **13 November 2026**.
Replace its placeholders with your material, learning goal, card count, and local
or AI evaluation preference. Save the generated JSON as a UTF-8 `.json` file and
use **Import JSON** on Home.

The template covers all nine task types and the four calculation formats, including
text/numeric cloze alternatives, explicit accepted units, justified rounding
tolerances, LaTeX, reference working steps, and structured explanations. It asks for
a suitable mix based on the material rather than forcing every type into each deck.
The [54-run prompt comparison](docs/prompt-quality/README.md) records the six synthetic source cases and frozen outputs.
It chooses an independently assessable learning goal before selecting a task type,
keeps unrelated facts in separate cards, and includes a final quality review.
See the [task quality implementation plan](docs/task-quality-implementation.md) for
the rules, editor/import guidance, and controlled splitting of matching cards.
Its examples use actual JSON objects rather than pseudo-values such as `"text" or "number"`.

To use interactive answer controls, enable **Typed recall** in **Smart Study**.
Confidence checks, why-prompts, interleaving, timers, and evaluation mode are session
settings configured in the app, not fields that the generation prompt can import.
Interleaving requires selecting multiple decks; generate separate topic decks when
that fits the material. The standard study mode still displays structured questions
and their solutions.

See **[task types and JSON examples](docs/task-types.md)** for the complete format
and **[the importable example deck](docs/task-types.example.json)** for all formats.

### TXT and CSV

Both **Import TXT / CSV** entry points (Home or inside a deck) use the same parser.

**Rules**

- Two columns: `front`, `back`.
- Delimiter is auto-detected: if the first non-empty, non-comment line contains a tab outside quoted fields, tab is used; otherwise comma.
- CSV quoting starts only at the beginning of a field (after optional whitespace). A quote inside ordinary text, such as `Convert 6" to centimetres`, is literal and does not hide a following tab separator. Unmarked tab-delimited imports preserve quotes unchanged. Anki files with a leading `#separator:Tab` directive support quoted fields.
- Lines starting with `#` are treated as comments and skipped outside quoted CSV fields. Quoted content, including lines starting with `#`, is preserved.
- Empty lines are skipped outside quoted CSV fields.
- For CSV, fields containing comma, quote, or newline must be wrapped in double quotes. Literal double quotes inside a quoted field are escaped by doubling them (`""`), per RFC 4180.
- An optional first row containing exactly `front,back` (or their tab-delimited equivalents) is recognized as a header, ignoring case and surrounding whitespace. Later rows with these values remain cards. A leading UTF-8 BOM is accepted.
- Quoted fields can contain LF, CRLF, or CR line breaks. An unclosed quoted field rejects the whole import with an error; no partial deck is imported.

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
front,back
casa,house
"Hola, ¿qué tal?","Hi, how are you?"
"He said ""hi""","Said hello"
perro,dog
"Name both stages","First stage
Second stage"
```

Imports made via **Home > Import TXT / CSV** create a new deck named after the file (underscores become spaces, extension stripped). Imports via **Browse > Import TXT / CSV** append cards to the currently open deck.

## Export formats

Per-deck exports live in the **Browse** view; a full backup of every deck lives on **Home**.

- **Export JSON** (Browse) writes the full deck object as `<deck_name>.json`. Re-import preserves task definitions, scheduling state, card IDs, card statistics, elaborations, extra-practice flags and session history; the deck receives a new ID when added to a populated library.
- **Export CSV** (Browse) writes two columns (`front`, `back`) with a header as `<deck_name>.csv`. Re-import recognizes the header and preserves multiline content. Structured tasks are flattened into readable questions and solutions; re-import creates text cards. Task definitions and scheduling state are not exported.
- **Export TXT** (Browse) writes Anki-compatible tab-delimited `front<TAB>back`, one note per line, as `<deck_name>.txt`. LF, CRLF, and CR line breaks inside a field become `<br>` (Anki renders HTML), literal tabs become spaces, and quotes are kept. Structured tasks are flattened into readable questions and solutions; interactive task definitions are not retained. When a question starts with `#`, the export uses Anki separator and HTML directives with quoted fields to preserve it on re-import. Import directly in Anki via *File > Import*.
- **Export All** (Home) writes every deck — with cards, per-card stats, and session history — as a single `smartL3arn_backup_<date>.json`. Re-import it with **Import JSON** on Home to restore the whole collection.

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
| Enter | Submit a single-line answer; insert a newline in a multiline answer |
| Ctrl/Cmd+Enter | Submit an answer, including multiline and formula fields |
| Shift+Enter | Newline in a multiline answer field |

**Smart Study (reviewing phase)**

| Key | Action |
|---|---|
| 1 / 2 / 3 / 4 | Rate Again / Hard / Good / Easy (disabled while an input or textarea is focused) |

Standard Study shortcuts apply when focus is outside buttons, inputs, textareas, selects, and editable cells. **Enter** submits the deck-name dialog; **Escape** closes an editor dialog.

## Data storage

| Context | Location |
|---|---|
| Electron, macOS | `~/Library/Application Support/smartl3arn/ankiweb_data.json` |
| Electron, Windows | `%APPDATA%/smartl3arn/ankiweb_data.json` |
| Electron, Linux | `~/.config/smartl3arn/ankiweb_data.json` |
| Browser only | IndexedDB database `smartL3arn` |
| iOS / Android (Capacitor) | WebView IndexedDB database `smartL3arn` |

Browser and mobile installations import their existing `ankiweb_v1` library on first load.

Other persisted keys:

| Key | Purpose |
|---|---|
| `ankiweb_smart_config` | Smart Study preferences (selected decks, toggles, duration, evaluation mode) |
| `ankiweb_dark` | Dark mode flag (`"1"` or `"0"`) |
| `smartl3arn_language` | Language preference (`system`, `de`, or `en`) |
| `ankiweb_smart_pomodoro_break_until` | Timestamp until which a Pomodoro break remains active |

Electron also keeps these files in its user-data directory:

| File | Purpose | Included in deck exports? |
|---|---|---|
| `ankiweb_data.json` | Decks, cards, scheduling, statistics, and sessions | Yes, through deck JSON or Export All |
| `openrouter-key.bin` | Encrypted key saved in the app | No |
| `api-usage.jsonl` | Local AI usage metadata | No |
| `openrouter-debug.jsonl`, `openrouter-debug.jsonl.1` | Rotating connection diagnostics; export separately from API Usage | No |
| `.env` | Optional key/model configuration for a packaged app | No |

Source/development `.env` configuration is read from the repository root. Decks are local to each app/browser installation; there is no automatic synchronization between Electron, browser, and mobile storage. Use **Export All** and **Import JSON** to transfer decks and learning data. Import into an empty library to retain the original deck IDs, or into a populated library to add copies.

A one-time migration in `main.js` copies data from the pre-rename `Anki Web` userData folder into the new `smartL3arn` folder on first launch.

The on-disk shape mirrors the in-memory state:

```json
{
  "decks": [
    {
      "id": "abc123def",
      "name": "Spanish",
      "smartSessionSeq": 2,
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
          "smartNeedsPractice": true,
          "smartLastGrade": "hard",
          "smartLastReviewedSession": 2,
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
├── electron/               # OpenRouter client, credential resolution, usage journal, tests
├── index.html              # Vite entry page
├── style.css               # shared design system and responsive styles
├── src/
│   ├── components/         # reusable Vue UI components and dialogs
│   ├── views/              # route-level Library, Browse, Study, and Smart Study screens
│   ├── stores/             # Pinia stores for data, settings, UI, and study sessions
│   ├── domain/             # shared FSRS, queues, dates, answer comparison, parsing, and types
│   ├── services/           # storage adapters, native APIs, and import handling
│   ├── i18n/               # German/English catalogs and reactive locale helpers
│   ├── App.vue
│   ├── main.ts
│   └── router.ts
├── build/
│   ├── icon.png            # desktop/browser application icon
│   └── design/             # deck covers, Kartenfächer artwork and asset notes
├── scripts/
│   ├── smoke-electron.cjs  # isolated end-to-end renderer smoke test
│   ├── design-preview-electron.cjs # example-data visual captures
│   └── generate-native-icons.swift # packages iOS/Android launcher artwork
├── .env.example            # local OpenRouter key/model configuration example
├── capacitor.config.json   # Capacitor config (webDir: web-dist)
├── web-dist/               # generated Vite bundle (gitignored)
├── ios/                    # Capacitor iOS project (Xcode)
├── android/                # Capacitor Android project (Android Studio)
├── vite.config.mts
├── tsconfig.json
├── package.json
└── README.md
```

Scheduling, queues, answer comparison, and import/export logic are shared by the browser, Electron, and Capacitor flows and covered by Vitest. Locale-aware domain helpers use the shared i18n module; platform persistence and native APIs live in services.

## Prism UI and app icons

The library, card browser, Smart Study setup, both study modes, completion and
Pomodoro screens, API usage and editor dialogs share a violet theme, macOS system
typography and coordinated light/dark surfaces. Deck covers use local artwork in
`build/design/`; they require no network requests. Existing decks need no migration.

The deck menu offers **Change name & image** with 13 local cover designs (the three
originals plus ten matching additions). Selected covers persist across restarts
and JSON backup exports/imports. **Delete deck** asks for confirmation. See
[deck cover notes and generation prompts](docs/deck-covers.md).

Action failures share a dismissible notification stack. Unresolved library saving
or loading failures remain visible; field and AI errors stay beside their existing
recovery controls. See [notification behavior and verification](docs/notifications.md).

The Kartenfächer logo uses a transparent navigation mark and matching desktop, browser, iOS, and Android artwork. Asset notes are in [build/design/brand-kartenfaecher.md](build/design/brand-kartenfaecher.md). On macOS, regenerate the native launcher images after changing their source artwork with:

```sh
swift scripts/generate-native-icons.swift
```

This replaces the iOS and Android icon assets. It uses the full-bleed `build/design/brand-kartenfaecher-ios.png` for the opaque 1024px iOS icon, and `build/icon.png` for Android legacy/round icons and adaptive foregrounds at all five densities. Android's adaptive background is configured separately in `android/app/src/main/res/values/ic_launcher_background.xml`.

Start the desktop app with `npm start`. A browser preview runs with `npm run dev`;
AI evaluation and usage tracking require the macOS desktop or native iOS app; native mobile file exports use the share sheet.

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
