const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let appCode = fs.readFileSync("app.js", "utf8");
appCode = appCode.replace(/init\(\)\.catch\([\s\S]*?\n\}\);\s*$/, "");
const stylesCode = fs.readFileSync("styles.css", "utf8");

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
assert(mobileCss.includes('"drag record muscles spacer"'), "Expected mobile exercise header to keep icons left of the field.");
assert(mobileCss.includes(".set-table th.prev-cell"), "Expected mobile set table to hide Prev header at the 720px breakpoint.");
assert(mobileCss.includes(".set-table td.prev-cell"), "Expected mobile set table to hide Prev values at the 720px breakpoint.");
assert(mobileCss.includes("table-layout: fixed"), "Expected mobile set table to use fixed columns.");
assert(mobileCss.includes(".set-table tr"), "Expected mobile set table rows to use explicit grid layout.");
assert(mobileCss.includes("grid-template-columns: minmax(0, 1.2fr)"), "Expected mobile set table to define visible input columns.");
assert(mobileCss.includes(".set-table td.mobile-set-meta"), "Expected mobile row metadata to be visible on mobile.");
assert(/\.mobile-set-meta\s*{\s*display:\s*none;/.test(stylesCode), "Expected mobile row metadata to be hidden by default.");
assert(!appCode.includes("exercise-title-dumbbell"), "Expected extra dumbbell icon next to record/muscle icons to be removed.");
assert(stylesCode.includes(".nutrition-meal-grid"), "Expected nutrition meal buckets to have dedicated layout styling.");
assert(mobileCss.includes(".nutrition-meal-grid"), "Expected nutrition meal buckets to stack safely on mobile.");
assert(stylesCode.includes(".nutrition-total-strip"), "Expected nutrition form to show live daily totals.");
assert(stylesCode.includes(".nutrition-quick-card"), "Expected quick daily totals to have dedicated layout styling.");
assert(stylesCode.includes(".nutrition-quick-card.is-overridden"), "Expected quick daily totals to show an overridden state.");
assert(stylesCode.includes(".nutrition-override-message"), "Expected meal override message to have dedicated styling.");

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
    firstExercise: state.workoutDraft[0].exercise,
    firstNotes: state.workoutDraft[0].notes,
    firstRows: state.workoutDraft[0].setRows,
    selectedExercise: state.selectedExercise
  });
`);

assert.strictEqual(emptyDateReset.date, "2026-06-12", "Expected empty date to stay selected.");
assert.strictEqual(emptyDateReset.editingWorkoutId, null, "Expected empty date to clear edit mode.");
assert.strictEqual(emptyDateReset.notes, "", "Expected empty date to clear stale notes.");
assert.strictEqual(emptyDateReset.draftCount, 1, "Expected empty date to reset to one fresh draft.");
assert.strictEqual(emptyDateReset.firstExercise, "Bench Press", `Expected fresh default library exercise, got ${emptyDateReset.firstExercise}`);
assert.strictEqual(emptyDateReset.firstNotes, "", "Expected fresh draft notes.");
assert.strictEqual(emptyDateReset.firstRows.length, 3, "Expected default fresh set rows.");
assert(emptyDateReset.firstRows.every((row) => row.weight === "" || row.weight === 0), "Expected empty date not to keep stale weight setup.");
assert.strictEqual(emptyDateReset.selectedExercise, "Bench Press", "Expected selected exercise to match fresh default draft.");

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

console.log("log regression tests passed");
