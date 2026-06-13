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

const withinCoachTimeWindow = (total, target) => Math.abs(total - target) <= 3;

const resetAndHelpers = `
  state.workouts = [];
  state.metrics = [];
  state.settings = {};
  state.selectedExercise = "Push-up";
  state.coachTargetMuscles = [];
  state.settings.customExercises = [
    ...muscleGroups.map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-12",
      rest: "90-180 sec",
      cue: "Test exercise for " + muscle.label,
      userCreated: true
    })),
    {
      id: "custom-bench-press",
      name: "Dumbbell Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps", "shoulders"],
      equipment: "dumbbells, bench",
      reps: "8-15",
      rest: "90-180 sec",
      cue: "Test bench press with secondary muscles.",
      userCreated: true
    }
  ];
  var makeWorkout = (muscle, daysAgo = 2, sets = 2, extra = {}) => ({
    id: extra.id || "w-" + muscle.id + "-" + daysAgo,
    date: dateDaysAgo(daysAgo),
    exercise: extra.exercise || ("custom-" + muscle.id),
    exerciseId: extra.exerciseId || ("custom-" + muscle.id),
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
assert(withinCoachTimeWindow(coverage.total, 60), `Expected 1 hour plan to land near 60 min, got ${coverage.total}`);
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
  state.settings.customExercises = state.settings.customExercises.filter((ex) => !ex.primaryMuscles.includes("back"));
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

const targetedMuscles = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["biceps"];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var plan = buildTodayPlan(60);
  ({
    mode: plan.mode,
    muscles: plan.sessionPlan.items.map((item) => item.muscle.id),
    bicepsSets: plan.sessionPlan.items.find((item) => item.muscle.id === "biceps")?.sets || 0,
    why: plan.why.join(" ")
  });
`);

assert.strictEqual(targetedMuscles.mode, "session", `Expected target focus to create a session, got ${targetedMuscles.mode}`);
assert(targetedMuscles.muscles.includes("biceps"), `Expected biceps target in plan, got ${targetedMuscles.muscles.join(", ")}`);
assert(targetedMuscles.bicepsSets > 0, `Expected biceps target to receive work, got ${targetedMuscles.bicepsSets}`);
assert(targetedMuscles.why.includes("Target focus"), `Expected target focus explanation, got ${targetedMuscles.why}`);

const targetMissingCoverage = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["biceps"];
  state.settings.customExercises = state.settings.customExercises.filter((exercise) => !exercise.primaryMuscles.includes("biceps"));
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var plan = buildTodayPlan(60);
  ({ missing: plan.sessionPlan.missing.map((muscle) => muscle.label) });
`);

assert(targetMissingCoverage.missing.includes("Biceps"), `Expected missing target coverage to include Biceps, got ${targetMissingCoverage.missing.join(", ")}`);

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
assert(withinCoachTimeWindow(timeframe.total50, 50), `Expected 50 min plan to land near 50 min, got ${timeframe.total50}`);
assert(withinCoachTimeWindow(timeframe.total60, 60), `Expected 60 min plan to land near 60 min, got ${timeframe.total60}`);
assert(timeframe.items60 >= timeframe.items50, `Expected 60 min to keep or add coverage, got ${timeframe.items50} and ${timeframe.items60}`);
assert(timeframe.sets60 > timeframe.sets50, `Expected 60 min to add useful sets, got ${timeframe.sets50} and ${timeframe.sets60}`);

const shortRestTimeframe = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = muscleGroups.map((muscle) => ({
    id: "short-rest-" + muscle.id,
    name: muscle.label + " Short Rest Exercise",
    primaryMuscles: [muscle.id],
    secondaryMuscles: [],
    equipment: "custom",
    reps: "8-15",
    rest: "30-60 sec",
    cue: "Short-rest test exercise for " + muscle.label,
    userCreated: true
  }));
  var shortWorkout = (muscle, daysAgo, sets) => makeWorkout(muscle, daysAgo, sets, {
    exercise: "short-rest-" + muscle.id,
    exerciseId: "short-rest-" + muscle.id,
    primaryMuscles: [muscle.id],
    restSeconds: 31
  });
  state.workouts = [
    shortWorkout(muscleGroups.find((muscle) => muscle.id === "biceps"), 5, 5),
    shortWorkout(muscleGroups.find((muscle) => muscle.id === "glutes"), 4, 7.5),
    shortWorkout(muscleGroups.find((muscle) => muscle.id === "back"), 5, 7.5),
    shortWorkout(muscleGroups.find((muscle) => muscle.id === "calves"), 4, 7.5),
    ...muscleGroups
      .filter((muscle) => !["biceps", "glutes", "back", "calves"].includes(muscle.id))
      .map((muscle) => shortWorkout(muscle, 2, 10))
  ];
  var plan = buildTodayPlan(60).sessionPlan;
  ({
    total: plan.totalMinutes,
    itemCount: plan.items.length,
    setCount: plan.items.reduce((sum, item) => sum + item.sets, 0)
  });
`);

assert(withinCoachTimeWindow(shortRestTimeframe.total, 60), `Expected short-rest 1 hour plan to land near 60 min, got ${shortRestTimeframe.total}`);
assert(shortRestTimeframe.setCount > 14, `Expected short-rest 1 hour plan to add useful volume beyond the early 14-set plan, got ${shortRestTimeframe.setCount}`);

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

const extraSetFairness = runScenario(`
  ${resetAndHelpers}
  var chest = muscleGroups.find((m) => m.id === "chest");
  var back = muscleGroups.find((m) => m.id === "back");
  state.workouts = [
    makeWorkout(chest, 2, 8),
    makeWorkout(back, 2, 3),
    makeWorkout(muscleGroups.find((m) => m.id === "quads"), 2, 10),
    makeWorkout(muscleGroups.find((m) => m.id === "biceps"), 2, 10),
    makeWorkout(muscleGroups.find((m) => m.id === "calves"), 2, 10)
  ];
  var plan = buildTodayPlan(60);
  var chestItem = plan.sessionPlan.items.find((item) => item.muscle.id === "chest");
  var backItem = plan.sessionPlan.items.find((item) => item.muscle.id === "back");
  ({
    chestSets: chestItem?.sets || 0,
    backSets: backItem?.sets || 0,
    chestDeficit: chestItem?.deficit || 0,
    backDeficit: backItem?.deficit || 0
  });
`);

assert(extraSetFairness.backSets > extraSetFairness.chestSets, `Expected Back (higher deficit) to get more extras, got chest=${extraSetFairness.chestSets} back=${extraSetFairness.backSets}`);

const shortTimeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 2));
  var plan30 = buildTodayPlan(30).sessionPlan;
  ({
    total30: plan30.totalMinutes,
    items30: plan30.items.length,
    fits: plan30.totalMinutes <= 33
  });
`);

assert(shortTimeframe.fits, `Expected 30 min plan to fit within time window, got ${shortTimeframe.total30}`);
assert(withinCoachTimeWindow(shortTimeframe.total30, 30), `Expected 30 min plan to land near 30 min, got ${shortTimeframe.total30}`);
assert(shortTimeframe.items30 >= 2, `Expected 30 min to cover at least 2 muscles, got ${shortTimeframe.items30}`);

const midTimeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 2));
  var plan40 = buildTodayPlan(40).sessionPlan;
  ({
    total40: plan40.totalMinutes,
    items40: plan40.items.length,
    fits: plan40.totalMinutes <= 43
  });
`);

assert(midTimeframe.fits, `Expected 40 min plan to fit within time window, got ${midTimeframe.total40}`);
assert(withinCoachTimeWindow(midTimeframe.total40, 40), `Expected 40 min plan to land near 40 min, got ${midTimeframe.total40}`);
assert(midTimeframe.items40 >= 3, `Expected 40 min to cover at least 3 muscles, got ${midTimeframe.items40}`);

const allUnderdeveloped = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 5, 1));
  var plan = buildTodayPlan(60);
  ({
    total: plan.sessionPlan.totalMinutes,
    itemCount: plan.sessionPlan.items.length,
    fits: plan.sessionPlan.totalMinutes <= 60
  });
`);

assert(allUnderdeveloped.fits, `Expected all-underdeveloped plan to fit within limit, got ${allUnderdeveloped.total}`);
assert(allUnderdeveloped.itemCount >= 4, `Expected all-underdeveloped to cover at least 4 muscles, got ${allUnderdeveloped.itemCount}`);

const emptyPlanAction = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var plan = buildTodayPlan(60);
  var action = actionFromSessionPlan(plan);
  ({
    mode: action.mode,
    itemCount: plan.sessionPlan.items.length,
    hasTitle: typeof action.title === "string" && action.title.length > 0,
    hasBody: typeof action.body === "string" && action.body.length > 0
  });
`);

assert.notStrictEqual(emptyPlanAction.mode, "session", "Expected all-covered muscles to stay in progression/recovery mode instead of filling time.");
assert.strictEqual(emptyPlanAction.itemCount, 0, `Expected all-covered plan to have no forced session items, got ${emptyPlanAction.itemCount}`);
assert(emptyPlanAction.hasTitle, `Expected action to have a title even with no items, got mode=${emptyPlanAction.mode}`);
assert(emptyPlanAction.hasBody, `Expected action to have body text even with no items, got mode=${emptyPlanAction.mode}`);

const exerciseScoring = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    {
      id: "curl",
      name: "Bicep Curl",
      primaryMuscles: ["biceps"],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-15",
      rest: "60-120 sec",
      cue: "Curl.",
      userCreated: true
    },
    {
      id: "hammer",
      name: "Hammer Curl",
      primaryMuscles: ["biceps"],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-15",
      rest: "60-120 sec",
      cue: "Hammer.",
      userCreated: true
    }
  ];
  var biceps = muscleGroups.find((m) => m.id === "biceps");
  state.workouts = [
    makeWorkout(biceps, 4, 3, { exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], secondaryMuscles: [], restSeconds: 90 })
  ];
  var chosen = chooseExerciseForMuscle("biceps");
  ({
    chosen: chosen?.name,
    curlScore: scoreExerciseForMuscle(resolveExerciseMeta("Bicep Curl"), "biceps"),
    hammerScore: scoreExerciseForMuscle(resolveExerciseMeta("Hammer Curl"), "biceps")
  });
`);

assert.strictEqual(exerciseScoring.chosen, "Hammer Curl", `Expected rotation toward Hammer Curl, got ${exerciseScoring.chosen} with scores curl=${exerciseScoring.curlScore} hammer=${exerciseScoring.hammerScore}`);

const highVolumeWording = runScenario(`
  setZone(21).label;
`);

assert.strictEqual(highVolumeWording, "High volume", `Expected high volume wording, got ${highVolumeWording}`);

console.log("coach regression tests passed");
