# TrainWise Coding Review Guide

Use this guide to review TrainWise without relying on prior conversation history. Verify behavior against the code and regression tests before changing it. The project has accumulated deliberate edge-case handling; prefer a narrow fix over a broad rewrite.

## 1. Product and Architecture

TrainWise is a static, offline-first hypertrophy training and nutrition PWA. It has no framework or build step.

- `index.html`: application shell and versioned asset references.
- `styles.css`: complete responsive UI and animation system.
- `app.js`: state, IndexedDB, rendering, event handling, Coach rules, charts, sync, audio, and exports.
- `service-worker.js`: offline shell cache.
- `manifest.webmanifest`: PWA metadata.
- `supabase-schema.sql`: optional record-level cloud sync and legacy snapshot backup schema.
- `coach-regression.test.js`: Coach planning/progression contract tests.
- `log-regression.test.js`: Log, History, UI, storage, sync, records, timing, and shell tests.

There is intentionally no module split. Do not refactor `app.js` merely because it is large. Preserve its established helpers, event delegation, naming, and render model unless a requested change genuinely requires restructuring.

## 2. Running and Verification

Run locally from the repository root:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173`. Use a server rather than opening `index.html` directly because service workers, IndexedDB, and PWA behavior require an HTTP origin.

Required checks after relevant changes:

```powershell
node --check app.js
node --check service-worker.js
node coach-regression.test.js
node log-regression.test.js
node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest','utf8'))"
```

For UI changes, smoke-test at `390px`, `430px`, and desktop width. Check horizontal overflow, the bottom tab bar, safe-area spacing, long-screen scrolling, collapsible animations, and browser console errors.

When releasing, bump all matching locations together:

- `APP_VERSION` in `app.js`
- versioned references and deployment marker in `index.html`
- `start_url` in `manifest.webmanifest`
- `CACHE_NAME` and shell asset versions in `service-worker.js`
- version assertions in `log-regression.test.js`

Never push unless the user explicitly requests it.

## 3. Sources of Truth

### Submitted data

- Submitted strength workouts live in IndexedDB `workouts`.
- Submitted nutrition/body metrics live in IndexedDB `metrics`, canonically one merged entry per local date.
- Only submitted/locked or updated entries count toward Coach, Today, Trends, Records, and weekly totals.
- Unsaved drafts must never affect charts, records, Coach performance analysis, or cloud record sync.

### Draft data

- Strength drafts are kept per date in local storage and state.
- Navigating dates must load that date's saved workout or its own draft; it must not carry the last viewed date's rows into another date.
- An empty date stays empty unless the user explicitly adds, copies, restores, templates, or starts an exercise.
- Coach and exercise `Log` actions append. They must not replace unrelated draft work.
- Clearing copied Coach content removes only untouched Coach-copied rows/tables. Edited or manually created work is preserved.

### Settings and library

- Custom exercises, templates, and settings are in IndexedDB `settings`.
- Exercise definitions are the source of truth for muscle mappings, loading style, rep range, progression mode, load increment, rest range, archive state, and exercise type.
- Archived/hidden exercises remain available for historical display but must not appear in new Coach plans.

## 4. Navigation and UI Contracts

Bottom tabs are Today, Log, Trends, Coach, Exercises, History, and Settings.

- Normal tab changes are fresh navigation and do not restore old scroll positions.
- Temporary/detail screens push a return context and Back restores the source view and exact scroll position after rendering.
- Long screens show a small fixed scroll-to-top control only when the page is sufficiently long and past the configured threshold. It animates in, auto-hides, and remains above the mobile tab bar.
- Long sections use the shared `details.collapsible-panel` treatment. Collapsing/expanding should animate smoothly without sticky panels obscuring content.
- The tab bar stays at the visible bottom. It may compact while scrolling but must not become stuck higher on the page.
- Audio cues are optional and controlled by Settings. AudioContext creation/resume must remain tied to genuine user gestures; visibility/focus lifecycle events should only mark audio for resume.

Preserve mobile-first spacing, wrapped action buttons, existing colors, muscle artwork, record icons, transition classes, and safe-area handling.

## 5. Strength Log

Each exercise table contains ordered set rows with:

- load in pounds, including decimal increments such as `0.5`
- reps
- RIR controlled by `-` and `+`, clamped to `0-100`
- rest duration
- previous-session context

Important behavior:

- The final exercise table can be removed; Log then returns to the empty state.
- `Today` navigates to today's saved workout or today's own draft. It must not transfer a different date's rows.
- Lock in creates submitted workout records. Update modifies the selected submitted records.
- Unfinished default rows block submission; intentional bodyweight work uses `0 lb` with completed reps/RIR/rest as appropriate.
- Coach-copied rows have a subtle gold draft-only highlight while exactly matching their copied snapshot. Editing one row removes only that row's highlight.
- Coach-copy metadata is not persisted into the submitted workout as draft highlighting metadata.
- Mobile table dragging uses long-press, tolerates small initial movement, and coexists with reorder arrows.
- Exercise history/detail navigation returns to the exact Log scroll location.

### Workout timer

The compact timer sits by the date/Today controls.

- Available only for a new current-date Strength draft.
- Disabled for historical dates and submitted-workout editing.
- Persists accumulated active seconds plus the current running interval timestamp.
- Pause/resume/refresh cannot double-count time.
- A timer is discarded if its date or draft identity no longer matches.
- Successful lock-in stores immutable `sessionTiming` metadata and then clears the timer; failed lock-in preserves it.

## 6. Set and Muscle Accounting

The Monday-start local training week is the common weekly boundary.

- A set at `0-3 RIR` counts as `1.0` hard set.
- A set above `3 RIR` counts as `0.5` hard set.
- Primary muscles receive `1.0x` the exercise's hard-set credit.
- Secondary muscles receive `0.5x` credit.
- Weekly muscle details must expose every contributing exercise and set, including secondary stimulus.
- Touches are distinct training dates. They are informational and useful for distribution, but satisfied touches must not by themselves block selected target volume.

Core volume landmarks:

- floor: `10` credited weekly sets
- growth zone: `12-20`
- cautious aggressive fill ceiling: `22` under current Coach rules
- desired frequency: generally two touches

Do not describe 20 as universally optimal. Secondary credit must be included before prescribing redundant direct work.

## 7. Exercise Definitions and Progression

### Type

- Manual `Compound` or `Isolation` selection wins.
- A legacy exercise without a manual type is classified as Compound when it has secondary muscles, otherwise Isolation.
- Timing setup is `180 seconds` for Compound and `60 seconds` for Isolation.

### Loading style

- Explicit `Standard` uses its configured standard range.
- Explicit `High-rep` has a strict effective range of `20-30`, even if stale stored text says `8-15`.
- `Auto` follows its configured range; low bound `>=15` is treated as High-rep for timing/progression style, but Auto is not silently rewritten to explicit High-rep.
- Changing style in Exercises sets the conventional range (`8-15` Standard, `20-30` High-rep).
- Historical workouts retain the style stored at submission.
- Style changes start a neutral transition phase; Coach converts the latest opposite-style performance but does not mix phases when judging success/failure.

### High-rep invariant

For an explicitly High-rep exercise:

- No Today, Week, debug recommendation, or copied Log row may prescribe fewer than 20 or more than 30 reps.
- A load increase requires RIR-adjusted top-set capacity of at least 30, every working set at 20+ actual reps, normal load progression mode, and no recovery/failure/deload block.
- If earned, increase by the configured smallest increment and reset to at least 20 reps.
- Otherwise hold load and progress reps, or reduce load when failure logic requires a reset.
- Standard-to-High-rep conversion starts near the 25-rep midpoint.

Progression preferences:

- `Normal`: ordinary load progression.
- `Small jumps only`: use the smallest configured/practical increment.
- `Rep-first / load-limited`: prioritize reps, RIR, control, and set quality before load.

## 8. Coach Today Plan

Coach is deterministic and rule-based, not an AI/API service.

Priority order:

1. Respect direct-muscle recovery and performance/deload safeguards.
2. Bring feasible muscles toward the 10-set weekly floor.
3. Give selected target muscles remaining useful capacity.
4. Fill non-target growth work only after floors and feasible targets.

Session contracts:

- Minimum `2` sets for every prescribed exercise.
- Maximum `6` exercises per session.
- Selected duration is a hard planning constraint with the existing `+3 minute` tolerance.
- Active exercise coverage is required; Coach never invents exercises.
- Archived/hidden exercises are excluded.
- Exercises are ordered with compounds first when practical and same-muscle exercises separated when alternatives exist.
- Copy to Log preserves Coach order and appends to existing drafts.

Global modes are Soft, Medium, and Aggressive. Per-target overrides may supersede the global mode. Higher modes should visibly increase eligible work or provide an exact guardrail reason when they cannot. Recovery and failure safeguards may legitimately make modes equal.

## 9. Weekly Coach

The Week view builds the remaining Monday-start week from:

- selected workout days
- average minutes per selected session
- submitted workouts already completed this week
- per-muscle equalizer targets and priority selections
- current active exercise library, loading styles, rest ranges, and progression constraints

Planning order is strict:

1. floors for every feasible muscle
2. prioritized muscles toward their configured targets
3. optional non-priority work

Secondary stimulus is credited during allocation. Optional work must not consume capacity while a feasible priority target remains unmet. Each session keeps the two-set minimum, six-exercise maximum, recovery spacing, and duration tolerance.

The equalizer is an editable preview. Faders and quick picks may rebalance capacity, but they must not drift on unrelated renders. Generate commits the exact visible form and replaces the previous generated result. The source fingerprint marks a plan stale when relevant workouts, styles, library definitions, days, duration, priorities, or targets change; it must not arbitrarily randomize identical inputs.

Copying a generated day does not require regenerating solely because the current calendar date changed. It does require the exercise to remain active and the saved day to remain valid.

## 10. Time Estimation

For an exercise with `S > 0`:

```text
setup = Compound 180s; Isolation 60s
work = Standard 45s/set; High-rep 60s/set
rest = max(0, S - 1) * estimatedRestSeconds
raw = setup + work + rest
```

Rest uses the latest three eligible submitted session averages for the exact exercise ID and effective loading style. A unique legacy-name fallback is allowed only when the historical row has no ID. Otherwise use the configured rest midpoint, then 90 seconds.

The final session estimate is rounded once:

```text
ceil(totalRawSeconds * personalCorrectionFactor / 60)
```

Personal correction uses recent valid timed sessions, deduplicated by `timingSessionId`, versioned by `coach-time-v1`, and excludes the workout being submitted from its own baseline. Do not simplify this into per-exercise rounded minutes or rederive old baselines from current settings.

## 11. Nutrition, Maintenance, and Trends

Nutrition logging supports meal-based calories/protein, body weight, and notes. Saving or updating a date creates the canonical submitted metric and queues sync.

Maintenance uses Mifflin-St Jeor with profile sex, birth year, height, activity multiplier, and preferably the current 7-day average body weight. It is always labeled `estimated maintenance`, with confidence based on profile completeness and recent data.

Trends use the shared SVG `lineChart()` system:

- adaptive Y-axis ticks
- compact first/middle/last X-axis labels
- interactive point readout
- subtle rolling averages where configured
- body weight uses the 7-day average behavior
- workout-derived series use `7-entry avg` wording when calendar-day wording would be misleading

Drafts never enter trend data. Empty and one-point series require safe rendering without clipping or misleading axes.

## 12. History and Records

History has Records, Exercises, and Dates modes plus temporary detail screens.

Records are calculated live from submitted data and include strength, body-weight high/low and weekly change, nutrition, muscle, exercise, volume, and consistency records. Archived historical exercises remain eligible. Drafts and sample data are excluded where the existing record helper specifies.

- Muscle records use the same primary `1.0x` and secondary `0.5x` stimulus math.
- Set volume is load x reps.
- Exercise-session volume sums one exercise entry.
- Full-session volume aggregates submitted entries sharing a date.
- Ties generally resolve to the most recent occurrence.
- Records use gold purpose-specific icons, not trophy abbreviations.

## 13. Backup and Sync

Local JSON export/import is the independent full recovery path. Exports include workouts, metrics, exercises, templates, and safe settings while excluding Supabase secrets/session credentials.

Supabase has two paths:

- record sync through `fitness_sync_records` and `apply_fitness_sync_change`
- legacy full snapshots in `fitness_snapshots` for manual recovery compatibility

Record sync includes submitted workouts, canonical daily metrics, exercises (including archived definitions), templates, and safe preferences such as maintenance profile and weekly Coach settings. Drafts, timers, Supabase passwords, and sessions remain device-local.

Lock/update workout and save/update nutrition queue durable sync changes. Manual Push/Pull remain available. Conflict handling is revision-aware; do not replace it with last-write-wins without explicit approval. RLS policies must keep every user restricted to their own records.

## 14. Review Priorities

When reviewing a change, check these failure-prone boundaries first:

- Drafts accidentally counted as submitted data.
- Date navigation carrying one date's draft into another.
- Coach actions replacing rather than appending Log rows.
- Weekly priority capacity leaking to non-priorities.
- Secondary stimulus omitted or counted twice.
- Archived exercises entering new plans.
- Explicit High-rep prescriptions escaping `20-30`.
- Loading-style histories contaminating one another.
- Recovery/failure safeguards being bypassed to satisfy targets.
- Session plans exceeding six exercises, one-set fragments, or duration tolerance.
- Equalizer state being overwritten by rerenders or stale preview state.
- Sync omitting safe preferences or including secrets/drafts.
- AudioContext being created outside a genuine user gesture.
- Temporary Back navigation losing source scroll.
- PWA shell versions becoming inconsistent.

## 15. Change Discipline

For bugs:

1. Reproduce or extract a minimal scenario from a debug export.
2. Identify the exact helper and invariant involved.
3. Add a regression that fails for the reported case.
4. Make the smallest safe implementation change.
5. Run both suites when shared Coach/Log/storage behavior is touched.
6. Browser-test the actual user workflow, not only helper output.

Do not delete apparently unused features, change training policy, alter audio lifecycle code, rewrite storage, or normalize historical records without explicit user approval. If a request conflicts with recovery, data integrity, or another established contract, explain the conflict before coding.
