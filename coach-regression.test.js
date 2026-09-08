const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let appCode = fs.readFileSync("app.js", "utf8");
appCode = appCode.replace(/init\(\)\.catch\([\s\S]*?\n\}\);\s*$/, "");

const NativeDate = Date;
class FixedDate extends NativeDate {
  constructor(...args) {
    return args.length ? new NativeDate(...args) : new NativeDate("2026-06-17T12:00:00");
  }

  static now() {
    return new NativeDate("2026-06-17T12:00:00").getTime();
  }

  static parse(value) {
    return NativeDate.parse(value);
  }

  static UTC(...args) {
    return NativeDate.UTC(...args);
  }
}

const sessionData = {};
const sessionStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(sessionData, key) ? sessionData[key] : null; },
  setItem(key, value) { sessionData[key] = String(value); },
  removeItem(key) { delete sessionData[key]; }
};

const context = {
  console,
  crypto: { randomUUID: () => `id-${Math.random().toString(16).slice(2)}` },
  Date: FixedDate,
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
    sessionStorage,
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
  state.coachGlobalGrowthMode = "medium";
  state.coachGrowthModes = {};
  state.copiedCoachPlan = null;
  state.previewNextCoachPlan = false;
  state.workoutDraft = [];
  state.draftDate = todayISO();
  state.templateQueue = [];
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

const coachExerciseSequencing = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "curl", name: "Bicep Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Curl.", userCreated: true },
    { id: "hammer", name: "Hammer Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Hammer.", userCreated: true },
    { id: "bench", name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], exerciseType: "compound", equipment: "barbell", reps: "6-12", rest: "120 sec", cue: "Bench.", userCreated: true },
    { id: "row", name: "Cable Row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], exerciseType: "compound", equipment: "cable", reps: "8-15", rest: "90 sec", cue: "Row.", userCreated: true }
  ];
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  var back = muscleGroups.find((muscle) => muscle.id === "back");
  var items = [
    { muscle: biceps, exercise: resolveExerciseMeta("Bicep Curl"), sets: 3, minutes: 6 },
    { muscle: biceps, exercise: resolveExerciseMeta("Hammer Curl"), sets: 3, minutes: 6 },
    { muscle: chest, exercise: resolveExerciseMeta("Bench Press"), sets: 3, minutes: 9 },
    { muscle: back, exercise: resolveExerciseMeta("Cable Row"), sets: 3, minutes: 8 }
  ];
  var ordered = orderCoachSessionItems(items);
  ({
    names: ordered.map((item) => item.exercise.name),
    firstType: exercisePlanType(ordered[0].exercise),
    adjacentSamePrimary: ordered.some((item, index) => index > 0 && item.muscle.id === ordered[index - 1].muscle.id),
    setTotal: ordered.reduce((sum, item) => sum + item.sets, 0),
    minuteTotal: ordered.reduce((sum, item) => sum + item.minutes, 0)
  });
`);

assert.strictEqual(coachExerciseSequencing.firstType, "compound", `Expected first ordered Coach exercise to be compound, got ${coachExerciseSequencing.firstType}: ${coachExerciseSequencing.names.join(", ")}`);
assert.strictEqual(coachExerciseSequencing.adjacentSamePrimary, false, `Expected Coach sequencing to gap repeated muscles, got ${coachExerciseSequencing.names.join(", ")}`);
assert.strictEqual(coachExerciseSequencing.setTotal, 12, `Expected Coach ordering not to change sets, got ${coachExerciseSequencing.setTotal}`);
assert.strictEqual(coachExerciseSequencing.minuteTotal, 29, `Expected Coach ordering not to change minutes, got ${coachExerciseSequencing.minuteTotal}`);

const mondayWeekBoundary = runScenario(`
  ${resetAndHelpers}
  var RealDate = Date;
  Date = class extends RealDate {
    constructor(...args) {
      return args.length ? new RealDate(...args) : new RealDate("2026-06-15T12:00:00");
    }
    static now() { return new RealDate("2026-06-15T12:00:00").getTime(); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  var sunday = { ...makeWorkout(chest, 0, 4), id: "sunday", date: "2026-06-14", createdAt: "2026-06-14T12:00:00.000Z" };
  var monday = { ...makeWorkout(chest, 0, 3), id: "monday", date: "2026-06-15", createdAt: "2026-06-15T12:00:00.000Z" };
  state.workouts = [sunday, monday];
  var stats = muscleSetStats().find((stat) => stat.id === "chest");
  var weeklyVolume = getWeeklyVolume();
  var weekStart = isoFromLocalDate(currentTrainingWeekStart());
  Date = RealDate;
  ({ sets: stats.sets, sessions: stats.sessions, weeklyVolume, weekStart });
`);

assert.strictEqual(mondayWeekBoundary.weekStart, "2026-06-15", `Expected Monday week to start on 2026-06-15, got ${mondayWeekBoundary.weekStart}`);
assert.strictEqual(mondayWeekBoundary.sets, 3, `Expected Monday boundary to exclude prior Sunday sets and include Monday sets, got ${mondayWeekBoundary.sets}`);
assert.strictEqual(mondayWeekBoundary.sessions, 1, `Expected Monday boundary to count only Monday touch, got ${mondayWeekBoundary.sessions}`);
assert.strictEqual(mondayWeekBoundary.weeklyVolume, 600, `Expected weekly volume to exclude Sunday and include Monday only, got ${mondayWeekBoundary.weeklyVolume}`);

const wednesdayWeekBoundary = runScenario(`
  ${resetAndHelpers}
  var RealDate = Date;
  Date = class extends RealDate {
    constructor(...args) {
      return args.length ? new RealDate(...args) : new RealDate("2026-06-17T12:00:00");
    }
    static now() { return new RealDate("2026-06-17T12:00:00").getTime(); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  var sunday = { ...makeWorkout(chest, 0, 4), id: "sunday", date: "2026-06-14", createdAt: "2026-06-14T12:00:00.000Z" };
  var monday = { ...makeWorkout(chest, 0, 3), id: "monday", date: "2026-06-15", createdAt: "2026-06-15T12:00:00.000Z" };
  var wednesday = { ...makeWorkout(chest, 0, 2), id: "wednesday", date: "2026-06-17", createdAt: "2026-06-17T12:00:00.000Z" };
  state.workouts = [sunday, monday, wednesday];
  var stats = muscleSetStats().find((stat) => stat.id === "chest");
  var weekStart = isoFromLocalDate(currentTrainingWeekStart());
  Date = RealDate;
  ({ sets: stats.sets, sessions: stats.sessions, weekStart });
`);

assert.strictEqual(wednesdayWeekBoundary.weekStart, "2026-06-15", `Expected Wednesday week to start on Monday 2026-06-15, got ${wednesdayWeekBoundary.weekStart}`);
assert.strictEqual(wednesdayWeekBoundary.sets, 5, `Expected Wednesday boundary to count Monday-Wednesday and exclude Sunday, got ${wednesdayWeekBoundary.sets}`);
assert.strictEqual(wednesdayWeekBoundary.sessions, 2, `Expected Wednesday boundary to count Monday and Wednesday touches, got ${wednesdayWeekBoundary.sessions}`);

const priorWeekStillRotatesExercises = runScenario(`
  ${resetAndHelpers}
  var RealDate = Date;
  Date = class extends RealDate {
    constructor(...args) {
      return args.length ? new RealDate(...args) : new RealDate("2026-06-15T12:00:00");
    }
    static now() { return new RealDate("2026-06-15T12:00:00").getTime(); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  state.settings.customExercises = [
    { id: "curl", name: "Bicep Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true },
    { id: "hammer", name: "Hammer Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Hammer.", userCreated: true }
  ];
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  var sundayCurl = {
    ...makeWorkout(biceps, 0, 4, { exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    id: "sunday-curl",
    date: "2026-06-14",
    createdAt: "2026-06-14T12:00:00.000Z"
  };
  state.workouts = [sundayCurl];
  var weeklySets = muscleSetStats().find((stat) => stat.id === "biceps").sets;
  var chosen = chooseExerciseForMuscle("biceps");
  Date = RealDate;
  ({ weeklySets, chosen: chosen?.name });
`);

assert.strictEqual(priorWeekStillRotatesExercises.weeklySets, 0, `Expected prior Sunday sets to reset on Monday, got ${priorWeekStillRotatesExercises.weeklySets}`);
assert.strictEqual(priorWeekStillRotatesExercises.chosen, "Hammer Curl", `Expected prior-week exercise history to still influence rotation, got ${priorWeekStillRotatesExercises.chosen}`);

const directMuscleDateGapBlocksYesterday = runScenario(`
  ${resetAndHelpers}
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  state.workouts = [
    makeWorkout(chest, 1, 2),
    ...muscleGroups
      .filter((muscle) => muscle.id !== "chest")
      .map((muscle) => makeWorkout(muscle, 3, 2))
  ];
  var plan = buildTodayPlan(60);
  ({
    plannedMuscles: plan.sessionPlan.items.map((item) => item.muscle.id),
    skipped: plan.sessionPlan.deprioritized.map((item) => item.reason).join(" ")
  });
`);

assert(!directMuscleDateGapBlocksYesterday.plannedMuscles.includes("chest"), `Expected direct chest work yesterday to be blocked by date gap, got ${directMuscleDateGapBlocksYesterday.plannedMuscles.join(", ")}`);
assert(directMuscleDateGapBlocksYesterday.skipped.includes("2-day gap"), `Expected skipped reason to mention the 2-day gap, got ${directMuscleDateGapBlocksYesterday.skipped}`);

const directMuscleDateGapAllowsTwoDays = runScenario(`
  ${resetAndHelpers}
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  state.workouts = [
    makeWorkout(chest, 2, 2),
    ...muscleGroups
      .filter((muscle) => muscle.id !== "chest")
      .map((muscle) => makeWorkout(muscle, 2, 22))
  ];
  var plan = buildTodayPlan(60);
  ({ plannedMuscles: plan.sessionPlan.items.map((item) => item.muscle.id) });
`);

assert(directMuscleDateGapAllowsTwoDays.plannedMuscles.includes("chest"), `Expected direct chest work 2 dates ago to be available again, got ${directMuscleDateGapAllowsTwoDays.plannedMuscles.join(", ")}`);

const dailyMuscleCap = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 3, 2));
  var plan = buildTodayPlan(60).sessionPlan;
  ({
    itemCount: plan.items.length,
    muscles: [...new Set(plan.items.map((item) => item.muscle.id))]
  });
`);

assert(dailyMuscleCap.muscles.length <= 8, `Expected Coach to cap new daily muscles by timeframe, got ${dailyMuscleCap.muscles.length}: ${dailyMuscleCap.muscles.join(", ")}`);

const weeklyExerciseFairnessCap = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "curl", name: "Bicep Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true },
    { id: "hammer", name: "Hammer Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Hammer.", userCreated: true }
  ];
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  state.workouts = [
    makeWorkout(biceps, 2, 3, { id: "curl-week-1", exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    makeWorkout(biceps, 2, 3, { id: "curl-week-2", exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    makeWorkout(biceps, 9, 3, { id: "curl-old-1", exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    makeWorkout(biceps, 14, 3, { id: "curl-old-2", exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    makeWorkout(biceps, 21, 3, { id: "curl-old-3", exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 })
  ];
  var chosen = chooseExerciseForMuscle("biceps");
  ({ chosen: chosen?.name, curlMemory: coachExerciseMemory(resolveExerciseMeta("Bicep Curl")).weeklyUses });
`);

assert.strictEqual(weeklyExerciseFairnessCap.chosen, "Hammer Curl", `Expected weekly use cap to rotate away from repeated Bicep Curl, got ${weeklyExerciseFairnessCap.chosen}`);
assert.strictEqual(weeklyExerciseFairnessCap.curlMemory, 2, `Expected Curl weekly use count to be 2, got ${weeklyExerciseFairnessCap.curlMemory}`);

const activeDraftDoesNotUpdateCoachPlan = runScenario(`
  ${resetAndHelpers}
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  state.workouts = [makeWorkout(biceps, 2, 8)];
  state.draftDate = todayISO();
  state.workoutDraft = [{
    draftId: "draft-biceps",
    editingWorkoutId: null,
    exercise: "Biceps Exercise",
    targetMuscle: "biceps",
    notes: "",
    setRows: [
      { weight: 20, reps: 10, rir: 1, restSeconds: 90 },
      { weight: 20, reps: 10, rir: 1, restSeconds: 90 }
    ]
  }];
  var bicepsStat = rankedCoachMuscles().find((muscle) => muscle.id === "biceps");
  var coachEntries = coachWorkoutEntries();
  ({ sets: bicepsStat.sets, sessions: bicepsStat.sessions, coachEntryCount: coachEntries.length, hasPending: coachEntries.some((entry) => entry.pendingDraft) });
`);

assert.strictEqual(activeDraftDoesNotUpdateCoachPlan.sets, 8, `Expected Coach to ignore active Log draft until lock-in, got ${activeDraftDoesNotUpdateCoachPlan.sets}`);
assert.strictEqual(activeDraftDoesNotUpdateCoachPlan.sessions, 1, `Expected active draft not to count as a Coach touch, got ${activeDraftDoesNotUpdateCoachPlan.sessions}`);
assert.strictEqual(activeDraftDoesNotUpdateCoachPlan.coachEntryCount, 1, `Expected Coach entries to use submitted workouts only, got ${activeDraftDoesNotUpdateCoachPlan.coachEntryCount}`);
assert.strictEqual(activeDraftDoesNotUpdateCoachPlan.hasPending, false, "Expected Coach entries not to include pending draft rows.");

const repeatedFailureRotatesExercise = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "bench", name: "Flat Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell", reps: "8-12", rest: "120-180 sec", cue: "Bench.", userCreated: true },
    { id: "incline", name: "Incline Dumbbell Press", primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], equipment: "dumbbells", reps: "8-15", rest: "90-150 sec", cue: "Incline.", userCreated: true },
    ...muscleGroups.filter((muscle) => muscle.id !== "chest").map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "custom",
      reps: "8-15",
      rest: "90-180 sec",
      cue: "Test.",
      userCreated: true
    }))
  ];
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  var benchWorkout = (daysAgo, reps, rir) => makeWorkout(chest, daysAgo, 3, {
    exercise: "Flat Bench Press",
    exerciseId: "bench",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    restSeconds: 150
  });
  state.workouts = [
    { ...benchWorkout(2, 8, 0), reps: 8, setRows: [{ weight: 145, reps: 8, rir: 0, restSeconds: 150 }, { weight: 135, reps: 8, rir: 0, restSeconds: 150 }, { weight: 125, reps: 8, rir: 1, restSeconds: 150 }] },
    { ...benchWorkout(5, 10, 0), reps: 10, setRows: [{ weight: 145, reps: 10, rir: 0, restSeconds: 150 }, { weight: 135, reps: 10, rir: 1, restSeconds: 150 }, { weight: 125, reps: 10, rir: 1, restSeconds: 150 }] },
    { ...benchWorkout(8, 11, 1), reps: 11, setRows: [{ weight: 145, reps: 11, rir: 1, restSeconds: 150 }, { weight: 135, reps: 11, rir: 1, restSeconds: 150 }, { weight: 125, reps: 11, rir: 1, restSeconds: 150 }] },
    ...muscleGroups.filter((muscle) => muscle.id !== "chest").map((muscle) => makeWorkout(muscle, 2, 10))
  ];
  var plan = buildTodayPlan(60);
  var chestItem = plan.sessionPlan.items.find((item) => item.muscle.id === "chest");
  ({ exercise: chestItem?.exercise.name, note: plan.notes.join(" "), why: plan.why.join(" ") });
`);

assert.strictEqual(repeatedFailureRotatesExercise.exercise, "Incline Dumbbell Press", `Expected repeated bench failure to rotate to incline, got ${repeatedFailureRotatesExercise.exercise}`);
assert((repeatedFailureRotatesExercise.note + repeatedFailureRotatesExercise.why).includes("rotate") && (repeatedFailureRotatesExercise.note + repeatedFailureRotatesExercise.why).includes("sessions") || (repeatedFailureRotatesExercise.note + repeatedFailureRotatesExercise.why).includes("Two straight dips"), `Expected conversational repeated failure explanation, got ${repeatedFailureRotatesExercise.note} ${repeatedFailureRotatesExercise.why}`);

const topSetPrAvoidsFalseFailure = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "bench", name: "Flat Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell", reps: "8-12", rest: "120-180 sec", cue: "Bench.", userCreated: true }
  ];
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  state.workouts = [
    {
      ...makeWorkout(chest, 2, 3, {
      id: "bench-pr",
      exercise: "Flat Bench Press",
      exerciseId: "bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps", "shoulders"],
      restSeconds: 150
      }),
      reps: 10,
      weight: 155,
      setRows: [
        { weight: 155, reps: 10, rir: 1, restSeconds: 150 },
        { weight: 135, reps: 9, rir: 1, restSeconds: 150 },
        { weight: 125, reps: 8, rir: 2, restSeconds: 150 }
      ]
    },
    {
      ...makeWorkout(chest, 5, 3, {
      id: "bench-prior",
      exercise: "Flat Bench Press",
      exerciseId: "bench",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps", "shoulders"],
      restSeconds: 150
      }),
      reps: 10,
      weight: 145,
      setRows: [
        { weight: 145, reps: 10, rir: 1, restSeconds: 150 },
        { weight: 135, reps: 11, rir: 1, restSeconds: 150 },
        { weight: 125, reps: 10, rir: 2, restSeconds: 150 }
      ]
    }
  ];
  var signal = coachExercisePerformanceSignal(resolveExerciseMeta("Flat Bench Press"));
  var target = coachPlanTargetForExercise(resolveExerciseMeta("Flat Bench Press"), signal);
  ({ status: signal.status, message: signal.message, targetKind: target.kind, targetLabel: target.label });
`);

assert.strictEqual(topSetPrAvoidsFalseFailure.status, "progressing", `Expected top-set PR with normal backoff drop to count as progressing, got ${topSetPrAvoidsFalseFailure.status}: ${topSetPrAvoidsFalseFailure.message}`);
assert.notStrictEqual(topSetPrAvoidsFalseFailure.targetKind, "reset", `Expected top-set PR not to produce reset target, got ${topSetPrAvoidsFalseFailure.targetLabel}`);
assert.notStrictEqual(topSetPrAvoidsFalseFailure.targetKind, "deload", `Expected top-set PR not to produce deload target, got ${topSetPrAvoidsFalseFailure.targetLabel}`);

const planIncludesProgressionTarget = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "curl", name: "Bicep Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true },
    ...muscleGroups.filter((muscle) => muscle.id !== "biceps").map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "custom",
      reps: "8-15",
      rest: "90-180 sec",
      cue: "Test.",
      userCreated: true
    }))
  ];
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  state.workouts = [
    makeWorkout(biceps, 2, 3, { exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    makeWorkout(biceps, 8, 3, { exercise: "Bicep Curl", exerciseId: "curl", primaryMuscles: ["biceps"], restSeconds: 90 }),
    ...muscleGroups.filter((muscle) => muscle.id !== "biceps").map((muscle) => makeWorkout(muscle, 2, 10))
  ];
  var plan = buildTodayPlan(40);
  var bicepsItem = plan.sessionPlan.items.find((item) => item.muscle.id === "biceps");
  ({ label: bicepsItem?.planTarget?.label || "", detail: bicepsItem?.planTarget?.detail || "" });
`);

assert(planIncludesProgressionTarget.label.includes("Target"), `Expected plan item to expose an actionable progression target, got ${planIncludesProgressionTarget.label}`);
assert(planIncludesProgressionTarget.detail.includes("RIR"), `Expected progression detail to include RIR, got ${planIncludesProgressionTarget.detail}`);

const progressionModeConstraints = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "curl", name: "Bicep Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true, progressionMode: "normal" }
  ];
  state.workouts = [
    {
      id: "curl-good",
      date: todayISO(),
      exercise: "Bicep Curl",
      exerciseId: "curl",
      primaryMuscles: ["biceps"],
      secondaryMuscles: [],
      setRows: [
        { weight: 25, reps: 15, rir: 2, restSeconds: 90 },
        { weight: 25, reps: 13, rir: 2, restSeconds: 90 }
      ]
    }
  ];
  var normal = progressionTargetForExercise("Bicep Curl");
  state.settings.customExercises[0].progressionMode = "rep-first";
  var repFirst = progressionTargetForExercise("Bicep Curl");
  state.settings.customExercises[0].progressionMode = "small-jumps";
  var smallJumps = progressionTargetForExercise("Bicep Curl");
  ({
    normalIncrease: normal.increaseLoad,
    normalTarget: normal.target,
    repFirstIncrease: repFirst.increaseLoad,
    repFirstTarget: repFirst.target,
    repFirstBody: repFirst.body,
    smallJumpBody: smallJumps.body
  });
`);

assert.strictEqual(progressionModeConstraints.normalIncrease, true, "Expected normal progression to allow load increases when reps and RIR support it.");
assert(progressionModeConstraints.normalTarget.includes("27.5 lb") || progressionModeConstraints.normalTarget.includes("30 lb"), `Expected normal target to increase load, got ${progressionModeConstraints.normalTarget}`);
assert.strictEqual(progressionModeConstraints.repFirstIncrease, false, "Expected rep-first progression to suppress automatic load increases.");
assert(progressionModeConstraints.repFirstTarget.startsWith("25"), `Expected rep-first target to keep current load, got ${progressionModeConstraints.repFirstTarget}`);
assert(progressionModeConstraints.repFirstBody.includes("load-limited"), `Expected rep-first Coach wording to explain load limits, got ${progressionModeConstraints.repFirstBody}`);
assert(progressionModeConstraints.smallJumpBody.includes("smallest practical load jump"), `Expected small-jump Coach wording, got ${progressionModeConstraints.smallJumpBody}`);

const nutritionGoalDefault = runScenario(`
  ${resetAndHelpers}
  ({
    goal: selectedNutritionGoal(),
    label: nutritionGoalLabel(),
    settingsMarkup: renderNutritionGoalSelector().includes('data-nutrition-goal="bulk"')
  });
`);

assert.strictEqual(nutritionGoalDefault.goal, "bulk", `Expected nutrition goal to default to bulk, got ${nutritionGoalDefault.goal}`);
assert.strictEqual(nutritionGoalDefault.label, "Bulk", `Expected nutrition goal label to default to Bulk, got ${nutritionGoalDefault.label}`);
assert(nutritionGoalDefault.settingsMarkup, "Expected nutrition goal selector to render the Bulk option.");

const bulkHealthCoach = runScenario(`
  ${resetAndHelpers}
  state.settings.nutritionGoal = "bulk";
  state.metrics = [
    { id: "m1", date: dateDaysAgo(13), bodyWeight: 180, calories: 2400, protein: 180 },
    { id: "m2", date: dateDaysAgo(6), bodyWeight: 179.8, calories: 2400, protein: 180 },
    { id: "m3", date: dateDaysAgo(0), bodyWeight: 179.7, calories: 2400, protein: 180 }
  ];
  var coach = healthCoachSummary();
  ({
    goal: coach.goal,
    tone: coach.tone,
    recommendation: coach.recommendation,
    calorieAverage: coach.calorieAverage,
    weeklyWeightRate: coach.weeklyWeightRate
  });
`);

assert.strictEqual(bulkHealthCoach.goal, "bulk", `Expected bulk goal, got ${bulkHealthCoach.goal}`);
assert.strictEqual(bulkHealthCoach.tone, "warn", `Expected bulk flat/down trend to warn, got ${bulkHealthCoach.tone}`);
assert(bulkHealthCoach.recommendation.includes("+150-250 cal/day"), `Expected bulk recommendation to suggest a small calorie bump, got ${bulkHealthCoach.recommendation}`);
assert.strictEqual(bulkHealthCoach.calorieAverage, 2400, `Expected 7-day calories to average 2400, got ${bulkHealthCoach.calorieAverage}`);
assert(bulkHealthCoach.weeklyWeightRate < 0, `Expected weekly weight rate to be negative, got ${bulkHealthCoach.weeklyWeightRate}`);

const cutHealthCoach = runScenario(`
  ${resetAndHelpers}
  state.settings.nutritionGoal = "cut";
  state.metrics = [
    { id: "m1", date: dateDaysAgo(13), bodyWeight: 180, calories: 2200, protein: 180 },
    { id: "m2", date: dateDaysAgo(6), bodyWeight: 180.1, calories: 2200, protein: 180 },
    { id: "m3", date: dateDaysAgo(0), bodyWeight: 180.2, calories: 2200, protein: 180 }
  ];
  var coach = healthCoachSummary();
  ({ tone: coach.tone, recommendation: coach.recommendation });
`);

assert.strictEqual(cutHealthCoach.tone, "warn", `Expected cut flat/up trend to warn, got ${cutHealthCoach.tone}`);
assert(cutHealthCoach.recommendation.includes("-150-250 cal/day"), `Expected cut recommendation to suggest a small calorie decrease, got ${cutHealthCoach.recommendation}`);

const maintainHealthCoach = runScenario(`
  ${resetAndHelpers}
  state.settings.nutritionGoal = "maintain";
  state.metrics = [
    { id: "m1", date: dateDaysAgo(13), bodyWeight: 180, calories: 2300, protein: 180 },
    { id: "m2", date: dateDaysAgo(6), bodyWeight: 180.1, calories: 2300, protein: 180 },
    { id: "m3", date: dateDaysAgo(0), bodyWeight: 180.1, calories: 2300, protein: 180 }
  ];
  var coach = healthCoachSummary();
  ({ tone: coach.tone, recommendation: coach.recommendation });
`);

assert.strictEqual(maintainHealthCoach.tone, "good", `Expected stable maintain trend to be good, got ${maintainHealthCoach.tone}`);
assert(maintainHealthCoach.recommendation.includes("Stay the course"), `Expected maintain stable trend to stay the course, got ${maintainHealthCoach.recommendation}`);

const missingHealthData = runScenario(`
  ${resetAndHelpers}
  state.metrics = [
    { id: "m1", date: dateDaysAgo(0), bodyWeight: 180, calories: 0, protein: 0 }
  ];
  var coach = healthCoachSummary();
  ({ tone: coach.tone, recommendation: coach.recommendation });
`);

assert.strictEqual(missingHealthData.tone, "warn", `Expected missing health data to warn, got ${missingHealthData.tone}`);
assert(missingHealthData.recommendation.includes("Log calories"), `Expected missing calories guidance, got ${missingHealthData.recommendation}`);

const lowProteinPriority = runScenario(`
  ${resetAndHelpers}
  state.metrics = [
    { id: "m1", date: dateDaysAgo(13), bodyWeight: 180, calories: 2600, protein: 90 },
    { id: "m2", date: dateDaysAgo(6), bodyWeight: 180.2, calories: 2600, protein: 90 },
    { id: "m3", date: dateDaysAgo(0), bodyWeight: 180.4, calories: 2600, protein: 90 }
  ];
  var coach = healthCoachSummary();
  ({ tone: coach.tone, recommendation: coach.recommendation });
`);

assert.strictEqual(lowProteinPriority.tone, "hot", `Expected low protein to be top health warning, got ${lowProteinPriority.tone}`);
assert(lowProteinPriority.recommendation.includes("Protein is below"), `Expected low protein recommendation, got ${lowProteinPriority.recommendation}`);

const nutritionGoalExport = runScenario(`
  ${resetAndHelpers}
  state.settings.nutritionGoal = "cut";
  exportSafeSettings().nutritionGoal;
`);

assert.strictEqual(nutritionGoalExport, "cut", `Expected backup-safe settings to include nutrition goal, got ${nutritionGoalExport}`);

const maintenanceProfileCalculations = runScenario(`
  ${resetAndHelpers}
  state.settings.maintenanceProfile = {
    sex: "male",
    birthYear: 1990,
    heightFeet: 5,
    heightInches: 10,
    activityLevel: "moderate"
  };
  state.metrics = [
    { id: "m1", date: dateDaysAgo(6), bodyWeight: 178, calories: 2600, protein: 170 },
    { id: "m2", date: dateDaysAgo(5), bodyWeight: 179, calories: 2600, protein: 170 },
    { id: "m3", date: dateDaysAgo(4), bodyWeight: 180, calories: 2600, protein: 170 },
    { id: "m4", date: dateDaysAgo(3), bodyWeight: 181, calories: 2600, protein: 170 },
    { id: "m5", date: dateDaysAgo(2), bodyWeight: 182, calories: 2600, protein: 170 },
    { id: "m6", date: dateDaysAgo(1), bodyWeight: 183, calories: 2600, protein: 170 },
    { id: "m7", date: dateDaysAgo(0), bodyWeight: 184, calories: 2600, protein: 170 }
  ];
  var male = maintenanceEstimate();
  state.settings.maintenanceProfile.sex = "female";
  var female = maintenanceEstimate();
  ({
    maleBmr: Math.round(male.bmr),
    maleMaintenance: Math.round(male.maintenanceCalories),
    femaleBmr: Math.round(female.bmr),
    femaleMaintenance: Math.round(female.maintenanceCalories),
    weightUsed: male.weightLb,
    weightSource: male.weightSource,
    summary: maintenanceProfileSummary(male),
    confidence: male.confidence
  });
`);

assert.strictEqual(maintenanceProfileCalculations.maleBmr, 1757, `Expected male Mifflin-St Jeor BMR near 1757, got ${maintenanceProfileCalculations.maleBmr}`);
assert.strictEqual(maintenanceProfileCalculations.maleMaintenance, 2724, `Expected moderate male maintenance near 2724, got ${maintenanceProfileCalculations.maleMaintenance}`);
assert.strictEqual(maintenanceProfileCalculations.femaleBmr, 1591, `Expected female Mifflin-St Jeor BMR near 1591, got ${maintenanceProfileCalculations.femaleBmr}`);
assert.strictEqual(maintenanceProfileCalculations.femaleMaintenance, 2466, `Expected moderate female maintenance near 2466, got ${maintenanceProfileCalculations.femaleMaintenance}`);
assert.strictEqual(maintenanceProfileCalculations.weightUsed, 181, `Expected 7-day average weight to be used, got ${maintenanceProfileCalculations.weightUsed}`);
assert.strictEqual(maintenanceProfileCalculations.weightSource, "7d avg body weight", `Expected maintenance to prefer 7d average weight, got ${maintenanceProfileCalculations.weightSource}`);
assert(maintenanceProfileCalculations.summary.includes("Male, 36") && maintenanceProfileCalculations.summary.includes("5'10\"") && maintenanceProfileCalculations.summary.includes("Moderate"), `Expected readable profile summary, got ${maintenanceProfileCalculations.summary}`);
assert.strictEqual(maintenanceProfileCalculations.confidence, "High", `Expected complete recent profile to be high confidence, got ${maintenanceProfileCalculations.confidence}`);

const maintenanceMissingGuidance = runScenario(`
  ${resetAndHelpers}
  state.metrics = [{ id: "m1", date: dateDaysAgo(0), bodyWeight: 180, calories: 2500, protein: 180 }];
  var estimate = maintenanceEstimate();
  ({
    complete: estimate.complete,
    confidence: estimate.confidence,
    missing: estimate.missing,
    recommendation: healthCoachSummary().recommendation
  });
`);

assert.strictEqual(maintenanceMissingGuidance.complete, false, "Expected incomplete maintenance profile to be unavailable.");
assert.strictEqual(maintenanceMissingGuidance.confidence, "Low", `Expected incomplete maintenance profile to be low confidence, got ${maintenanceMissingGuidance.confidence}`);
assert(maintenanceMissingGuidance.missing.includes("sex") && maintenanceMissingGuidance.missing.includes("activity level"), `Expected missing profile fields, got ${maintenanceMissingGuidance.missing.join(", ")}`);
assert(maintenanceMissingGuidance.recommendation.includes("Log body weight consistently"), `Expected existing data-needed guidance to remain, got ${maintenanceMissingGuidance.recommendation}`);

const maintenanceAwareHealthCoach = runScenario(`
  ${resetAndHelpers}
  state.settings.nutritionGoal = "cut";
  state.settings.maintenanceProfile = {
    sex: "male",
    birthYear: 1990,
    heightFeet: 5,
    heightInches: 10,
    activityLevel: "moderate"
  };
  state.metrics = [
    { id: "m1", date: dateDaysAgo(13), bodyWeight: 180, calories: 3000, protein: 180 },
    { id: "m2", date: dateDaysAgo(6), bodyWeight: 180.1, calories: 3000, protein: 180 },
    { id: "m3", date: dateDaysAgo(5), bodyWeight: 180.1, calories: 3000, protein: 180 },
    { id: "m4", date: dateDaysAgo(4), bodyWeight: 180.1, calories: 3000, protein: 180 },
    { id: "m5", date: dateDaysAgo(3), bodyWeight: 180.2, calories: 3000, protein: 180 },
    { id: "m6", date: dateDaysAgo(2), bodyWeight: 180.2, calories: 3000, protein: 180 },
    { id: "m7", date: dateDaysAgo(1), bodyWeight: 180.2, calories: 3000, protein: 180 },
    { id: "m8", date: dateDaysAgo(0), bodyWeight: 180.2, calories: 3000, protein: 180 }
  ];
  var coach = healthCoachSummary();
  ({
    maintenance: Math.round(coach.maintenance.maintenanceCalories),
    recommendation: coach.recommendation,
    stats: healthCoachStatMarkup(coach)
  });
`);

assert(maintenanceAwareHealthCoach.maintenance > 0, "Expected health coach summary to include estimated maintenance.");
assert(maintenanceAwareHealthCoach.recommendation.includes("estimated maintenance"), `Expected health recommendation to compare calories against maintenance, got ${maintenanceAwareHealthCoach.recommendation}`);
assert(maintenanceAwareHealthCoach.recommendation.includes("-150-250 cal/day"), `Expected cut guidance above maintenance to suggest a small decrease, got ${maintenanceAwareHealthCoach.recommendation}`);
assert(maintenanceAwareHealthCoach.stats.includes("Maintenance") && maintenanceAwareHealthCoach.stats.includes("confidence"), "Expected Today/Coach health stats to show maintenance and confidence.");

const maintenanceProfileExport = runScenario(`
  ${resetAndHelpers}
  state.settings.maintenanceProfile = {
    sex: "male",
    birthYear: 1990,
    heightFeet: 5,
    heightInches: 10,
    activityLevel: "moderate",
    lastReviewedAt: "2026-06-17T12:00:00.000Z"
  };
  exportSafeSettings().maintenanceProfile;
`);

assert.strictEqual(maintenanceProfileExport.activityLevel, "moderate", "Expected backup-safe settings to include maintenance profile.");

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
  ({
    missing: plan.sessionPlan.missing.map((muscle) => muscle.label),
    explanation: plan.explanation.missing.join(" ")
  });
`);

assert(missingCoverage.missing.includes("Back"), `Expected missing coverage to include Back, got ${missingCoverage.missing.join(", ")}`);
assert(missingCoverage.explanation.includes("Back"), "Expected Coach reasoning data to preserve missing Back coverage.");

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
assert(targetedMuscles.why.includes("Biceps (Medium)") && targetedMuscles.why.includes("weekly floor"), `Expected conversational target priority explanation, got ${targetedMuscles.why}`);

const targetsPrioritizeBeforeGeneralFill = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["biceps"];
  state.coachGrowthModes = { biceps: "soft" };
  state.coachGlobalGrowthMode = "medium";
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "biceps" ? 12 : 10));
  var plan = buildTodayPlan(60);
  var muscles = plan.sessionPlan.items.map((item) => item.muscle.id);
  var bicepsIndex = muscles.indexOf("biceps");
  var firstNonTargetIndex = muscles.findIndex((id) => id !== "biceps");
  ({
    muscles,
    bicepsIndex,
    firstNonTargetIndex,
    bicepsSets: plan.sessionPlan.items.find((item) => item.muscle.id === "biceps")?.sets || 0,
    why: plan.why.join(" ")
  });
`);

assert(targetsPrioritizeBeforeGeneralFill.bicepsIndex >= 0, `Expected selected Biceps target in plan, got ${targetsPrioritizeBeforeGeneralFill.muscles.join(", ")}`);
assert(targetsPrioritizeBeforeGeneralFill.firstNonTargetIndex < 0 || targetsPrioritizeBeforeGeneralFill.bicepsIndex < targetsPrioritizeBeforeGeneralFill.firstNonTargetIndex, `Expected selected target before non-target optional fill, got ${targetsPrioritizeBeforeGeneralFill.muscles.join(", ")}`);
assert(targetsPrioritizeBeforeGeneralFill.bicepsSets > 0, "Expected Soft target to receive conservative work before non-target optional work.");
assert(targetsPrioritizeBeforeGeneralFill.why.includes("Biceps (Soft)") && targetsPrioritizeBeforeGeneralFill.why.includes("floor"), `Expected conversational Soft target wording, got ${targetsPrioritizeBeforeGeneralFill.why}`);

const targetTouchesSatisfiedStillAddsVolume = runScenario(`
  ${resetAndHelpers}
  var OriginalDate = Date;
  Date = class ScenarioDate extends OriginalDate {
    constructor(...args) {
      return args.length ? new OriginalDate(...args) : new OriginalDate("2026-06-19T12:00:00");
    }
    static now() { return new OriginalDate("2026-06-19T12:00:00").getTime(); }
    static parse(value) { return OriginalDate.parse(value); }
    static UTC(...args) { return OriginalDate.UTC(...args); }
  };
  var biceps = muscleGroups.find((muscle) => muscle.id === "biceps");
  state.coachTargetMuscles = ["biceps"];
  state.coachGlobalGrowthMode = "medium";
  state.workouts = [
    makeWorkout(biceps, 2, 5, { id: "biceps-a" }),
    makeWorkout(biceps, 4, 5, { id: "biceps-b" }),
    ...muscleGroups.filter((muscle) => muscle.id !== "biceps").map((muscle) => makeWorkout(muscle, 2, 10))
  ];
  var plan = buildTodayPlan(60);
  var bicepsItem = plan.sessionPlan.items.find((item) => item.muscle.id === "biceps");
  Date = OriginalDate;
  ({
    muscles: plan.sessionPlan.items.map((item) => item.muscle.id),
    bicepsSets: bicepsItem?.sets || 0,
    bicepsSessions: bicepsItem?.muscle.sessions || 0,
    reason: bicepsItem?.reason || "",
    limitations: plan.sessionPlan.targetLimitations.map((item) => item.reason).join(" ")
  });
`);

assert(targetTouchesSatisfiedStillAddsVolume.muscles.includes("biceps"), `Expected selected Biceps with 2/2 touches to receive volume, got ${targetTouchesSatisfiedStillAddsVolume.muscles.join(", ")}`);
assert(targetTouchesSatisfiedStillAddsVolume.bicepsSets > 0, `Expected selected Biceps to receive sets despite satisfied touches, got ${targetTouchesSatisfiedStillAddsVolume.bicepsSets}`);
assert.strictEqual(targetTouchesSatisfiedStillAddsVolume.bicepsSessions, 2, `Expected Biceps touches to be satisfied, got ${targetTouchesSatisfiedStillAddsVolume.bicepsSessions}`);
assert(targetTouchesSatisfiedStillAddsVolume.reason.includes("Touches satisfied"), `Expected target reason to explain satisfied touches as informational, got ${targetTouchesSatisfiedStillAddsVolume.reason}`);
assert(!targetTouchesSatisfiedStillAddsVolume.limitations.includes("touch"), `Expected touches not to limit selected target, got ${targetTouchesSatisfiedStillAddsVolume.limitations}`);

const targetSelectionRecoveryWarning = runScenario(`
  ${resetAndHelpers}
  var triceps = muscleGroups.find((muscle) => muscle.id === "triceps");
  state.workouts = [makeWorkout(triceps, 1, 3)];
  var directWarning = coachTargetSelectionWarning("triceps");
  state.workouts = [makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 1, 3, { secondaryMuscles: ["triceps"] })];
  var secondaryWarning = coachTargetSelectionWarning("triceps");
  state.workouts = [makeWorkout(triceps, 2, 3)];
  var readyWarning = coachTargetSelectionWarning("triceps");
  ({
    directWarning,
    secondaryWarning,
    readyWarning
  });
`);

assert(/champ|boss|enthusiasm/.test(targetSelectionRecoveryWarning.directWarning), `Expected direct target warning to use high-personality Coach voice, got ${targetSelectionRecoveryWarning.directWarning}`);
assert(targetSelectionRecoveryWarning.directWarning.includes("Triceps") && targetSelectionRecoveryWarning.directWarning.includes("yesterday"), `Expected warning to identify recent direct work, got ${targetSelectionRecoveryWarning.directWarning}`);
assert(targetSelectionRecoveryWarning.directWarning.includes("2-day"), `Expected firm recovery wording, got ${targetSelectionRecoveryWarning.directWarning}`);
assert.strictEqual(targetSelectionRecoveryWarning.secondaryWarning, "", `Expected secondary-only work not to warn, got ${targetSelectionRecoveryWarning.secondaryWarning}`);
assert.strictEqual(targetSelectionRecoveryWarning.readyWarning, "", `Expected ready target not to warn, got ${targetSelectionRecoveryWarning.readyWarning}`);

const conversationalCoachBriefing = runScenario(`
  ${resetAndHelpers}
  var chest = muscleGroups.find((muscle) => muscle.id === "chest");
  state.workouts = [makeWorkout(chest, 1, 3)];
  var plan = buildTodayPlan(60);
  var todayAction = actionFromSessionPlan(plan);
  ({
    briefing: plan.briefing || [],
    todayBody: todayAction.body,
    skipped: plan.explanation.skipped.join(" "),
    recoverySummary: plan.explanation.recoverySummary || ""
  });
`);

assert(conversationalCoachBriefing.briefing.length > 0, "Expected Coach to provide a short briefing summary.");
assert(conversationalCoachBriefing.briefing[0].includes("Here's the play"), `Expected briefing to speak directly, got ${conversationalCoachBriefing.briefing.join(" ")}`);
assert(conversationalCoachBriefing.recoverySummary.includes("Chest") && conversationalCoachBriefing.recoverySummary.includes("2-day"), `Expected one aggregated recovery summary, got ${conversationalCoachBriefing.recoverySummary}`);
assert(!/champ|boss/.test(conversationalCoachBriefing.skipped), `Expected routine skipped reasons not to spam nicknames, got ${conversationalCoachBriefing.skipped}`);
assert(conversationalCoachBriefing.todayBody.includes("Here's the play"), `Expected Today action to reuse Coach briefing, got ${conversationalCoachBriefing.todayBody}`);

const coachVoiceVarietyAndAggregation = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.slice(0, 7).map((muscle) => makeWorkout(muscle, 1, 3));
  var plan = buildTodayPlan(60);
  var firstPhrase = coachPhrase("test", "stable-key", ["one", "two", "three"]);
  var secondPhrase = coachPhrase("test", "stable-key", ["one", "two", "three"]);
  var allCopy = [...plan.why, ...plan.explanation.skipped, ...(plan.briefing || [])].join(" ");
  ({
    stable: firstPhrase === secondPhrase,
    recoverySummary: plan.explanation.recoverySummary,
    recoverySummaryCount: plan.why.filter((item) => item === plan.explanation.recoverySummary).length,
    nicknameCount: (allCopy.match(/champ|boss/gi) || []).length,
    detailedCount: plan.explanation.skipped.length
  });
`);

assert(coachVoiceVarietyAndAggregation.stable, "Expected deterministic Coach phrases to remain stable during rerenders.");
assert.strictEqual(coachVoiceVarietyAndAggregation.recoverySummaryCount, 1, "Expected one aggregated recovery message in Why this?.");
assert(coachVoiceVarietyAndAggregation.detailedCount >= 5, "Expected exact per-muscle recovery details to remain available.");
assert.strictEqual(coachVoiceVarietyAndAggregation.nicknameCount, 0, "Expected routine plan rendering not to repeat nicknames.");

const targetSelectionBlocksRecoveryConflict = runScenario(`
  ${resetAndHelpers}
  var originalToast = toast;
  var toastMessage = "";
  toast = (message) => { toastMessage = message; };
  var triceps = muscleGroups.find((muscle) => muscle.id === "triceps");
  state.workouts = [makeWorkout(triceps, 1, 3)];
  state.coachTargetMuscles = [];
  var targetEl = {
    dataset: { muscleId: "triceps" },
    closest: () => ({ scrollLeft: 0 })
  };
  Promise.resolve(handleAction("coach-target-muscle", targetEl)).then(() => {});
  toast = originalToast;
  ({
    selected: selectedCoachTargetMuscles(),
    toastMessage
  });
`);

assert(!targetSelectionBlocksRecoveryConflict.selected.includes("triceps"), `Expected recovery-conflicting Triceps target to stay unselected, got ${targetSelectionBlocksRecoveryConflict.selected.join(", ")}`);
assert(targetSelectionBlocksRecoveryConflict.toastMessage.includes("2-day"), `Expected blocked selection toast, got ${targetSelectionBlocksRecoveryConflict.toastMessage}`);

const targetAboveGrowthZoneStillGetsReserve = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["hamstrings"];
  state.coachGlobalGrowthMode = "medium";
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "hamstrings" ? 21 : 10));
  var warning = coachTargetSelectionWarning("hamstrings");
  var plan = buildTodayPlan(60);
  var hamstrings = plan.sessionPlan.items.find((item) => item.muscle.id === "hamstrings");
  ({
    warning,
    muscles: plan.sessionPlan.items.map((item) => item.muscle.id),
    phase: hamstrings?.phase || "",
    sets: hamstrings?.sets || 0,
    projectedSets: hamstrings ? hamstrings.muscle.sets + hamstrings.sets : 0,
    reason: hamstrings?.reason || "",
    why: plan.why.join(" ")
  });
`);

assert.strictEqual(targetAboveGrowthZoneStillGetsReserve.warning, "", `Expected high-volume but recovered target selection to be allowed, got ${targetAboveGrowthZoneStillGetsReserve.warning}`);
assert(targetAboveGrowthZoneStillGetsReserve.muscles.includes("hamstrings"), `Expected selected Hamstrings above 20 to receive target reserve work, got ${targetAboveGrowthZoneStillGetsReserve.muscles.join(", ")}`);
assert.strictEqual(targetAboveGrowthZoneStillGetsReserve.phase, "target-extra", `Expected Hamstrings to be target-extra, got ${targetAboveGrowthZoneStillGetsReserve.phase}`);
assert(targetAboveGrowthZoneStillGetsReserve.sets > 0, `Expected target reserve sets for Hamstrings, got ${targetAboveGrowthZoneStillGetsReserve.sets}`);
assert(targetAboveGrowthZoneStillGetsReserve.projectedSets > 20, `Expected selected target to be allowed above 20, got ${targetAboveGrowthZoneStillGetsReserve.projectedSets}`);
assert(targetAboveGrowthZoneStillGetsReserve.reason.includes("adding focused work"), `Expected conversational target-extra reason, got ${targetAboveGrowthZoneStillGetsReserve.reason}`);
assert(!targetAboveGrowthZoneStillGetsReserve.why.includes("already at its Medium target"), `Expected Why this? not to deny above-20 target by mode cap, got ${targetAboveGrowthZoneStillGetsReserve.why}`);

const globalGrowthModeSelector = runScenario(`
  ${resetAndHelpers}
  state.coachGlobalGrowthMode = "";
  var markup = renderCoachGrowthModeSelector();
  ({
    selected: selectedCoachGlobalGrowthMode(),
    hasSelector: markup.includes('data-action="coach-global-growth-mode"'),
    mediumActive: markup.includes('growth-mode-chip is-active') && markup.includes('Medium'),
    hasLabel: markup.includes("Plan intensity")
  });
`);

assert.strictEqual(globalGrowthModeSelector.selected, "medium", `Expected global growth mode to default to medium, got ${globalGrowthModeSelector.selected}`);
assert(globalGrowthModeSelector.hasSelector, "Expected Coach to render a global plan intensity selector.");
assert(globalGrowthModeSelector.mediumActive, "Expected global plan intensity selector to show Medium as active by default.");
assert(globalGrowthModeSelector.hasLabel, "Expected global plan intensity selector to be labeled Plan intensity.");

const globalGrowthModesChangeSets = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "supinated-curls", name: "Supinated Curls", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true },
    ...muscleGroups.filter((muscle) => muscle.id !== "biceps").map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-12",
      rest: "90-180 sec",
      cue: "Test exercise for " + muscle.label,
      userCreated: true
    }))
  ];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "biceps" ? 10 : 20, muscle.id === "biceps" ? { exercise: "Supinated Curls", exerciseId: "supinated-curls", primaryMuscles: ["biceps"], restSeconds: 90 } : {}));
  state.coachGlobalGrowthMode = "soft";
  var soft = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  state.coachGlobalGrowthMode = "medium";
  var medium = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  state.coachGlobalGrowthMode = "aggressive";
  var aggressive = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  ({
    softSets: soft?.sets || 0,
    mediumSets: medium?.sets || 0,
    aggressiveSets: aggressive?.sets || 0,
    aggressiveMode: aggressive?.growthMode,
    why: buildTodayPlan(60).why.join(" ")
  });
`);

assert(globalGrowthModesChangeSets.softSets < globalGrowthModesChangeSets.mediumSets, `Expected Medium to prescribe more Biceps sets than Soft, got soft=${globalGrowthModesChangeSets.softSets}, medium=${globalGrowthModesChangeSets.mediumSets}`);
assert(globalGrowthModesChangeSets.mediumSets <= globalGrowthModesChangeSets.aggressiveSets, `Expected Aggressive to prescribe at least Medium Biceps sets, got medium=${globalGrowthModesChangeSets.mediumSets}, aggressive=${globalGrowthModesChangeSets.aggressiveSets}`);
assert.strictEqual(globalGrowthModesChangeSets.aggressiveMode, "aggressive", `Expected inherited aggressive global mode, got ${globalGrowthModesChangeSets.aggressiveMode}`);
assert(globalGrowthModesChangeSets.why.includes("Aggressive plan intensity"), `Expected Why this? to include global plan intensity, got ${globalGrowthModesChangeSets.why}`);

const belowFloorModeDifferentiation = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "supinated-curls", name: "Supinated Curls", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60-120 sec", cue: "Curl.", userCreated: true },
    ...muscleGroups.filter((muscle) => muscle.id !== "biceps").map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-12",
      rest: "90-180 sec",
      cue: "Test exercise for " + muscle.label,
      userCreated: true
    }))
  ];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "biceps" ? 8 : 20, muscle.id === "biceps" ? { exercise: "Supinated Curls", exerciseId: "supinated-curls", primaryMuscles: ["biceps"], restSeconds: 90 } : {}));
  state.coachTargetMuscles = ["biceps"];
  state.coachGlobalGrowthMode = "soft";
  var soft = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  state.coachGlobalGrowthMode = "medium";
  var medium = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  state.coachGlobalGrowthMode = "aggressive";
  var aggressive = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "biceps");
  ({
    softSets: soft?.sets || 0,
    mediumSets: medium?.sets || 0,
    aggressiveSets: aggressive?.sets || 0,
    softProjected: soft ? soft.muscle.sets + soft.sets : 0,
    mediumProjected: medium ? medium.muscle.sets + medium.sets : 0,
    aggressiveProjected: aggressive ? aggressive.muscle.sets + aggressive.sets : 0
  });
`);

assert.strictEqual(belowFloorModeDifferentiation.softProjected, 10, `Expected Soft Biceps to clear the floor only, got projected ${belowFloorModeDifferentiation.softProjected}`);
assert(belowFloorModeDifferentiation.mediumSets > belowFloorModeDifferentiation.softSets, `Expected Medium Biceps to exceed Soft below-floor sets, got soft=${belowFloorModeDifferentiation.softSets}, medium=${belowFloorModeDifferentiation.mediumSets}`);
assert(belowFloorModeDifferentiation.aggressiveSets >= belowFloorModeDifferentiation.mediumSets, `Expected Aggressive Biceps to match or exceed Medium below-floor sets, got medium=${belowFloorModeDifferentiation.mediumSets}, aggressive=${belowFloorModeDifferentiation.aggressiveSets}`);

const modeAwarePerExerciseCaps = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "calve-raises", name: "Calve Raises", primaryMuscles: ["calves"], secondaryMuscles: [], equipment: "machine", reps: "8-15", rest: "60-120 sec", cue: "Raise.", userCreated: true },
    ...muscleGroups.filter((muscle) => muscle.id !== "calves").map((muscle) => ({
      id: "custom-" + muscle.id,
      name: muscle.label + " Exercise",
      primaryMuscles: [muscle.id],
      secondaryMuscles: [],
      equipment: "dumbbells",
      reps: "8-12",
      rest: "90-180 sec",
      cue: "Test exercise for " + muscle.label,
      userCreated: true
    }))
  ];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "calves" ? 10 : 20, muscle.id === "calves" ? { exercise: "Calve Raises", exerciseId: "calve-raises", primaryMuscles: ["calves"], restSeconds: 90 } : {}));
  state.coachTargetMuscles = ["calves"];
  state.coachGlobalGrowthMode = "soft";
  var soft = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "calves");
  state.coachGlobalGrowthMode = "medium";
  var medium = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "calves");
  state.coachGlobalGrowthMode = "aggressive";
  var aggressive = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "calves");
  ({
    softSets: soft?.sets || 0,
    mediumSets: medium?.sets || 0,
    aggressiveSets: aggressive?.sets || 0
  });
`);

assert(modeAwarePerExerciseCaps.softSets < modeAwarePerExerciseCaps.mediumSets, `Expected Medium Calves to exceed Soft, got soft=${modeAwarePerExerciseCaps.softSets}, medium=${modeAwarePerExerciseCaps.mediumSets}`);
assert(modeAwarePerExerciseCaps.aggressiveSets > modeAwarePerExerciseCaps.mediumSets, `Expected Aggressive Calves to exceed the old 8-set Medium cap, got medium=${modeAwarePerExerciseCaps.mediumSets}, aggressive=${modeAwarePerExerciseCaps.aggressiveSets}`);

const manyFloorGapsKeepModesDistinct = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = muscleGroups.map((muscle) => ({
    id: "custom-" + muscle.id,
    name: muscle.label + " Exercise",
    primaryMuscles: [muscle.id],
    secondaryMuscles: [],
    equipment: "dumbbells",
    reps: "8-12",
    rest: muscle.id === "calves" ? "120 sec" : "90 sec",
    cue: "Test exercise for " + muscle.label,
    userCreated: true
  }));
  state.workouts = muscleGroups.map((muscle) => makeWorkout(
    muscle,
    2,
    ["chest", "back", "quads", "abs", "biceps", "calves", "shoulders"].includes(muscle.id) ? 4 : 10,
    { restSeconds: muscle.id === "calves" ? 120 : 90 }
  ));
  state.coachTargetMuscles = [];
  state.coachGrowthModes = {};
  var plans = {};
  for (var mode of ["soft", "medium", "aggressive"]) {
    state.coachGlobalGrowthMode = mode;
    var plan = buildTodayPlan(60).sessionPlan;
    plans[mode] = {
      totalSets: plan.items.reduce((sum, item) => sum + item.sets, 0),
      totalMinutes: plan.totalMinutes,
      allocation: plan.items.map((item) => item.muscle.id + ":" + item.sets).join(",")
    };
  }
  plans;
`);

assert(manyFloorGapsKeepModesDistinct.soft.totalSets < manyFloorGapsKeepModesDistinct.medium.totalSets, `Expected Soft to stay conservative when many muscles are below floor, got soft=${JSON.stringify(manyFloorGapsKeepModesDistinct.soft)} medium=${JSON.stringify(manyFloorGapsKeepModesDistinct.medium)}`);
assert(manyFloorGapsKeepModesDistinct.medium.totalMinutes <= 63 && manyFloorGapsKeepModesDistinct.aggressive.totalMinutes <= 63, `Expected Medium/Aggressive to stay inside hard cap, got ${JSON.stringify(manyFloorGapsKeepModesDistinct)}`);
assert.notStrictEqual(manyFloorGapsKeepModesDistinct.medium.allocation, manyFloorGapsKeepModesDistinct.aggressive.allocation, `Expected Aggressive allocation to remain visibly different from Medium when time-capped, got ${manyFloorGapsKeepModesDistinct.medium.allocation}`);

const realisticModeComparisonExplainsAggressiveLimits = runScenario(`
  ${resetAndHelpers}
  state.workouts = [
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 2, 10, { restSeconds: 120 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "back"), 2, 12, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "quads"), 2, 10, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "abs"), 2, 15, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "triceps"), 2, 13, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "shoulders"), 1, 18, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "glutes"), 1, 18, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "calves"), 1, 18, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "biceps"), 1, 19, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "hamstrings"), 1, 20, { restSeconds: 90 })
  ];
  var comparison = coachDebugModeComparison();
  var mediumByMuscle = Object.fromEntries(comparison.medium.items.map((item) => [item.muscleId, item.sets]));
  var lowerAggressiveItems = comparison.aggressive.items
    .filter((item) => mediumByMuscle[item.muscleId] && item.sets < mediumByMuscle[item.muscleId])
    .map((item) => item.muscle + ":" + item.sets + "<" + mediumByMuscle[item.muscleId]);
  ({
    mediumSets: comparison.medium.totalSets,
    aggressiveSets: comparison.aggressive.totalSets,
    aggressiveReason: comparison.aggressive.limitingReason || "",
    lowerAggressiveItems,
    aggressiveItems: comparison.aggressive.items.map((item) => item.muscle + ":" + item.sets).join(", ")
  });
`);

assert(
  realisticModeComparisonExplainsAggressiveLimits.aggressiveSets >= realisticModeComparisonExplainsAggressiveLimits.mediumSets
    || realisticModeComparisonExplainsAggressiveLimits.aggressiveReason.includes("Aggressive held"),
  `Expected Aggressive to beat Medium or explain the guardrail, got medium=${realisticModeComparisonExplainsAggressiveLimits.mediumSets}, aggressive=${realisticModeComparisonExplainsAggressiveLimits.aggressiveSets}, reason=${realisticModeComparisonExplainsAggressiveLimits.aggressiveReason}, items=${realisticModeComparisonExplainsAggressiveLimits.aggressiveItems}`
);
assert(
  realisticModeComparisonExplainsAggressiveLimits.lowerAggressiveItems.length === 0
    || realisticModeComparisonExplainsAggressiveLimits.aggressiveReason.includes("Aggressive held"),
  `Expected Aggressive not to quietly reduce planned muscles below Medium, got ${realisticModeComparisonExplainsAggressiveLimits.lowerAggressiveItems.join(", ")} with reason=${realisticModeComparisonExplainsAggressiveLimits.aggressiveReason}`
);

const targetSelectorReset = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["biceps", "triceps"];
  state.coachGrowthModes = { biceps: "aggressive", triceps: "medium" };
  var markup = renderCoachTargetSelector();
  ({
    hasReset: markup.includes('data-action="clear-coach-targets"'),
    hasCount: markup.includes("2 selected"),
    hasModeControls: markup.includes('data-action="coach-growth-mode"'),
    hasAggressive: markup.includes("Aggressive")
  });
`);

assert(targetSelectorReset.hasReset, "Expected target selector to expose a reset choices control when muscles are selected.");
assert(targetSelectorReset.hasCount, "Expected target selector to keep selected count visible.");
assert(targetSelectorReset.hasModeControls, "Expected selected target muscles to expose per-muscle growth mode controls.");
assert(targetSelectorReset.hasAggressive, "Expected per-muscle growth mode controls to include Aggressive mode.");

const perMuscleGrowthModes = runScenario(`
  ${resetAndHelpers}
  state.coachGlobalGrowthMode = "aggressive";
  state.coachTargetMuscles = ["chest", "quads"];
  state.coachGrowthModes = { chest: "aggressive", quads: "soft" };
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "quads" ? 11 : muscle.id === "chest" ? 18 : 20));
  var plan = buildTodayPlan(60);
  var chest = plan.sessionPlan.items.find((item) => item.muscle.id === "chest");
  var quads = plan.sessionPlan.items.find((item) => item.muscle.id === "quads");
  ({
    chestMode: chest?.growthMode,
    quadsMode: quads?.growthMode,
    chestProjected: chest ? chest.muscle.sets + chest.sets : 0,
    quadsProjected: quads ? quads.muscle.sets + quads.sets : 0,
    why: plan.why.join(" ")
  });
`);

assert.strictEqual(perMuscleGrowthModes.chestMode, "aggressive", `Expected Chest to use aggressive mode, got ${perMuscleGrowthModes.chestMode}`);
assert.strictEqual(perMuscleGrowthModes.quadsMode, "soft", `Expected Quads to use soft mode, got ${perMuscleGrowthModes.quadsMode}`);
assert(perMuscleGrowthModes.chestProjected > perMuscleGrowthModes.quadsProjected, `Expected aggressive Chest to receive more upper-zone volume than soft Quads, got chest=${perMuscleGrowthModes.chestProjected} quads=${perMuscleGrowthModes.quadsProjected}`);
assert(perMuscleGrowthModes.why.includes("Chest (Aggressive)") && perMuscleGrowthModes.why.includes("Quads (Soft)"), `Expected Why this? to include per-muscle modes, got ${perMuscleGrowthModes.why}`);

const targetModeContractsStayMonotonic = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["chest"];
  state.coachGlobalGrowthMode = "medium";
  state.workouts = [
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 2, 10, { restSeconds: 120 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "back"), 2, 12, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "quads"), 2, 10, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "abs"), 2, 15, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "triceps"), 2, 13, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "shoulders"), 1, 18, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "glutes"), 1, 18, { restSeconds: 90 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "calves"), 1, 18, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "biceps"), 1, 19, { restSeconds: 75 }),
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "hamstrings"), 1, 20, { restSeconds: 90 })
  ];
  state.coachGrowthModes = { chest: "soft" };
  var soft = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "chest");
  state.coachGrowthModes = { chest: "medium" };
  var medium = buildTodayPlan(60).sessionPlan.items.find((item) => item.muscle.id === "chest");
  state.coachGrowthModes = { chest: "aggressive" };
  var aggressivePlan = buildTodayPlan(60);
  var aggressive = aggressivePlan.sessionPlan.items.find((item) => item.muscle.id === "chest");
  ({
    softSets: soft?.sets || 0,
    mediumSets: medium?.sets || 0,
    aggressiveSets: aggressive?.sets || 0,
    aggressiveMode: aggressive?.growthMode,
    contractNotes: aggressivePlan.sessionPlan.contractNotes || [],
    why: aggressivePlan.why.join(" ")
  });
`);

assert(targetModeContractsStayMonotonic.mediumSets >= targetModeContractsStayMonotonic.softSets, `Expected targeted Medium Chest to keep or exceed Soft sets, got soft=${targetModeContractsStayMonotonic.softSets}, medium=${targetModeContractsStayMonotonic.mediumSets}`);
assert(targetModeContractsStayMonotonic.aggressiveSets >= targetModeContractsStayMonotonic.mediumSets, `Expected targeted Aggressive Chest to keep or exceed Medium sets, got medium=${targetModeContractsStayMonotonic.mediumSets}, aggressive=${targetModeContractsStayMonotonic.aggressiveSets}, notes=${targetModeContractsStayMonotonic.contractNotes.join(" ")}`);
assert.strictEqual(targetModeContractsStayMonotonic.aggressiveMode, "aggressive", `Expected Chest to keep the aggressive override, got ${targetModeContractsStayMonotonic.aggressiveMode}`);

const targetModeContractsSurviveDebugComparison = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["chest"];
  state.coachGlobalGrowthMode = "medium";
  state.coachGrowthModes = { chest: "aggressive" };
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "chest" ? 14 : 20));
  var comparison = coachDebugModeComparison();
  var chestModes = Object.fromEntries(Object.entries(comparison).map(([mode, plan]) => [
    mode,
    plan.items.find((item) => item.muscleId === "chest")?.growthMode || ""
  ]));
  ({
    selectedMode: state.coachGlobalGrowthMode,
    selectedOverride: state.coachGrowthModes.chest,
    chestModes
  });
`);

assert.deepEqual(targetModeContractsSurviveDebugComparison.chestModes, { soft: "aggressive", medium: "aggressive", aggressive: "aggressive" }, `Expected Coach debug mode comparison to preserve selected target overrides, got ${JSON.stringify(targetModeContractsSurviveDebugComparison.chestModes)}`);
assert.strictEqual(targetModeContractsSurviveDebugComparison.selectedMode, "medium", `Expected debug mode comparison not to mutate global mode, got ${targetModeContractsSurviveDebugComparison.selectedMode}`);
assert.strictEqual(targetModeContractsSurviveDebugComparison.selectedOverride, "aggressive", `Expected debug mode comparison not to clear target override, got ${targetModeContractsSurviveDebugComparison.selectedOverride}`);

const targetedModeAllocationStaysProtected = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["chest"];
  state.coachGrowthModes = { chest: "aggressive" };
  state.workouts = [];
  var targetSets = {};
  var totals = {};
  var allocations = {};
  for (var mode of ["soft", "medium", "aggressive"]) {
    state.coachGlobalGrowthMode = mode;
    var plan = buildTodayPlan(60).sessionPlan;
    targetSets[mode] = plan.items.find((item) => item.muscle.id === "chest")?.sets || 0;
    totals[mode] = plan.items.reduce((sum, item) => sum + item.sets, 0);
    allocations[mode] = plan.items.map((item) => item.muscle.id + ":" + item.sets).join(",");
  }
  ({ targetSets, totals, allocations });
`);

assert(
  targetedModeAllocationStaysProtected.targetSets.soft <= targetedModeAllocationStaysProtected.targetSets.medium
    && targetedModeAllocationStaysProtected.targetSets.medium <= targetedModeAllocationStaysProtected.targetSets.aggressive,
  `Expected selected Aggressive Chest not to lose sets as global intensity rises, got targets=${JSON.stringify(targetedModeAllocationStaysProtected.targetSets)} totals=${JSON.stringify(targetedModeAllocationStaysProtected.totals)} allocations=${JSON.stringify(targetedModeAllocationStaysProtected.allocations)}`
);
assert(
  targetedModeAllocationStaysProtected.totals.soft <= targetedModeAllocationStaysProtected.totals.medium
    && targetedModeAllocationStaysProtected.totals.medium <= targetedModeAllocationStaysProtected.totals.aggressive,
  `Expected mode totals to remain monotonic, got ${JSON.stringify(targetedModeAllocationStaysProtected.totals)}`
);

const rirAwareProgressionAndEffortClassification = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "row", name: "One-Armed Cable Row", primaryMuscles: ["back"], secondaryMuscles: [], equipment: "cable", reps: "8-15", rest: "60 sec", cue: "Row.", userCreated: true },
    { id: "raise", name: "Lateral Raises", primaryMuscles: ["shoulders"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Raise.", userCreated: true }
  ];
  state.workouts = [
    {
      id: "row-latest", date: "2026-06-16", exercise: "One-Armed Cable Row", exerciseId: "row", primaryMuscles: ["back"], secondaryMuscles: [],
      setRows: [
        { weight: 55, reps: 14, rir: 2, restSeconds: 60 },
        { weight: 55, reps: 10, rir: 2, restSeconds: 60 },
        { weight: 55, reps: 9, rir: 2, restSeconds: 60 },
        { weight: 50, reps: 11, rir: 2, restSeconds: 60 }
      ], createdAt: "2026-06-16T12:00:00.000Z"
    },
    {
      id: "row-previous", date: "2026-06-09", exercise: "One-Armed Cable Row", exerciseId: "row", primaryMuscles: ["back"], secondaryMuscles: [],
      setRows: [{ weight: 50, reps: 15, rir: 1, restSeconds: 60 }], createdAt: "2026-06-09T12:00:00.000Z"
    },
    {
      id: "raise-latest", date: "2026-06-15", exercise: "Lateral Raises", exerciseId: "raise", primaryMuscles: ["shoulders"], secondaryMuscles: [],
      setRows: [
        { weight: 25, reps: 13, rir: 0, restSeconds: 60 },
        { weight: 25, reps: 8, rir: 0, restSeconds: 60 },
        { weight: 20, reps: 9, rir: 0, restSeconds: 60 }
      ], createdAt: "2026-06-15T12:00:00.000Z"
    },
    {
      id: "raise-previous", date: "2026-06-08", exercise: "Lateral Raises", exerciseId: "raise", primaryMuscles: ["shoulders"], secondaryMuscles: [],
      setRows: [
        { weight: 25, reps: 14, rir: 1, restSeconds: 60 },
        { weight: 25, reps: 9, rir: 0, restSeconds: 60 },
        { weight: 20, reps: 9, rir: 0, restSeconds: 60 }
      ], createdAt: "2026-06-08T12:00:00.000Z"
    }
  ];
  var rowProgression = progressionTargetForExercise("One-Armed Cable Row");
  var raiseSignal = coachExercisePerformanceSignal(resolveExerciseMeta("Lateral Raises"));
  var raiseTarget = coachPlanTargetForExercise(resolveExerciseMeta("Lateral Raises"), raiseSignal);
  ({
    rowTarget: rowProgression?.target || "",
    rowIncreaseLoad: rowProgression?.increaseLoad || false,
    raiseStatus: raiseSignal.status,
    raiseTargetKind: raiseTarget.kind,
    raiseTargetLabel: raiseTarget.label
  });
`);

assert(rirAwareProgressionAndEffortClassification.rowIncreaseLoad, `Expected 55 x 14 @2 RIR to permit a load increase, got ${rirAwareProgressionAndEffortClassification.rowTarget}`);
assert(rirAwareProgressionAndEffortClassification.rowTarget.includes("60 lb"), `Expected Cable Row target to increase to 60 lb, got ${rirAwareProgressionAndEffortClassification.rowTarget}`);
assert(["minor-dip", "reached-failure"].includes(rirAwareProgressionAndEffortClassification.raiseStatus), `Expected Lateral Raises to avoid failure classification, got ${rirAwareProgressionAndEffortClassification.raiseStatus}`);
assert.notStrictEqual(rirAwareProgressionAndEffortClassification.raiseTargetKind, "reset", `Expected Lateral Raises to hold rather than reduce load, got ${rirAwareProgressionAndEffortClassification.raiseTargetLabel}`);

const targetScrollRestore = runScenario(`
  var originalQuerySelector = document.querySelector;
  var scroller = { scrollLeft: 0 };
  var usedAnimationFrame = false;
  document.querySelector = (selector) => selector === ".coach-target-options" ? scroller : null;
  requestAnimationFrame = (fn) => {
    usedAnimationFrame = true;
    fn();
  };
  restoreCoachTargetScroll(137);
  document.querySelector = originalQuerySelector;
  ({ scrollLeft: scroller.scrollLeft, usedAnimationFrame });
`);

assert.strictEqual(targetScrollRestore.scrollLeft, 137, `Expected target selector scroll to restore to 137, got ${targetScrollRestore.scrollLeft}`);
assert(targetScrollRestore.usedAnimationFrame, "Expected target selector scroll restore to run after render timing.");

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

const allFloorCoveredTimeframes = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  [30, 40, 50, 60, 75].map((minutes) => {
    var plan = buildTodayPlan(minutes).sessionPlan;
    return {
      minutes,
      total: plan.totalMinutes,
      itemCount: plan.items.length,
      setCount: plan.items.reduce((sum, item) => sum + item.sets, 0)
    };
  });
`);

for (const result of allFloorCoveredTimeframes) {
  assert(withinCoachTimeWindow(result.total, result.minutes), `Expected floor-covered ${result.minutes} min plan to land near target, got ${result.total}`);
  assert(result.itemCount > 0, `Expected floor-covered ${result.minutes} min plan to include useful work.`);
}

const nearOptimumTimeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 18));
  var plan = buildTodayPlan(60).sessionPlan;
  ({
    total: plan.totalMinutes,
    itemCount: plan.items.length,
    setCount: plan.items.reduce((sum, item) => sum + item.sets, 0),
    detail: plan.items.map((item) => item.muscle.label + ":" + item.sets).join(", ")
  });
`);

assert(nearOptimumTimeframe.total <= 63, `Expected 18/20 muscles to stay inside the 1 hour tolerance, got ${nearOptimumTimeframe.total}: ${nearOptimumTimeframe.detail}`);
assert(nearOptimumTimeframe.itemCount <= 6, `Expected 18/20 1 hour plan to honor the hard six-exercise cap, got ${nearOptimumTimeframe.itemCount}`);

const highVolumeTimeframe = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["chest"];
  state.coachGrowthModes = { chest: "aggressive" };
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 20));
  var plan = buildTodayPlan(60);
  ({
    mode: plan.mode,
    total: plan.sessionPlan.totalMinutes,
    hasHighVolumeReason: plan.why.join(" ").includes("above the default growth zone"),
    chestProjectedSets: plan.sessionPlan.items.find((item) => item.muscle.id === "chest")?.muscle.sets + plan.sessionPlan.items.find((item) => item.muscle.id === "chest")?.sets,
    maxProjectedSets: Math.max(...plan.sessionPlan.items.map((item) => item.muscle.sets + item.sets)),
    shortfallReason: plan.sessionPlan.shortfallReason
  });
`);

assert.strictEqual(highVolumeTimeframe.mode, "session", `Expected aggressive selected upper-zone muscle to build a high-volume session, got ${highVolumeTimeframe.mode}`);
assert(highVolumeTimeframe.total < 57, `Expected selected high-volume plan to stop short instead of forcing universal high volume, got ${highVolumeTimeframe.total}`);
assert(highVolumeTimeframe.hasHighVolumeReason || highVolumeTimeframe.chestProjectedSets > 20, "Expected selected aggressive plan to explain or apply slight upper-zone fill in Why this?");
assert(highVolumeTimeframe.chestProjectedSets > 20, `Expected aggressive Chest to receive slight high-volume fill, got ${highVolumeTimeframe.chestProjectedSets}`);
assert(highVolumeTimeframe.maxProjectedSets <= 22, `Expected high-volume filler to cap projected sets at 22, got ${highVolumeTimeframe.maxProjectedSets}`);
assert(highVolumeTimeframe.shortfallReason.includes("volume limits"), `Expected aggressive high-volume shortfall to explain volume limits, got ${highVolumeTimeframe.shortfallReason}`);

const noUniversalHighVolume = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 20));
  var plan = buildTodayPlan(60);
  ({
    mode: plan.mode,
    itemCount: plan.sessionPlan.items.length,
    why: plan.why.join(" ")
  });
`);

assert.notStrictEqual(noUniversalHighVolume.mode, "session", "Expected non-targeted muscles at upper growth zone not to force universal high-volume filler.");
assert.strictEqual(noUniversalHighVolume.itemCount, 0, `Expected no forced all-muscle high-volume plan, got ${noUniversalHighVolume.itemCount}`);

const restartTimeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = [];
  var plan = buildTodayPlan(60);
  ({
    mode: plan.mode,
    total: plan.sessionPlan.totalMinutes,
    itemCount: plan.sessionPlan.items.length,
    maxSets: Math.max(...plan.sessionPlan.items.map((item) => item.sets))
  });
`);

assert.strictEqual(restartTimeframe.mode, "restart", `Expected no-workout case to remain restart mode, got ${restartTimeframe.mode}`);
assert(restartTimeframe.total > 0 && restartTimeframe.total <= 63, `Expected restart timing to stay inside the selected limit after safety caps, got ${restartTimeframe.total}`);
assert(restartTimeframe.itemCount <= 6, `Expected restart 1 hour plan to honor the six-exercise cap, got ${restartTimeframe.itemCount}`);
assert(restartTimeframe.maxSets <= 3, `Expected restart plan to keep per-muscle volume controlled, got max ${restartTimeframe.maxSets}`);

const insufficientLibraryShortfall = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "custom-chest-only",
    name: "Chest Only Exercise",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    equipment: "dumbbells",
    reps: "8-12",
    rest: "90-180 sec",
    cue: "Single coverage test.",
    userCreated: true
  }];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var plan = buildTodayPlan(60);
  ({
    total: plan.sessionPlan.totalMinutes,
    itemCount: plan.sessionPlan.items.length,
    exerciseNames: plan.sessionPlan.items.map((item) => item.exercise.name),
    shortfallReason: plan.sessionPlan.shortfallReason || "",
    why: plan.why.join(" ")
  });
`);

assert(insufficientLibraryShortfall.total < 57, `Expected limited library plan to stay short rather than invent exercises, got ${insufficientLibraryShortfall.total}`);
assert(insufficientLibraryShortfall.exerciseNames.every((name) => name === "Chest Only Exercise"), `Expected limited library plan to use only the real library exercise, got ${insufficientLibraryShortfall.exerciseNames.join(", ")}`);
assert(insufficientLibraryShortfall.shortfallReason.includes("library-safe"), `Expected limited library shortfall reason, got ${insufficientLibraryShortfall.shortfallReason}`);
assert(insufficientLibraryShortfall.why.includes("library-safe"), `Expected Why this? to explain shortfall, got ${insufficientLibraryShortfall.why}`);

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
  row.rest = "180-300 sec";
  state.workouts = [makeWorkout({ id: "back", label: "Back" }, 2, 2, {
    exercise: row.name,
    exerciseId: row.id,
    primaryMuscles: row.primaryMuscles,
    secondaryMuscles: row.secondaryMuscles,
    restSeconds: 240
  })];
  ({ estimated: estimateExerciseMinutes(row, 2) });
`);

assert.strictEqual(personalRest.estimated, 6.5, `Expected valid in-range 240-second rest history to personalize the estimate to 6.5 raw minutes, got ${personalRest.estimated}`);

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
    fits: plan.sessionPlan.totalMinutes <= 63
  });
`);

assert(allUnderdeveloped.fits, `Expected all-underdeveloped plan to fit within time window, got ${allUnderdeveloped.total}`);
assert(allUnderdeveloped.total > 0, `Expected all-underdeveloped planning to produce a positive raw estimate, got ${allUnderdeveloped.total}`);
assert(allUnderdeveloped.itemCount >= 4, `Expected all-underdeveloped to cover at least 4 muscles, got ${allUnderdeveloped.itemCount}`);

const optimumPlanAction = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var plan = buildTodayPlan(60);
  var action = actionFromSessionPlan(plan);
  ({
    mode: action.mode,
    itemCount: plan.sessionPlan.items.length,
    total: plan.sessionPlan.totalMinutes,
    hasOptimumReason: plan.why.join(" ").includes("upper growth"),
    maxMuscleSets: Math.max(...plan.sessionPlan.items.map((item) => item.muscle.sets + item.sets)),
    hasTitle: typeof action.title === "string" && action.title.length > 0,
    hasBody: typeof action.body === "string" && action.body.length > 0
  });
`);

assert.strictEqual(optimumPlanAction.mode, "session", `Expected all floor-covered muscles below 20 to build an optimum-volume session, got ${optimumPlanAction.mode}`);
assert(optimumPlanAction.itemCount > 0, "Expected optimum-volume plan to include exercises after minimums are covered.");
assert(optimumPlanAction.total <= 63, `Expected optimum-volume 1 hour plan to fit, got ${optimumPlanAction.total}`);
assert(optimumPlanAction.hasOptimumReason, "Expected optimum-volume reasons to use upper growth zone language after the floor is covered.");
assert(optimumPlanAction.maxMuscleSets <= 20, `Expected optimum-volume plan not to push muscles over 20 sets, got ${optimumPlanAction.maxMuscleSets}`);
assert(optimumPlanAction.hasTitle, `Expected action to have a title, got mode=${optimumPlanAction.mode}`);
assert(optimumPlanAction.hasBody, `Expected action to have body text, got mode=${optimumPlanAction.mode}`);

const emptyPlanAction = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 22));
  var plan = buildTodayPlan(60);
  var action = actionFromSessionPlan(plan);
  ({
    mode: action.mode,
    itemCount: plan.sessionPlan.items.length,
    hasTitle: typeof action.title === "string" && action.title.length > 0,
    hasBody: typeof action.body === "string" && action.body.length > 0
  });
`);

assert.notStrictEqual(emptyPlanAction.mode, "session", "Expected all muscles at the high-volume filler ceiling to stay in progression/recovery mode instead of forcing more volume.");
assert.strictEqual(emptyPlanAction.itemCount, 0, `Expected all-ceiling plan to have no forced session items, got ${emptyPlanAction.itemCount}`);
assert(emptyPlanAction.hasTitle, `Expected action to have a title even with no items, got mode=${emptyPlanAction.mode}`);
assert(emptyPlanAction.hasBody, `Expected action to have body text even with no items, got mode=${emptyPlanAction.mode}`);

const copiedPlanPreview = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["chest"];
  state.coachGrowthModes = { chest: "aggressive" };
  var beforeCount = state.workouts.length;
  var plan = buildTodayPlan(60);
  copyCoachPlanToLog(plan);
  state.activeTab = "coach";
  var markup = renderCoach();
  var preview = buildNextCoachPlanPreview();
  ({
    copiedTitle: state.copiedCoachPlan?.title || "",
    copiedItems: state.copiedCoachPlan?.sessionPlan?.items?.length || 0,
    workoutsUnchanged: state.workouts.length === beforeCount,
    hasPreviewButton: markup.includes('data-action="preview-next-coach-plan"'),
    previewNotice: preview.notice,
    previewItems: preview.plan.sessionPlan.items.length,
    workoutsStillUnchanged: state.workouts.length === beforeCount
  });
`);

assert(copiedPlanPreview.copiedTitle, "Expected Coach copy to preserve a copied-plan snapshot.");
assert(copiedPlanPreview.copiedItems > 0, "Expected copied-plan snapshot to keep plan items.");
assert(copiedPlanPreview.workoutsUnchanged && copiedPlanPreview.workoutsStillUnchanged, "Expected next-plan preview to avoid writing simulated workouts.");
assert.strictEqual(copiedPlanPreview.hasPreviewButton, false, "Expected the next-plan preview control to be removed from Coach.");
assert(copiedPlanPreview.previewNotice.includes("only the next plan"), `Expected preview advisory, got ${copiedPlanPreview.previewNotice}`);

const copiedPlanCompletionAwarePreview = runScenario(`
  ${resetAndHelpers}
  var plan = buildTodayPlan(60);
  copyCoachPlanToLog(plan);
  var copied = state.copiedCoachPlan;
  var first = copied.sessionPlan.items[0];
  var partialSets = Math.max(1, first.sets - 1);
  state.workouts = [{
    id: "partial-copy",
    date: todayISO(),
    exercise: first.exercise.name,
    exerciseId: first.exercise.id,
    primaryMuscles: first.exercise.primaryMuscles,
    secondaryMuscles: first.exercise.secondaryMuscles,
    setRows: Array.from({ length: partialSets }, () => ({ weight: 20, reps: 10, rir: 2, restSeconds: 90 }))
  }];
  var partial = buildNextCoachPlanPreview(copied);
  state.workouts = copied.sessionPlan.items.map((item, index) => ({
    id: "complete-copy-" + index,
    date: todayISO(),
    exercise: item.exercise.name,
    exerciseId: item.exercise.id,
    primaryMuscles: item.exercise.primaryMuscles,
    secondaryMuscles: item.exercise.secondaryMuscles,
    setRows: Array.from({ length: item.sets }, () => ({ weight: 20, reps: 10, rir: 2, restSeconds: 90 }))
  }));
  var beforeCount = state.workouts.length;
  var complete = buildNextCoachPlanPreview(copied);
  ({
    partialStatus: partial.completion.status,
    partialRemaining: partial.completion.remainingSets,
    partialNotice: partial.notice,
    completeStatus: complete.completion.status,
    completeRemaining: complete.completion.remainingSets,
    completeNotice: complete.notice,
    workoutsUnchanged: state.workouts.length === beforeCount
  });
`);

assert.strictEqual(copiedPlanCompletionAwarePreview.partialStatus, "partial", `Expected partial copied-plan status, got ${copiedPlanCompletionAwarePreview.partialStatus}`);
assert(copiedPlanCompletionAwarePreview.partialRemaining > 0 && copiedPlanCompletionAwarePreview.partialNotice.includes("remaining sets"), `Expected only missing copied work to be simulated, got ${copiedPlanCompletionAwarePreview.partialNotice}`);
assert.strictEqual(copiedPlanCompletionAwarePreview.completeStatus, "completed", `Expected completed copied-plan status, got ${copiedPlanCompletionAwarePreview.completeStatus}`);
assert.strictEqual(copiedPlanCompletionAwarePreview.completeRemaining, 0, `Expected no simulation after completion, got ${copiedPlanCompletionAwarePreview.completeRemaining}`);
assert(copiedPlanCompletionAwarePreview.completeNotice.includes("Nothing was simulated twice"), `Expected completed preview explanation, got ${copiedPlanCompletionAwarePreview.completeNotice}`);
assert(copiedPlanCompletionAwarePreview.workoutsUnchanged, "Expected preview simulation never to write workouts.");
assert(appCode.includes("state.previewNextCoachPlan = !state.previewNextCoachPlan"), "Expected Preview next plan control to toggle open and closed.");

const coachCopiedPlanEmptyStateAndAudit = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var markup = renderCoach();
  ({
    hasEmptyCopyMessage: markup.includes("Copy today's plan to preview the next one."),
    hasCoachNotes: markup.includes("Coach notes"),
    auditOpen: markup.includes('muscle-audit-panel" open') || markup.includes("muscle-audit-panel' open"),
    auditHasProgress: markup.includes("muscle-card") && markup.includes("progress-bar")
  });
`);

assert.strictEqual(coachCopiedPlanEmptyStateAndAudit.hasEmptyCopyMessage, false, "Expected the next-plan preview empty state to be removed from Coach.");
assert.strictEqual(coachCopiedPlanEmptyStateAndAudit.hasCoachNotes, false, "Expected Coach notes to be removed from Coach.");
assert(coachCopiedPlanEmptyStateAndAudit.auditOpen, "Expected Coach muscle set audit to render open by default.");
assert(coachCopiedPlanEmptyStateAndAudit.auditHasProgress, "Expected Coach muscle audit to include progress bars.");

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

const highVolumeZone = runScenario(`
  setZone(21);
`);

assert.strictEqual(highVolumeZone.label, "High volume", `Expected high volume wording, got ${highVolumeZone.label}`);
assert.strictEqual(highVolumeZone.tone, "high-volume", `Expected high volume to use dark-green tone, got ${highVolumeZone.tone}`);

const muscleChartScale = runScenario(`
  ${resetAndHelpers}
  var chest = muscleGroups.find((m) => m.id === "chest");
  state.workouts = [makeWorkout(chest, 2, 10)];
  muscleSetStats().find((stat) => stat.id === "chest").percent;
`);

assert.strictEqual(muscleChartScale, 50, `Expected 10 sets to fill half of the 20-set chart target, got ${muscleChartScale}`);

const pendingBodyweightDraft = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "pushup",
    name: "Push-up",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    equipment: "bodyweight",
    reps: "8-20",
    rest: "60-90 sec",
    cue: "Bodyweight pending test.",
    userCreated: true
  }];
  state.draftDate = todayISO();
  state.workoutDraft = [{
    draftId: "pushup-draft",
    editingWorkoutId: null,
    exercise: "Push-up",
    targetMuscle: "chest",
    notes: "",
    setRows: [
      { weight: 0, reps: 12, rir: 2, restSeconds: 60 },
      { weight: 0, reps: 10, rir: 2, restSeconds: 60 }
    ]
  }];
  var pending = coachPendingWorkoutEntries();
  ({
    count: pending.length,
    sets: pending[0]?.sets || 0,
    weight: pending[0]?.weight ?? null
  });
`);

assert.strictEqual(pendingBodyweightDraft.count, 1, `Expected unsaved bodyweight draft to count as pending Coach work, got ${pendingBodyweightDraft.count}`);
assert.strictEqual(pendingBodyweightDraft.sets, 2, `Expected pending bodyweight draft sets to count, got ${pendingBodyweightDraft.sets}`);
assert.strictEqual(pendingBodyweightDraft.weight, 0, `Expected pending bodyweight draft to allow zero load, got ${pendingBodyweightDraft.weight}`);

const copiedPlanSameDayRetention = runScenario(`
  ${resetAndHelpers}
  var copiedStorage = {};
  localStorage.getItem = (key) => copiedStorage[key] || null;
  localStorage.setItem = (key, value) => { copiedStorage[key] = value; };
  localStorage.removeItem = (key) => { delete copiedStorage[key]; };
  var plan = buildTodayPlan(60);
  copyCoachPlanToLog(plan);
  var sameDay = activeCopiedCoachPlan();
  sameDay.copiedDate = "2026-06-16";
  var wrongDay = activeCopiedCoachPlan();
  ({
    sameDayItems: sameDay?.sessionPlan?.items?.length || 0,
    wrongDayVisible: Boolean(wrongDay),
    storagePayload: JSON.parse(safeLocalStorageGet(COPIED_COACH_PLAN_KEY) || "null")
  });
`);

assert(copiedPlanSameDayRetention.sameDayItems > 0, "Expected copied Coach plan to remain visible on the copied date.");
assert.strictEqual(copiedPlanSameDayRetention.wrongDayVisible, false, "Expected copied Coach plan to hide when its copied date no longer matches today.");
assert.strictEqual(copiedPlanSameDayRetention.storagePayload.copiedDate, "2026-06-17", "Expected copied Coach plan to persist with the same-day date key.");

const highRepPerformanceTrack = runScenario(`
  ${resetAndHelpers}
  var exercise = normalizeExerciseDefinition({
    id: "high-rep-raise",
    name: "High Rep Raise",
    primaryMuscles: ["shoulders"],
    reps: "20-30",
    loadingStyle: "high-rep",
    loadIncrement: 0.5
  });
  state.settings.customExercises = [exercise];
  var older = makeWorkout({ id: "shoulders" }, 4, 2, {
      exercise: exercise.name,
      exerciseId: exercise.id,
      primaryMuscles: ["shoulders"]
    });
  Object.assign(older, { loadingStyle: "high-rep", setRows: [{ weight: 12.5, reps: 24, rir: 1 }, { weight: 12.5, reps: 22, rir: 1 }] });
  var latest = makeWorkout({ id: "shoulders" }, 2, 2, {
      exercise: exercise.name,
      exerciseId: exercise.id,
      primaryMuscles: ["shoulders"]
    });
  Object.assign(latest, { loadingStyle: "high-rep", setRows: [{ weight: 12.5, reps: 26, rir: 0 }, { weight: 12.5, reps: 23, rir: 0 }] });
  var standard = makeWorkout({ id: "shoulders" }, 6, 1, {
      exercise: exercise.name,
      exerciseId: exercise.id,
      primaryMuscles: ["shoulders"]
    });
  Object.assign(standard, { loadingStyle: "standard", setRows: [{ weight: 20, reps: 8, rir: 1 }] });
  state.workouts = [older, latest, standard];
  var signal = coachExercisePerformanceSignal(exercise);
  ({ status: signal.status, historyCount: signal.history.length, target: progressionTargetForExercise(exercise.name)?.target || "" });
`);

assert.notStrictEqual(highRepPerformanceTrack.status, "isolated-failure", "Expected in-range high-rep work at 0 RIR not to be mislabeled as failure.");
assert.strictEqual(highRepPerformanceTrack.historyCount, 2, "Expected high-rep performance comparisons to ignore standard-loading history.");
assert(highRepPerformanceTrack.target.includes("12.5"), `Expected high-rep progression to preserve the configured half-pound load, got ${highRepPerformanceTrack.target}`);

const highRepProgressionGuard = runScenario(`
  ${resetAndHelpers}
  var highRep = normalizeExerciseDefinition({
    id: "guard-high", name: "Guard High Rep", primaryMuscles: ["calves"], secondaryMuscles: [],
    reps: "8-15", loadingStyle: "high-rep", progressionMode: "normal", loadIncrement: 2.5
  });
  var autoStandard = normalizeExerciseDefinition({
    id: "guard-auto", name: "Guard Auto", primaryMuscles: ["calves"], secondaryMuscles: [],
    reps: "8-15", loadingStyle: "auto", progressionMode: "normal", loadIncrement: 2.5
  });
  state.settings.customExercises = [highRep, autoStandard];
  state.workouts = [{
    id: "guard-20", date: dateDaysAgo(2), exercise: highRep.name, exerciseId: highRep.id,
    primaryMuscles: ["calves"], secondaryMuscles: [], loadingStyle: "high-rep",
    setRows: [{ weight: 10, reps: 20, rir: 2 }, { weight: 10, reps: 20, rir: 2 }]
  }];
  var holdProgression = progressionTargetForExercise(highRep.name);
  var holdTarget = coachPlanTargetForExercise(highRep, coachExercisePerformanceSignal(highRep));
  var holdRows = plannedSetRowsFromPreviousSession(highRep, 2, holdTarget);
  var emptyRows = plannedSetRowsFromPreviousSession({ ...highRep, id: "empty-high", name: "Empty High" }, 2, null);
  var debugItem = coachDebugPlanSummary({
    mode: "session",
    sessionPlan: { items: [{ muscle: { id: "calves", label: "Calves" }, exercise: highRep, sets: 2, minutes: 5, phase: "growth", growthMode: "medium", reason: "Test", planTarget: holdTarget }] }
  }).items[0];
  ({
    highRange: effectiveRepRange({ loadingStyle: "high-rep", reps: "8-15" }),
    autoRange: effectiveRepRange(autoStandard),
    holdProgression,
    holdRows,
    emptyRows,
    autoRow: adjustedCoachPlanRow({ weight: 10, reps: 10, rir: 2 }, autoStandard, null),
    debugItem
  });
`);

assert.deepEqual(highRepProgressionGuard.highRange, { low: 20, high: 30, label: "20-30" }, "Expected explicit High-rep to enforce the 20-30 Coach range even when stored reps conflict.");
assert.deepEqual(highRepProgressionGuard.autoRange, { low: 8, high: 15, label: "8-15" }, "Expected Auto / 8-15 to remain a Standard track rather than being silently reclassified.");
assert.strictEqual(highRepProgressionGuard.holdProgression.increaseLoad, false, "Expected 20 reps at 2 RIR not to earn a High-rep load increase.");
assert.strictEqual(highRepProgressionGuard.holdProgression.loadIncreaseBlockReason, "RIR-adjusted top-set capacity is 22/30 reps", "Expected the High-rep load hold to explain the exact capacity shortfall.");
assert(highRepProgressionGuard.holdProgression.target.includes("10 lb x 21-30"), `Expected the same load to progress within 20-30, got ${highRepProgressionGuard.holdProgression.target}.`);
assert(highRepProgressionGuard.holdRows.every((row) => row.weight === 10 && row.reps >= 20 && row.reps <= 30), "Expected copied High-rep hold rows to stay at the same load and within 20-30.");
assert(highRepProgressionGuard.emptyRows.every((row) => row.reps === 20), "Expected a High-rep exercise without history to copy baseline rows at 20 reps, not the generic 10-rep default.");
assert.strictEqual(highRepProgressionGuard.autoRow.reps, 10, "Expected Auto / 8-15 copied rows to preserve existing Standard behavior.");
assert.strictEqual(highRepProgressionGuard.debugItem.configuredLoadingStyle, "high-rep", "Expected Coach debug output to expose the configured loading style.");
assert.strictEqual(highRepProgressionGuard.debugItem.effectiveLoadingStyle, "high-rep", "Expected Coach debug output to expose the effective loading style.");
assert.strictEqual(highRepProgressionGuard.debugItem.effectiveRepRange, "20-30", "Expected Coach debug output to expose the guarded High-rep range.");
assert.strictEqual(highRepProgressionGuard.debugItem.planTarget.loadIncreaseBlockReason, "RIR-adjusted top-set capacity is 22/30 reps", "Expected Coach debug output to explain why load progression was held.");

const highRepRirAdjustedLoadIncrease = runScenario(`
  ${resetAndHelpers}
  var exercise = normalizeExerciseDefinition({
    id: "guard-increase", name: "Guard Increase", primaryMuscles: ["calves"], secondaryMuscles: [],
    reps: "20-30", loadingStyle: "high-rep", progressionMode: "normal", loadIncrement: 2.5
  });
  state.settings.customExercises = [exercise];
  state.workouts = [{
    id: "guard-28", date: dateDaysAgo(2), exercise: exercise.name, exerciseId: exercise.id,
    primaryMuscles: ["calves"], secondaryMuscles: [], loadingStyle: "high-rep",
    setRows: [{ weight: 10, reps: 28, rir: 2 }, { weight: 10, reps: 22, rir: 1 }]
  }];
  var progression = progressionTargetForExercise(exercise.name);
  var planTarget = coachPlanTargetForExercise(exercise, coachExercisePerformanceSignal(exercise));
  var copiedRows = plannedSetRowsFromPreviousSession(exercise, 2, planTarget);
  ({ progression, planTarget, copiedRows });
`);

assert.strictEqual(highRepRirAdjustedLoadIncrease.progression.increaseLoad, true, "Expected 28 reps at 2 RIR to qualify as RIR-adjusted 30-rep capacity when every set remains in range.");
assert.strictEqual(highRepRirAdjustedLoadIncrease.progression.loadIncreaseBlockReason, "", "Expected no blocking reason after a valid High-rep load increase.");
assert(highRepRirAdjustedLoadIncrease.progression.target.includes("12.5 lb x 20-26"), `Expected the new load target to remain in 20-30, got ${highRepRirAdjustedLoadIncrease.progression.target}.`);
assert(highRepRirAdjustedLoadIncrease.copiedRows.every((row) => row.weight === 12.5 && row.reps === 20), "Expected copied rows to match the RIR-adjusted load increase and reset to 20 reps.");

const highRepBackoffGuard = runScenario(`
  ${resetAndHelpers}
  var exercise = normalizeExerciseDefinition({
    id: "guard-backoff", name: "Guard Backoff", primaryMuscles: ["calves"], secondaryMuscles: [],
    reps: "20-30", loadingStyle: "high-rep", progressionMode: "normal", loadIncrement: 2.5
  });
  state.settings.customExercises = [exercise];
  state.workouts = [{
    id: "guard-backoff-session", date: dateDaysAgo(2), exercise: exercise.name, exerciseId: exercise.id,
    primaryMuscles: ["calves"], secondaryMuscles: [], loadingStyle: "high-rep",
    setRows: [{ weight: 10, reps: 28, rir: 2 }, { weight: 0, reps: 19, rir: 1 }]
  }];
  var progression = progressionTargetForExercise(exercise.name);
  var resetRow = adjustedCoachPlanRow({ weight: 10, reps: 12, rir: 0 }, exercise, { kind: "reset", loadMultiplier: 0.95 });
  ({ progression, resetRow });
`);

assert.strictEqual(highRepBackoffGuard.progression.increaseLoad, false, "Expected one working set below 20 to block a High-rep load increase.");
assert.strictEqual(highRepBackoffGuard.progression.loadIncreaseBlockReason, "One or more working sets finished below 20 reps", "Expected the below-range working set to be reported as the exact blocker.");
assert.strictEqual(highRepBackoffGuard.resetRow.reps, 20, "Expected High-rep reset rows to preserve the 20-rep minimum while reducing load.");

const highRepEightRepLoadIsNotProgress = runScenario(`
  ${resetAndHelpers}
  var exercise = normalizeExerciseDefinition({
    id: "guard-eight", name: "Guard Eight", primaryMuscles: ["calves"], secondaryMuscles: [],
    reps: "20-30", loadingStyle: "high-rep", progressionMode: "normal", loadIncrement: 2.5
  });
  state.settings.customExercises = [exercise];
  state.workouts = [
    { id: "guard-eight-latest", date: dateDaysAgo(2), exercise: exercise.name, exerciseId: exercise.id, primaryMuscles: ["calves"], loadingStyle: "high-rep", setRows: [{ weight: 15, reps: 8, rir: 1 }] },
    { id: "guard-eight-prior", date: dateDaysAgo(5), exercise: exercise.name, exerciseId: exercise.id, primaryMuscles: ["calves"], loadingStyle: "high-rep", setRows: [{ weight: 10, reps: 20, rir: 2 }] }
  ];
  var signal = coachExercisePerformanceSignal(exercise);
  ({ status: signal.status, reasons: signal.progressEvidence?.reasons || [], target: coachPlanTargetForExercise(exercise, signal) });
`);

assert.notStrictEqual(highRepEightRepLoadIsNotProgress.status, "progressing", "Expected a new High-rep load performed for only 8 reps not to count as progression.");
assert(!highRepEightRepLoadIsNotProgress.reasons.some((reason) => reason.includes("load PR")), "Expected an 8-rep High-rep load not to create a qualifying load-PR signal.");
assert(["reset", "deload"].includes(highRepEightRepLoadIsNotProgress.target.kind), "Expected below-range High-rep work to hold or reduce load rather than prescribe another increase.");

const standardToHighRepConversion = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "conversion-curl", name: "Conversion Curl", primaryMuscles: ["biceps"], secondaryMuscles: [],
    equipment: "cable", reps: "20-30", rest: "60 sec", loadingStyle: "high-rep", loadIncrement: 2.5, userCreated: true
  }];
  state.workouts = [{
    id: "standard-curl", date: dateDaysAgo(3), exercise: "Conversion Curl", exerciseId: "conversion-curl",
    primaryMuscles: ["biceps"], secondaryMuscles: [], loadingStyle: "standard",
    setRows: [{ weight: 100, reps: 10, rir: 2, restSeconds: 60 }]
  }];
  var exercise = resolveExerciseMeta("Conversion Curl");
  var progression = progressionTargetForExercise(exercise.name);
  var planTarget = coachPlanTargetForExercise(exercise, coachExercisePerformanceSignal(exercise));
  var rows = plannedSetRowsFromPreviousSession(exercise, 2, planTarget);
  ({ progression, planTarget, rows });
`);

assert.strictEqual(standardToHighRepConversion.progression.styleConversion, true, "Expected a new high-rep track to use a converted standard baseline.");
assert.strictEqual(standardToHighRepConversion.planTarget.kind, "style-conversion", "Expected Coach copy to identify a style conversion rather than ordinary progression.");
assert.strictEqual(standardToHighRepConversion.rows[0].weight, 72.5, "Expected 100 x 10 at 2 RIR to convert conservatively to 72.5 lb for the high-rep midpoint.");
assert.strictEqual(standardToHighRepConversion.rows[0].reps, 25, "Expected a 20-30 range conversion to target its 25-rep midpoint.");
assert.strictEqual(standardToHighRepConversion.rows[0].rir, 2, "Expected the converted first-session target to use 2 RIR.");

const highRepToStandardConversion = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "conversion-curl", name: "Conversion Curl", primaryMuscles: ["biceps"], secondaryMuscles: [],
    equipment: "cable", reps: "8-12", rest: "60 sec", loadingStyle: "standard", loadIncrement: 2.5, userCreated: true
  }];
  state.workouts = [{
    id: "high-curl", date: dateDaysAgo(3), exercise: "Conversion Curl", exerciseId: "conversion-curl",
    primaryMuscles: ["biceps"], secondaryMuscles: [], loadingStyle: "high-rep",
    setRows: [{ weight: 72.5, reps: 25, rir: 2, restSeconds: 60 }]
  }];
  var exercise = resolveExerciseMeta("Conversion Curl");
  var planTarget = coachPlanTargetForExercise(exercise, coachExercisePerformanceSignal(exercise));
  var rows = plannedSetRowsFromPreviousSession(exercise, 1, planTarget);
  ({ planTarget, row: rows[0] });
`);

assert.strictEqual(highRepToStandardConversion.planTarget.kind, "style-conversion", "Expected switching back to standard loading to convert the high-rep baseline.");
assert.strictEqual(highRepToStandardConversion.row.weight, 97.5, "Expected the high-rep set to convert conservatively to the configured 2.5 lb increment.");
assert.strictEqual(highRepToStandardConversion.row.reps, 10, "Expected an 8-12 standard range conversion to target its 10-rep midpoint.");

const interruptedLoadingStylePhase = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "phase-curl", name: "Phase Curl", primaryMuscles: ["biceps"], secondaryMuscles: [],
    equipment: "cable", reps: "20-30", rest: "60 sec", loadingStyle: "high-rep", loadIncrement: 2.5, userCreated: true
  }];
  var exercise = resolveExerciseMeta("Phase Curl");
  var olderHigh = makeWorkout({ id: "biceps" }, 6, 1, { id: "old-high", exercise: exercise.name, exerciseId: exercise.id });
  Object.assign(olderHigh, { loadingStyle: "high-rep", setRows: [{ weight: 50, reps: 28, rir: 1 }] });
  var interveningStandard = makeWorkout({ id: "biceps" }, 4, 1, { id: "middle-standard", exercise: exercise.name, exerciseId: exercise.id });
  Object.assign(interveningStandard, { loadingStyle: "standard", setRows: [{ weight: 75, reps: 10, rir: 2 }] });
  var latestHigh = makeWorkout({ id: "biceps" }, 2, 1, { id: "new-high", exercise: exercise.name, exerciseId: exercise.id });
  Object.assign(latestHigh, { loadingStyle: "high-rep", setRows: [{ weight: 52.5, reps: 22, rir: 2 }] });
  state.workouts = [olderHigh, interveningStandard, latestHigh];
  var phase = exerciseLoadingStylePhase(exercise);
  var signal = coachExercisePerformanceSignal(exercise);
  ({ phaseIds: phase.history.map((workout) => workout.id), status: signal.status, historyCount: signal.history.length });
`);

assert.deepEqual(interruptedLoadingStylePhase.phaseIds, ["new-high"], "Expected the active high-rep phase to stop at the intervening standard workout.");
assert.strictEqual(interruptedLoadingStylePhase.status, "neutral", "Expected the first workout in a new loading-style phase to establish a neutral baseline.");
assert.strictEqual(interruptedLoadingStylePhase.historyCount, 1, "Expected old high-rep phases not to affect current progression or regression.");

const returningStyleUsesTransition = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "return-curl", name: "Return Curl", primaryMuscles: ["biceps"], secondaryMuscles: [],
    equipment: "cable", reps: "20-30", rest: "60 sec", loadingStyle: "high-rep", loadIncrement: 2.5, userCreated: true
  }];
  var exercise = resolveExerciseMeta("Return Curl");
  var oldHigh = makeWorkout({ id: "biceps" }, 8, 1, { id: "old-high", exercise: exercise.name, exerciseId: exercise.id });
  Object.assign(oldHigh, { loadingStyle: "high-rep", setRows: [{ weight: 45, reps: 25, rir: 2 }] });
  var latestStandard = makeWorkout({ id: "biceps" }, 2, 1, { id: "latest-standard", exercise: exercise.name, exerciseId: exercise.id });
  Object.assign(latestStandard, { loadingStyle: "standard", setRows: [{ weight: 80, reps: 10, rir: 2 }] });
  state.workouts = [oldHigh, latestStandard];
  var progression = progressionTargetForExercise(exercise.name);
  var signal = coachExercisePerformanceSignal(exercise);
  ({ styleConversion: progression.styleConversion, sourceId: progression.latest.id, status: signal.status, historyCount: signal.history.length });
`);

assert.strictEqual(returningStyleUsesTransition.styleConversion, true, "Expected the latest opposite-style workout to create a new conversion baseline even when an older target-style phase exists.");
assert.strictEqual(returningStyleUsesTransition.sourceId, "latest-standard", "Expected conversion to use the newest opposite-style performance.");
assert.strictEqual(returningStyleUsesTransition.status, "neutral", "Expected no progression or regression verdict across a loading-style transition.");
assert.strictEqual(returningStyleUsesTransition.historyCount, 0, "Expected previous high-rep phases to remain outside the new transition baseline.");

const weeklyCoachPlan = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({
    days: [5, 0],
    averageMinutes: 60,
    priorities: ["biceps"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "biceps" ? 24 : 10]))
  });
  var plan = buildCoachWeeklyPlan();
  ({
    priorityProjected: plan.projected.biceps,
    priorityTarget: plan.setup.targets.biceps,
    plannedDays: plan.sessions.filter((session) => session.status === "planned").length,
    capacityMessage: plan.capacity.message,
    markup: renderCoachWeek()
  });
`);

assert(weeklyCoachPlan.priorityProjected > 10, `Expected weekly plan to add volume to priority Biceps, got ${weeklyCoachPlan.priorityProjected}`);
assert.strictEqual(weeklyCoachPlan.priorityTarget, 24, "Expected numeric weekly target to remain attached to the priority muscle.");
assert(weeklyCoachPlan.plannedDays > 0, "Expected the weekly planner to create remaining sessions.");
assert(weeklyCoachPlan.markup.includes("Weekly distribution") && weeklyCoachPlan.markup.includes("Copy this day to Log"), "Expected weekly Coach distribution and day-copy controls.");

const weeklyPriorityBeforeOptionalGrowth = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = muscleGroups.map((muscle) => ({
    id: "weekly-priority-" + muscle.id,
    name: "Weekly Priority " + muscle.label,
    primaryMuscles: [muscle.id],
    secondaryMuscles: [],
    equipment: "machine",
    reps: "8-15",
    rest: "60 sec",
    cue: "Train.",
    userCreated: true
  }));
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  var setup = normalizeCoachWeeklyPlan({
    days: [5, 0],
    averageMinutes: 30,
    priorities: ["chest"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, ["chest", "hamstrings"].includes(muscle.id) ? 20 : 10]))
  });
  var plan = buildCoachWeeklyPlan(setup);
  ({
    chestAdded: plan.projected.chest - 10,
    hamstringsAdded: plan.projected.hamstrings - 10,
    maxExercises: Math.max(...plan.sessions.map((session) => session.items.length))
  });
`);

assert(weeklyPriorityBeforeOptionalGrowth.chestAdded >= weeklyPriorityBeforeOptionalGrowth.hamstringsAdded, `Expected priority Chest capacity before optional Hamstrings growth, got +${weeklyPriorityBeforeOptionalGrowth.chestAdded} Chest and +${weeklyPriorityBeforeOptionalGrowth.hamstringsAdded} Hamstrings.`);
assert(weeklyPriorityBeforeOptionalGrowth.chestAdded > 0, "Expected priority Chest to receive remaining weekly capacity.");
assert(weeklyPriorityBeforeOptionalGrowth.maxExercises <= 6, `Expected weekly sessions to cap at six exercises, got ${weeklyPriorityBeforeOptionalGrowth.maxExercises}.`);

const weeklyFloorBeforePriorityGrowth = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = muscleGroups.map((muscle) => ({
    id: "weekly-floor-" + muscle.id,
    name: "Weekly Floor " + muscle.label,
    primaryMuscles: [muscle.id],
    secondaryMuscles: [],
    equipment: "machine",
    reps: "8-15",
    rest: "60 sec",
    cue: "Train.",
    userCreated: true
  }));
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "hamstrings" ? 6 : 10));
  var plan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 30, priorities: ["chest"], targets: { chest: 20, hamstrings: 10 } }));
  ({ chest: plan.projected.chest, hamstrings: plan.projected.hamstrings, phases: plan.sessions.flatMap((session) => session.items.map((item) => item.phase)) });
`);

assert(weeklyFloorBeforePriorityGrowth.hamstrings >= 10, `Expected Hamstrings floor to be protected before Chest growth, got ${weeklyFloorBeforePriorityGrowth.hamstrings}.`);
assert(weeklyFloorBeforePriorityGrowth.chest > 10, `Expected remaining capacity to reach priority Chest after the Hamstrings floor, got ${weeklyFloorBeforePriorityGrowth.chest}.`);
assert(weeklyFloorBeforePriorityGrowth.phases.includes("floor") && weeklyFloorBeforePriorityGrowth.phases.includes("priority"), "Expected explicit floor and priority planning phases.");

const todayHardExerciseCap = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 18));
  var plan = buildTodayPlan(75).sessionPlan;
  ({ count: plan.items.length, total: plan.totalMinutes });
`);

assert(todayHardExerciseCap.count <= 6, `Expected Today to cap at six exercises even at 1 hour+, got ${todayHardExerciseCap.count}.`);
assert(todayHardExerciseCap.total <= 78, `Expected Today to remain inside the 75-minute tolerance, got ${todayHardExerciseCap.total}.`);

const weeklyDistributionIndicators = runScenario(`
  ${resetAndHelpers}
  renderCoachWeekDistribution({
    actualStats: muscleGroups.map((muscle) => ({ id: muscle.id, sets: muscle.id === "chest" ? 8 : muscle.id === "back" ? 12 : 20 })),
    projected: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "chest" ? 8 : muscle.id === "back" ? 12 : 20])),
    setup: { priorities: [], targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 20])) }
  });
`);

assert(weeklyDistributionIndicators.includes("coach-week-muscle-status below-minimum") && weeklyDistributionIndicators.includes('aria-label="Below 10-set minimum"'), "Expected red weekly indicator for projected totals below 10 sets.");
assert(weeklyDistributionIndicators.includes("coach-week-muscle-status below-upper") && weeklyDistributionIndicators.includes('aria-label="Below 20 planned sets"'), "Expected orange weekly indicator for projected totals from 10 through under 20 sets.");
assert(weeklyDistributionIndicators.includes("coach-week-muscle-status upper-met") && weeklyDistributionIndicators.includes('aria-label="20 planned sets reached"'), "Expected green weekly indicator at 20 or more projected sets.");

const weeklySetBudgetAllocation = runScenario(`
  ${resetAndHelpers}
  var actual = { chest: 0, back: 7.5, shoulders: 7.5, biceps: 8.5, triceps: 5, quads: 4, hamstrings: 0, glutes: 0, calves: 0, abs: 6.5 };
  var stats = muscleGroups.map((muscle) => ({ ...muscle, sets: actual[muscle.id] }));
  var setup = normalizeCoachWeeklyPlan({
    priorities: ["chest", "back", "biceps", "triceps"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 20]))
  });
  coachWeeklySetBudgets(setup, stats, 100);
`);

assert(["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "abs"].every((id) => weeklySetBudgetAllocation.setBudgets[id] >= 10), "Expected the weekly allocator to protect every feasible 10-set floor first.");
assert(["chest", "back", "biceps", "triceps"].every((id) => weeklySetBudgetAllocation.setBudgets[id] >= 19), `Expected remaining capacity to be balanced across selected priorities, got ${JSON.stringify(weeklySetBudgetAllocation.setBudgets)}.`);
assert(["shoulders", "quads", "hamstrings", "glutes", "calves", "abs"].every((id) => weeklySetBudgetAllocation.setBudgets[id] === 10), "Expected non-priority growth to wait while selected priority targets still need reserved capacity.");
assert.strictEqual(weeklySetBudgetAllocation.remainingCapacity, 0, "Expected the allocator to account for all estimated remaining capacity.");

const weeklySameSessionPriorityFill = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "chest-a", name: "Chest A", primaryMuscles: ["chest"], secondaryMuscles: [], equipment: "machine", reps: "8-15", rest: "60 sec", cue: "Train.", userCreated: true },
    { id: "chest-b", name: "Chest B", primaryMuscles: ["chest"], secondaryMuscles: [], equipment: "machine", reps: "8-15", rest: "60 sec", cue: "Train.", userCreated: true },
    { id: "chest-c", name: "Chest C", primaryMuscles: ["chest"], secondaryMuscles: [], equipment: "machine", reps: "8-15", rest: "60 sec", cue: "Train.", userCreated: true }
  ];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10, { exercise: "Previous " + muscle.label, exerciseId: "previous-" + muscle.id }));
  var plan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 60, priorities: ["chest"], targets: { chest: 20 } }));
  var session = plan.sessions.find((item) => item.status === "planned");
  ({ projected: plan.projected.chest, allocated: plan.setBudgets.chest, chestItems: session.items.filter((item) => item.muscle.id === "chest").length, totalItems: session.items.length });
`);

assert.strictEqual(weeklySameSessionPriorityFill.allocated, 20, "Expected the weekly allocator to reserve Chest through its selected target.");
assert.strictEqual(weeklySameSessionPriorityFill.projected, 20, `Expected same-date priority work to continue beyond the floor, got ${weeklySameSessionPriorityFill.projected}.`);
assert(weeklySameSessionPriorityFill.chestItems > 1, "Expected recovery spacing to allow multiple Chest exercises within the same workout date.");
assert(weeklySameSessionPriorityFill.totalItems <= 6, `Expected same-session priority fill to preserve the six-exercise cap, got ${weeklySameSessionPriorityFill.totalItems}.`);

const weeklyExistingExerciseTopUp = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{
    id: "abs-only",
    name: "Only Abs Exercise",
    primaryMuscles: ["abs"],
    secondaryMuscles: [],
    exerciseType: "isolation",
    loadingStyle: "standard",
    equipment: "machine",
    reps: "8-15",
    rest: "60 sec",
    cue: "Train.",
    userCreated: true
  }];
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "abs" ? 8 : 10, {
    exercise: "Previous " + muscle.label,
    exerciseId: "previous-" + muscle.id,
    secondaryMuscles: []
  }));
  var targets = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "abs" ? 14 : 10]));
  var plan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 60, priorities: [], targets }));
  var session = plan.sessions.find((item) => item.status === "planned");
  ({ projectedAbs: plan.projected.abs, absSets: session.items.find((item) => item.exercise.id === "abs-only")?.sets || 0, itemCount: session.items.length, totalMinutes: session.totalMinutes });
`);

assert.strictEqual(weeklyExistingExerciseTopUp.projectedAbs, 16, `Expected logical unused time to continue safe growth-zone work beyond the requested floor, got ${weeklyExistingExerciseTopUp.projectedAbs}.`);
assert.strictEqual(weeklyExistingExerciseTopUp.absSets, 8, `Expected the existing Abs exercise to reach the per-exercise cap when no other safe work is available, got ${weeklyExistingExerciseTopUp.absSets}.`);
assert.strictEqual(weeklyExistingExerciseTopUp.itemCount, 1, "Expected topping up sets to preserve the exercise count.");
assert(weeklyExistingExerciseTopUp.totalMinutes <= 63, `Expected the topped-up session to remain within the selected time tolerance, got ${weeklyExistingExerciseTopUp.totalMinutes}.`);

const weeklyPreferenceSync = runScenario(`
  ${resetAndHelpers}
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ days: [1, 3, 5], averageMinutes: 50, priorities: ["chest"], targets: { chest: 22 } });
  safePreferenceValue("coachWeeklyPlan");
`);

assert.deepEqual(weeklyPreferenceSync.days, [1, 3, 5], "Expected weekly plan days to use safe preference sync.");
assert.strictEqual(weeklyPreferenceSync.targets.chest, 22, "Expected weekly target settings to sync.");

const weeklyCommittedPreferenceWins = runScenario(`
  ${resetAndHelpers}
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ days: [2, 4, 6], averageMinutes: 50, priorities: ["back"], targets: { back: 24 } });
  var synced = safePreferenceValue("coachWeeklyPlan");
  ({ days: synced.days, minutes: synced.averageMinutes, priorities: synced.priorities, backTarget: synced.targets.back });
`);

assert.deepEqual(weeklyCommittedPreferenceWins.days, [2, 4, 6], "Expected record sync to use the committed weekly setup.");
assert.strictEqual(weeklyCommittedPreferenceWins.minutes, 50, "Expected committed weekly duration to remain authoritative.");
assert.deepEqual(weeklyCommittedPreferenceWins.priorities, ["back"], "Expected committed weekly priorities to remain authoritative.");
assert.strictEqual(weeklyCommittedPreferenceWins.backTarget, 24, "Expected committed weekly targets to remain authoritative.");

// The weekly screen must render only committed settings and the new independent fader board.
const weeklyCommittedPlanOwnsMixer = runScenario(`
  ${resetAndHelpers}
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ days: [1, 3, 5, 6], averageMinutes: 60 });
  var selected = selectedCoachWeeklyPlan();
  ({ days: selected.days, averageMinutes: selected.averageMinutes, markup: renderCoachWeek() });
`);

assert.deepEqual(weeklyCommittedPlanOwnsMixer.days, [1, 3, 5, 6], "Expected the displayed weekly plan to remain on committed days until Generate is clicked.");
assert.strictEqual(weeklyCommittedPlanOwnsMixer.averageMinutes, 60, "Expected the displayed weekly plan to remain on the committed duration until Generate is clicked.");
assert.strictEqual((weeklyCommittedPlanOwnsMixer.markup.match(/data-coach-week-fader/g) || []).length, 10, "Expected one independent weekly fader per muscle group.");
assert(weeklyCommittedPlanOwnsMixer.markup.includes('type="hidden" name="target-chest"'), "Expected faders to retain the existing hidden target form contract.");
assert(!weeklyCommittedPlanOwnsMixer.markup.includes('type="number" name="target-chest"'), "Expected numeric target fields to be retired from the weekly UI.");

const weeklyChangeHandlerStart = appCode.indexOf('const coachWeekForm = event.target.closest("#coach-week-form")');
const weeklyChangeHandlerEnd = appCode.indexOf('if (event.target.matches("[data-sound-effects-enabled]"))', weeklyChangeHandlerStart);
const weeklyChangeHandler = appCode.slice(weeklyChangeHandlerStart, weeklyChangeHandlerEnd);
assert(weeklyChangeHandler.includes("markCoachWeekFormDirty(coachWeekForm)"), "Expected day/time edits to refresh the weekly capacity readout.");
assert(!weeklyChangeHandler.includes("autoFitCoachWeekForm"), "Expected day/time edits not to redistribute weekly fader targets automatically.");
assert(appCode.includes("Valid planned days can still be copied"), "Expected stale weekly information to remain copyable when the selected day is valid.");

const weeklySourceFingerprint = runScenario(`
  ${resetAndHelpers}
  var setup = normalizeCoachWeeklyPlan({ days: [5, 6], averageMinutes: 60, priorities: ["glutes"], targets: { glutes: 20 } });
  var initial = coachWeeklySourceFingerprint(setup);
  state.workouts = [makeWorkout(muscleGroups.find((muscle) => muscle.id === "glutes"), 2, 3)];
  var workoutChanged = coachWeeklySourceFingerprint(setup);
  state.settings.customExercises[0] = { ...state.settings.customExercises[0], loadingStyle: "high-rep", reps: "20-30", updatedAt: "2026-06-17T12:00:00.000Z" };
  var styleChanged = coachWeeklySourceFingerprint(setup);
  state.settings.customExercises[0] = { ...state.settings.customExercises[0], archivedAt: "2026-06-17T13:00:00.000Z" };
  var archiveChanged = coachWeeklySourceFingerprint(setup);
  ({ initial, workoutChanged, styleChanged, archiveChanged });
`);

assert.notStrictEqual(weeklySourceFingerprint.initial, weeklySourceFingerprint.workoutChanged, "Expected submitted workouts to stale the generated weekly source fingerprint.");
assert.notStrictEqual(weeklySourceFingerprint.workoutChanged, weeklySourceFingerprint.styleChanged, "Expected loading-style changes to stale the generated weekly source fingerprint.");
assert.notStrictEqual(weeklySourceFingerprint.styleChanged, weeklySourceFingerprint.archiveChanged, "Expected library archive changes to stale the generated weekly source fingerprint.");

const weeklyGeneratedSnapshotStaysCommitted = runScenario(`
  ${resetAndHelpers}
  var setup = normalizeCoachWeeklyPlan({ days: [5, 0], averageMinutes: 60, priorities: ["biceps"], targets: { biceps: 20 } });
  var generated = buildCoachWeeklyPlan(setup);
  var committed = normalizeCoachWeeklyPlan({
    ...setup,
    sourceFingerprint: coachWeeklySourceFingerprint(setup),
    generatedPlan: compactCoachWeeklyPlanSnapshot(generated)
  });
  state.settings.coachWeeklyPlan = committed;
  var before = displayedCoachWeeklyPlan();
  var beforeItems = before.sessions.flatMap((session) => session.items.map((item) => item.exercise.id + ":" + item.sets));
  state.workouts.push(makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 0, 4, { id: "new-submitted-workout" }));
  var after = displayedCoachWeeklyPlan();
  var afterItems = after.sessions.flatMap((session) => session.items.map((item) => item.exercise.id + ":" + item.sets));
  ({ beforeItems, afterItems, stale: after.stale });
`);

assert.deepEqual(weeklyGeneratedSnapshotStaysCommitted.afterItems, weeklyGeneratedSnapshotStaysCommitted.beforeItems, "Expected newly submitted work to leave the generated remaining-week items unchanged until Generate is clicked.");
assert.strictEqual(weeklyGeneratedSnapshotStaysCommitted.stale, true, "Expected newly submitted work to mark the committed weekly plan as needing regeneration.");

const staleWorkoutStillAllowsDayCopy = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{ id: "weekly-curl", name: "Weekly Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Curl.", userCreated: true }];
  var setup = normalizeCoachWeeklyPlan({ days: [5, 6], averageMinutes: 40, priorities: ["biceps"], targets: { biceps: 20 } });
  var generated = buildCoachWeeklyPlan(setup);
  var plannedDate = generated.sessions.find((session) => session.status === "planned" && session.items.length)?.date;
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ ...setup, sourceFingerprint: coachWeeklySourceFingerprint(setup), generatedPlan: compactCoachWeeklyPlanSnapshot(generated) });
  state.workouts.push(makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 0, 2, { id: "completed-after-generation" }));
  var displayed = displayedCoachWeeklyPlan();
  ({ stale: displayed.stale, issue: coachWeekDayCopyIssue(displayed, plannedDate) });
`);

assert.strictEqual(staleWorkoutStillAllowsDayCopy.stale, true, "Expected submitted work to keep the informational stale marker.");
assert.strictEqual(staleWorkoutStillAllowsDayCopy.issue, "", "Expected unrelated submitted work not to block copying a valid generated day.");

const archivedGeneratedExerciseIsBlocked = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{ id: "weekly-curl", name: "Weekly Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Curl.", userCreated: true }];
  var setup = normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 40, priorities: ["biceps"], targets: { biceps: 20 } });
  var generated = buildCoachWeeklyPlan(setup);
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ ...setup, sourceFingerprint: coachWeeklySourceFingerprint(setup), generatedPlan: compactCoachWeeklyPlanSnapshot(generated) });
  state.settings.customExercises[0] = { ...state.settings.customExercises[0], archivedAt: "2026-06-17T14:00:00.000Z", updatedAt: "2026-06-17T14:00:00.000Z" };
  var plannedDate = generated.sessions.find((session) => session.status === "planned" && session.items.length)?.date;
  var displayed = displayedCoachWeeklyPlan();
  ({ stale: displayed.stale, ids: displayed.sessions.flatMap((session) => session.items.map((item) => item.exercise.id)), issue: coachWeekDayCopyIssue(displayed, plannedDate) });
`);

assert.strictEqual(archivedGeneratedExerciseIsBlocked.stale, true, "Expected archiving a generated exercise to mark the weekly plan stale.");
assert(!archivedGeneratedExerciseIsBlocked.ids.includes("weekly-curl"), "Expected archived generated exercises to be removed from actionable weekly recommendations.");
assert(archivedGeneratedExerciseIsBlocked.issue.includes("archived, hidden, or missing exercise"), "Expected an inactive exercise to block only its affected generated day.");

const weeklySecondaryStimulusBudget = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "squat", name: "Squat", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"], equipment: "barbell", reps: "8-15", rest: "120 sec", cue: "Squat.", userCreated: true },
    { id: "hip-thrust", name: "Hip Thrust", primaryMuscles: ["glutes"], secondaryMuscles: [], equipment: "barbell", reps: "8-15", rest: "120 sec", cue: "Thrust.", userCreated: true }
  ];
  var glutes = muscleGroups.find((muscle) => muscle.id === "glutes");
  var quads = muscleGroups.find((muscle) => muscle.id === "quads");
  state.workouts = [
    makeWorkout(glutes, 2, 15, { id: "glutes-current", exercise: "Hip Thrust", exerciseId: "hip-thrust" }),
    makeWorkout(quads, 2, 10, { id: "quads-current", exercise: "Previous Quad Exercise", exerciseId: "previous-quads", secondaryMuscles: [] })
  ];
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({
    days: [5, 0],
    averageMinutes: 60,
    priorities: ["glutes"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, ["glutes", "quads"].includes(muscle.id) ? 20 : 10]))
  });
  var plan = buildCoachWeeklyPlan();
  var planned = plan.sessions.flatMap((session) => session.items);
  var directGluteSets = planned.filter((item) => item.muscle.id === "glutes").reduce((sum, item) => sum + item.sets, 0);
  var squatSets = planned.filter((item) => item.exercise.id === "squat").reduce((sum, item) => sum + item.sets, 0);
  ({ projectedGlutes: plan.projected.glutes, directGluteSets, squatSets, maxMinutes: Math.max(...plan.sessions.map((session) => session.totalMinutes)) });
`);

assert(weeklySecondaryStimulusBudget.squatSets > 0, "Expected the weekly plan to retain useful squat work.");
assert(weeklySecondaryStimulusBudget.directGluteSets === 0 || weeklySecondaryStimulusBudget.directGluteSets >= 2, `Expected secondary-credit reconciliation to keep a useful direct Glutes block or remove it entirely, got ${weeklySecondaryStimulusBudget.directGluteSets}.`);
assert(weeklySecondaryStimulusBudget.directGluteSets <= 2, `Expected squat secondary credit to reduce direct Glutes work to the two-set minimum, got ${weeklySecondaryStimulusBudget.directGluteSets} direct and ${weeklySecondaryStimulusBudget.squatSets} squat sets.`);
assert(weeklySecondaryStimulusBudget.projectedGlutes <= 21, `Expected the two-set minimum to keep weekly Glutes projection within one set of the 20-set target, got ${weeklySecondaryStimulusBudget.projectedGlutes}.`);
assert(weeklySecondaryStimulusBudget.maxMinutes <= 63, `Expected every 60-minute weekly session to remain inside the 63-minute hard limit, got ${weeklySecondaryStimulusBudget.maxMinutes}.`);

const todaySecondaryStimulusBudget = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = muscleGroups.map((muscle) => ({
    id: "today-" + muscle.id,
    name: "Today " + muscle.label,
    primaryMuscles: [muscle.id],
    secondaryMuscles: muscle.id === "quads" ? ["glutes"] : [],
    equipment: "machine",
    reps: "8-15",
    rest: "60 sec",
    cue: "Train.",
    userCreated: true
  }));
  state.coachTargetMuscles = ["glutes"];
  state.coachGlobalGrowthMode = "medium";
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, muscle.id === "glutes" ? 15 : 10, {
    exercise: "Previous " + muscle.label,
    exerciseId: "previous-" + muscle.id,
    secondaryMuscles: []
  }));
  var plan = buildTodayPlan(60).sessionPlan;
  var currentGlutes = muscleSetStats().find((stat) => stat.id === "glutes").sets;
  var plannedCredits = plan.items.reduce((sum, item) => sum + (coachExerciseStimulusCredits(item.exercise, item.sets).glutes || 0), 0);
  ({ projectedGlutes: currentGlutes + plannedCredits, totalMinutes: plan.totalMinutes, ids: plan.items.map((item) => item.exercise.id) });
`);

assert(todaySecondaryStimulusBudget.ids.includes("today-quads"), "Expected Today to retain useful Quad work with secondary Glute stimulus.");
assert(todaySecondaryStimulusBudget.projectedGlutes <= 20.5, `Expected Today to reduce redundant direct Glute work after secondary credit, got ${todaySecondaryStimulusBudget.projectedGlutes}.`);
assert(todaySecondaryStimulusBudget.totalMinutes <= 63, `Expected the 60-minute Today plan to remain inside the 63-minute hard limit, got ${todaySecondaryStimulusBudget.totalMinutes}.`);

const archivedExerciseSafety = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "active-curl", name: "Active Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Curl.", userCreated: true },
    { id: "archived-curl", name: "Archived Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: "dumbbells", reps: "8-15", rest: "60 sec", cue: "Curl.", userCreated: true, archivedAt: "2026-06-16T12:00:00.000Z" }
  ];
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 40, priorities: ["biceps"], targets: { biceps: 20 } });
  var week = buildCoachWeeklyPlan();
  var today = buildTodayPlan(40);
  ({
    weekIds: week.sessions.flatMap((session) => session.items.map((item) => item.exercise.id)),
    todayIds: today.sessionPlan.items.map((item) => item.exercise.id),
    activeArchived: isActiveCoachExercise({ id: "archived-curl" })
  });
`);

assert(!archivedExerciseSafety.weekIds.includes("archived-curl"), "Expected regenerated Week plans to exclude archived exercises.");
assert(!archivedExerciseSafety.todayIds.includes("archived-curl"), "Expected Today plans to exclude archived exercises.");
assert.strictEqual(archivedExerciseSafety.activeArchived, false, "Expected the final Coach exercise guard to reject archived definitions.");

const weeklyAttainmentWarning = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 10));
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({
    days: [3, 4],
    averageMinutes: 60,
    priorities: ["biceps"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "biceps" ? 30 : 10]))
  });
  var plan = buildCoachWeeklyPlan();
  ({
    fits: plan.capacity.fits,
    estimatedCapacity: plan.capacity.estimatedSetCapacity,
    requestedSets: plan.capacity.requestedSets,
    targetMet: plan.attainment.targetMet,
    priorityMet: plan.attainment.priorityMet,
    priorityTotal: plan.attainment.priorityTotal,
    message: plan.capacity.message,
    markup: renderCoachWeek()
  });
`);

assert(weeklyAttainmentWarning.requestedSets <= weeklyAttainmentWarning.estimatedCapacity, "Expected this scenario to expose why rough capacity alone is insufficient.");
assert.strictEqual(weeklyAttainmentWarning.fits, false, "Expected weekly capacity status to follow the scheduled projection, not only rough minute capacity.");
assert(weeklyAttainmentWarning.targetMet < 10, "Expected adjacent remaining days to leave at least one defined target unmet.");
assert(weeklyAttainmentWarning.priorityMet < weeklyAttainmentWarning.priorityTotal, "Expected unmet priority targets to be reported explicitly.");
assert(weeklyAttainmentWarning.message.includes("Floors planned:") && weeklyAttainmentWarning.message.includes("Priority targets planned:"), "Expected weekly status to report floor and priority-target attainability.");
assert(weeklyAttainmentWarning.markup.includes("Some weekly targets cannot be planned"), "Expected Coach Week UI to clearly warn when the generated schedule misses targets.");

// The equalizer must clamp floors and debit non-priorities before other priorities.
const weeklyEqualizer = runScenario(`
  ${resetAndHelpers}
  var allTen = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 10]));
  var floorSetup = normalizeCoachWeeklyPlan({ priorities: ["chest"], targets: { ...allTen, chest: 12 } });
  var floorClamp = rebalanceWeeklyTargets({ setup: floorSetup, draggedMuscleId: "chest", requestedRemaining: -5, bankedSets: { ...allTen, chest: 8 }, remainingCapacity: 100 });
  var phaseSetup = normalizeCoachWeeklyPlan({ priorities: ["chest", "biceps"], targets: { ...allTen, chest: 20, biceps: 20, quads: 20, hamstrings: 20 } });
  var nonPriorityPhase = rebalanceWeeklyTargets({ setup: phaseSetup, draggedMuscleId: "chest", requestedRemaining: 15, bankedSets: allTen, remainingCapacity: 40 });
  var prioritySetup = normalizeCoachWeeklyPlan({ priorities: ["chest", "biceps", "triceps"], targets: { ...allTen, chest: 20, biceps: 20, triceps: 20 } });
  var priorityPhase = rebalanceWeeklyTargets({ setup: prioritySetup, draggedMuscleId: "chest", requestedRemaining: 15, bankedSets: allTen, remainingCapacity: 30 });
  var deadlock = rebalanceWeeklyTargets({ setup: normalizeCoachWeeklyPlan({ targets: allTen }), draggedMuscleId: "chest", requestedRemaining: 10, bankedSets: {}, remainingCapacity: 90 });
  var autoFit = fitCoachWeekTargetsToCapacity({
    setup: normalizeCoachWeeklyPlan({ priorities: ["chest"], targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 20])) }),
    bankedSets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 5])),
    remainingCapacity: 60
  });
  var reportTargets = { chest: 20, back: 20, shoulders: 20, biceps: 20, triceps: 20, quads: 18, hamstrings: 20, glutes: 17, calves: 18, abs: 18 };
  var reportFit = fitCoachWeekTargetsToCapacity({
    setup: normalizeCoachWeeklyPlan({ priorities: ["chest", "back", "shoulders", "biceps", "triceps"], targets: reportTargets }),
    bankedSets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 0])),
    remainingCapacity: 106
  });
  var underCapacity = optimizeCoachWeekTargetsToCapacity({
    setup: normalizeCoachWeeklyPlan({ priorities: ["chest", "biceps"], targets: allTen }),
    bankedSets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 0])),
    remainingCapacity: 120
  });
  var optimizeWhileOver = optimizeCoachWeekTargetsToCapacity({
    setup: normalizeCoachWeeklyPlan({ priorities: ["chest"], targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 20])) }),
    bankedSets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 0])),
    remainingCapacity: 100
  });
  var reportPriorityTargets = { chest: 20, back: 15, shoulders: 20, biceps: 20, triceps: 20, quads: 11.4, hamstrings: 12.3, glutes: 11.7, calves: 11.7, abs: 20 };
  var projectionGuard = optimizeCoachWeekTargetsToCapacity({
    setup: normalizeCoachWeeklyPlan({ priorities: ["chest", "back", "shoulders", "biceps", "triceps", "abs"], targets: reportPriorityTargets }),
    bankedSets: { chest: 9, back: 10, shoulders: 10, biceps: 4, triceps: 8, quads: 4, hamstrings: 6, glutes: 6, calves: 6, abs: 6 },
    projectedSets: { chest: 20, back: 15, shoulders: 19.5, biceps: 20, triceps: 18.5, quads: 14, hamstrings: 13, glutes: 12.5, calves: 11.5, abs: 18.5 },
    remainingCapacity: 95
  });
  var absExercise = { id: "abs-priority", name: "Abs Priority", primaryMuscles: ["abs"], secondaryMuscles: [], rest: "60 sec", loadingStyle: "standard", exerciseType: "isolation" };
  var quadExercise = { id: "quad-donor", name: "Quad Donor", primaryMuscles: ["quads"], secondaryMuscles: [], rest: "60 sec", loadingStyle: "standard", exerciseType: "isolation" };
  var reallocationSetup = normalizeCoachWeeklyPlan({ averageMinutes: 60, priorities: ["abs"], targets: { ...allTen, abs: 20, quads: 14 } });
  var reallocationProjected = { ...allTen, abs: 18, quads: 14 };
  var reallocationSessions = [{ status: "planned", totalMinutes: 30, items: [
    { muscle: muscleGroups.find((muscle) => muscle.id === "abs"), exercise: absExercise, sets: 6 },
    { muscle: muscleGroups.find((muscle) => muscle.id === "quads"), exercise: quadExercise, sets: 4 }
  ] }];
  reallocateCoachWeeklyPriorityShortfalls(reallocationSessions, reallocationProjected, reallocationSetup.targets, reallocationSetup);
  var replacementProjected = { ...allTen, abs: 18, quads: 14 };
  var replacementSessions = [{ status: "planned", date: todayISO(), totalMinutes: 15, usedExercises: new Set(["quad-donor"]), items: [
    { muscle: muscleGroups.find((muscle) => muscle.id === "quads"), exercise: quadExercise, sets: 4 }
  ] }];
  reallocateCoachWeeklyPriorityShortfalls(replacementSessions, replacementProjected, reallocationSetup.targets, reallocationSetup);
  ({ floorClamp, nonPriorityPhase, priorityPhase, deadlock, autoFit, reportFit, underCapacity, optimizeWhileOver, projectionGuard, reallocationProjected, reallocationSessions, replacementProjected, replacementSessions });
`);

assert.strictEqual(weeklyEqualizer.floorClamp.denied, false, "Expected a below-floor drag to clamp rather than fail.");
assert.strictEqual(weeklyEqualizer.floorClamp.targets.chest, 10, "Expected Chest to remain at its protected 10-set weekly floor.");
assert.strictEqual(weeklyEqualizer.nonPriorityPhase.targets.chest, 25, "Expected the dragged Chest target to win its requested capacity.");
assert.strictEqual(weeklyEqualizer.nonPriorityPhase.targets.biceps, 20, "Expected another priority to remain untouched while non-priority donors have room.");
assert.strictEqual(weeklyEqualizer.nonPriorityPhase.targets.quads, 17.5, "Expected Quads to donate its proportional half of the phase-one cost.");
assert.strictEqual(weeklyEqualizer.nonPriorityPhase.targets.hamstrings, 17.5, "Expected Hamstrings to donate its proportional half of the phase-one cost.");
assert.deepEqual(weeklyEqualizer.nonPriorityPhase.bleed.priority, [], "Expected strict phase one to avoid priority bleed.");
assert.deepEqual(weeklyEqualizer.nonPriorityPhase.bleed.nonPriority.map((item) => item.muscleId).sort(), ["hamstrings", "quads"], "Expected proportional phase-one bleed from eligible non-priorities.");
assert.strictEqual(weeklyEqualizer.priorityPhase.targets.chest, 25, "Expected dragged Chest to retain its phase-two target.");
assert.strictEqual(weeklyEqualizer.priorityPhase.targets.biceps, 17.5, "Expected Biceps to share priority-phase cost proportionally.");
assert.strictEqual(weeklyEqualizer.priorityPhase.targets.triceps, 17.5, "Expected Triceps to share priority-phase cost proportionally.");
assert.deepEqual(weeklyEqualizer.priorityPhase.bleed.priority.map((item) => item.muscleId).sort(), ["biceps", "triceps"], "Expected phase-two bleed only after non-priorities reach their floors.");
assert.strictEqual(weeklyEqualizer.deadlock.denied, true, "Expected a true all-floor capacity deadlock to be denied.");
assert.strictEqual(weeklyEqualizer.autoFit.denied, false, "Expected reduced day/time capacity to auto-fit targets when all protected floors still fit.");
assert.strictEqual(weeklyEqualizer.autoFit.targets.chest, 20, "Expected auto-fit to preserve a selected priority before reducing non-priority growth targets.");
assert.strictEqual(Object.values(weeklyEqualizer.autoFit.targets).reduce((sum, value) => sum + value, 0), 110, "Expected auto-fit targets to consume the 60 remaining sets plus 50 already banked sets.");
assert.strictEqual(weeklyEqualizer.reportFit.denied, false, "Expected the reported 106-set capacity to fit because all ten protected floors require only 100 sets.");
assert(Math.abs(Object.values(weeklyEqualizer.reportFit.targets).reduce((sum, value) => sum + value, 0) - 106) < 0.001, "Expected Fix Over Capacity to reduce the report's 191 requested sets to exactly 106.");
assert.strictEqual(weeklyEqualizer.underCapacity.denied, false, "Expected Optimize Under Capacity to accept available room.");
assert.strictEqual(Object.values(weeklyEqualizer.underCapacity.targets).reduce((sum, value) => sum + value, 0), 120, "Expected Optimize Under Capacity to consume all 20 available sets.");
assert.strictEqual(weeklyEqualizer.underCapacity.targets.chest, 20, "Expected prioritized Chest to fill toward 20 before non-priority growth work.");
assert.strictEqual(weeklyEqualizer.underCapacity.targets.biceps, 20, "Expected prioritized Biceps to fill toward 20 before non-priority growth work.");
assert.strictEqual(weeklyEqualizer.optimizeWhileOver.denied, true, "Expected the under-capacity optimizer never to conceal or lower an over-capacity request.");
assert.strictEqual(weeklyEqualizer.projectionGuard.targets.back, 15, "Expected Optimize Under Capacity to preserve Back's explicit 15-set target while another priority is underplanned.");
assert.strictEqual(weeklyEqualizer.projectionGuard.targets.abs, 20, "Expected an underplanned Abs projection to retain its explicit 20-set target for session reallocation.");
assert(weeklyEqualizer.projectionGuard.reason.includes("Abs"), "Expected the optimizer to identify projected priority shortfalls instead of inflating a satisfied target.");
assert.strictEqual(weeklyEqualizer.reallocationProjected.abs, 20, "Expected removable non-priority work to be reassigned until the Abs priority reaches its target.");
assert(weeklyEqualizer.reallocationProjected.quads >= 10, "Expected priority reallocation to preserve the non-priority weekly floor.");
assert.strictEqual(weeklyEqualizer.reallocationSessions[0].items.find((item) => item.muscle.id === "abs").sets, 8, "Expected the existing priority exercise to receive the reclaimed sets.");
assert.strictEqual(weeklyEqualizer.replacementProjected.abs, 20, "Expected a missing priority item to replace optional non-priority work when a session is full.");
assert.strictEqual(weeklyEqualizer.replacementSessions[0].items[0].muscle.id, "abs", "Expected the replacement session slot to belong to the unmet priority.");
assert(!appCode.includes("state.coachWeekFormPreview = coachWeeklyPlanFromForm(form);\n  persistCoachWeekFormPreview();\n  updateCoachWeekCapacityProgressDom(form, state.coachWeekFormPreview"), "Expected capacity actions to store calculated targets directly instead of rereading potentially stale hidden inputs.");
assert(/async "coach-week-fix-over"\(\)[\s\S]*?await render\(\);[\s\S]*?toast\(/.test(appCode), "Expected Fix Over Capacity to rerender from its authoritative fitted preview before reporting success.");
assert(/async "coach-week-optimize-under"\(\)[\s\S]*?await render\(\);[\s\S]*?toast\(/.test(appCode), "Expected Optimize Under Capacity to rerender from its authoritative optimized preview before reporting success.");
assert(appCode.includes('data-action="coach-week-fix-over">Fix Over Capacity') && appCode.includes('data-action="coach-week-optimize-under">Optimize Under Capacity'), "Expected separate one-way weekly capacity controls.");
assert(!appCode.includes('data-action="coach-week-auto-fit">Fit capacity'), "Expected the ambiguous Fit capacity control to be removed.");

// Toggling Wednesday must change the exact remaining schedule and its projection without any alternate plan source.
const weeklyExactDays = runScenario(`
  ${resetAndHelpers}
  var targets = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 20]));
  var withoutWednesday = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [4, 5, 6], averageMinutes: 60, priorities: ["chest", "back"], targets }));
  var withWednesday = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [3, 4, 5, 6], averageMinutes: 60, priorities: ["chest", "back"], targets }));
  ({
    emptyDays: normalizeCoachWeeklyPlan({ days: [] }).days,
    withoutDates: withoutWednesday.sessions.filter((session) => session.status === "planned").map((session) => session.date),
    withDates: withWednesday.sessions.filter((session) => session.status === "planned").map((session) => session.date),
    withoutProjected: withoutWednesday.projected,
    withProjected: withWednesday.projected,
    markup: renderCoachWeekDistribution(withoutWednesday)
  });
`);

assert.deepEqual(weeklyExactDays.emptyDays, [], "Expected an explicit zero-day selection to stay empty for Generate validation.");
assert(!weeklyExactDays.withoutDates.includes("2026-06-17"), "Expected Wednesday to remain excluded when its checkbox is off.");
assert(weeklyExactDays.withDates.includes("2026-06-17"), "Expected Wednesday to be included only when explicitly selected.");
assert.notDeepEqual(weeklyExactDays.withoutProjected, weeklyExactDays.withProjected, "Expected selected-day changes to alter the generated weekly projection.");
assert(!weeklyExactDays.markup.includes("allocated"), "Expected the distribution to remove the confusing internal allocated value.");
assert(weeklyExactDays.markup.includes("banked") && weeklyExactDays.markup.includes("projected") && weeklyExactDays.markup.includes("target"), "Expected the distribution to expose one coherent committed plan summary.");
assert(!appCode.includes("coachWeeklyAdjustmentOptions") && !appCode.includes("Coach adjustment"), "Expected the competing adjustment advisor plan source to be retired.");

// Generated weekly credits must become the committed fader targets so the equalizer and distribution cannot disagree.
const weeklyGeneratedTargetsBecomeAuthoritative = runScenario(`
  ${resetAndHelpers}
  var requestedTargets = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "shoulders" ? 20 : muscle.id === "back" ? 12.8 : 10]));
  var setup = normalizeCoachWeeklyPlan({ days: [1, 2, 4, 5, 6], averageMinutes: 75, priorities: ["shoulders"], targets: requestedTargets });
  var projected = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "shoulders" ? 18 : muscle.id === "back" ? 14 : 10]));
  var generated = {
    setup,
    sessions: [],
    actualStats: muscleGroups.map((muscle) => ({ ...muscle, sets: 0 })),
    projected,
    setBudgets: requestedTargets,
    missing: [],
    attainment: coachWeeklyAttainment(setup, projected),
    capacity: { totalMinutes: 375, estimatedSetCapacity: 120, allocatedSetCapacity: 120, requestedSets: 120, fits: false, message: "Requested targets did not all fit." }
  };
  var finalized = finalizeCoachWeeklyGeneratedPlan(setup, generated);
  ({
    shoulderTarget: finalized.setup.targets.shoulders,
    shoulderProjected: finalized.projected.shoulders,
    backTarget: finalized.setup.targets.back,
    backProjected: finalized.projected.back,
    unmet: finalized.attainment.unmet.length,
    adjustments: finalized.targetAdjustments,
    markup: renderCoachWeekDistribution(finalized)
  });
`);

assert.strictEqual(weeklyGeneratedTargetsBecomeAuthoritative.shoulderTarget, 18, "Expected an unschedulable 20-set Shoulder request to commit the generated 18-set target.");
assert.strictEqual(weeklyGeneratedTargetsBecomeAuthoritative.shoulderProjected, 18, "Expected the committed Shoulder target and projection to agree.");
assert.strictEqual(weeklyGeneratedTargetsBecomeAuthoritative.backTarget, 14, "Expected incidental secondary stimulus to be reflected in the committed Back target.");
assert.strictEqual(weeklyGeneratedTargetsBecomeAuthoritative.backProjected, 14, "Expected the committed Back target and projection to agree.");
assert.strictEqual(weeklyGeneratedTargetsBecomeAuthoritative.unmet, 0, "Expected a committed generated plan to contain no target/display shortfalls.");
assert(weeklyGeneratedTargetsBecomeAuthoritative.adjustments.some((item) => item.id === "shoulders" && item.requested === 20 && item.committed === 18), "Expected the Shoulder adjustment to remain explainable.");
assert(weeklyGeneratedTargetsBecomeAuthoritative.markup.includes("18 projected / 18 target"), "Expected Weekly distribution to render the same Shoulder values as the committed fader.");

// An impossible floor remains a hard error rather than being relabeled as a feasible lower target.
const weeklyGeneratedTargetsProtectFloor = runScenario(`
  ${resetAndHelpers}
  var setup = normalizeCoachWeeklyPlan({ days: [3], averageMinutes: 30, targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 10])) });
  var projected = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "chest" ? 8 : 10]));
  var generated = {
    setup,
    sessions: [],
    actualStats: muscleGroups.map((muscle) => ({ ...muscle, sets: 0 })),
    projected,
    setBudgets: setup.targets,
    missing: [],
    attainment: coachWeeklyAttainment(setup, projected),
    capacity: { totalMinutes: 30, estimatedSetCapacity: 20, allocatedSetCapacity: 20, requestedSets: 100, fits: false, message: "Floor shortfall." }
  };
  try {
    finalizeCoachWeeklyGeneratedPlan(setup, generated);
    "no error";
  } catch (error) {
    error.message;
  }
`);

assert(weeklyGeneratedTargetsProtectFloor.includes("10-set floor") && weeklyGeneratedTargetsProtectFloor.includes("Chest"), `Expected an impossible floor to block generation with a precise explanation, got: ${weeklyGeneratedTargetsProtectFloor}`);

// Fader previews must survive unrelated renders, use muscle artwork, and report live remaining capacity.
const weeklyFaderStability = runScenario(`
  ${resetAndHelpers}
  state.settings.coachWeeklyPlan = normalizeCoachWeeklyPlan({ days: [1, 5, 6], averageMinutes: 60, targets: { chest: 10 } });
  state.coachWeekFormPreview = normalizeCoachWeeklyPlan({ days: [5, 6], averageMinutes: 40, priorities: ["chest"], targets: { chest: 24 } });
  var firstRender = renderCoachWeek();
  state.settings.lastRecordSyncAt = "2026-06-17T12:01:00.000Z";
  var secondRender = renderCoachWeek();
  var allTen = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 10]));
  var available = coachWeekCapacityProgress(normalizeCoachWeeklyPlan({ targets: allTen }), {}, 120);
  var over = coachWeekCapacityProgress(normalizeCoachWeeklyPlan({ targets: allTen }), {}, 90);
  ({ firstRender, secondRender, available, over });
`);

assert(weeklyFaderStability.firstRender.includes("2 days - 40 min average") && weeklyFaderStability.secondRender.includes("2 days - 40 min average"), "Expected session-local weekly controls to survive a background-style rerender.");
assert(weeklyFaderStability.secondRender.includes("24 target") && weeklyFaderStability.secondRender.includes("Changes not generated yet."), "Expected the unsaved Chest fader and dirty state to remain visible after rerender.");
assert(weeklyFaderStability.secondRender.includes("assets/muscles/chest.png") && weeklyFaderStability.secondRender.includes("assets/muscles/bicep.png"), "Expected fader knobs to use the corresponding muscle artwork.");
assert(weeklyFaderStability.secondRender.includes('data-action="coach-week-quick-pick" data-target="10"') && weeklyFaderStability.secondRender.includes('data-target="15"') && weeklyFaderStability.secondRender.includes('data-target="20"'), "Expected mobile-safe all-10, all-15, and all-20 weekly quick picks.");
assert.strictEqual(weeklyFaderStability.available.available, 20, "Expected the progress helper to report unassigned estimated capacity.");
assert.strictEqual(weeklyFaderStability.available.label, "20 sets left", "Expected the white bar label to state how many sets remain.");
assert.strictEqual(weeklyFaderStability.over.over, 10, "Expected over-capacity protected targets to be reported explicitly.");
assert.strictEqual(weeklyFaderStability.over.label, "10 sets over capacity", "Expected constrained weeks to avoid a misleading zero-left label.");
assert(appCode.includes("COACH_WEEK_PREVIEW_STORAGE_KEY") && appCode.includes("restoreCoachWeekFormPreview"), "Expected unsaved weekly fader choices to survive an app-shell refresh during the same week.");

const weeklyFaderRefreshRecovery = runScenario(`
  ${resetAndHelpers}
  state.coachWeekFormPreview = normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 40, priorities: ["chest"], targets: { chest: 24 } });
  persistCoachWeekFormPreview();
  state.coachWeekFormPreview = null;
  var restored = restoreCoachWeekFormPreview();
  ({ restored, days: state.coachWeekFormPreview.days, minutes: state.coachWeekFormPreview.averageMinutes, chest: state.coachWeekFormPreview.targets.chest });
`);

assert.strictEqual(weeklyFaderRefreshRecovery.restored, true, "Expected a same-week app-shell refresh to restore unsaved fader choices.");
assert.deepEqual(weeklyFaderRefreshRecovery.days, [5], "Expected the exact unsaved workout-day selection to survive refresh.");
assert.strictEqual(weeklyFaderRefreshRecovery.minutes, 40, "Expected the unsaved timeframe to survive refresh.");
assert.strictEqual(weeklyFaderRefreshRecovery.chest, 24, "Expected the unsaved Chest fader target to survive refresh.");

const weeklyStimulusAwareCapacity = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{ id: "capacity-iso", name: "Capacity Isolation", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60 sec", userCreated: true }];
  var isolationCapacity = coachWeeklyCapacity(normalizeCoachWeeklyPlan({ averageMinutes: 60 }), [{ date: "2026-06-19" }]).estimatedSetCapacity;
  state.settings.customExercises = [{ id: "capacity-compound", name: "Capacity Compound", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "60 sec", userCreated: true }];
  var compoundCapacity = coachWeeklyCapacity(normalizeCoachWeeklyPlan({ averageMinutes: 60 }), [{ date: "2026-06-19" }]).estimatedSetCapacity;
  ({ isolationCapacity, compoundCapacity });
`);

assert(weeklyStimulusAwareCapacity.isolationCapacity > 0, "Expected active exercise timing to produce usable weekly capacity.");
assert(weeklyStimulusAwareCapacity.compoundCapacity > weeklyStimulusAwareCapacity.isolationCapacity, `Expected secondary stimulus credits to increase estimated weekly capacity, got ${JSON.stringify(weeklyStimulusAwareCapacity)}.`);

// Coach must omit an exercise rather than prescribe a one-set fragment in Today or Week.
const coachExerciseSetMinimum = runScenario(`
  ${resetAndHelpers}
  var todayPlan = buildSessionPlan(60);
  var weeklyPlan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({
    days: [3, 4, 5, 6],
    averageMinutes: 60,
    priorities: ["chest"],
    targets: Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, muscle.id === "chest" ? 20 : 10]))
  }));
  ({
    todaySets: todayPlan.items.map((item) => item.sets),
    weeklySets: weeklyPlan.sessions.flatMap((session) => session.items.map((item) => item.sets))
  });
`);

assert(coachExerciseSetMinimum.todaySets.length > 0 && coachExerciseSetMinimum.todaySets.every((sets) => sets >= 2), `Expected every Today exercise to have at least two sets, got ${coachExerciseSetMinimum.todaySets.join(", ")}`);
assert(coachExerciseSetMinimum.weeklySets.length > 0 && coachExerciseSetMinimum.weeklySets.every((sets) => sets >= 2), `Expected every weekly exercise to have at least two sets, got ${coachExerciseSetMinimum.weeklySets.join(", ")}`);

const coachPlanDirections = runScenario(`
  ({
    up: coachPlanDirectionIndicator({ kind: "progression", tone: "up", label: "Add a rep", detail: "1-3 RIR", message: "Progressing" }),
    down: coachPlanDirectionIndicator({ kind: "reset", tone: "warn", label: "Reset load", detail: "1-2 RIR", message: "Regressing" }),
    transition: coachPlanDirectionIndicator({ kind: "style-conversion", tone: "flat", label: "High-rep baseline", detail: "1-3 RIR", message: "Establish baseline" })
  });
`);

assert(coachPlanDirections.up.includes("load-direction-indicator up") && coachPlanDirections.up.includes("\u2191"), "Expected progressing Coach exercises to show a green up direction.");
assert(coachPlanDirections.down.includes("load-direction-indicator down") && coachPlanDirections.down.includes("\u2193"), "Expected regressing Coach exercises to show a red down direction.");
assert(coachPlanDirections.transition.includes("load-direction-indicator neutral") && coachPlanDirections.transition.includes("\u2192"), "Expected loading-style transitions to show an honest hold/baseline direction instead of a false up/down verdict.");

// The time estimator must use raw seconds, explicit exercise types, and one shared loading-style resolver.
const coachTimeEstimatorRules = runScenario(`
  ${resetAndHelpers}
  var compound = normalizeExerciseDefinition({ id: "timed-compound", name: "Timed Compound", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "60 sec" });
  var isolation = normalizeExerciseDefinition({ id: "timed-isolation", name: "Timed Isolation", primaryMuscles: ["biceps"], secondaryMuscles: ["shoulders"], exerciseType: "isolation", loadingStyle: "high-rep", reps: "20-30", rest: "60 sec" });
  var legacy = normalizeExerciseDefinition({ id: "timed-legacy", name: "Timed Legacy", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], reps: "8-15", rest: "60 sec" });
  var legacyIsolation = normalizeExerciseDefinition({ id: "timed-legacy-isolation", name: "Timed Legacy Isolation", primaryMuscles: ["biceps"], secondaryMuscles: [], reps: "8-15", rest: "60 sec" });
  ({
    compoundType: exerciseTimingType(compound),
    isolationType: exerciseTimingType(isolation),
    legacyType: exerciseTimingType(legacy),
    legacyIsolationType: exerciseTimingType(legacyIsolation),
    compoundSeconds: estimateExerciseRawSeconds(compound, 4, { restSeconds: 120 }),
    isolationSeconds: estimateExerciseRawSeconds(isolation, 4, { restSeconds: 60 }),
    legacySeconds: estimateExerciseRawSeconds(legacy, 1, { restSeconds: 60 }),
    zeroSeconds: estimateExerciseRawSeconds(compound, 0, { restSeconds: 120 }),
    styles: [
      effectiveLoadingStyle({ loadingStyle: "standard", reps: "20-30" }),
      effectiveLoadingStyle({ loadingStyle: "high-rep", reps: "8-15" }),
      effectiveLoadingStyle({ loadingStyle: "auto", reps: "20-30" }),
      effectiveLoadingStyle({ loadingStyle: "bogus", reps: "" })
    ],
    noDoubleRound: correctedSessionEstimateMinutes(61, 1.1)
  });
`);

assert.strictEqual(coachTimeEstimatorRules.compoundType, "compound", "Expected explicit Compound timing classification.");
assert.strictEqual(coachTimeEstimatorRules.isolationType, "isolation", "Expected explicit Isolation to stay Isolation despite secondary muscles.");
assert.strictEqual(coachTimeEstimatorRules.legacyType, "compound", "Expected a legacy exercise with secondary muscles to default to Compound.");
assert.strictEqual(coachTimeEstimatorRules.legacyIsolationType, "isolation", "Expected a legacy exercise without secondary muscles to default to Isolation.");
assert.strictEqual(coachTimeEstimatorRules.compoundSeconds, 720, "Expected four Standard Compound sets with 120-second rest to take 720 raw seconds.");
assert.strictEqual(coachTimeEstimatorRules.isolationSeconds, 480, "Expected four High-rep Isolation sets with 60-second rest to take 480 raw seconds.");
assert.strictEqual(coachTimeEstimatorRules.legacySeconds, 225, "Expected one inferred Compound Standard set to use 180-second setup and no rest.");
assert.strictEqual(coachTimeEstimatorRules.zeroSeconds, 0, "Expected zero sets to contribute zero time.");
assert.deepEqual(coachTimeEstimatorRules.styles, ["standard", "high-rep", "high-rep", "standard"], "Expected one loading-style helper to resolve explicit, Auto, and invalid values.");
assert.strictEqual(coachTimeEstimatorRules.noDoubleRound, 2, "Expected correction to apply to raw seconds before the single final ceiling.");

// Recent rest must prefer IDs and reject ambiguous legacy name fallback.
const coachTimeRestIdentity = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "curl-a", name: "Cable Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "90-120 sec" },
    { id: "curl-b", name: "Cable-Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60 sec" }
  ];
  var target = normalizeExerciseDefinition(state.settings.customExercises[0]);
  state.workouts = [
    { id: "r1", date: "2026-06-16", exerciseId: "curl-a", exercise: "Cable Curl", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 120 }, { reps: 10, restSeconds: 120 }] },
    { id: "r2", date: "2026-06-15", exerciseId: "curl-a", exercise: "Cable Curl", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 90 }] },
    { id: "r3", date: "2026-06-14", exerciseId: "curl-a", exercise: "Cable Curl", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 105 }] },
    { id: "r4", date: "2026-06-13", exerciseId: "curl-b", exercise: "Cable Curl", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 300 }] },
    { id: "r5", date: "2026-06-12", exercise: "Cable Curl", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 400 }] },
    { id: "r6", date: "2026-06-11", exerciseId: "curl-a", exercise: "Cable Curl", loadingStyle: "high-rep", setRows: [{ reps: 25, restSeconds: 500 }] }
  ];
  ({ rest: recentRestSecondsForExercise(target), source: exerciseRestEstimate(target).source });
`);

assert.strictEqual(coachTimeRestIdentity.rest, 105, "Expected latest three exact-ID same-style session averages to produce 105 seconds.");
assert.strictEqual(coachTimeRestIdentity.source, "history", "Expected valid recent history to be identified as the rest source.");

const coachTimeRejectsOutOfRangeRest = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [{ id: "rest-guard", name: "Rest Guard", primaryMuscles: ["quads"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec" }];
  var target = normalizeExerciseDefinition(state.settings.customExercises[0]);
  state.workouts = [{ id: "short-rest", date: "2026-06-16", exerciseId: "rest-guard", exercise: "Rest Guard", loadingStyle: "standard", setRows: [{ reps: 10, restSeconds: 31 }, { reps: 10, restSeconds: 31 }] }];
  exerciseRestEstimate(target);
`);

assert.strictEqual(coachTimeRejectsOutOfRangeRest.seconds, 90, "Expected rest history below the configured range to fall back to its 90-second midpoint.");
assert.strictEqual(coachTimeRejectsOutOfRangeRest.source, "configured", "Expected rejected rest history to report the configured fallback source.");

const weeklyLogicalTimeFill = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "fill-back", name: "Fill Back", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true },
    { id: "fill-squat", name: "Fill Squat", primaryMuscles: ["quads"], secondaryMuscles: ["hamstrings", "glutes"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true },
    { id: "fill-calf-a", name: "Fill Calf A", primaryMuscles: ["calves"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true },
    { id: "fill-glutes", name: "Fill Glutes", primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true },
    { id: "fill-calf-b", name: "Fill Calf B", primaryMuscles: ["calves"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true },
    { id: "fill-legs", name: "Fill Legs", primaryMuscles: ["quads"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "60-120 sec", userCreated: true }
  ];
  var actual = { chest: 10, back: 8, shoulders: 10, biceps: 10, triceps: 10, quads: 4, hamstrings: 10, glutes: 5, calves: 0, abs: 10 };
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 3, actual[muscle.id], { exercise: "Previous " + muscle.label, exerciseId: "previous-" + muscle.id, secondaryMuscles: [] }));
  var targets = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 10]));
  var plan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [5], averageMinutes: 60, priorities: [], targets }));
  var session = plan.sessions.find((item) => item.status === "planned");
  ({ minutes: session.totalMinutes, itemCount: session.items.length, sets: session.items.map((item) => item.sets) });
`);

assert(weeklyLogicalTimeFill.minutes >= 50 && weeklyLogicalTimeFill.minutes <= 63, `Expected a logical one-hour weekly session to estimate within 5-10 minutes of the selection, got ${weeklyLogicalTimeFill.minutes}.`);
assert(weeklyLogicalTimeFill.itemCount <= 6, `Expected time fill to preserve the six-exercise cap, got ${weeklyLogicalTimeFill.itemCount}.`);
assert(weeklyLogicalTimeFill.sets.some((sets) => sets > 4), `Expected remaining time to add safe sets to an existing exercise, got ${weeklyLogicalTimeFill.sets.join(", ")}.`);

// Current-week and Coach calculations must never include submitted entries dated after today.
const futureDatedEntriesExcluded = runScenario(`
  ${resetAndHelpers}
  state.workouts = [
    makeWorkout(muscleGroups.find((muscle) => muscle.id === "chest"), 0, 3, { id: "today-chest" }),
    { ...makeWorkout(muscleGroups.find((muscle) => muscle.id === "biceps"), 0, 9, { id: "future-biceps" }), date: "2026-06-24" }
  ];
  ({
    weeklyIds: weeklyWorkouts().map((entry) => entry.id),
    coachIds: coachWorkoutEntries().map((entry) => entry.id)
  });
`);

assert.deepEqual(futureDatedEntriesExcluded.weeklyIds, ["today-chest"], "Expected the current training week to stop at today.");
assert.deepEqual(futureDatedEntriesExcluded.coachIds, ["today-chest"], "Expected future workouts to stay out of Coach history and recency.");

// Exercise selection should prefer useful secondary credit when it closes a selected priority gap.
const targetAwareSecondarySelection = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    { id: "row-only", name: "Row Only", primaryMuscles: ["back"], secondaryMuscles: [], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "90 sec", userCreated: true },
    { id: "pulldown-biceps", name: "Pulldown Biceps", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "90 sec", userCreated: true }
  ];
  state.workouts = [
    { ...makeWorkout({ id: "back" }, 8, 3, { id: "row-history", exercise: "Row Only", exerciseId: "row-only", primaryMuscles: ["back"], secondaryMuscles: [] }) },
    { ...makeWorkout({ id: "biceps" }, 3, 10, { id: "biceps-history", exercise: "Old Curl", exerciseId: "old-curl", primaryMuscles: ["biceps"], secondaryMuscles: [] }) }
  ];
  var needs = {
    back: { floorGap: 0, priorityGap: 8 },
    biceps: { floorGap: 0, priorityGap: 6 }
  };
  coachExerciseCandidates("back", new Set(), { stimulusNeeds: needs })[0].exercise.id;
`);

assert.strictEqual(targetAwareSecondarySelection, "pulldown-biceps", "Expected Coach to value secondary stimulus that closes an unmet priority target.");

const weeklyPlanUsesTargetAwareSecondary = runScenario(`
  ${resetAndHelpers}
  state.settings.customExercises = [
    ...state.settings.customExercises.filter((exercise) => exercise.id !== "custom-back" && exercise.id !== "custom-biceps"),
    { id: "row-only", name: "Row Only", primaryMuscles: ["back"], secondaryMuscles: [], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "90 sec", userCreated: true },
    { id: "pulldown-biceps", name: "Pulldown Biceps", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], exerciseType: "compound", loadingStyle: "standard", reps: "8-15", rest: "90 sec", userCreated: true },
    { id: "curl", name: "Curl", primaryMuscles: ["biceps"], secondaryMuscles: [], exerciseType: "isolation", loadingStyle: "standard", reps: "8-15", rest: "90 sec", userCreated: true }
  ];
  state.workouts = muscleGroups.flatMap((muscle) => {
    if (muscle.id === "back") return [makeWorkout(muscle, 3, 10, { id: "back-base", exercise: "Old Back", exerciseId: "old-back" })];
    if (muscle.id === "biceps") return [makeWorkout(muscle, 1, 12, { id: "biceps-base", exercise: "Curl", exerciseId: "curl" })];
    return [makeWorkout(muscle, 3, 10, { id: muscle.id + "-base" })];
  });
  state.workouts.push(makeWorkout({ id: "back" }, 8, 3, { id: "row-history", exercise: "Row Only", exerciseId: "row-only", primaryMuscles: ["back"], secondaryMuscles: [] }));
  var targets = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, ["back", "biceps"].includes(muscle.id) ? 20 : 10]));
  var plan = buildCoachWeeklyPlan(normalizeCoachWeeklyPlan({ days: [3], averageMinutes: 60, priorities: ["back", "biceps"], targets }));
  var session = plan.sessions.find((item) => item.status === "planned");
  ({ exercises: session.items.map((item) => item.exercise.id), projectedBiceps: plan.projected.biceps });
`);

assert(weeklyPlanUsesTargetAwareSecondary.exercises.includes("pulldown-biceps"), `Expected the weekly plan to choose Back work that also closes Biceps priority volume, got ${weeklyPlanUsesTargetAwareSecondary.exercises.join(", ")}.`);
assert(weeklyPlanUsesTargetAwareSecondary.projectedBiceps > 12, "Expected the selected compound to add secondary Biceps credit to the weekly projection.");

assert(!appCode.includes("if (coachWeekForm.isConnected) render();"), "Expected pending weekly form changes not to rerender and replace the committed plan before Generate.");

console.log("coach regression tests passed");
