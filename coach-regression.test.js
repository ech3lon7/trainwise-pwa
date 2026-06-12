const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let appCode = fs.readFileSync("app.js", "utf8");
appCode = appCode.replace(/init\(\)\.catch\([\s\S]*?\n\}\);\s*$/, "");

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

const resetAndHelpers = `
  state.workouts = [];
  state.metrics = [];
  state.settings = {};
  state.selectedExercise = "Push-up";
  var makeWorkout = (muscle, daysAgo = 2, sets = 2, extra = {}) => ({
    id: extra.id || "w-" + muscle.id + "-" + daysAgo,
    date: dateDaysAgo(daysAgo),
    exercise: extra.exercise || chooseExerciseForMuscle(muscle.id)?.name || muscle.label,
    exerciseId: extra.exerciseId || chooseExerciseForMuscle(muscle.id)?.id || "manual-" + muscle.id,
    primaryMuscles: extra.primaryMuscles || [muscle.id],
    secondaryMuscles: extra.secondaryMuscles || [],
    sets,
    reps: 10,
    weight: 20,
    rir: 2,
    setRows: Array.from({ length: sets }, () => ({ weight: 20, reps: 10, rir: 2, restSeconds: extra.restSeconds || null })),
    createdAt: dateDaysAgo(daysAgo) + "T12:00:00.000Z"
  });
`;

const coverage = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 2));
  var plan = buildTodayPlan(60);
  ({
    total: plan.sessionPlan.totalMinutes,
    itemCount: plan.sessionPlan.items.length,
    muscles: plan.sessionPlan.items.map((item) => item.muscle.label),
    regions: [...new Set(plan.sessionPlan.items.map((item) => muscleRegion(item.muscle.id)))],
    sets: plan.sessionPlan.items.map((item) => item.sets),
    noteTitle: recommendations(plan)[0].title,
    noteBody: recommendations(plan)[0].body
  });
`);

assert(coverage.itemCount >= 5, `Expected 1 hour to cover at least 5 muscles, got ${coverage.itemCount}: ${coverage.muscles.join(", ")}`);
assert(coverage.total >= 50, `Expected 1 hour plan to use meaningful time, got ${coverage.total}`);
assert(coverage.regions.includes("push") && coverage.regions.includes("pull") && coverage.regions.includes("legs") && coverage.regions.includes("core"), `Expected balanced regions, got ${coverage.regions.join(", ")}`);
assert(coverage.noteTitle.includes("Today's Plan"), `Expected Coach note to summarize Today's Plan, got ${coverage.noteTitle}`);
assert(coverage.noteBody.includes(`${coverage.total}/60`), `Expected Coach note to use active plan estimate, got ${coverage.noteBody}`);

const secondaryReadiness = runScenario(`
  ${resetAndHelpers}
  var bench = resolveExerciseMeta("Dumbbell Bench Press");
  state.workouts = [makeWorkout({ id: "chest", label: "Chest" }, 1, 2, {
    id: "bench-yesterday",
    exercise: bench.name,
    exerciseId: bench.id,
    primaryMuscles: bench.primaryMuscles,
    secondaryMuscles: bench.secondaryMuscles
  })];
  var triceps = muscleSetStats().map(muscleReadiness).find((muscle) => muscle.id === "triceps");
  ({ readiness: triceps.readiness, primaryDaysSince: triceps.primaryDaysSince, secondaryDaysSince: triceps.secondaryDaysSince });
`);

assert.notStrictEqual(secondaryReadiness.readiness, "recent", "Secondary-only work should not block direct muscle planning as recent primary work.");
assert.strictEqual(secondaryReadiness.primaryDaysSince, null, "Triceps should not have a primary recent date from bench secondary work.");
assert.strictEqual(secondaryReadiness.secondaryDaysSince, 1, "Triceps should still report secondary work for explanation.");

const missingCoverage = runScenario(`
  ${resetAndHelpers}
  state.settings.hiddenExercises = exerciseLibrary
    .filter((exercise) => exercise.primaryMuscles.includes("back"))
    .map((exercise) => exercise.id);
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 2));
  var plan = buildTodayPlan(60);
  var whyHtml = renderCoachWhy(plan);
  ({
    missing: plan.sessionPlan.missing.map((muscle) => muscle.label),
    whyHasLibraryGap: whyHtml.includes("Library gaps"),
    whyHasBack: whyHtml.includes("Back")
  });
`);

assert(missingCoverage.missing.includes("Back"), `Expected missing coverage to include Back, got ${missingCoverage.missing.join(", ")}`);
assert(missingCoverage.whyHasLibraryGap && missingCoverage.whyHasBack, "Why this? should expose missing library coverage.");

const timeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 2));
  var plan50 = buildTodayPlan(50).sessionPlan;
  var plan60 = buildTodayPlan(60).sessionPlan;
  ({
    total50: plan50.totalMinutes,
    total60: plan60.totalMinutes,
    items50: plan50.items.length,
    items60: plan60.items.length,
    sets50: plan50.items.reduce((sum, item) => sum + item.sets, 0),
    sets60: plan60.items.reduce((sum, item) => sum + item.sets, 0)
  });
`);

assert(timeframe.total60 > timeframe.total50, `Expected 60 min to exceed 50 min, got ${timeframe.total50} and ${timeframe.total60}`);
assert(timeframe.items60 >= timeframe.items50, `Expected 60 min to keep or add coverage, got ${timeframe.items50} and ${timeframe.items60}`);
assert(timeframe.sets60 > timeframe.sets50, `Expected 60 min to add useful sets, got ${timeframe.sets50} and ${timeframe.sets60}`);

const personalRest = runScenario(`
  ${resetAndHelpers}
  var row = resolveExerciseMeta("Dumbbell Row");
  state.workouts = [makeWorkout({ id: "back", label: "Back" }, 2, 2, {
    exercise: row.name,
    exerciseId: row.id,
    primaryMuscles: row.primaryMuscles,
    secondaryMuscles: row.secondaryMuscles,
    restSeconds: 240
  })];
  ({ estimated: estimateExerciseMinutes(row, 2) });
`);

assert(personalRest.estimated >= 12, `Expected personal long rest data to increase time estimate, got ${personalRest.estimated}`);

console.log("coach regression tests passed");
