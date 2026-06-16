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

assert(dailyMuscleCap.muscles.length <= 5, `Expected Coach to cap new daily muscles at 5, got ${dailyMuscleCap.muscles.length}: ${dailyMuscleCap.muscles.join(", ")}`);

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

const activeDraftUpdatesCoachPlan = runScenario(`
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
  ({ sets: bicepsStat.sets, sessions: bicepsStat.sessions });
`);

assert.strictEqual(activeDraftUpdatesCoachPlan.sets, 10, `Expected Coach to count active log draft as pending biceps work, got ${activeDraftUpdatesCoachPlan.sets}`);
assert.strictEqual(activeDraftUpdatesCoachPlan.sessions, 2, `Expected pending draft date to count as a Coach touch, got ${activeDraftUpdatesCoachPlan.sessions}`);

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
assert((repeatedFailureRotatesExercise.note + repeatedFailureRotatesExercise.why).includes("deload") || (repeatedFailureRotatesExercise.note + repeatedFailureRotatesExercise.why).includes("stalled"), `Expected repeated failure explanation, got ${repeatedFailureRotatesExercise.note} ${repeatedFailureRotatesExercise.why}`);

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

const targetSelectorReset = runScenario(`
  ${resetAndHelpers}
  state.coachTargetMuscles = ["biceps", "triceps"];
  var markup = renderCoachTargetSelector();
  ({
    hasReset: markup.includes('data-action="clear-coach-targets"'),
    hasCount: markup.includes("2 selected")
  });
`);

assert(targetSelectorReset.hasReset, "Expected target selector to expose a reset choices control when muscles are selected.");
assert(targetSelectorReset.hasCount, "Expected target selector to keep selected count visible.");

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

assert(withinCoachTimeWindow(nearOptimumTimeframe.total, 60), `Expected 18/20 muscles to still fill 1 hour with more muscle slots, got ${nearOptimumTimeframe.total}: ${nearOptimumTimeframe.detail}`);
assert(nearOptimumTimeframe.itemCount <= 5, `Expected 18/20 1 hour plan to honor the 5-muscle cap, got ${nearOptimumTimeframe.itemCount}`);

const highVolumeTimeframe = runScenario(`
  ${resetAndHelpers}
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 20));
  var plan = buildTodayPlan(60);
  ({
    mode: plan.mode,
    total: plan.sessionPlan.totalMinutes,
    hasHighVolumeReason: plan.why.join(" ").includes("High-volume filler"),
    maxProjectedSets: Math.max(...plan.sessionPlan.items.map((item) => item.muscle.sets + item.sets)),
    shortfallReason: plan.sessionPlan.shortfallReason
  });
`);

assert.strictEqual(highVolumeTimeframe.mode, "session", `Expected all-optimum muscles to build a time-fill session, got ${highVolumeTimeframe.mode}`);
assert(highVolumeTimeframe.total < 57, `Expected all-optimum plan to stop short instead of exceeding high-volume limits, got ${highVolumeTimeframe.total}`);
assert(highVolumeTimeframe.hasHighVolumeReason, "Expected all-optimum time-fill plan to label high-volume filler in Why this?");
assert(highVolumeTimeframe.maxProjectedSets <= 22, `Expected high-volume filler to cap projected sets at 22, got ${highVolumeTimeframe.maxProjectedSets}`);
assert(highVolumeTimeframe.shortfallReason.includes("volume limits"), `Expected all-optimum shortfall to explain volume limits, got ${highVolumeTimeframe.shortfallReason}`);

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
assert(withinCoachTimeWindow(restartTimeframe.total, 60), `Expected restart 1 hour plan to fill time with more muscles, got ${restartTimeframe.total}`);
assert(restartTimeframe.itemCount <= 5, `Expected restart 1 hour plan to honor the 5-muscle cap, got ${restartTimeframe.itemCount}`);
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
  state.workouts = muscleGroups.map((muscle) => makeWorkout(muscle, 2, 20));
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
    fits: plan.sessionPlan.totalMinutes <= 63
  });
`);

assert(allUnderdeveloped.fits, `Expected all-underdeveloped plan to fit within time window, got ${allUnderdeveloped.total}`);
assert(withinCoachTimeWindow(allUnderdeveloped.total, 60), `Expected all-underdeveloped 1 hour plan to land near 60 min, got ${allUnderdeveloped.total}`);
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
    hasOptimumReason: plan.why.join(" ").includes("/20 hard sets"),
    maxMuscleSets: Math.max(...plan.sessionPlan.items.map((item) => item.muscle.sets + item.sets)),
    hasTitle: typeof action.title === "string" && action.title.length > 0,
    hasBody: typeof action.body === "string" && action.body.length > 0
  });
`);

assert.strictEqual(optimumPlanAction.mode, "session", `Expected all floor-covered muscles below 20 to build an optimum-volume session, got ${optimumPlanAction.mode}`);
assert(optimumPlanAction.itemCount > 0, "Expected optimum-volume plan to include exercises after minimums are covered.");
assert(withinCoachTimeWindow(optimumPlanAction.total, 60), `Expected optimum-volume 1 hour plan to land near 60 min, got ${optimumPlanAction.total}`);
assert(optimumPlanAction.hasOptimumReason, "Expected optimum-volume reasons to use the 20-set target after the floor is covered.");
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

console.log("coach regression tests passed");
