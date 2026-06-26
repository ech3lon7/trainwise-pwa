const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let appCode = fs.readFileSync("app.js", "utf8");
appCode = appCode.replace(/init\(\)\.catch\([\s\S]*?\n\}\);\s*$/, "");
const stylesCode = fs.readFileSync("styles.css", "utf8");
const serviceWorkerCode = fs.readFileSync("service-worker.js", "utf8");
const indexCode = fs.readFileSync("index.html", "utf8");

const context = {
  console,
  crypto: { randomUUID: () => `id-${Math.random().toString(16).slice(2)}` },
  Date,
  Intl,
  Math,
  Number,
  String,
  Array,
  Object,
  Set,
  Map,
  Promise,
  setTimeout,
  clearTimeout,
  navigator: { storage: {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  window: {
    clearTimeout,
    setTimeout,
    location: { reload() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  },
  document: {
    getElementById: () => ({
      innerHTML: "",
      addEventListener() {},
      classList: { toggle() {}, add() {}, remove() {} },
      dataset: {},
      style: {},
      querySelectorAll: () => []
    }),
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    documentElement: { scrollWidth: 390, clientWidth: 390 }
  }
};
context.window.document = context.document;

vm.createContext(context);
vm.runInContext(appCode, context);

function runScenario(source) {
  return vm.runInContext(source, context);
}

const reset = `
  state.workouts = [];
  state.metrics = [];
  state.settings = {
    customExercises: [
      {
        id: "custom-bench",
        name: "Bench Press",
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps"],
        equipment: "barbell",
        reps: "6-12",
        rest: "90-180 sec",
        cue: "Test bench."
      },
      {
        id: "custom-row",
        name: "Cable Row",
        primaryMuscles: ["back"],
        secondaryMuscles: ["biceps"],
        equipment: "cable",
        reps: "8-15",
        rest: "90-180 sec",
        cue: "Test row."
      }
    ]
  };
  state.selectedExercise = "Bench Press";
  state.draftTargetMuscle = "chest";
  state.draftNotes = "";
  state.editingWorkoutId = null;
  state.workoutDraft = [];
  state.dismissedRecordTrophies = new Set();
  state.weeklyMuscleDetail = null;
  var makeWorkout = (overrides = {}) => ({
    id: overrides.id || "workout-" + Math.random(),
    date: overrides.date || "2026-06-10",
    exercise: overrides.exercise || "Bench Press",
    exerciseId: overrides.exerciseId || "custom-bench",
    primaryMuscles: overrides.primaryMuscles || ["chest"],
    secondaryMuscles: overrides.secondaryMuscles || ["triceps"],
    setRows: overrides.setRows || [
      { weight: 100, reps: 11, rir: 2, restSeconds: 120 },
      { weight: 95, reps: 10, rir: 2, restSeconds: 120 }
    ],
    sets: overrides.sets || 2,
    reps: overrides.reps || 11,
    weight: overrides.weight || 100,
    rir: overrides.rir || 2,
    notes: overrides.notes || "",
    order: overrides.order,
    createdAt: overrides.createdAt || "2026-06-10T12:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-06-10T12:00:00.000Z"
  });
`;

const mobileStart = stylesCode.indexOf("@media (max-width: 720px)");
const mobileEnd = stylesCode.indexOf("@media (max-width: 420px)");
const mobileCss = mobileStart >= 0 && mobileEnd > mobileStart ? stylesCode.slice(mobileStart, mobileEnd) : "";
assert(mobileCss.includes('"drag record direction muscles spacer"'), "Expected mobile exercise header to keep icons left of the field.");
assert(mobileCss.includes(".set-table th.prev-cell"), "Expected mobile set table to hide Prev header at the 720px breakpoint.");
assert(mobileCss.includes(".set-table td.prev-cell"), "Expected mobile set table to hide Prev values at the 720px breakpoint.");
assert(mobileCss.includes("table-layout: fixed"), "Expected mobile set table to use fixed columns.");
assert(mobileCss.includes(".set-table tr"), "Expected mobile set table rows to use explicit grid layout.");
assert(mobileCss.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr) minmax(88px, 0.9fr)"), "Expected mobile set table to define visible input columns with RIR stepper room.");
assert(mobileCss.includes(".set-table td.mobile-set-meta"), "Expected mobile row metadata to be visible on mobile.");
assert(/\.mobile-set-meta\s*{\s*display:\s*none;/.test(stylesCode), "Expected mobile row metadata to be hidden by default.");
assert(!appCode.includes("exercise-title-dumbbell"), "Expected extra dumbbell icon next to record/muscle icons to be removed.");
assert(stylesCode.includes(".nutrition-meal-grid"), "Expected nutrition meal buckets to have dedicated layout styling.");
assert(mobileCss.includes(".nutrition-meal-grid"), "Expected nutrition meal buckets to stack safely on mobile.");
assert(stylesCode.includes(".nutrition-total-strip"), "Expected nutrition form to show live daily totals.");
assert(stylesCode.includes(".nutrition-quick-card"), "Expected quick daily totals to have dedicated layout styling.");
assert(stylesCode.includes(".nutrition-quick-card.is-overridden"), "Expected quick daily totals to show an overridden state.");
assert(stylesCode.includes(".nutrition-override-message"), "Expected meal override message to have dedicated styling.");
assert(serviceWorkerCode.includes("shouldHandleRequest"), "Expected service worker request guard helper.");
assert(serviceWorkerCode.includes('request.headers.has("Authorization")'), "Expected service worker to bypass authorized requests.");
assert(serviceWorkerCode.includes("url.origin === self.location.origin"), "Expected service worker to bypass cross-origin requests.");
assert(serviceWorkerCode.includes("shouldCacheResponse"), "Expected service worker to guard cache writes.");
assert(appCode.includes("Delete this workout?"), "Expected workout deletes to ask for confirmation.");
assert(appCode.includes("Delete nutrition entry"), "Expected metric deletes to ask for confirmation.");
assert(appCode.includes("Stored only in this browser on this device"), "Expected Supabase password helper text.");
assert(stylesCode.includes(".exercise-library-controls"), "Expected Exercises library controls to have dedicated styling.");
assert(stylesCode.includes(".exercise-coverage-list"), "Expected Exercises coverage panel to have dedicated styling.");
assert(stylesCode.includes(".exercise-action-menu"), "Expected Exercises card action menu styling.");
assert(!stylesCode.includes(".mobile-quick-actions"), "Expected floating mobile quick actions to be removed.");
assert(stylesCode.includes(".app-banner"), "Expected persistent app banner styling.");
assert(stylesCode.includes(".date-control"), "Expected shared date control styling.");
assert(stylesCode.includes(".modal-backdrop"), "Expected import preview modal styling.");
assert(stylesCode.includes(".data-safety-grid"), "Expected data safety summary styling.");
assert(stylesCode.includes(".widget-preference-list"), "Expected Today widget preference styling.");
assert(stylesCode.includes(".collapsible-panel"), "Expected secondary settings/notes panels to be collapsible.");
assert(stylesCode.includes(".settings-panel.collapsible-panel"), "Expected Settings panels to use collapsible panel styling.");
assert(stylesCode.includes(".empty-restore-row"), "Expected inline Log empty-state restore styling.");
assert(appCode.includes("muscle-audit-panel"), "Expected long Coach muscle set audit to be collapsible.");
assert(appCode.includes("scrollTopButtonShouldShow"), "Expected scroll-to-top threshold helper.");
assert(appCode.includes("scrollTopButtonTopOffset"), "Expected scroll-to-top viewport positioning helper.");
assert(indexCode.includes("scroll-top-button"), "Expected app shell to include scroll-to-top control outside app content.");
assert(stylesCode.includes(".scroll-top-button"), "Expected scroll-to-top button styling.");
assert(stylesCode.includes(".scroll-top-button::before"), "Expected scroll-to-top button to use a chevron-style icon.");
assert(stylesCode.includes(".drag-handle.is-pending"), "Expected drag handle pending animation styling.");
assert(stylesCode.includes("translateX(58px)"), "Expected scroll-to-top button to slide in from the right.");
assert(!appCode.includes("renderMobileQuickActions"), "Expected floating quick action renderer to be removed.");
assert(!appCode.includes('selectedExercise: "Push-up"'), "Expected Log startup not to default to Push-up.");
assert(!appCode.includes('showBanner("Unsaved draft restored."'), "Expected startup draft recovery not to show a top banner.");
assert(appCode.includes("notifyMetricSaved"), "Expected metrics saves to use a dedicated bottom-only notification helper.");
assert(!stylesCode.includes(".mobile-quick-toggle"), "Expected floating quick action button styling to be removed.");
assert(indexCode.includes("v=1.5.42"), "Expected index shell references to use bumped app version.");
assert(!indexCode.includes('id="app" class="app-content" aria-live'), "Expected broad app aria-live to be removed in favor of targeted live regions.");
assert(serviceWorkerCode.includes("trainwise-cache-v64"), "Expected service worker cache version bump.");
assert(appCode.includes("data-settings-panel"), "Expected Settings panels to preserve open state with stable panel ids.");
assert(appCode.includes('forceSettingsPanelOpen("supabase-sync")'), "Expected Supabase actions to keep the Supabase panel open after rendering.");

const settingsPanelOpenState = runScenario(`
  state.settingsOpenPanels = [];
  var closed = renderSettingsPanel("Supabase sync", "offline", "<p>Body</p>", { id: "supabase-sync" });
  forceSettingsPanelOpen("supabase-sync");
  var open = renderSettingsPanel("Supabase sync", "offline", "<p>Body</p>", { id: "supabase-sync" });
  setSettingsPanelOpen("supabase-sync", false);
  var closedAgain = renderSettingsPanel("Supabase sync", "offline", "<p>Body</p>", { id: "supabase-sync" });
  ({
    closedHasOpen: closed.includes(" open"),
    openHasOpen: open.includes(" open"),
    closedAgainHasOpen: closedAgain.includes(" open")
  });
`);

assert.strictEqual(settingsPanelOpenState.closedHasOpen, false, "Expected Supabase settings panel to start collapsed without session state.");
assert.strictEqual(settingsPanelOpenState.openHasOpen, true, "Expected Supabase settings panel to render open after session preservation.");
assert.strictEqual(settingsPanelOpenState.closedAgainHasOpen, false, "Expected Supabase settings panel to respect user collapse.");

const nutritionQuickTotals = runScenario(`
  ${reset}
  var entry = metricEntryFromFormData({
    date: "2026-06-15",
    bodyWeight: "181.5",
    calories: "2400",
    protein: "180",
    notes: "Fast entry"
  });
  ({
    calories: entry.calories,
    protein: entry.protein,
    bodyWeight: entry.bodyWeight,
    hasMealDetail: metricHasMealData(entry),
    snackCalories: entry.meals.snacks.calories,
    note: entry.notes
  });
`);

assert.strictEqual(nutritionQuickTotals.calories, 2400, `Expected quick calories to save as day total, got ${nutritionQuickTotals.calories}`);
assert.strictEqual(nutritionQuickTotals.protein, 180, `Expected quick protein to save as day total, got ${nutritionQuickTotals.protein}`);
assert.strictEqual(nutritionQuickTotals.bodyWeight, 181.5, `Expected quick body weight parse, got ${nutritionQuickTotals.bodyWeight}`);
assert.strictEqual(nutritionQuickTotals.hasMealDetail, false, "Expected quick totals not to be classified as meal detail.");
assert.strictEqual(nutritionQuickTotals.snackCalories, 0, `Expected quick totals not to prefill Snacks, got ${nutritionQuickTotals.snackCalories}`);
assert.strictEqual(nutritionQuickTotals.note, "Fast entry", `Expected quick notes to persist, got ${nutritionQuickTotals.note}`);

const nutritionMealsOverrideQuickTotals = runScenario(`
  ${reset}
  var entry = metricEntryFromFormData({
    date: "2026-06-15",
    calories: "2400",
    protein: "180",
    "meal-breakfast-calories": "500",
    "meal-breakfast-protein": "40"
  });
  ({
    calories: entry.calories,
    protein: entry.protein,
    breakfastCalories: entry.meals.breakfast.calories,
    snackCalories: entry.meals.snacks.calories
  });
`);

assert.strictEqual(nutritionMealsOverrideQuickTotals.calories, 500, `Expected meal detail to override quick calories, got ${nutritionMealsOverrideQuickTotals.calories}`);
assert.strictEqual(nutritionMealsOverrideQuickTotals.protein, 40, `Expected meal detail to override quick protein, got ${nutritionMealsOverrideQuickTotals.protein}`);
assert.strictEqual(nutritionMealsOverrideQuickTotals.breakfastCalories, 500, `Expected breakfast calories to persist, got ${nutritionMealsOverrideQuickTotals.breakfastCalories}`);
assert.strictEqual(nutritionMealsOverrideQuickTotals.snackCalories, 0, `Expected unused snacks to stay empty, got ${nutritionMealsOverrideQuickTotals.snackCalories}`);

const nutritionMealRollup = runScenario(`
  ${reset}
  var entry = metricEntryFromFormData({
    date: "2026-06-15",
    bodyWeight: "181.5",
    notes: "Good day",
    "meal-breakfast-calories": "420",
    "meal-breakfast-protein": "35",
    "meal-lunch-calories": "700",
    "meal-lunch-protein": "55",
    "meal-dinner-calories": "850",
    "meal-dinner-protein": "65",
    "meal-snacks-calories": "250",
    "meal-snacks-protein": "20"
  });
  ({
    calories: entry.calories,
    protein: entry.protein,
    bodyWeight: entry.bodyWeight,
    breakfastProtein: entry.meals.breakfast.protein,
    snacksCalories: entry.meals.snacks.calories,
    note: entry.notes
  });
`);

assert.strictEqual(nutritionMealRollup.calories, 2220, `Expected meal calories to roll up to 2220, got ${nutritionMealRollup.calories}`);
assert.strictEqual(nutritionMealRollup.protein, 175, `Expected meal protein to roll up to 175, got ${nutritionMealRollup.protein}`);
assert.strictEqual(nutritionMealRollup.bodyWeight, 181.5, `Expected body weight parse, got ${nutritionMealRollup.bodyWeight}`);
assert.strictEqual(nutritionMealRollup.breakfastProtein, 35, `Expected breakfast protein to persist, got ${nutritionMealRollup.breakfastProtein}`);
assert.strictEqual(nutritionMealRollup.snacksCalories, 250, `Expected snacks calories to persist, got ${nutritionMealRollup.snacksCalories}`);
assert.strictEqual(nutritionMealRollup.note, "Good day", `Expected notes to persist, got ${nutritionMealRollup.note}`);

const nutritionExistingUpdate = runScenario(`
  ${reset}
  var existing = {
    id: "metric-existing",
    date: "2026-06-15",
    bodyWeight: 180,
    calories: 2100,
    protein: 150,
    notes: "Original",
    createdAt: "2026-06-15T08:00:00.000Z"
  };
  var entry = metricEntryFromFormData({
    date: "2026-06-15",
    bodyWeight: "181",
    notes: "Corrected",
    "meal-breakfast-calories": "500",
    "meal-breakfast-protein": "40"
  }, existing);
  ({ id: entry.id, createdAt: entry.createdAt, calories: entry.calories, protein: entry.protein, notes: entry.notes });
`);

assert.strictEqual(nutritionExistingUpdate.id, "metric-existing", `Expected update to keep existing id, got ${nutritionExistingUpdate.id}`);
assert.strictEqual(nutritionExistingUpdate.createdAt, "2026-06-15T08:00:00.000Z", "Expected update to preserve createdAt.");
assert.strictEqual(nutritionExistingUpdate.calories, 500, `Expected corrected calories to use meals, got ${nutritionExistingUpdate.calories}`);
assert.strictEqual(nutritionExistingUpdate.protein, 40, `Expected corrected protein to use meals, got ${nutritionExistingUpdate.protein}`);
assert.strictEqual(nutritionExistingUpdate.notes, "Corrected", `Expected corrected notes, got ${nutritionExistingUpdate.notes}`);

const nutritionDuplicateMerge = runScenario(`
  ${reset}
  state.metrics = [
    { id: "old", date: "2026-06-15", bodyWeight: 180, calories: 1000, protein: 80, notes: "Old", createdAt: "2026-06-15T08:00:00.000Z" },
    { id: "new", date: "2026-06-15", bodyWeight: 181, calories: 0, protein: 0, meals: { lunch: { calories: 700, protein: 55 } }, notes: "New", createdAt: "2026-06-15T12:00:00.000Z" },
    { id: "other", date: "2026-06-14", bodyWeight: 179, calories: 2200, protein: 170, createdAt: "2026-06-14T08:00:00.000Z" }
  ];
  var merged = metricForDate("2026-06-15");
  var canonical = canonicalMetricEntries();
  ({
    id: merged.id,
    calories: merged.calories,
    protein: merged.protein,
    bodyWeight: merged.bodyWeight,
    notes: merged.notes,
    snacksCalories: merged.meals.snacks.calories,
    quickCalories: merged.quickCalories,
    lunchProtein: merged.meals.lunch.protein,
    canonicalCount: canonical.length,
    duplicateIds: metricDuplicateIdsForDate("2026-06-15", merged.id)
  });
`);

assert.strictEqual(nutritionDuplicateMerge.id, "new", `Expected newest metric id to be canonical, got ${nutritionDuplicateMerge.id}`);
assert.strictEqual(nutritionDuplicateMerge.calories, 1700, `Expected duplicate calories to merge, got ${nutritionDuplicateMerge.calories}`);
assert.strictEqual(nutritionDuplicateMerge.protein, 135, `Expected duplicate protein to merge, got ${nutritionDuplicateMerge.protein}`);
assert.strictEqual(nutritionDuplicateMerge.bodyWeight, 181, `Expected newest body weight to win, got ${nutritionDuplicateMerge.bodyWeight}`);
assert.strictEqual(nutritionDuplicateMerge.notes, "New", `Expected newest notes to win, got ${nutritionDuplicateMerge.notes}`);
assert.strictEqual(nutritionDuplicateMerge.quickCalories, 1000, `Expected legacy calories to preserve as quick totals, got ${nutritionDuplicateMerge.quickCalories}`);
assert.strictEqual(nutritionDuplicateMerge.snacksCalories, 0, `Expected legacy calories not to prefill Snacks, got ${nutritionDuplicateMerge.snacksCalories}`);
assert.strictEqual(nutritionDuplicateMerge.lunchProtein, 55, `Expected meal protein to preserve, got ${nutritionDuplicateMerge.lunchProtein}`);
assert.strictEqual(nutritionDuplicateMerge.canonicalCount, 2, `Expected canonical metrics to collapse same-date duplicates, got ${nutritionDuplicateMerge.canonicalCount}`);
assert.deepEqual(nutritionDuplicateMerge.duplicateIds, ["old"], `Expected old duplicate id to be deleted, got ${nutritionDuplicateMerge.duplicateIds.join(", ")}`);

const nutritionCanonicalAverages = runScenario(`
  ${reset}
  state.metrics = [
    { id: "old", date: dateDaysAgo(0), calories: 1000, protein: 80, bodyWeight: 180, createdAt: dateDaysAgo(0) + "T08:00:00.000Z" },
    { id: "new", date: dateDaysAgo(0), meals: { dinner: { calories: 700, protein: 50 } }, bodyWeight: 181, createdAt: dateDaysAgo(0) + "T12:00:00.000Z" },
    { id: "prior", date: dateDaysAgo(1), calories: 2300, protein: 170, bodyWeight: 179, createdAt: dateDaysAgo(1) + "T08:00:00.000Z" }
  ];
  ({
    calorieAverage: getAverage("calories", 7),
    proteinAverage: getAverage("protein", 7),
    seriesCount: seriesFromMetrics("calories").length,
    latestWeight: lastMetric("bodyWeight").bodyWeight
  });
`);

assert.strictEqual(nutritionCanonicalAverages.calorieAverage, 2000, `Expected canonical calorie average, got ${nutritionCanonicalAverages.calorieAverage}`);
assert.strictEqual(nutritionCanonicalAverages.proteinAverage, 150, `Expected canonical protein average, got ${nutritionCanonicalAverages.proteinAverage}`);
assert.strictEqual(nutritionCanonicalAverages.seriesCount, 2, `Expected metric chart series to use one point per date, got ${nutritionCanonicalAverages.seriesCount}`);
assert.strictEqual(nutritionCanonicalAverages.latestWeight, 181, `Expected latest canonical body weight, got ${nutritionCanonicalAverages.latestWeight}`);

const nutritionFormMarkup = runScenario(`
  ${reset}
  state.logMode = "metrics";
  state.metricDate = "2026-06-15";
  state.metrics = [
    { id: "legacy", date: "2026-06-15", bodyWeight: 182, calories: 2400, protein: 180, notes: "Legacy total", createdAt: "2026-06-15T08:00:00.000Z" }
  ];
  renderLog();
`);

assert(nutritionFormMarkup.includes("Breakfast"), "Expected nutrition form to include Breakfast meal bucket.");
assert(nutritionFormMarkup.includes("Lunch"), "Expected nutrition form to include Lunch meal bucket.");
assert(nutritionFormMarkup.includes("Dinner"), "Expected nutrition form to include Dinner meal bucket.");
assert(nutritionFormMarkup.includes("Snacks"), "Expected nutrition form to include Snacks meal bucket.");
assert(nutritionFormMarkup.includes("Update metrics"), "Expected existing date to render Update metrics button.");
assert(nutritionFormMarkup.includes('id="calories"'), "Expected nutrition form to include quick calorie totals.");
assert(nutritionFormMarkup.includes('id="protein"'), "Expected nutrition form to include quick protein totals.");
assert(nutritionFormMarkup.includes('id="calories" name="calories"'), "Expected quick calories input to use the legacy calories name.");
assert(nutritionFormMarkup.includes('id="meal-snacks-calories" name="meal-snacks-calories" data-meal-field="calories" type="number" inputmode="decimal" min="0" step="1" value=""'), "Expected legacy daily calories not to prefill Snacks.");
assert(nutritionFormMarkup.includes('id="calories" name="calories" data-quick-field="calories" type="number" inputmode="decimal" min="0" step="1" value="2400"'), "Expected legacy daily calories to prefill quick totals.");
assert(nutritionFormMarkup.includes("Legacy total"), "Expected existing notes to prefill.");

const nutritionMealOverrideMarkup = runScenario(`
  ${reset}
  state.logMode = "metrics";
  state.metricDate = "2026-06-15";
  state.metrics = [
    {
      id: "meal-detail",
      date: "2026-06-15",
      calories: 500,
      protein: 40,
      mealDetail: true,
      meals: { breakfast: { calories: 500, protein: 40 } },
      createdAt: "2026-06-15T08:00:00.000Z"
    }
  ];
  renderLog();
`);

assert(nutritionMealOverrideMarkup.includes("nutrition-quick-card is-overridden"), "Expected quick daily total card to show overridden state when meals exist.");
assert(nutritionMealOverrideMarkup.includes("Using meal details for today"), "Expected override message to explain meal details are active.");
assert(nutritionMealOverrideMarkup.includes('id="calories" name="calories" data-quick-field="calories" type="number" inputmode="decimal" min="0" step="1" value="" readonly aria-disabled="true"'), "Expected quick calories input to lock when meal details exist.");
assert(nutritionMealOverrideMarkup.includes('id="protein" name="protein" data-quick-field="protein" type="number" inputmode="decimal" min="0" step="1" value="" placeholder="g" readonly aria-disabled="true"'), "Expected quick protein input to lock when meal details exist.");

const emptyLogStartup = runScenario(`
  ${reset}
  state.logMode = "strength";
  state.settings.customExercises = [];
  state.selectedExercise = "";
  state.workoutDraft = [];
  state.draftDate = "2026-06-16";
  renderLog();
`);

assert(emptyLogStartup.includes("Add an exercise to start logging strength."), "Expected empty Log to ask for a real library exercise.");
assert(!emptyLogStartup.includes("Push-up"), "Expected empty Log startup not to render Push-up.");
assert(!emptyLogStartup.includes('class="set-table"'), "Expected empty Log startup not to create a fake set table.");

const emptyLogWithLibrary = runScenario(`
  ${reset}
  state.logMode = "strength";
  clearWorkoutDraft("2026-06-16");
  renderLog();
`);

assert(emptyLogWithLibrary.includes("Add an exercise to start logging strength."), "Expected empty strength date to remain empty even when library exercises exist.");
assert(!emptyLogWithLibrary.includes("Bench Press"), "Expected empty strength date not to auto-load the first library exercise.");
assert(!emptyLogWithLibrary.includes('class="set-table"'), "Expected empty strength date not to create a set table from library defaults.");

const explicitAddExerciseCreatesDraft = runScenario(`
  ${reset}
  state.logMode = "strength";
  clearWorkoutDraft("2026-06-16");
  state.workoutDraft.push(defaultDraftExercise(defaultLogExerciseName()));
  syncLegacyDraftFromFirst();
  renderLog();
`);

assert(explicitAddExerciseCreatesDraft.includes("Bench Press"), "Expected explicit Add exercise action to create a library draft.");
assert(explicitAddExerciseCreatesDraft.includes('class="set-table"'), "Expected explicit Add exercise action to create an editable set table.");

const nutritionToEmptyStrength = runScenario(`
  ${reset}
  state.logMode = "metrics";
  state.metricDate = "2026-06-16";
  applyLogModeSwitch("strength");
  state.logMode = "strength";
  renderLog();
`);

assert(nutritionToEmptyStrength.includes("Add an exercise to start logging strength."), "Expected switching from nutrition to empty strength date to stay empty.");
assert(!nutritionToEmptyStrength.includes("Bench Press"), "Expected nutrition-to-strength switch not to create a stale first exercise.");

const savedDateStillLoadsStrength = runScenario(`
  ${reset}
  state.workouts = [makeWorkout({ id: "saved-bench", date: "2026-06-16", exercise: "Bench Press", exerciseId: "custom-bench" })];
  state.logMode = "strength";
  loadWorkoutDateDraft("2026-06-16");
  renderLog();
`);

assert(savedDateStillLoadsStrength.includes("Bench Press"), "Expected saved strength date to load existing workout entries.");
assert(savedDateStillLoadsStrength.includes('class="set-table"'), "Expected saved strength date to keep editable set table.");

const nutritionDateSwitchClearsStaleDraft = runScenario(`
  ${reset}
  state.logMode = "metrics";
  state.metricDate = "2026-06-15";
  state.metricFormDraft = {
    date: "2026-06-15",
    data: { date: "2026-06-15", calories: "2400", protein: "180", bodyWeight: "182", notes: "old date" }
  };
  loadMetricDateDraft("2026-06-16");
  renderLog();
`);

assert(nutritionDateSwitchClearsStaleDraft.includes('id="metric-date"'), "Expected nutrition date field to render after switching date.");
assert(!nutritionDateSwitchClearsStaleDraft.includes('value="2400"'), "Expected quick calories from the previous date not to follow the new nutrition date.");
assert(!nutritionDateSwitchClearsStaleDraft.includes("old date"), "Expected notes from the previous date not to follow the new nutrition date.");

const recoveryScopeClearsOnlyNutrition = runScenario(`
  ${reset}
  var storage = {};
  localStorage.getItem = (key) => storage[key] || null;
  localStorage.setItem = (key, value) => { storage[key] = value; };
  localStorage.removeItem = (key) => { delete storage[key]; };
  safeLocalStorageSet(DRAFT_RECOVERY_KEY, JSON.stringify({
    version: APP_VERSION,
    reason: "test",
    savedAt: "2026-06-16T12:00:00.000Z",
    strength: { date: "2026-06-16", workoutDraft: [{ exercise: "Bench Press", setRows: [{ weight: 100, reps: 10 }] }] },
    metric: { date: "2026-06-16", data: { calories: "2000" } },
    exercise: { name: "Incline Curl" }
  }));
  clearDraftRecoveryScope("metric");
  JSON.parse(storage[DRAFT_RECOVERY_KEY]);
`);

assert(recoveryScopeClearsOnlyNutrition.strength, "Expected saving nutrition to preserve recoverable strength draft.");
assert.strictEqual(recoveryScopeClearsOnlyNutrition.metric, null, "Expected nutrition draft recovery to be cleared after saving nutrition.");
assert(recoveryScopeClearsOnlyNutrition.exercise, "Expected unrelated exercise draft recovery to remain.");

const metricsBottomOnlyNotification = runScenario(`
  ${reset}
  state.appBanner = null;
  var toastCalls = [];
  var originalToast = toast;
  toast = (message, options = {}) => { toastCalls.push({ message, options }); };
  notifyMetricSaved(false);
  var saved = { banner: state.appBanner, toastCalls };
  toastCalls = [];
  notifyMetricSaved(true);
  var updated = { banner: state.appBanner, toastCalls };
  toast = originalToast;
  ({ saved, updated });
`);

assert.strictEqual(metricsBottomOnlyNotification.saved.banner, null, "Expected metric save notification not to create a top banner.");
assert.strictEqual(metricsBottomOnlyNotification.saved.toastCalls[0].message, "Metrics saved.", "Expected metric save to use bottom toast copy.");
assert.strictEqual(metricsBottomOnlyNotification.saved.toastCalls[0].options.duration, 2000, "Expected metric save toast to last two seconds.");
assert.strictEqual(metricsBottomOnlyNotification.updated.toastCalls[0].message, "Metrics updated.", "Expected metric update to use bottom toast copy.");

const draftSaveUsesToastOnly = runScenario(`
  ${reset}
  state.activeTab = "log";
  state.logDraftNotice = null;
  showDraftSavedToast.lastShownAt = 0;
  var toastCalls = [];
  var originalToast = toast;
  toast = (message, options = {}) => { toastCalls.push({ message, options }); };
  showLogDraftNotice();
  var result = { notice: state.logDraftNotice, toastCalls, markup: renderLogDraftNotice() };
  toast = originalToast;
  result;
`);

assert.strictEqual(draftSaveUsesToastOnly.notice, null, "Expected draft-save feedback not to create persistent notice state.");
assert.strictEqual(draftSaveUsesToastOnly.toastCalls[0].message, "Draft saved.", "Expected draft-save feedback to use a compact bottom toast.");
assert.strictEqual(draftSaveUsesToastOnly.toastCalls[0].options.duration, 1400, "Expected draft-save toast to stay brief.");
assert.strictEqual(draftSaveUsesToastOnly.markup, "", "Expected draft-save overlay markup to stay absent.");

const setRecords = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "prior", setRows: [{ weight: 100, reps: 11, rir: 2, restSeconds: 120 }] })
  ];
  var stats = exerciseRecordStats("Bench Press");
  ({
    repPr: setRecordReasons({ weight: 100, reps: 12 }, stats),
    weightPr: setRecordReasons({ weight: 105, reps: 8 }, stats),
    lowRepWeight: setRecordReasons({ weight: 105, reps: 7 }, stats),
    markup: recordTrophyMarkup("New record", "set-record-trophy", "record-key")
  });
`);

assert(setRecords.repPr.some((reason) => reason.includes("Rep record")), `Expected same-weight rep PR, got ${setRecords.repPr.join(", ")}`);
assert(setRecords.weightPr.some((reason) => reason.includes("Weight record")), `Expected 8+ rep weight PR, got ${setRecords.weightPr.join(", ")}`);
assert(!setRecords.lowRepWeight.some((reason) => reason.includes("Weight record")), `Expected sub-8 rep weight PR to be ignored, got ${setRecords.lowRepWeight.join(", ")}`);
assert(setRecords.markup.includes("&#127942;"), "Expected trophy markup to use an ASCII-safe HTML entity.");
assert(setRecords.markup.includes('data-action="dismiss-record-trophy"'), "Expected trophy markup to be dismissible.");

const setPositionRecords = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "prior-slot", setRows: [
      { weight: 25, reps: 14, rir: 1, restSeconds: 120 },
      { weight: 25, reps: 8, rir: 1, restSeconds: 120 },
      { weight: 20, reps: 10, rir: 1, restSeconds: 120 }
    ] })
  ];
  var stats = exerciseRecordStats("Bench Press");
  ({
    secondSetRepPr: setRecordReasons({ weight: 25, reps: 9 }, stats, 1),
    thirdSetWeightPr: setRecordReasons({ weight: 25, reps: 8 }, stats, 2),
    thirdSetLowRepWeight: setRecordReasons({ weight: 25, reps: 7 }, stats, 2)
  });
`);

assert(setPositionRecords.secondSetRepPr.some((reason) => reason.includes("Set 2 rep record")), `Expected set-position rep PR, got ${setPositionRecords.secondSetRepPr.join(", ")}`);
assert(setPositionRecords.thirdSetWeightPr.some((reason) => reason.includes("Set 3 weight record")), `Expected set-position weight PR, got ${setPositionRecords.thirdSetWeightPr.join(", ")}`);
assert(!setPositionRecords.thirdSetLowRepWeight.some((reason) => reason.includes("Set 3 weight record")), `Expected low-rep set-position weight PR to be ignored, got ${setPositionRecords.thirdSetLowRepWeight.join(", ")}`);

const setTrophyDismissal = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "prior", setRows: [{ weight: 100, reps: 11, rir: 2, restSeconds: 120 }] })
  ];
  var draft = {
    draftId: "draft-record",
    exercise: "Bench Press",
    editingWorkoutId: null,
    setRows: [{ weight: 100, reps: 12, rir: 2, restSeconds: 120 }]
  };
  var stats = exerciseRecordStats("Bench Press");
  var reasons = setRecordReasons(draft.setRows[0], stats);
  var key = setRecordTrophyKey(draft, 0, draft.setRows[0], reasons);
  var before = renderSetRows(draft);
  state.dismissedRecordTrophies.add(key);
  var afterDismiss = renderSetRows(draft);
  draft.setRows[0].reps = 13;
  var afterChange = renderSetRows(draft);
  ({
    beforeVisible: before.includes("set-record-trophy"),
    afterDismissHidden: !afterDismiss.includes("set-record-trophy"),
    afterChangeVisible: afterChange.includes("set-record-trophy")
  });
`);

assert(setTrophyDismissal.beforeVisible, "Expected set trophy before dismissal.");
assert(setTrophyDismissal.afterDismissHidden, "Expected dismissed set trophy to hide.");
assert(setTrophyDismissal.afterChangeVisible, "Expected set trophy to return after weight/reps change.");

const mobileMetaMarkup = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "prior-meta", setRows: [{ weight: 100, reps: 11, rir: 2, restSeconds: 120 }] })
  ];
  var draft = {
    draftId: "draft-meta",
    exercise: "Bench Press",
    editingWorkoutId: null,
    setRows: [{ weight: 100, reps: 12, rir: 2, restSeconds: 120 }]
  };
  renderSetRows(draft);
`);

assert(mobileMetaMarkup.includes("mobile-set-meta"), "Expected set rows to include mobile metadata.");
assert(mobileMetaMarkup.includes("Prev 100 x 11"), "Expected mobile metadata to include previous set label.");
assert(mobileMetaMarkup.includes("<strong>Set</strong>"), "Expected mobile metadata to include Set label.");

const rirStepper = runScenario(`
  ${reset}
  var draft = {
    draftId: "rir-draft",
    exercise: "Bench Press",
    editingWorkoutId: null,
    setRows: [
      { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
      { weight: 95, reps: 10, rir: 100, restSeconds: 120 }
    ]
  };
  state.workoutDraft = [draft];
  var markup = renderSetRows(draft);
  var incremented = updateDraftRowRir("rir-draft", 0, 1);
  var decremented = updateDraftRowRir("rir-draft", 0, -1);
  var minClamped = updateDraftRowRir("rir-draft", 0, -50);
  var maxClamped = updateDraftRowRir("rir-draft", 1, 1);
  ({
    hasStepper: markup.includes("rir-stepper"),
    hasMinus: markup.includes('data-action="decrement-rir"'),
    hasPlus: markup.includes('data-action="increment-rir"'),
    readonly: markup.includes("readonly"),
    inputModeNone: markup.includes('inputmode="none"'),
    incremented,
    decremented,
    minClamped,
    maxClamped
  });
`);

assert(rirStepper.hasStepper, "Expected set rows to render RIR stepper markup.");
assert(rirStepper.hasMinus && rirStepper.hasPlus, "Expected RIR stepper to include decrement and increment actions.");
assert(rirStepper.readonly && rirStepper.inputModeNone, "Expected RIR value to be read-only and not manually typed.");
assert.strictEqual(rirStepper.incremented, 3, `Expected RIR increment to produce 3, got ${rirStepper.incremented}`);
assert.strictEqual(rirStepper.decremented, 2, `Expected RIR decrement to return to 2, got ${rirStepper.decremented}`);
assert.strictEqual(rirStepper.minClamped, 0, `Expected RIR decrement to clamp at 0, got ${rirStepper.minClamped}`);
assert.strictEqual(rirStepper.maxClamped, 100, `Expected RIR increment to clamp at 100, got ${rirStepper.maxClamped}`);

const volumeRecord = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      id: "prior-volume",
      setRows: [
        { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 90, reps: 10, rir: 2, restSeconds: 120 }
      ]
    })
  ];
  var stats = exerciseRecordStats("Bench Press");
  var draft = {
    exercise: "Bench Press",
    editingWorkoutId: null,
    setRows: [
      { weight: 105, reps: 10, rir: 2, restSeconds: 120 },
      { weight: 100, reps: 10, rir: 2, restSeconds: 120 }
    ]
  };
  exerciseVolumeRecordReason(draft, stats);
`);

assert(volumeRecord.includes("Exercise volume record"), `Expected exercise volume PR reason, got ${volumeRecord}`);

const volumeTrophyDismissal = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      id: "prior-volume",
      setRows: [
        { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 90, reps: 10, rir: 2, restSeconds: 120 }
      ]
    })
  ];
  var draft = {
    draftId: "draft-volume",
    exercise: "Bench Press",
    targetMuscle: "chest",
    editingWorkoutId: null,
    notes: "",
    setRows: [
      { weight: 105, reps: 10, rir: 2, restSeconds: 120 },
      { weight: 100, reps: 10, rir: 2, restSeconds: 120 }
    ]
  };
  var stats = exerciseRecordStats("Bench Press");
  var reason = exerciseVolumeRecordReason(draft, stats);
  var key = volumeRecordTrophyKey(draft, reason);
  var before = exerciseDraftTable(draft, 0, 1);
  state.dismissedRecordTrophies.add(key);
  var afterDismiss = exerciseDraftTable(draft, 0, 1);
  ({
    beforeVisible: before.includes("volume-record-trophy"),
    afterDismissHidden: !afterDismiss.includes("volume-record-trophy")
  });
`);

assert(volumeTrophyDismissal.beforeVisible, "Expected volume trophy before dismissal.");
assert(volumeTrophyDismissal.afterDismissHidden, "Expected dismissed volume trophy to hide.");

const liveTrophySlots = runScenario(`
  ${reset}
  state.workouts = [makeWorkout({ setRows: [{ weight: 25, reps: 10, rir: 2, restSeconds: 90 }] })];
  var draft = {
    draftId: "live-draft",
    exercise: "Bench Press",
    targetMuscle: "chest",
    editingWorkoutId: null,
    notes: "",
    setRows: [{ weight: 25, reps: 12, rir: 2, restSeconds: 90 }]
  };
  var markup = renderSetRows(draft);
  var stats = exerciseRecordStats("Bench Press");
  ({
    hasSlot: markup.includes('data-record-slot="set"'),
    hasTrophy: markup.includes("set-record-trophy"),
    removedAfterEdit: !setRecordTrophyMarkupForRow(draft, { weight: 25, reps: 9, rir: 2, restSeconds: 90 }, 0, stats)
  });
`);

assert(liveTrophySlots.hasSlot, "Expected set rows to include live trophy slots.");
assert(liveTrophySlots.hasTrophy, "Expected live trophy slot to render a set trophy when row is a record.");
assert(liveTrophySlots.removedAfterEdit, "Expected live trophy helper to remove trophy when edited below record.");

const logLoadDirectionIndicator = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "bench-current", date: "2026-06-22", createdAt: "2026-06-22T12:00:00.000Z", setRows: [
      { weight: 145, reps: 12, rir: 0, restSeconds: 31 },
      { weight: 145, reps: 5, rir: 0, restSeconds: 31 }
    ] }),
    makeWorkout({ id: "bench-prior", date: "2026-06-15", createdAt: "2026-06-15T12:00:00.000Z", setRows: [
      { weight: 145, reps: 14, rir: 0, restSeconds: 31 },
      { weight: 145, reps: 7, rir: 0, restSeconds: 31 }
    ] })
  ];
  var down = logLoadDirectionForExercise(resolveExerciseMeta("Bench Press"));
  state.workouts = [
    makeWorkout({ id: "bench-good", date: "2026-06-22", createdAt: "2026-06-22T12:00:00.000Z", setRows: [
      { weight: 100, reps: 12, rir: 1, restSeconds: 31 }
    ] }),
    makeWorkout({ id: "bench-base", date: "2026-06-15", createdAt: "2026-06-15T12:00:00.000Z", setRows: [
      { weight: 100, reps: 11, rir: 1, restSeconds: 31 }
    ] })
  ];
  var up = logLoadDirectionForExercise(resolveExerciseMeta("Bench Press"));
  var markup = exerciseDraftTable({
    draftId: "direction-draft",
    editingWorkoutId: null,
    exercise: "Bench Press",
    targetMuscle: "chest",
    notes: "",
    setRows: [{ weight: 100, reps: 10, rir: 2, restSeconds: 120 }]
  }, 0, 1);
  ({ down, up, markup });
`);

assert.strictEqual(logLoadDirectionIndicator.down.direction, "down", `Expected failed bench signal to recommend lowering load, got ${JSON.stringify(logLoadDirectionIndicator.down)}`);
assert.strictEqual(logLoadDirectionIndicator.up.direction, "up", `Expected progressing bench signal to recommend raising load, got ${JSON.stringify(logLoadDirectionIndicator.up)}`);
assert(logLoadDirectionIndicator.markup.includes("load-direction-indicator"), "Expected log table to render Coach load direction indicator.");

const editExclusion = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "edit-me", setRows: [{ weight: 100, reps: 11, rir: 2, restSeconds: 120 }] })
  ];
  var stats = exerciseRecordStats("Bench Press", "edit-me");
  setRecordReasons({ weight: 100, reps: 12 }, stats);
`);

assert.strictEqual(editExclusion.length, 0, `Expected active edit to be excluded from PR baseline, got ${editExclusion.join(", ")}`);

const orderPreserved = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ exercise: "Third", order: 2, createdAt: "2026-06-10T09:00:00.000Z" }),
    makeWorkout({ exercise: "First", order: 0, createdAt: "2026-06-10T11:00:00.000Z" }),
    makeWorkout({ exercise: "Second", order: 1, createdAt: "2026-06-10T10:00:00.000Z" })
  ];
  workoutsForDate("2026-06-10").map((entry) => entry.exercise);
`);

assert.deepEqual(orderPreserved, ["First", "Second", "Third"], `Expected saved exercise order, got ${orderPreserved.join(", ")}`);

const removeLastExerciseTable = runScenario(`
  ${reset}
  state.logMode = "strength";
  state.workoutDraft = [defaultDraftExercise("Bench Press")];
  state.draftNotes = "remove me";
  state.setRows = [{ weight: 100, reps: 10, rir: 2, restSeconds: 120 }];
  removeExerciseDraftTable(state.workoutDraft[0].draftId);
  ({
    draftLength: state.workoutDraft.length,
    setRowsLength: state.setRows.length,
    selectedExercise: state.selectedExercise,
    markup: renderLog()
  });
`);

assert.strictEqual(removeLastExerciseTable.draftLength, 0, `Expected removing last exercise to empty draft, got ${removeLastExerciseTable.draftLength}`);
assert.strictEqual(removeLastExerciseTable.setRowsLength, 0, `Expected legacy rows to clear when Log is empty, got ${removeLastExerciseTable.setRowsLength}`);
assert(removeLastExerciseTable.markup.includes("Add an exercise to start logging strength."), "Expected removing the last table to render the empty strength state.");

const coachPlanCopy = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      exercise: "Bench Press",
      exerciseId: "custom-bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      setRows: [
        { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 95, reps: 10, rir: 2, restSeconds: 120 }
      ]
    }),
    makeWorkout({
      exercise: "Cable Row",
      exerciseId: "custom-row",
      primaryMuscles: ["back"],
      secondaryMuscles: ["biceps"],
      setRows: [
        { weight: 120, reps: 11, rir: 2, restSeconds: 120 }
      ]
    })
  ];
  copyCoachPlanToLog({
    sessionPlan: {
      items: [
        { exercise: resolveExerciseMeta("Bench Press"), muscle: { id: "chest" }, sets: 3, reason: "Chest plan" },
        { exercise: resolveExerciseMeta("Cable Row"), muscle: { id: "back" }, sets: 2, reason: "Back plan" }
      ]
    }
  });
  ({
    activeTab: state.activeTab,
    draftExercises: state.workoutDraft.map((draft) => draft.exercise),
    setCounts: state.workoutDraft.map((draft) => draft.setRows.length),
    firstWeights: state.workoutDraft.map((draft) => draft.setRows[0].weight),
    repeatedPrevious: state.workoutDraft[0].setRows[2].weight,
    editingIds: state.workoutDraft.map((draft) => draft.editingWorkoutId)
  });
`);

assert.strictEqual(coachPlanCopy.activeTab, "log", `Expected Coach copy to switch to Log, got ${coachPlanCopy.activeTab}`);
assert.deepEqual(coachPlanCopy.draftExercises, ["Bench Press", "Cable Row"], `Expected Coach copy order, got ${coachPlanCopy.draftExercises.join(", ")}`);
assert.deepEqual(coachPlanCopy.setCounts, [3, 2], `Expected planned set counts, got ${coachPlanCopy.setCounts.join(", ")}`);
assert.deepEqual(coachPlanCopy.firstWeights, [100, 120], `Expected copied previous weights, got ${coachPlanCopy.firstWeights.join(", ")}`);
assert.strictEqual(coachPlanCopy.repeatedPrevious, 95, `Expected missing planned sets to repeat last previous row, got ${coachPlanCopy.repeatedPrevious}`);
assert(coachPlanCopy.editingIds.every((id) => id === null), "Expected Coach copied drafts to be unsaved templates.");

const coachCopiedRowHighlight = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      exercise: "Bench Press",
      exerciseId: "custom-bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      setRows: [
        { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 95, reps: 9, rir: 2, restSeconds: 120 }
      ]
    })
  ];
  copyCoachPlanToLog({
    sessionPlan: {
      items: [
        { exercise: resolveExerciseMeta("Bench Press"), muscle: { id: "chest" }, sets: 2, reason: "Chest plan" }
      ]
    }
  });
  var before = renderSetRows(state.workoutDraft[0]);
  markCoachCopiedRowDirty(state.workoutDraft[0].draftId, 1);
  var afterDirty = renderSetRows(state.workoutDraft[0]);
  var saved = {
    exercise: state.workoutDraft[0].exercise,
    targetMuscle: state.workoutDraft[0].targetMuscle,
    setRows: normalizeSetRows(state.workoutDraft[0].setRows)
  };
  ({
    beforeCount: (before.match(/coach-copied-row/g) || []).length,
    afterCount: (afterDirty.match(/coach-copied-row/g) || []).length,
    savedHasMetadata: Object.prototype.hasOwnProperty.call(saved, "coachCopiedRows")
  });
`);

assert.strictEqual(coachCopiedRowHighlight.beforeCount, 2, `Expected both copied Coach rows to be highlighted, got ${coachCopiedRowHighlight.beforeCount}`);
assert.strictEqual(coachCopiedRowHighlight.afterCount, 1, `Expected dirty copied row to lose highlight only for that row, got ${coachCopiedRowHighlight.afterCount}`);
assert.strictEqual(coachCopiedRowHighlight.savedHasMetadata, false, "Expected Coach copied row metadata to stay draft-only.");

const renamedExerciseIdentity = runScenario(`
  ${reset}
  state.settings.customExercises = [{
    id: "custom-bench",
    name: "Flat Barbell Bench Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    equipment: "barbell",
    reps: "6-12",
    rest: "90-180 sec",
    cue: "Renamed bench."
  }];
  state.workouts = [
    makeWorkout({
      exercise: "Bench Press",
      exerciseId: "custom-bench",
      setRows: [
        { weight: 115, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 105, reps: 9, rir: 2, restSeconds: 120 }
      ]
    })
  ];
  var renamed = resolveExerciseMeta("Flat Barbell Bench Press");
  copyCoachPlanToLog({
    sessionPlan: {
      items: [
        { exercise: renamed, muscle: { id: "chest" }, sets: 2, reason: "Renamed plan" }
      ]
    }
  });
  ({
    previous: previousSetLabel("Flat Barbell Bench Press", 0),
    historyCount: exerciseHistoryEntries("Flat Barbell Bench Press").length,
    seriesCount: seriesFromWorkouts("Flat Barbell Bench Press", workoutVolume).length,
    progression: progressionTargetForExercise("Flat Barbell Bench Press")?.target || "",
    prReasons: setRecordReasons({ weight: 115, reps: 11 }, exerciseRecordStats("Flat Barbell Bench Press")),
    copiedWeight: state.workoutDraft[0].setRows[0].weight
  });
`);

assert.strictEqual(renamedExerciseIdentity.previous, "115 x 10", `Expected renamed exercise to keep previous-set label, got ${renamedExerciseIdentity.previous}`);
assert.strictEqual(renamedExerciseIdentity.historyCount, 1, `Expected renamed exercise history to match by id, got ${renamedExerciseIdentity.historyCount}`);
assert.strictEqual(renamedExerciseIdentity.seriesCount, 1, `Expected renamed exercise chart series to match by id, got ${renamedExerciseIdentity.seriesCount}`);
assert(renamedExerciseIdentity.progression, "Expected renamed exercise progression target.");
assert(renamedExerciseIdentity.prReasons.some((reason) => reason.includes("Rep record")), `Expected renamed exercise PR check, got ${renamedExerciseIdentity.prReasons.join(", ")}`);
assert.strictEqual(renamedExerciseIdentity.copiedWeight, 115, `Expected Coach copy to use renamed exercise previous rows, got ${renamedExerciseIdentity.copiedWeight}`);

const coachPlanCopyUsesPlanTarget = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      exercise: "Bench Press",
      exerciseId: "custom-bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      setRows: [
        { weight: 100, reps: 10, rir: 0, restSeconds: 120 },
        { weight: 95, reps: 9, rir: 1, restSeconds: 120 }
      ]
    })
  ];
  copyCoachPlanToLog({
    sessionPlan: {
      items: [
        {
          exercise: resolveExerciseMeta("Bench Press"),
          muscle: { id: "chest" },
          sets: 2,
          reason: "Bench reset",
          planTarget: { kind: "reset", label: "Reset target 95 lb", loadMultiplier: 0.95 }
        }
      ]
    }
  });
  state.workoutDraft[0].setRows.map((row) => ({ weight: row.weight, reps: row.reps, rir: row.rir }));
`);

assert.deepEqual(coachPlanCopyUsesPlanTarget, [
  { weight: 95, reps: 10, rir: 2 },
  { weight: 90, reps: 9, rir: 2 }
], `Expected Coach reset target to adjust copied set rows, got ${JSON.stringify(coachPlanCopyUsesPlanTarget)}`);

const emptyDateReset = runScenario(`
  ${reset}
  state.workouts = [makeWorkout({ date: "2026-06-10" })];
  state.draftNotes = "stale notes";
  state.selectedExercise = "Cable Row";
  state.draftTargetMuscle = "back";
  state.setRows = [{ weight: 200, reps: 4, rir: 0, restSeconds: 240 }];
  state.workoutDraft = [{
    draftId: "stale",
    editingWorkoutId: "stale-workout",
    exercise: "Cable Row",
    targetMuscle: "back",
    notes: "stale notes",
    setRows: [{ weight: 200, reps: 4, rir: 0, restSeconds: 240 }],
    order: 0
  }];
  state.editingWorkoutId = "stale-workout";
  loadWorkoutDateDraft("2026-06-12");
  ({
    date: state.draftDate,
    editingWorkoutId: state.editingWorkoutId,
    notes: state.draftNotes,
    draftCount: state.workoutDraft.length,
    selectedExercise: state.selectedExercise
  });
`);

assert.strictEqual(emptyDateReset.date, "2026-06-12", "Expected empty date to stay selected.");
assert.strictEqual(emptyDateReset.editingWorkoutId, null, "Expected empty date to clear edit mode.");
assert.strictEqual(emptyDateReset.notes, "", "Expected empty date to clear stale notes.");
assert.strictEqual(emptyDateReset.draftCount, 0, "Expected empty date to render no draft tables.");
assert.strictEqual(emptyDateReset.selectedExercise, "", "Expected empty date not to select a default exercise.");

const todayShortcutPreservesDraft = runScenario(`
  ${reset}
  document.getElementById = () => null;
  state.logMode = "strength";
  state.draftDate = "2026-06-10";
  state.editingWorkoutId = null;
  state.loadedWorkoutDateIds = [];
  state.workoutDraft = [{
    draftId: "draft-old",
    editingWorkoutId: null,
    exercise: "Bench Press",
    targetMuscle: "chest",
    notes: "move to today",
    setRows: [{ weight: 135, reps: 8, rir: 1, restSeconds: 120 }]
  }];
  var applied = applyStrengthTodayShortcut();
  ({
    applied,
    date: state.draftDate,
    rows: state.workoutDraft[0].setRows,
    editingWorkoutId: state.editingWorkoutId,
    draftEditingId: state.workoutDraft[0].editingWorkoutId,
    loadedIds: state.loadedWorkoutDateIds
  });
`);

assert.strictEqual(todayShortcutPreservesDraft.applied, true, "Expected Today shortcut to handle meaningful strength drafts.");
assert.strictEqual(todayShortcutPreservesDraft.date, runScenario("todayISO();"), "Expected Today shortcut to move the draft date to today.");
assert.deepEqual(todayShortcutPreservesDraft.rows, [{ weight: 135, reps: 8, rir: 1, restSeconds: 120 }], "Expected Today shortcut to preserve visible strength rows.");
assert.strictEqual(todayShortcutPreservesDraft.editingWorkoutId, null, "Expected Today shortcut to stay out of edit mode for unsaved drafts.");
assert.strictEqual(todayShortcutPreservesDraft.draftEditingId, null, "Expected Today shortcut to preserve only unsaved draft rows.");
assert.deepEqual(todayShortcutPreservesDraft.loadedIds, [], "Expected Today shortcut to clear loaded saved workout ids.");

const todayShortcutDoesNotCarrySavedLogs = runScenario(`
  ${reset}
  document.getElementById = () => null;
  state.logMode = "strength";
  state.draftDate = "2026-06-22";
  state.editingWorkoutId = "saved-monday";
  state.loadedWorkoutDateIds = ["saved-monday"];
  state.workoutDraft = [{
    draftId: "draft-monday",
    editingWorkoutId: "saved-monday",
    exercise: "Bench Press",
    targetMuscle: "chest",
    notes: "locked monday",
    setRows: [{ weight: 185, reps: 5, rir: 1, restSeconds: 180 }]
  }];
  var applied = applyStrengthTodayShortcut();
  ({
    applied,
    date: state.draftDate,
    rows: state.workoutDraft[0].setRows,
    editingWorkoutId: state.editingWorkoutId,
    draftEditingId: state.workoutDraft[0].editingWorkoutId,
    loadedIds: state.loadedWorkoutDateIds
  });
`);

assert.strictEqual(todayShortcutDoesNotCarrySavedLogs.applied, false, "Expected Today shortcut not to carry saved logs to today.");
assert.strictEqual(todayShortcutDoesNotCarrySavedLogs.date, "2026-06-22", "Expected saved-date draft to remain on its original date until normal Today loading runs.");
assert.deepEqual(todayShortcutDoesNotCarrySavedLogs.rows, [{ weight: 185, reps: 5, rir: 1, restSeconds: 180 }], "Expected saved Monday rows not to be converted into today's unsaved draft.");
assert.strictEqual(todayShortcutDoesNotCarrySavedLogs.editingWorkoutId, "saved-monday", "Expected saved loaded edit mode to remain untouched when shortcut declines.");
assert.strictEqual(todayShortcutDoesNotCarrySavedLogs.draftEditingId, "saved-monday", "Expected saved draft editing id to remain untouched when shortcut declines.");
assert.deepEqual(todayShortcutDoesNotCarrySavedLogs.loadedIds, ["saved-monday"], "Expected saved loaded ids to remain untouched when shortcut declines.");

const todayShortcutAllowsEmptyLoad = runScenario(`
  ${reset}
  document.getElementById = () => null;
  state.logMode = "strength";
  state.workoutDraft = [];
  applyStrengthTodayShortcut();
`);

assert.strictEqual(todayShortcutAllowsEmptyLoad, false, "Expected empty Strength Log Today shortcut to fall through to normal date loading.");

const populatedDateLoad = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "second", exercise: "Cable Row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], order: 1 }),
    makeWorkout({ id: "first", exercise: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], order: 0 })
  ];
  loadWorkoutDateDraft("2026-06-10");
  state.workoutDraft.map((draft) => draft.exercise);
`);

assert.deepEqual(populatedDateLoad, ["Bench Press", "Cable Row"], `Expected populated date to load in saved order, got ${populatedDateLoad.join(", ")}`);

const removedExerciseDeletion = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "bench", exercise: "Bench Press", exerciseId: "custom-bench", order: 0 }),
    makeWorkout({ id: "row", exercise: "Cable Row", exerciseId: "custom-row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], order: 1 })
  ];
  loadWorkoutDateDraft("2026-06-10");
  state.workoutDraft = state.workoutDraft.filter((draft) => draft.editingWorkoutId !== "row");
  staleWorkoutIdsForSavedDraft("2026-06-10", [{ id: "bench", date: "2026-06-10" }]);
`);

assert.deepEqual(removedExerciseDeletion, ["row"], `Expected removed same-date exercise to be deleted on save, got ${removedExerciseDeletion.join(", ")}`);

const lockInUndoRemovesChartEntry = runScenario(`
  ${reset}
  var badEntry = makeWorkout({
    id: "bad-lock",
    setRows: [{ weight: 0, reps: 1, rir: 2, restSeconds: 120 }],
    weight: 0,
    reps: 1
  });
  state.workouts = [badEntry];
  var before = seriesFromWorkouts("Bench Press", workoutVolume);
  var payload = workoutSaveUndoPayload([badEntry], [], []);
  state.workouts = applyWorkoutSaveUndoSnapshot(state.workouts, payload);
  var after = seriesFromWorkouts("Bench Press", workoutVolume);
  ({
    undoType: payload.type,
    savedEntryIds: payload.savedEntryIds,
    previousCount: payload.previousEntries.length,
    beforeCount: before.length,
    beforeVolume: before[0]?.value,
    afterCount: after.length
  });
`);

assert.strictEqual(lockInUndoRemovesChartEntry.undoType, "save-workout", "Expected lock-in save to create a workout undo payload.");
assert.deepEqual(lockInUndoRemovesChartEntry.savedEntryIds, ["bad-lock"], `Expected undo to target the saved workout, got ${lockInUndoRemovesChartEntry.savedEntryIds.join(", ")}`);
assert.strictEqual(lockInUndoRemovesChartEntry.previousCount, 0, "Expected new lock-in undo not to restore prior entries.");
assert.strictEqual(lockInUndoRemovesChartEntry.beforeCount, 1, "Expected accidental lock-in to appear in chart series before undo.");
assert.strictEqual(lockInUndoRemovesChartEntry.beforeVolume, 0, `Expected accidental zero-volume lock-in to tank chart value, got ${lockInUndoRemovesChartEntry.beforeVolume}`);
assert.strictEqual(lockInUndoRemovesChartEntry.afterCount, 0, "Expected undoing lock-in to remove the saved entry from chart series.");

const updateUndoRestoresPreviousChartEntry = runScenario(`
  ${reset}
  var previous = makeWorkout({
    id: "bench-edit",
    setRows: [{ weight: 100, reps: 10, rir: 2, restSeconds: 120 }],
    weight: 100,
    reps: 10
  });
  var updated = makeWorkout({
    id: "bench-edit",
    setRows: [{ weight: 0, reps: 1, rir: 2, restSeconds: 120 }],
    weight: 0,
    reps: 1
  });
  state.workouts = [updated];
  var before = seriesFromWorkouts("Bench Press", workoutVolume);
  var payload = workoutSaveUndoPayload([updated], [], [previous]);
  state.workouts = applyWorkoutSaveUndoSnapshot(state.workouts, payload);
  var after = seriesFromWorkouts("Bench Press", workoutVolume);
  ({
    previousCount: payload.previousEntries.length,
    beforeVolume: before[0]?.value,
    afterVolume: after[0]?.value,
    afterCount: after.length
  });
`);

assert.strictEqual(updateUndoRestoresPreviousChartEntry.previousCount, 1, "Expected update undo to snapshot the overwritten workout.");
assert.strictEqual(updateUndoRestoresPreviousChartEntry.beforeVolume, 0, `Expected bad update to show zero volume before undo, got ${updateUndoRestoresPreviousChartEntry.beforeVolume}`);
assert.strictEqual(updateUndoRestoresPreviousChartEntry.afterVolume, 1000, `Expected undoing update to restore previous chart volume, got ${updateUndoRestoresPreviousChartEntry.afterVolume}`);
assert.strictEqual(updateUndoRestoresPreviousChartEntry.afterCount, 1, "Expected undoing update to keep the restored chart entry.");

const backupValidation = runScenario(`
  ${reset}
  var invalidMessage = "";
  try {
    normalizeBackupPayload({ workouts: "bad", metrics: [] });
  } catch (error) {
    invalidMessage = error.message;
  }
  var normalized = normalizeBackupPayload({
    workouts: [],
    metrics: [],
    settings: {}
  });
  ({
    invalidMessage,
    nutritionGoal: normalized.settings.nutritionGoal,
    customExerciseCount: normalized.settings.customExercises.length,
    templateCount: normalized.settings.dayTemplates.length
  });
`);

assert(backupValidation.invalidMessage.includes("missing workouts or metrics"), `Expected malformed backup rejection, got ${backupValidation.invalidMessage}`);
assert.strictEqual(backupValidation.nutritionGoal, "bulk", `Expected missing backup nutrition goal to reset to bulk, got ${backupValidation.nutritionGoal}`);
assert.strictEqual(backupValidation.customExerciseCount, 0, `Expected missing custom exercises to reset, got ${backupValidation.customExerciseCount}`);
assert.strictEqual(backupValidation.templateCount, 0, `Expected missing templates to reset, got ${backupValidation.templateCount}`);

const supabaseSessionRefresh = runScenario(`
  ({
    expired: supabaseSessionNeedsRefresh({ expires_at: Math.floor(Date.now() / 1000) - 5 }, Date.now()),
    fresh: supabaseSessionNeedsRefresh({ expires_at: Math.floor(Date.now() / 1000) + 3600 }, Date.now())
  });
`);

assert.strictEqual(supabaseSessionRefresh.expired, true, "Expected expired Supabase session to require refresh.");
assert.strictEqual(supabaseSessionRefresh.fresh, false, "Expected fresh Supabase session not to require refresh.");

const archivedExerciseBehavior = runScenario(`
  ${reset}
  state.settings.customExercises = [
    {
      id: "custom-bench",
      name: "Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      equipment: "barbell",
      reps: "6-12",
      rest: "90-180 sec",
      cue: "Test bench."
    },
    {
      id: "custom-row",
      name: "Cable Row",
      primaryMuscles: ["back"],
      secondaryMuscles: ["biceps"],
      equipment: "cable",
      reps: "8-15",
      rest: "90-180 sec",
      cue: "Test row.",
      archivedAt: "2026-06-12T12:00:00.000Z"
    },
    {
      id: "custom-unused",
      name: "Unused Fly",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "10-15",
      rest: "60 sec",
      cue: "Unused."
    }
  ];
  state.workouts = [
    makeWorkout({ exercise: "Bench Press", exerciseId: "custom-bench" }),
    makeWorkout({ exercise: "Cable Row", exerciseId: "custom-row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"] })
  ];
  var all = getCustomExercises({ includeArchived: true });
  var row = all.find((exercise) => exercise.id === "custom-row");
  var bench = all.find((exercise) => exercise.id === "custom-bench");
  var unused = all.find((exercise) => exercise.id === "custom-unused");
  ({
    activeNames: getCustomExercises().map((exercise) => exercise.name),
    databaseNames: exerciseDatabase().map((exercise) => exercise.name),
    allArchived: !!row.archivedAt,
    benchUsage: exerciseUsageStats(bench),
    rowUsage: exerciseUsageStats(row),
    benchRemoval: exerciseRemovalMode(bench),
    unusedRemoval: exerciseRemovalMode(unused)
  });
`);

assert.deepEqual(archivedExerciseBehavior.activeNames, ["Bench Press", "Unused Fly"], `Expected archived exercises excluded from active list, got ${archivedExerciseBehavior.activeNames.join(", ")}`);
assert.deepEqual(archivedExerciseBehavior.databaseNames, ["Bench Press", "Unused Fly"], `Expected archived exercises excluded from Coach database, got ${archivedExerciseBehavior.databaseNames.join(", ")}`);
assert.strictEqual(archivedExerciseBehavior.allArchived, true, "Expected archived exercise metadata to be preserved.");
assert.strictEqual(archivedExerciseBehavior.benchUsage.sessionCount, 1, `Expected logged active usage count, got ${archivedExerciseBehavior.benchUsage.sessionCount}`);
assert.strictEqual(archivedExerciseBehavior.rowUsage.lastUsedAt, "2026-06-10", `Expected archived exercise usage to resolve by id, got ${archivedExerciseBehavior.rowUsage.lastUsedAt}`);
assert.strictEqual(archivedExerciseBehavior.benchRemoval, "archive", `Expected logged exercise to archive, got ${archivedExerciseBehavior.benchRemoval}`);
assert.strictEqual(archivedExerciseBehavior.unusedRemoval, "delete", `Expected unused exercise to hard delete, got ${archivedExerciseBehavior.unusedRemoval}`);

const exerciseDropdownSafety = runScenario(`
  ${reset}
  state.settings.customExercises = [{
    id: "custom-row",
    name: "Cable Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["biceps"],
    equipment: "cable",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Test row.",
    archivedAt: "2026-06-12T12:00:00.000Z"
  }];
  var archived = exerciseOptions("Cable Row");
  state.settings.customExercises = [];
  var missing = exerciseOptions("Ghost Press");
  ({ archived, missing });
`);

assert(exerciseDropdownSafety.archived.includes('value="Cable Row" selected'), `Expected archived exercise option to keep original value, got ${exerciseDropdownSafety.archived}`);
assert(exerciseDropdownSafety.archived.includes("Cable Row (archived)"), `Expected archived exercise label, got ${exerciseDropdownSafety.archived}`);
assert(exerciseDropdownSafety.missing.includes('value="Ghost Press" selected'), `Expected missing exercise option to keep original value, got ${exerciseDropdownSafety.missing}`);
assert(exerciseDropdownSafety.missing.includes("Ghost Press (not in library)"), `Expected missing exercise label, got ${exerciseDropdownSafety.missing}`);

const exerciseFormValidation = runScenario(`
  ${reset}
  var valid = validateExerciseFormInput({
    name: "  Incline Curl  ",
    primaryMuscle: "biceps",
    secondaryMuscles: ["biceps", "forearms", "triceps"],
    equipment: "dumbbells",
    reps: "10",
    rest: "1:30",
    cue: "Strict."
  });
  var invalid = validateExerciseFormInput({
    name: "",
    primaryMuscle: "chest",
    secondaryMuscles: ["chest"],
    equipment: "",
    reps: "heavy",
    rest: "forever",
    cue: ""
  });
  ({
    valid,
    invalid,
    secondaryMarkup: secondaryMuscleCheckboxes(["chest", "triceps"], "chest")
  });
`);

assert.strictEqual(exerciseFormValidation.valid.ok, true, `Expected valid exercise form, got ${JSON.stringify(exerciseFormValidation.valid.errors)}`);
assert.strictEqual(exerciseFormValidation.valid.exercise.name, "Incline Curl", `Expected trimmed exercise name, got ${exerciseFormValidation.valid.exercise.name}`);
assert.strictEqual(exerciseFormValidation.valid.exercise.reps, "10", `Expected normalized single rep target, got ${exerciseFormValidation.valid.exercise.reps}`);
assert.strictEqual(exerciseFormValidation.valid.exercise.rest, "90 sec", `Expected time rest to normalize to seconds, got ${exerciseFormValidation.valid.exercise.rest}`);
assert.deepEqual(exerciseFormValidation.valid.exercise.secondaryMuscles, ["triceps"], `Expected primary muscle removed from secondary, got ${exerciseFormValidation.valid.exercise.secondaryMuscles.join(", ")}`);
assert.strictEqual(exerciseFormValidation.invalid.ok, false, "Expected invalid exercise form to fail validation.");
assert(exerciseFormValidation.invalid.errors.name, "Expected name validation error.");
assert(exerciseFormValidation.invalid.errors.reps, "Expected reps validation error.");
assert(exerciseFormValidation.invalid.errors.rest, "Expected rest validation error.");
assert(exerciseFormValidation.secondaryMarkup.includes('value="chest" checked disabled'), "Expected primary muscle checkbox to be checked and disabled.");

const exerciseCoverageAndFilters = runScenario(`
  ${reset}
  state.settings.customExercises = [
    {
      id: "custom-bench",
      name: "Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      equipment: "barbell",
      reps: "6-12",
      rest: "90-180 sec",
      cue: "Test bench."
    },
    {
      id: "custom-row",
      name: "Cable Row",
      primaryMuscles: ["back"],
      secondaryMuscles: ["biceps"],
      equipment: "cable",
      reps: "8-15",
      rest: "90-180 sec",
      cue: "Test row."
    },
    {
      id: "custom-curl",
      name: "Curl",
      primaryMuscles: ["biceps"],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-15",
      rest: "60 sec",
      cue: "Test curl.",
      archivedAt: "2026-06-12T12:00:00.000Z"
    }
  ];
  state.workouts = [
    makeWorkout({ exercise: "Cable Row", exerciseId: "custom-row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], date: "2026-06-11" }),
    makeWorkout({ exercise: "Bench Press", exerciseId: "custom-bench", date: "2026-06-10" })
  ];
  var coverage = exerciseCoverageStats();
  var markup = renderExercises();
  ({
    chestCount: coverage.find((item) => item.id === "chest").count,
    backCount: coverage.find((item) => item.id === "back").count,
    bicepsCount: coverage.find((item) => item.id === "biceps").count,
    missingAbs: coverage.find((item) => item.id === "abs").missing,
    searchNames: filteredExerciseList({ search: "row", muscle: "all", sort: "az" }).map((item) => item.name),
    mostLogged: filteredExerciseList({ search: "", muscle: "all", sort: "most" }).map((item) => item.name),
    archivedNames: filteredExerciseList({ includeArchived: true, archivedOnly: true }).map((item) => item.name),
    hasSearch: markup.includes('data-exercise-search'),
    hasCoverage: markup.includes('exercise-coverage-list'),
    hasCoverageRows: markup.includes('coverage-row'),
    hasCoveragePanelCollapse: markup.includes('exercise-coverage-panel') && markup.includes('<summary><span>Primary coverage</span>'),
    hasFormPanelCollapse: markup.includes('exercise-form-panel') && markup.includes('<summary><span>Add exercise</span>'),
    hasControlsPanelCollapse: markup.includes('exercise-library-controls') && markup.includes('<summary><span>Find exercises</span>'),
    hasDatabasePanelCollapse: markup.includes('exercise-database-panel') && markup.includes('<summary><span>Your exercise database</span>'),
    showsBenchUnderChest: markup.includes('Bench Press'),
    showsRowUnderBack: markup.includes('Cable Row'),
    hasCollapseArrow: markup.includes('collapse-arrow'),
    coverageRowsHaveStandardArrowOnly: !markup.includes('class="collapse-arrow"'),
    hasArchiveSection: markup.includes('Archived exercises')
  });
`);

assert.strictEqual(exerciseCoverageAndFilters.chestCount, 1, `Expected chest coverage count, got ${exerciseCoverageAndFilters.chestCount}`);
assert.strictEqual(exerciseCoverageAndFilters.backCount, 1, `Expected back coverage count, got ${exerciseCoverageAndFilters.backCount}`);
assert.strictEqual(exerciseCoverageAndFilters.bicepsCount, 0, `Expected archived biceps exercise excluded from active coverage, got ${exerciseCoverageAndFilters.bicepsCount}`);
assert.strictEqual(exerciseCoverageAndFilters.missingAbs, true, "Expected missing abs coverage.");
assert.deepEqual(exerciseCoverageAndFilters.searchNames, ["Cable Row"], `Expected exercise search/filter result, got ${exerciseCoverageAndFilters.searchNames.join(", ")}`);
assert.strictEqual(exerciseCoverageAndFilters.mostLogged[0], "Bench Press", `Expected most logged sort to keep highest session count first, got ${exerciseCoverageAndFilters.mostLogged.join(", ")}`);
assert.deepEqual(exerciseCoverageAndFilters.archivedNames, ["Curl"], `Expected archived list to include archived exercises, got ${exerciseCoverageAndFilters.archivedNames.join(", ")}`);
assert.strictEqual(exerciseCoverageAndFilters.hasSearch, true, "Expected Exercises markup to include search input.");
assert.strictEqual(exerciseCoverageAndFilters.hasCoverage, true, "Expected Exercises markup to include coverage panel.");
assert.strictEqual(exerciseCoverageAndFilters.hasCoverageRows, true, "Expected Exercises coverage to render collapsible muscle rows.");
assert.strictEqual(exerciseCoverageAndFilters.hasCoveragePanelCollapse, true, "Expected Primary coverage section to be a collapsible panel.");
assert.strictEqual(exerciseCoverageAndFilters.hasFormPanelCollapse, true, "Expected Add/Edit exercise section to be a collapsible panel.");
assert.strictEqual(exerciseCoverageAndFilters.hasControlsPanelCollapse, true, "Expected Exercises filter controls to be a collapsible panel.");
assert.strictEqual(exerciseCoverageAndFilters.hasDatabasePanelCollapse, true, "Expected active exercise database section to be a collapsible panel.");
assert.strictEqual(exerciseCoverageAndFilters.showsBenchUnderChest, true, "Expected covered Chest row to list primary exercises.");
assert.strictEqual(exerciseCoverageAndFilters.showsRowUnderBack, true, "Expected covered Back row to list primary exercises.");
assert.strictEqual(exerciseCoverageAndFilters.coverageRowsHaveStandardArrowOnly, true, "Expected coverage rows to avoid redundant inner collapse arrows.");
assert.strictEqual(exerciseCoverageAndFilters.hasArchiveSection, true, "Expected Exercises markup to include archived section.");

const exerciseEditVisibleState = runScenario(`
  ${reset}
  state.activeTab = "exercises";
  state.settings.customExercises = [
    {
      id: "custom-bench",
      name: "Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      equipment: "barbell",
      reps: "6-12",
      rest: "90-180 sec",
      cue: "Test bench."
    }
  ];
  state.editingExerciseId = "custom-bench";
  state.exerciseFormDraft = null;
  state.exerciseFormErrors = {};
  state.openExerciseActionMenu = "custom-bench";
  var markup = renderExercises();
  ({
    editSummary: markup.includes('<summary><span>Edit exercise</span><small>Bench Press</small></summary>'),
    formValue: markup.includes('value="Bench Press"'),
    formTarget: markup.includes('id="exercise-form"'),
    focusTarget: markup.includes('data-edit-focus-target')
  });
`);

assert.strictEqual(exerciseEditVisibleState.editSummary, true, "Expected Exercises edit mode to render the selected exercise in the form summary.");
assert.strictEqual(exerciseEditVisibleState.formValue, true, "Expected Exercises edit mode to populate selected exercise values.");
assert.strictEqual(exerciseEditVisibleState.formTarget, true, "Expected Exercises edit form to expose a stable form target.");
assert.strictEqual(exerciseEditVisibleState.focusTarget, true, "Expected Exercises edit form to expose a visible focus/scroll target.");

const exerciseActionsVisible = runScenario(`
  ${reset}
  state.activeTab = "exercises";
  var markup = renderExercises();
  ({
    hasEdit: markup.includes('data-action="edit-exercise"'),
    hasTrend: markup.includes('data-action="open-exercise-trend"'),
    hasHistory: markup.includes('data-action="open-exercise-history-global"'),
    hasArchive: markup.includes('data-action="archive-exercise"'),
    hasHiddenMenuButton: markup.includes('data-action="toggle-exercise-action-menu"')
  });
`);

assert.strictEqual(exerciseActionsVisible.hasEdit, true, "Expected Exercise cards to expose visible Edit actions.");
assert.strictEqual(exerciseActionsVisible.hasTrend, true, "Expected Exercise cards to expose visible Trend actions.");
assert.strictEqual(exerciseActionsVisible.hasHistory, true, "Expected Exercise cards to expose visible History actions.");
assert.strictEqual(exerciseActionsVisible.hasArchive, true, "Expected Exercise cards to expose visible archive/delete actions.");
assert.strictEqual(exerciseActionsVisible.hasHiddenMenuButton, false, "Expected Exercise card actions not to require the three-dot menu.");

const weeklyMuscleDetail = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({
      id: "bench",
      date: todayISO(),
      exercise: "Bench Press",
      exerciseId: "custom-bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      setRows: [
        { weight: 100, reps: 10, rir: 2, restSeconds: 120 },
        { weight: 95, reps: 10, rir: 5, restSeconds: 90 }
      ],
      order: 0
    }),
    makeWorkout({
      id: "pressdown",
      date: todayISO(),
      exercise: "Cable Pushdown",
      exerciseId: "pushdown",
      primaryMuscles: ["triceps"],
      secondaryMuscles: [],
      setRows: [
        { weight: 50, reps: 12, rir: 2, restSeconds: 60 }
      ],
      order: 1
    })
  ];
  state.weeklyMuscleDetail = { muscleId: "triceps", returnTab: "dashboard" };
  var summary = weeklyMuscleDetailSummary("triceps");
  var markup = renderDashboard();
  ({
    totalSets: summary.totalSets,
    primarySets: summary.primarySets,
    secondarySets: summary.secondarySets,
    entryCount: summary.entries.length,
    firstRole: summary.entries[0].role,
    firstRowCredits: summary.entries[0].rows.map((row) => row.creditedSets),
    hasScreen: markup.includes("Weekly set detail") && markup.includes("Cable Pushdown") && markup.includes("Bench Press"),
    hasFullStats: markup.includes("raw hard sets") && markup.includes("load volume") && markup.includes("avg RIR")
  });
`);

assert.strictEqual(weeklyMuscleDetail.entryCount, 2, `Expected primary and secondary weekly contributions, got ${weeklyMuscleDetail.entryCount}`);
assert.strictEqual(weeklyMuscleDetail.firstRole, "secondary", `Expected bench to count as secondary triceps work, got ${weeklyMuscleDetail.firstRole}`);
assert.deepEqual(weeklyMuscleDetail.firstRowCredits, [0.5, 0.25], `Expected secondary set credits with RIR discount, got ${weeklyMuscleDetail.firstRowCredits.join(", ")}`);
assert.strictEqual(weeklyMuscleDetail.primarySets, 1, `Expected 1 primary credited set, got ${weeklyMuscleDetail.primarySets}`);
assert.strictEqual(weeklyMuscleDetail.secondarySets, 0.75, `Expected 0.75 secondary credited sets, got ${weeklyMuscleDetail.secondarySets}`);
assert.strictEqual(weeklyMuscleDetail.totalSets, 1.75, `Expected 1.75 total credited sets, got ${weeklyMuscleDetail.totalSets}`);
assert.strictEqual(weeklyMuscleDetail.hasScreen, true, "Expected weekly muscle detail screen to render the contributing exercises.");
assert.strictEqual(weeklyMuscleDetail.hasFullStats, true, "Expected weekly muscle detail screen to render full logging stats.");

const bodyWeightAverage = runScenario(`
  ${reset}
  state.metrics = [
    { id: "m1", date: "2026-06-01", bodyWeight: 180, calories: 2500, protein: 170 },
    { id: "m2", date: "2026-06-02", bodyWeight: 182, calories: 2500, protein: 170 },
    { id: "m3", date: "2026-06-03", bodyWeight: 181, calories: 2500, protein: 170 },
    { id: "m4", date: "2026-06-04", bodyWeight: 183, calories: 2500, protein: 170 },
    { id: "m5", date: "2026-06-05", bodyWeight: 184, calories: 2500, protein: 170 },
    { id: "m6", date: "2026-06-06", bodyWeight: 186, calories: 2500, protein: 170 },
    { id: "m7", date: "2026-06-07", bodyWeight: 185, calories: 2500, protein: 170 },
    { id: "m8", date: "2026-06-08", bodyWeight: 187, calories: 2500, protein: 170 }
  ];
  state.settings.dashboardWidgets = ["bodyWeight"];
  state.settings.dashboardWidgetOrder = ["bodyWeight"];
  var series = seriesFromMetrics("bodyWeight");
  var avgSeries = rollingAverageSeries(series, 7);
  var latestAvg = latestRollingAverage(series, 7);
  var dashboard = renderDashboard();
  var trends = renderTrends();
  ({
    avgValues: avgSeries.map((point) => Math.round(point.value * 10) / 10),
    latestAvg: Math.round(latestAvg * 10) / 10,
    dashboardHasAvg: dashboard.includes("7d avg"),
    trendsHasOverlay: trends.includes("comparison-polyline")
  });
`);

assert.deepEqual(bodyWeightAverage.avgValues.slice(-2), [183, 184], `Expected rolling average values, got ${bodyWeightAverage.avgValues.join(", ")}`);
assert.strictEqual(bodyWeightAverage.latestAvg, 184, `Expected latest 7-day average weight, got ${bodyWeightAverage.latestAvg}`);
assert.strictEqual(bodyWeightAverage.dashboardHasAvg, true, "Expected Today body weight card to include 7d avg label.");
assert.strictEqual(bodyWeightAverage.trendsHasOverlay, true, "Expected Trends body weight chart to include average overlay.");

const mobileQolMarkup = runScenario(`
  ${reset}
  state.activeTab = "log";
  state.appBanner = { message: "Workout locked in.", tone: "good", detail: "Undo is available.", action: "undo-last-action", actionLabel: "Undo" };
  var storage = {};
  localStorage.getItem = (key) => storage[key] || null;
  localStorage.setItem = (key, value) => { storage[key] = value; };
  localStorage.removeItem = (key) => { delete storage[key]; };
  safeLocalStorageSet(DRAFT_RECOVERY_KEY, JSON.stringify({
    version: APP_VERSION,
    savedAt: "2026-06-16T12:00:00.000Z",
    strength: { date: "2026-06-16", workoutDraft: [{ exercise: "Bench Press", setRows: [{ weight: 100, reps: 10 }] }] },
    metric: null,
    exercise: null
  }));
  state.pendingImport = {
    source: "test-backup.json",
    summary: { workouts: 2, metrics: 1, customExercises: 3, newestDate: "2026-06-15" }
  };
  state.settings.dashboardWidgets = ["health", "weeklySets"];
  state.settings.dashboardWidgetOrder = ["health", "weeklySets", "nextLift", "lowestSets", "bodyWeight", "protein"];
  ({
    banner: renderAppBanner(),
    logNotice: renderLogDraftNotice(),
    emptyLog: emptyStrengthLogMarkup(true),
    hiddenNotice: (state.activeTab = "exercises", renderLogDraftNotice()),
    modal: renderImportPreview(),
    widgets: selectedDashboardWidgets(),
    order: dashboardWidgetOrder(),
    date: renderDateControl({ id: "workout-date", name: "date", value: "2026-06-15" }),
    settings: renderDashboardWidgetSelector()
  });
`);

assert(!mobileQolMarkup.banner.includes("Draft saved locally."), "Expected draft-save message to stay out of the top app banner.");
assert(mobileQolMarkup.banner.includes("Workout locked in."), "Expected normal app banner messages to remain supported.");
assert.strictEqual(mobileQolMarkup.logNotice, "", "Expected draft-save overlay markup to stay absent.");
assert(mobileQolMarkup.emptyLog.includes("Unsaved strength draft"), "Expected empty Log state to surface recoverable strength drafts inline.");
assert(mobileQolMarkup.emptyLog.includes('data-action="restore-draft"'), "Expected empty Log state to include restore action.");
assert.strictEqual(mobileQolMarkup.hiddenNotice, "", "Expected Log draft notice to stay hidden outside the Log tab.");
assert(mobileQolMarkup.modal.includes("Review backup import"), "Expected import preview dialog.");
assert(mobileQolMarkup.modal.includes("2</strong> workouts"), "Expected import preview workout count.");
assert.deepEqual(mobileQolMarkup.widgets, ["health", "weeklySets"], `Expected selected dashboard widgets to persist, got ${mobileQolMarkup.widgets.join(", ")}`);
assert.strictEqual(mobileQolMarkup.order[0], "health", `Expected widget order to persist, got ${mobileQolMarkup.order.join(", ")}`);
assert(mobileQolMarkup.date.includes('data-action="date-step"'), "Expected shared date control to include previous/next actions.");
assert(mobileQolMarkup.date.includes('data-action="date-today"'), "Expected shared date control to include Today action.");
assert(mobileQolMarkup.settings.includes('data-action="toggle-dashboard-widget"'), "Expected widget settings markup to include preference controls.");

const scrollTopThreshold = runScenario(`
  ${reset}
  ({
    shortPage: scrollTopButtonShouldShow(600, 1000, 800),
    beforeHalf: scrollTopButtonShouldShow(400, 2200, 800),
    pastHalf: scrollTopButtonShouldShow(800, 2200, 800),
    exactEnoughLength: scrollTopButtonShouldShow(500, 1200, 800),
    fallbackTop: scrollTopButtonTopOffset(400, null, 800, 76, 36),
    viewportTop: scrollTopButtonTopOffset(400, { offsetTop: 40, height: 620 }, 800, 76, 36),
    chrome: renderAppChrome()
  });
`);

assert.strictEqual(scrollTopThreshold.shortPage, false, "Expected scroll-to-top to stay hidden on short pages.");
assert.strictEqual(scrollTopThreshold.beforeHalf, false, "Expected scroll-to-top to stay hidden before 55% scroll.");
assert.strictEqual(scrollTopThreshold.pastHalf, true, "Expected scroll-to-top to show after 55% scroll.");
assert.strictEqual(scrollTopThreshold.exactEnoughLength, false, "Expected scroll-to-top to require pages longer than 1.5 view heights.");
assert.strictEqual(scrollTopThreshold.fallbackTop, 1054, `Expected fallback scroll-to-top top position to sit higher above tabbar, got ${scrollTopThreshold.fallbackTop}`);
assert.strictEqual(scrollTopThreshold.viewportTop, 914, `Expected visual viewport top position to sit higher inside visible screen, got ${scrollTopThreshold.viewportTop}`);
assert(indexCode.includes('data-action="scroll-top"'), "Expected app shell to render scroll-to-top action outside scrolling content.");

const dragPendingTolerance = runScenario(`
  ${reset}
  state.workoutDraft = [defaultDraftExercise("Bench Press"), defaultDraftExercise("Cable Row")];
  var handle = {
    classList: { added: [], removed: [], add(value) { this.added.push(value); }, remove(value) { this.removed.push(value); } },
    closest(selector) { return selector === ".exercise-draft" ? { dataset: { draftId: state.workoutDraft[0].draftId }, classList: { add() {}, remove() {} }, style: {} } : null; },
    setPointerCapture() {}
  };
  startExerciseDrag(handle, { clientY: 100, pointerId: 1 });
  updatePendingExerciseDrag({ clientY: 104 });
  clearTimeout(dragState.dragTimer);
  ({
    pending: dragState.pending,
    currentY: dragState.currentY,
    pendingClass: handle.classList.added.includes("is-pending")
  });
`);

assert.strictEqual(dragPendingTolerance.pending, true, "Expected tiny mobile drag movement not to cancel pending long-press drag.");
assert.strictEqual(dragPendingTolerance.currentY, 104, `Expected pending drag currentY to update, got ${dragPendingTolerance.currentY}`);
assert.strictEqual(dragPendingTolerance.pendingClass, true, "Expected drag handle pending animation class.");

const collapsibleLongScreens = runScenario(`
  ${reset}
  state.settings.dashboardWidgets = ["health", "weeklySets", "lowestSets", "bodyWeight", "protein", "nextLift"];
  state.settings.dashboardWidgetOrder = ["health", "weeklySets", "lowestSets", "bodyWeight", "protein", "nextLift"];
  state.workouts = [
    makeWorkout({ exercise: "Bench Press", exerciseId: "custom-bench", date: "2026-06-10" }),
    makeWorkout({ exercise: "Cable Row", exerciseId: "custom-row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], date: "2026-06-11" })
  ];
  ({
    today: renderDashboard(),
    coach: renderCoach(),
    trends: renderTrends()
  });
`);

assert(collapsibleLongScreens.coach.includes("today-plan-card") && collapsibleLongScreens.coach.includes("<summary><span>Today's Plan</span>"), "Expected Coach Today's Plan to be collapsible.");
assert(collapsibleLongScreens.coach.includes("coach-why-card") && collapsibleLongScreens.coach.includes("<summary><span>Why this?</span>"), "Expected Coach Why this to be collapsible.");
assert(collapsibleLongScreens.trends.includes("muscle-trends-panel") && collapsibleLongScreens.trends.includes("<summary><span>Muscle trends</span>"), "Expected Muscle trends to be collapsible.");
assert(collapsibleLongScreens.trends.includes("exercise-performance-panel") && collapsibleLongScreens.trends.includes("<summary><span>Exercise performance</span>"), "Expected Exercise performance to be collapsible.");
assert(collapsibleLongScreens.trends.includes("health-trends-panel") && collapsibleLongScreens.trends.includes("<summary><span>Health trends</span>"), "Expected Health trends to be collapsible.");
assert(collapsibleLongScreens.today.includes("dashboard-health-panel") && collapsibleLongScreens.today.includes("<summary><span>Health coach</span>"), "Expected Today health widget to be collapsible.");
assert(collapsibleLongScreens.today.includes("dashboard-weeklySets-panel") && collapsibleLongScreens.today.includes("<summary><span>This week's hard sets</span>"), "Expected Today weekly sets widget to be collapsible.");
assert(collapsibleLongScreens.today.includes("dashboard-lowestSets-panel") && collapsibleLongScreens.today.includes("<summary><span>Lowest set counts</span>"), "Expected Today lowest sets widget to be collapsible.");
assert(collapsibleLongScreens.today.includes("dashboard-bodyWeight-panel") && collapsibleLongScreens.today.includes("<summary><span>Body weight</span>"), "Expected Today body weight widget to be collapsible.");
assert(collapsibleLongScreens.today.includes("dashboard-protein-panel") && collapsibleLongScreens.today.includes("<summary><span>Protein</span>"), "Expected Today protein widget to be collapsible.");
assert(collapsibleLongScreens.today.includes("coach-action dashboard-widget") && !collapsibleLongScreens.today.includes("dashboard-nextLift-panel"), "Expected Next best lift to remain a normal card.");

const historyCollapseSupport = runScenario(`
  ${reset}
  state.workouts = [
    makeWorkout({ id: "h1", date: "2026-06-16", exercise: "Bench Press", exerciseId: "custom-bench" }),
    makeWorkout({ id: "h2", date: "2026-06-15", exercise: "Cable Row", exerciseId: "custom-row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"] })
  ];
  state.historyMode = "exercises";
  var list = renderHistory();
  state.historyMode = "dates";
  var dates = renderHistory();
  state.historyExercise = "Bench Press";
  var detail = renderHistory();
  ({
    list,
    dates,
    detail
  });
`);

assert(historyCollapseSupport.list.includes("history-filter-panel") && historyCollapseSupport.list.includes("collapsible-panel"), "Expected History search/filter panel to be collapsible.");
assert(historyCollapseSupport.list.includes("history-exercises-panel") && historyCollapseSupport.list.includes("<summary><span>Exercise records</span>"), "Expected History exercise records to be collapsible.");
assert(historyCollapseSupport.dates.includes("history-date-panel") && historyCollapseSupport.dates.includes("<summary><span>Browse by date</span>"), "Expected History date browser to be collapsible.");
assert(historyCollapseSupport.detail.includes("history-summary-panel") && historyCollapseSupport.detail.includes("<summary><span>Exercise summary</span>"), "Expected History detail summary to be collapsible.");
assert(historyCollapseSupport.detail.includes("history-load-panel") && historyCollapseSupport.detail.includes("<summary><span>Load volume</span>"), "Expected History load chart to be collapsible.");
assert(historyCollapseSupport.detail.includes("history-e1rm-panel") && historyCollapseSupport.detail.includes("<summary><span>Estimated 1RM</span>"), "Expected History e1RM chart to be collapsible.");
assert(historyCollapseSupport.detail.includes("history-sessions-panel") && historyCollapseSupport.detail.includes("<summary><span>Logged sessions</span>"), "Expected History session list to be collapsible.");
assert(historyCollapseSupport.detail.includes("history-session-card collapsible-panel"), "Expected individual History session cards to use collapse affordance styling.");

const backupPreviewSummary = runScenario(`
  ${reset}
  var summary = backupImportSummary({
    settings: {
      customExercises: [
        { id: "custom-bench", name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: [], reps: "8-12", rest: "90 sec" }
      ],
      dashboardWidgets: ["health"],
      dashboardWidgetOrder: ["health", "nextLift"]
    },
    workouts: [
      makeWorkout({ id: "w1", date: "2026-06-14" }),
      makeWorkout({ id: "w2", date: "2026-06-16" })
    ],
    metrics: [
      { id: "m1", date: "2026-06-15", calories: 2400, protein: 180 }
    ]
  });
  ({
    workouts: summary.workouts,
    metrics: summary.metrics,
    customExercises: summary.customExercises,
    newestDate: summary.newestDate,
    dashboardWidgets: summary.normalized.settings.dashboardWidgets
  });
`);

assert.strictEqual(backupPreviewSummary.workouts, 2, `Expected import summary workout count, got ${backupPreviewSummary.workouts}`);
assert.strictEqual(backupPreviewSummary.metrics, 1, `Expected import summary metric count, got ${backupPreviewSummary.metrics}`);
assert.strictEqual(backupPreviewSummary.customExercises, 1, `Expected import summary exercise count, got ${backupPreviewSummary.customExercises}`);
assert.strictEqual(backupPreviewSummary.newestDate, "2026-06-16", `Expected newest import date, got ${backupPreviewSummary.newestDate}`);
assert.deepEqual(backupPreviewSummary.dashboardWidgets, ["health"], `Expected dashboard widgets to normalize through import summary, got ${backupPreviewSummary.dashboardWidgets.join(", ")}`);

const supabasePasswordExport = runScenario(`
  ${reset}
  state.settings.supabasePassword = "secret-password";
  state.settings.supabaseRememberPassword = true;
  state.settings.supabaseUrl = "https://example.supabase.co";
  state.settings.supabaseAnonKey = "anon";
  state.settings.supabaseEmail = "user@example.com";
  exportPayload().settings;
`);

assert(!("supabasePassword" in supabasePasswordExport), "Expected saved Supabase password to be excluded from backup exports.");
assert(!("supabaseRememberPassword" in supabasePasswordExport), "Expected Supabase remember flag to be excluded from backup exports.");

const coachDebugReport = runScenario(`
  ${reset}
  state.settings.supabasePassword = "secret-password";
  state.settings.supabaseRememberPassword = true;
  state.settings.supabaseAnonKey = "anon-secret";
  state.settings.supabaseSession = { access_token: "access-secret", refresh_token: "refresh-secret" };
  state.workouts = [makeWorkout({ id: "submitted-bench", date: todayISO() })];
  state.draftDate = todayISO();
  state.workoutDraft = [{
    draftId: "draft-bench",
    editingWorkoutId: null,
    exercise: "Bench Press",
    targetMuscle: "chest",
    notes: "unsaved",
    setRows: [{ weight: 125, reps: 10, rir: 1, restSeconds: 120 }]
  }];
  var report = buildCoachDebugReport();
  var serialized = JSON.stringify(report);
  ({
    app: report.app,
    notBackup: report.notBackup,
    hasCoachPlan: Boolean(report.coach.todayPlan),
    hasMuscleAudit: report.coach.muscleAudit.length > 0,
    modeKeys: Object.keys(report.coach.modeComparison || {}),
    modeItemCounts: Object.fromEntries(Object.entries(report.coach.modeComparison || {}).map(([mode, plan]) => [mode, plan.items.length])),
    modeSetTotals: Object.fromEntries(Object.entries(report.coach.modeComparison || {}).map(([mode, plan]) => [mode, plan.totalSets])),
    modeMinutes: Object.fromEntries(Object.entries(report.coach.modeComparison || {}).map(([mode, plan]) => [mode, plan.totalMinutes])),
    restoredMode: state.coachGlobalGrowthMode,
    hasSubmitted: report.submitted.workoutCount,
    hasDraftOnly: report.draftOnly.entries.length,
    hasSecret: serialized.includes("secret-password") || serialized.includes("anon-secret") || serialized.includes("access-secret") || serialized.includes("refresh-secret")
  });
`);

assert.strictEqual(coachDebugReport.app, "TrainWise Coach Debug Report", `Expected Coach debug report app label, got ${coachDebugReport.app}`);
assert.strictEqual(coachDebugReport.notBackup, true, "Expected Coach debug report to mark itself as non-backup.");
assert(coachDebugReport.hasCoachPlan, "Expected Coach debug report to include today's plan.");
assert(coachDebugReport.hasMuscleAudit, "Expected Coach debug report to include muscle audit.");
assert.deepEqual(coachDebugReport.modeKeys, ["soft", "medium", "aggressive"], `Expected Coach debug report to compare all three modes, got ${coachDebugReport.modeKeys.join(", ")}`);
assert(Object.values(coachDebugReport.modeItemCounts).every((count) => Number.isFinite(count)), `Expected every mode comparison to include item counts, got ${JSON.stringify(coachDebugReport.modeItemCounts)}`);
assert(Object.values(coachDebugReport.modeSetTotals).every((count) => Number.isFinite(count)), `Expected every mode comparison to include total sets, got ${JSON.stringify(coachDebugReport.modeSetTotals)}`);
assert(Object.values(coachDebugReport.modeMinutes).every((count) => Number.isFinite(count)), `Expected every mode comparison to include minutes, got ${JSON.stringify(coachDebugReport.modeMinutes)}`);
assert.strictEqual(coachDebugReport.restoredMode, "medium", `Expected debug mode comparison not to mutate selected Coach mode, got ${coachDebugReport.restoredMode}`);
assert.strictEqual(coachDebugReport.hasSubmitted, 1, `Expected Coach debug report to include submitted workout count, got ${coachDebugReport.hasSubmitted}`);
assert.strictEqual(coachDebugReport.hasDraftOnly, 1, `Expected Coach debug report to include draft-only entries separately, got ${coachDebugReport.hasDraftOnly}`);
assert(appCode.includes('data-action="export-coach-debug"'), "Expected Settings to expose a Coach debug export action.");
assert.strictEqual(coachDebugReport.hasSecret, false, "Expected Coach debug report to exclude Supabase secrets and sessions.");

console.log("log regression tests passed");
