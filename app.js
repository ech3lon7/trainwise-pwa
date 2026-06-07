"use strict";

const DB_NAME = "trainwise-db";
const DB_VERSION = 2;
const STORES = ["workouts", "metrics", "settings"];
const APP_VERSION = "1.2.0";
const SAMPLE_BATCH = "hypertrophy-demo-v1";

const HYPERTROPHY = {
  minimumSets: 10,
  growthLow: 12,
  growthHigh: 20,
  idealRirMin: 1,
  idealRirMax: 3,
  highRirDiscount: 0.5,
  proteinFloorGPerKg: 1.6,
  proteinUpperGPerKg: 2.2
};

const muscleGroups = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "glutes", label: "Glutes" },
  { id: "calves", label: "Calves" },
  { id: "abs", label: "Abs" }
];

const exerciseLibrary = [
  {
    id: "push-up",
    name: "Push-up",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    equipment: "bodyweight",
    reps: "8-20",
    rest: "60-120 sec",
    cue: "Add a backpack or slow eccentric when 20 reps gets easy."
  },
  {
    id: "dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    equipment: "dumbbells, bench",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Use a deep, controlled stretch and stop 1-3 reps short of failure."
  },
  {
    id: "dumbbell-fly",
    name: "Dumbbell Fly",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders"],
    equipment: "dumbbells, bench",
    reps: "10-20",
    rest: "60-120 sec",
    cue: "Keep the load light enough to control the stretched position."
  },
  {
    id: "dumbbell-row",
    name: "Dumbbell Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["biceps"],
    equipment: "dumbbell",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Pull the elbow toward your hip and pause briefly near the top."
  },
  {
    id: "band-row",
    name: "Band Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["biceps"],
    equipment: "band",
    reps: "12-25",
    rest: "60-120 sec",
    cue: "Use higher reps and a hard squeeze if the band is light."
  },
  {
    id: "pull-up-inverted-row",
    name: "Pull-up / Inverted Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["biceps"],
    equipment: "bar or sturdy table",
    reps: "6-15",
    rest: "90-180 sec",
    cue: "Choose the variation that keeps reps controlled and near failure."
  },
  {
    id: "dumbbell-shoulder-press",
    name: "Dumbbell Shoulder Press",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    equipment: "dumbbells",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Press in a pain-free path and avoid grinding every set."
  },
  {
    id: "lateral-raise",
    name: "Lateral Raise",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: [],
    equipment: "dumbbells or bands",
    reps: "12-25",
    rest: "45-90 sec",
    cue: "Use strict reps; small load jumps go a long way here."
  },
  {
    id: "rear-delt-fly",
    name: "Rear Delt Fly",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["back"],
    equipment: "dumbbells or bands",
    reps: "12-25",
    rest: "45-90 sec",
    cue: "Lead with elbows and keep traps from taking over."
  },
  {
    id: "dumbbell-curl",
    name: "Dumbbell Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    equipment: "dumbbells",
    reps: "8-15",
    rest: "45-90 sec",
    cue: "Control the lowering phase and avoid swinging."
  },
  {
    id: "hammer-curl",
    name: "Hammer Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    equipment: "dumbbells",
    reps: "8-15",
    rest: "45-90 sec",
    cue: "Keep wrists neutral and elbows pinned."
  },
  {
    id: "overhead-triceps-extension",
    name: "Overhead Triceps Extension",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    equipment: "dumbbell or band",
    reps: "10-20",
    rest: "45-90 sec",
    cue: "Use the overhead stretch, but keep elbows comfortable."
  },
  {
    id: "goblet-squat",
    name: "Goblet Squat",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "abs"],
    equipment: "dumbbell",
    reps: "8-20",
    rest: "90-180 sec",
    cue: "Keep depth consistent so progression means something."
  },
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: "dumbbells, bench",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Count one set after both legs are complete."
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "back"],
    equipment: "dumbbells",
    reps: "8-15",
    rest: "90-180 sec",
    cue: "Push hips back and keep tension in the hamstrings."
  },
  {
    id: "hip-thrust-glute-bridge",
    name: "Hip Thrust / Glute Bridge",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: "bodyweight or dumbbell",
    reps: "10-20",
    rest: "60-120 sec",
    cue: "Pause at lockout and add load once reps get easy."
  },
  {
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    equipment: "bodyweight or dumbbells",
    reps: "10-25",
    rest: "45-90 sec",
    cue: "Use a full stretch and pause at the top."
  },
  {
    id: "plank-dead-bug",
    name: "Plank / Dead Bug",
    primaryMuscles: ["abs"],
    secondaryMuscles: [],
    equipment: "bodyweight",
    reps: "30-60 sec",
    rest: "45-90 sec",
    cue: "Progress by adding time, control, or harder variations."
  }
];

const legacyExerciseMetadata = [
  { name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell", reps: "6-12", rest: "90-180 sec" },
  { name: "Squat", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings", "abs"], equipment: "barbell", reps: "6-12", rest: "120-180 sec" },
  { name: "Deadlift", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["back", "quads"], equipment: "barbell", reps: "5-10", rest: "120-180 sec" },
  { name: "Overhead Press", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"], equipment: "barbell", reps: "6-12", rest: "90-180 sec" },
  { name: "Barbell Row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: "barbell", reps: "8-12", rest: "90-180 sec" },
  { name: "Pull-up", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: "bar", reps: "6-15", rest: "90-180 sec" },
  { name: "Incline Dumbbell Press", primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], equipment: "dumbbells, bench", reps: "8-15", rest: "90-180 sec" }
];

const defaultExercises = exerciseLibrary.map((exercise) => exercise.name);

const state = {
  db: null,
  activeTab: "dashboard",
  logMode: "strength",
  selectedExercise: "Push-up",
  workouts: [],
  metrics: [],
  settings: {}
};

const els = {
  app: document.getElementById("app"),
  toast: document.getElementById("toast")
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isoFromLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return isoFromLocalDate(new Date());
}

function dateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return isoFromLocalDate(date);
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

function fmt(num, digits = 0) {
  if (!Number.isFinite(num)) return "--";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(num);
}

function parseNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      let workoutStore;
      if (!db.objectStoreNames.contains("workouts")) {
        workoutStore = db.createObjectStore("workouts", { keyPath: "id" });
        workoutStore.createIndex("date", "date");
        workoutStore.createIndex("exercise", "exercise");
      } else {
        workoutStore = request.transaction.objectStore("workouts");
      }
      if (workoutStore && !workoutStore.indexNames.contains("exerciseId")) {
        workoutStore.createIndex("exerciseId", "exerciseId");
      }

      if (!db.objectStoreNames.contains("metrics")) {
        const store = db.createObjectStore("metrics", { keyPath: "id" });
        store.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeTx(name, mode = "readonly") {
  return state.db.transaction(name, mode).objectStore(name);
}

function dbAll(name) {
  return new Promise((resolve, reject) => {
    const request = storeTx(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(name, value) {
  return new Promise((resolve, reject) => {
    const request = storeTx(name, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function dbDelete(name, id) {
  return new Promise((resolve, reject) => {
    const request = storeTx(name, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbClear(name) {
  return new Promise((resolve, reject) => {
    const request = storeTx(name, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function sortByDateDesc(items) {
  return items.sort((a, b) => {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

async function loadState() {
  const [workouts, metrics, settingsRows] = await Promise.all([
    dbAll("workouts"),
    dbAll("metrics"),
    dbAll("settings")
  ]);
  state.workouts = sortByDateDesc(workouts);
  state.metrics = sortByDateDesc(metrics);
  state.settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
}

async function saveSetting(key, value) {
  state.settings[key] = value;
  await dbPut("settings", { key, value });
}

function recentDays(days) {
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function daysBetween(a, b) {
  const first = parseLocalDate(a);
  const second = parseLocalDate(b);
  return Math.round((second - first) / 86400000);
}

function muscleLabel(id) {
  return muscleGroups.find((muscle) => muscle.id === id)?.label || id;
}

function allExerciseMetadata() {
  return [...exerciseLibrary, ...legacyExerciseMetadata.map((exercise) => ({
    id: `legacy-${normalizeName(exercise.name)}`,
    cue: "Legacy exercise mapped for hypertrophy set tracking.",
    ...exercise
  }))];
}

function resolveExerciseMeta(name, fallbackMuscle = "chest") {
  const normalized = normalizeName(name);
  const byId = allExerciseMetadata().find((exercise) => exercise.id === name);
  const byName = allExerciseMetadata().find((exercise) => normalizeName(exercise.name) === normalized);
  if (byId || byName) return byId || byName;

  return {
    id: `custom-${normalized || "exercise"}`,
    name: name || "Custom exercise",
    primaryMuscles: [fallbackMuscle || "chest"],
    secondaryMuscles: [],
    equipment: "custom",
    reps: "8-15",
    rest: "60-120 sec",
    cue: "Custom exercise. Keep form strict and progress gradually."
  };
}

function workoutMeta(entry) {
  if (Array.isArray(entry.primaryMuscles) && entry.primaryMuscles.length) {
    return {
      id: entry.exerciseId || `custom-${normalizeName(entry.exercise)}`,
      name: entry.exercise,
      primaryMuscles: entry.primaryMuscles,
      secondaryMuscles: Array.isArray(entry.secondaryMuscles) ? entry.secondaryMuscles : [],
      equipment: entry.equipment || "custom",
      reps: "8-15",
      rest: "60-120 sec"
    };
  }
  return resolveExerciseMeta(entry.exercise, entry.targetMuscle);
}

function workoutVolume(workout) {
  return workout.sets * workout.reps * workout.weight;
}

function e1rm(workout) {
  return workout.weight * (1 + workout.reps / 30);
}

function setEffortMultiplier(workout) {
  if (workout.rir === null || workout.rir === undefined || workout.rir === "") return 1;
  return Number(workout.rir) <= HYPERTROPHY.idealRirMax ? 1 : HYPERTROPHY.highRirDiscount;
}

function creditedSetsForWorkout(workout) {
  const meta = workoutMeta(workout);
  const base = Math.max(0, parseNum(workout.sets)) * setEffortMultiplier(workout);
  const credits = {};
  for (const muscle of meta.primaryMuscles || []) {
    credits[muscle] = (credits[muscle] || 0) + base;
  }
  for (const muscle of meta.secondaryMuscles || []) {
    credits[muscle] = (credits[muscle] || 0) + base * 0.5;
  }
  return credits;
}

function weeklyWorkouts() {
  const start = recentDays(7);
  return state.workouts.filter((entry) => parseLocalDate(entry.date) >= start);
}

function getWeeklyVolume() {
  return weeklyWorkouts().reduce((sum, entry) => sum + workoutVolume(entry), 0);
}

function getAverage(field, days) {
  const start = recentDays(days);
  const values = state.metrics
    .filter((entry) => parseLocalDate(entry.date) >= start && entry[field] > 0)
    .map((entry) => entry[field]);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lastMetric(field) {
  return state.metrics.find((entry) => Number.isFinite(entry[field]) && entry[field] > 0);
}

function weightTrend(days = 14) {
  const start = recentDays(days);
  const entries = state.metrics
    .filter((entry) => parseLocalDate(entry.date) >= start && entry.bodyWeight > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length < 2) return null;
  return entries[entries.length - 1].bodyWeight - entries[0].bodyWeight;
}

function proteinTargets() {
  const bodyWeightLb = lastMetric("bodyWeight")?.bodyWeight || 0;
  if (!bodyWeightLb) return { bodyWeightLb: 0, floor: 0, upper: 0 };
  const kg = bodyWeightLb / 2.20462;
  return {
    bodyWeightLb,
    floor: kg * HYPERTROPHY.proteinFloorGPerKg,
    upper: kg * HYPERTROPHY.proteinUpperGPerKg
  };
}

function muscleSetStats() {
  const totals = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 0]));
  const sessions = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, new Set()]));
  const highRir = [];
  const unknown = [];

  for (const workout of weeklyWorkouts()) {
    const meta = workoutMeta(workout);
    const credits = creditedSetsForWorkout(workout);
    const hasTrackedMuscle = Object.keys(credits).some((muscle) => totals[muscle] !== undefined);
    if (!hasTrackedMuscle) unknown.push(workout);

    for (const [muscle, sets] of Object.entries(credits)) {
      if (totals[muscle] === undefined) continue;
      totals[muscle] += sets;
      if (sets > 0) sessions[muscle].add(workout.date);
    }

    if (workout.rir !== null && workout.rir !== undefined && workout.rir !== "" && Number(workout.rir) > HYPERTROPHY.idealRirMax) {
      highRir.push({ ...workout, meta });
    }
  }

  return muscleGroups.map((muscle) => {
    const sets = totals[muscle.id];
    return {
      ...muscle,
      sets,
      sessions: sessions[muscle.id].size,
      percent: Math.min(100, (sets / HYPERTROPHY.minimumSets) * 100),
      zone: setZone(sets),
      deficit: Math.max(0, HYPERTROPHY.minimumSets - sets)
    };
  }).map((stat) => ({ ...stat, highRir, unknown }));
}

function setZone(sets) {
  if (sets < 5) return { key: "low", label: "Low", tone: "hot" };
  if (sets < HYPERTROPHY.minimumSets) return { key: "below", label: "Below minimum", tone: "warn" };
  if (sets < HYPERTROPHY.growthLow) return { key: "minimum", label: "Minimum met", tone: "" };
  if (sets <= HYPERTROPHY.growthHigh) return { key: "growth", label: "Growth zone", tone: "good" };
  return { key: "high", label: "High fatigue", tone: "warn" };
}

function chooseExerciseForMuscle(muscleId) {
  return exerciseLibrary.find((exercise) => exercise.primaryMuscles.includes(muscleId)) || exerciseLibrary[0];
}

function nextHypertrophyAction() {
  const stats = muscleSetStats();
  const underMinimum = stats
    .filter((stat) => stat.sets < HYPERTROPHY.minimumSets)
    .sort((a, b) => a.sets - b.sets || muscleGroups.findIndex((muscle) => muscle.id === a.id) - muscleGroups.findIndex((muscle) => muscle.id === b.id));

  if (underMinimum.length) {
    const target = underMinimum[0];
    const exercise = chooseExerciseForMuscle(target.id);
    const recommendedSets = Math.min(3, Math.max(2, Math.ceil(target.deficit)));
    return {
      mode: "minimum",
      muscle: target,
      exercise,
      sets: recommendedSets,
      title: `${target.label} is below the hypertrophy floor`,
      body: `${target.label} is at ${fmt(target.sets, 1)}/${HYPERTROPHY.minimumSets} hard sets. Do ${recommendedSets} sets of ${exercise.name}, ${exercise.reps} reps, ${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR.`
    };
  }

  const belowGrowth = stats
    .filter((stat) => stat.sets < HYPERTROPHY.growthLow)
    .sort((a, b) => a.sets - b.sets);
  if (belowGrowth.length) {
    const target = belowGrowth[0];
    const exercise = chooseExerciseForMuscle(target.id);
    return {
      mode: "growth",
      muscle: target,
      exercise,
      sets: 2,
      title: `${target.label} met the floor`,
      body: `${target.label} has ${fmt(target.sets, 1)} hard sets. Add 2 careful sets of ${exercise.name} if recovery feels good.`
    };
  }

  return {
    mode: "recovery",
    muscle: null,
    exercise: null,
    sets: 0,
    title: "Minimums are covered",
    body: "All tracked muscles are at the weekly hypertrophy floor. Progress by adding reps or load, or recover if joints or soreness are talking back."
  };
}

function previewSeries(kind) {
  const base = new Date();
  const values = [];
  for (let index = 9; index >= 0; index -= 1) {
    const date = new Date(base);
    date.setDate(date.getDate() - index * 3);
    const bump = Math.sin(index / 1.8) * 8;
    values.push({
      label: isoFromLocalDate(date).slice(5, 10),
      value: kind === "calories" ? 2300 + bump * 18 : kind === "protein" ? 165 + bump : 185 + bump / 2
    });
  }
  return values;
}

function seriesFromWorkouts(exercise, mapper) {
  return state.workouts
    .filter((entry) => entry.exercise === exercise)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      label: entry.date.slice(5, 10),
      value: mapper(entry)
    }));
}

function seriesFromMetrics(field) {
  return state.metrics
    .filter((entry) => entry[field] > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      label: entry.date.slice(5, 10),
      value: entry[field]
    }));
}

function lineChart(points, color = "#35d58c", unit = "") {
  if (!points.length) {
    return `<div class="empty">No data yet. Your chart will appear after the first few logs.</div>`;
  }

  const chartPoints = points.length > 1 ? points : [
    { label: points[0].label, value: points[0].value - 1 },
    points[0]
  ];
  const min = Math.min(...chartPoints.map((point) => point.value));
  const max = Math.max(...chartPoints.map((point) => point.value));
  const range = max - min || 1;
  const coords = chartPoints.map((point, index) => {
    const x = 8 + (index / Math.max(chartPoints.length - 1, 1)) * 84;
    const y = 84 - ((point.value - min) / range) * 68;
    return { x, y, ...point };
  });
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `8,92 ${polyline} 92,92`;
  const last = coords[coords.length - 1];
  const first = coords[0];
  const gradientId = `area-${color.slice(1)}-${coords.length}-${Math.round(last.value * 10)}`;

  return `
    <div class="chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.36"></stop>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <line x1="8" y1="16" x2="92" y2="16" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <line x1="8" y1="84" x2="92" y2="84" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <polygon points="${area}" fill="url(#${gradientId})"></polygon>
        <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.7" fill="${color}"></circle>`).join("")}
      </svg>
      <p class="muted small">${escapeHtml(first.label)} to ${escapeHtml(last.label)} - Latest ${fmt(last.value, 1)}${escapeHtml(unit)}</p>
    </div>
  `;
}

function muscleProgressMarkup(stats = muscleSetStats(), compact = false) {
  const rows = stats.map((stat) => `
    <div class="muscle-card ${stat.zone.tone}">
      <div class="muscle-card-top">
        <strong>${escapeHtml(stat.label)}</strong>
        <span>${fmt(stat.sets, 1)}/${HYPERTROPHY.minimumSets}</span>
      </div>
      <div class="progress-bar"><span style="width:${stat.percent}%"></span></div>
      <div class="muscle-card-meta">
        <span>${escapeHtml(stat.zone.label)}</span>
        <span>${stat.sessions}/2 touches</span>
      </div>
    </div>
  `).join("");
  return `<div class="muscle-grid ${compact ? "compact" : ""}">${rows}</div>`;
}

function topUnderTargetMuscles(limit = 4) {
  return muscleSetStats()
    .filter((stat) => stat.sets < HYPERTROPHY.minimumSets)
    .sort((a, b) => a.sets - b.sets)
    .slice(0, limit);
}

function recommendations() {
  const recs = [];
  const stats = muscleSetStats();
  const action = nextHypertrophyAction();
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const trend = weightTrend(14);
  const highRir = stats[0]?.highRir || [];
  const highVolume = stats.filter((stat) => stat.sets > HYPERTROPHY.growthHigh);
  const lowFrequency = stats.filter((stat) => stat.sets >= 5 && stat.sessions < 2).slice(0, 3);
  const lastWorkout = state.workouts[0];
  const daysSinceWorkout = lastWorkout ? daysBetween(lastWorkout.date, todayISO()) : null;

  recs.push({
    tone: action.mode === "minimum" ? "hot" : "",
    title: action.title,
    body: action.body,
    action
  });

  if (daysSinceWorkout === null) {
    recs.push({
      tone: "warn",
      title: "Start with a baseline hypertrophy session",
      body: "Log 2-3 hard sets for a few muscles. The coach will start filling weekly set gaps as soon as it sees data."
    });
  } else if (daysSinceWorkout >= 4) {
    recs.push({
      tone: "warn",
      title: "Ease back into the week",
      body: `It has been ${daysSinceWorkout} days since your last lift. Use 2-3 sets and keep 1-3 reps in reserve.`
    });
  }

  if (lowFrequency.length) {
    recs.push({
      tone: "warn",
      title: "Add a second weekly touch",
      body: `${lowFrequency.map((stat) => stat.label).join(", ")} have work logged but fewer than 2 weekly touches. Split sets across another day if you can.`
    });
  }

  if (highRir.length) {
    recs.push({
      tone: "warn",
      title: "Some sets were too far from failure",
      body: `${highRir.length} recent log${highRir.length === 1 ? "" : "s"} had RIR above 3. Those sets count at half credit for hypertrophy until effort gets closer.`
    });
  }

  if (protein.bodyWeightLb && proteinAvg) {
    if (proteinAvg < protein.floor) {
      recs.push({
        tone: "hot",
        title: "Protein is below the hypertrophy floor",
        body: `Your 7-day average is ${fmt(proteinAvg)}g. Based on ${fmt(protein.bodyWeightLb, 1)} lb, aim for at least ${fmt(protein.floor)}g/day.`
      });
    } else {
      recs.push({
        tone: "good",
        title: "Protein floor is covered",
        body: `Your 7-day average is ${fmt(proteinAvg)}g. Useful range for your logged weight is about ${fmt(protein.floor)}-${fmt(protein.upper)}g/day.`
      });
    }
  } else {
    recs.push({
      tone: "warn",
      title: "Log body weight and protein",
      body: "The hypertrophy nutrition target needs body weight plus protein logs to calculate your daily floor."
    });
  }

  if (trend !== null && trend <= 0 && getAverage("calories", 7)) {
    recs.push({
      tone: "warn",
      title: "Weight trend is flat or down",
      body: "For muscle gain, consider adding a small calorie bump and watching the next 2 weeks of body-weight trend."
    });
  }

  if (highVolume.length) {
    recs.push({
      tone: "warn",
      title: "Watch recovery on high-volume muscles",
      body: `${highVolume.map((stat) => stat.label).join(", ")} are above ${HYPERTROPHY.growthHigh} weekly hard sets. Consider holding volume or deloading if performance drops.`
    });
  }

  return recs.slice(0, 6);
}

function renderDashboard() {
  const weeklyVolume = getWeeklyVolume();
  const bodyWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const stats = muscleSetStats();
  const covered = stats.filter((stat) => stat.sets >= HYPERTROPHY.minimumSets).length;
  const underTarget = topUnderTargetMuscles(4);
  const action = nextHypertrophyAction();

  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Build the floor first.</h2>
        <p class="hero-copy">Reach 10 hard sets per muscle each rolling week, train muscles twice, and keep most work 1-3 reps from failure.</p>
      </div>
      <div class="grid three">
        <div class="stat"><span class="label">Hypertrophy floor</span><span class="value accent-green">${covered}/${stats.length}</span><span class="hint">muscles at 10 sets</span></div>
        <div class="stat"><span class="label">Needs work</span><span class="value accent-gold">${stats.length - covered}</span><span class="hint">under weekly floor</span></div>
        <div class="stat"><span class="label">Protein floor</span><span class="value accent-coral">${protein.floor ? fmt(protein.floor) : "--"}</span><span class="hint">g/day minimum</span></div>
      </div>
    </section>

    <section class="section grid two">
      <div class="card coach-action">
        <span class="badge">Next best lift</span>
        <h3>${escapeHtml(action.title)}</h3>
        <p>${escapeHtml(action.body)}</p>
        ${action.exercise ? `<p class="muted small">Rest ${escapeHtml(action.exercise.rest)}. ${escapeHtml(action.exercise.cue)}</p>` : ""}
      </div>
      <div class="card">
        <h3>Lowest set counts</h3>
        <div class="list">
          ${underTarget.length ? underTarget.map((stat) => `
            <div class="list-item simple">
              <strong>${escapeHtml(stat.label)}</strong>
              <span class="muted small">${fmt(stat.sets, 1)}/${HYPERTROPHY.minimumSets} hard sets - ${stat.sessions}/2 touches</span>
            </div>
          `).join("") : `<div class="empty">All tracked muscles have reached the weekly floor.</div>`}
        </div>
      </div>
    </section>

    <section class="section chart-panel">
      <div class="chart-header"><h3>Weekly hard sets</h3><span class="muted small">${fmt(weeklyVolume)} lb total load logged</span></div>
      ${muscleProgressMarkup(stats, true)}
    </section>

    <section class="section grid two">
      <div class="chart-panel">
        <div class="chart-header"><h3>Body weight</h3><span class="muted small">${bodyWeight ? "logged" : "preview"}</span></div>
        ${lineChart(seriesFromMetrics("bodyWeight").length ? seriesFromMetrics("bodyWeight") : previewSeries("bodyWeight"), "#f2d06b", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Protein</h3><span class="muted small">${proteinAvg ? `${fmt(proteinAvg)}g avg` : "preview"}</span></div>
        ${lineChart(seriesFromMetrics("protein").length ? seriesFromMetrics("protein") : previewSeries("protein"), "#ff6b5f", "g")}
      </div>
    </section>
  `;
}

function listWorkout(entry) {
  const meta = workoutMeta(entry);
  return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(entry.exercise)}</strong>
        <span class="muted small">${escapeHtml(entry.date)} - ${entry.sets}x${entry.reps} @ ${fmt(entry.weight)} lb - ${fmt(workoutVolume(entry))} lb volume</span>
        <span class="muted micro">${meta.primaryMuscles.map(muscleLabel).join(", ")}${entry.rir !== null && entry.rir !== undefined ? ` - ${fmt(Number(entry.rir))} RIR` : ""}</span>
      </div>
      <button class="delete-small" type="button" aria-label="Delete workout" data-action="delete-workout" data-id="${escapeHtml(entry.id)}">x</button>
    </div>
  `;
}

function listMetric(entry) {
  const parts = [];
  if (entry.bodyWeight) parts.push(`${fmt(entry.bodyWeight, 1)} lb`);
  if (entry.calories) parts.push(`${fmt(entry.calories)} cal`);
  if (entry.protein) parts.push(`${fmt(entry.protein)}g protein`);
  return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(entry.date)}</strong>
        <span class="muted small">${escapeHtml(parts.join(" - ") || "Metric entry")}</span>
      </div>
      <button class="delete-small" type="button" aria-label="Delete metric" data-action="delete-metric" data-id="${escapeHtml(entry.id)}">x</button>
    </div>
  `;
}

function renderLog() {
  const exerciseChips = defaultExercises.map((name) => `
    <button class="pill ${state.selectedExercise === name ? "is-active" : ""}" type="button" data-action="choose-exercise" data-exercise="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  const selectedMeta = resolveExerciseMeta(state.selectedExercise);
  const muscleOptions = muscleGroups.map((muscle) => `
    <option value="${muscle.id}" ${selectedMeta.primaryMuscles.includes(muscle.id) ? "selected" : ""}>${escapeHtml(muscle.label)}</option>
  `).join("");

  return `
    <section class="form-panel">
      <div class="segment">
        <button type="button" data-log-mode="strength" class="${state.logMode === "strength" ? "is-active" : ""}">Strength</button>
        <button type="button" data-log-mode="metrics" class="${state.logMode === "metrics" ? "is-active" : ""}">Nutrition</button>
      </div>

      ${state.logMode === "strength" ? `
        <form id="strength-form">
          <div class="pill-row">${exerciseChips}</div>
          <div class="field">
            <label for="exercise">Exercise</label>
            <input id="exercise" name="exercise" required value="${escapeHtml(state.selectedExercise)}">
          </div>
          <div class="field">
            <label for="targetMuscle">Target muscle for custom lifts</label>
            <select id="targetMuscle" name="targetMuscle">${muscleOptions}</select>
          </div>
          <div class="field">
            <label for="workout-date">Date</label>
            <input id="workout-date" name="date" type="date" required value="${todayISO()}">
          </div>
          <div class="field-row">
            <div class="field"><label for="sets">Sets</label><input id="sets" name="sets" type="number" inputmode="decimal" min="1" step="1" required value="3"></div>
            <div class="field"><label for="reps">Reps</label><input id="reps" name="reps" type="number" inputmode="decimal" min="1" step="1" required value="10"></div>
            <div class="field"><label for="weight">Weight</label><input id="weight" name="weight" type="number" inputmode="decimal" min="0" step="2.5" required placeholder="lb"></div>
          </div>
          <div class="field">
            <label for="rir">Reps in reserve</label>
            <input id="rir" name="rir" type="number" inputmode="decimal" min="0" max="5" step="1" placeholder="2">
          </div>
          <div class="field">
            <label for="workout-notes">Notes</label>
            <textarea id="workout-notes" name="notes" placeholder="Tempo, soreness, pain, pump, setup, anything useful."></textarea>
          </div>
          <button class="primary-button" type="submit">Save hypertrophy set</button>
          <p class="muted micro form-note">Avoid sharp pain. Most hypertrophy work should stop 1-3 reps before failure.</p>
        </form>
      ` : `
        <form id="metric-form">
          <div class="field">
            <label for="metric-date">Date</label>
            <input id="metric-date" name="date" type="date" required value="${todayISO()}">
          </div>
          <div class="field-row">
            <div class="field"><label for="bodyWeight">Body weight</label><input id="bodyWeight" name="bodyWeight" type="number" inputmode="decimal" min="0" step="0.1" placeholder="lb"></div>
            <div class="field"><label for="calories">Calories</label><input id="calories" name="calories" type="number" inputmode="decimal" min="0" step="1"></div>
            <div class="field"><label for="protein">Protein</label><input id="protein" name="protein" type="number" inputmode="decimal" min="0" step="1" placeholder="g"></div>
          </div>
          <div class="field">
            <label for="metric-notes">Notes</label>
            <textarea id="metric-notes" name="notes" placeholder="Sleep, hunger, stress, digestion, or anything that explains the trend."></textarea>
          </div>
          <button class="primary-button" type="submit">Save metrics</button>
        </form>
      `}
    </section>

    <section class="section grid two">
      <div class="card">
        <h3>Strength history</h3>
        <div class="list">${state.workouts.slice(0, 8).map((entry) => listWorkout(entry)).join("") || `<div class="empty">No lifts logged yet.</div>`}</div>
      </div>
      <div class="card">
        <h3>Nutrition history</h3>
        <div class="list">${state.metrics.slice(0, 8).map((entry) => listMetric(entry)).join("") || `<div class="empty">No metrics logged yet.</div>`}</div>
      </div>
    </section>
  `;
}

function renderTrends() {
  const exercises = [...new Set([...defaultExercises, ...state.workouts.map((entry) => entry.exercise)])];
  if (!exercises.includes(state.selectedExercise)) state.selectedExercise = exercises[0];
  const options = exercises.map((exercise) => `<option ${exercise === state.selectedExercise ? "selected" : ""}>${escapeHtml(exercise)}</option>`).join("");
  const volumeSeries = seriesFromWorkouts(state.selectedExercise, workoutVolume);
  const e1rmSeries = seriesFromWorkouts(state.selectedExercise, e1rm);

  return `
    <section class="settings-panel">
      <div class="field">
        <label for="trend-exercise">Exercise progression</label>
        <select id="trend-exercise" data-action="trend-exercise">${options}</select>
      </div>
    </section>
    <section class="section chart-panel">
      <div class="chart-header"><h3>Weekly hard sets by muscle</h3><span class="muted small">rolling 7 days</span></div>
      ${muscleProgressMarkup(muscleSetStats())}
    </section>
    <section class="section grid two">
      <div class="chart-panel">
        <div class="chart-header"><h3>${escapeHtml(state.selectedExercise)} volume</h3><span class="muted small">sets x reps x load</span></div>
        ${lineChart(volumeSeries, "#35d58c", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Estimated 1RM</h3><span class="muted small">Epley formula</span></div>
        ${lineChart(e1rmSeries, "#9b8cff", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Body weight</h3><span class="muted small">latest logs</span></div>
        ${lineChart(seriesFromMetrics("bodyWeight"), "#f2d06b", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Protein</h3><span class="muted small">daily grams</span></div>
        ${lineChart(seriesFromMetrics("protein"), "#ff6b5f", "g")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Calories</h3><span class="muted small">daily intake</span></div>
        ${lineChart(seriesFromMetrics("calories"), "#35d58c", "")}
      </div>
    </section>
  `;
}

function renderCoach() {
  const recs = recommendations();
  const action = recs[0]?.action;
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Hypertrophy is counted in hard sets.</h2>
        <p class="hero-copy">Minimum-first coaching: 10 hard sets per muscle, 2 weekly touches, 1-3 RIR, enough protein, and gradual overload.</p>
      </div>
    </section>
    ${action?.exercise ? `
      <section class="section card coach-action featured-action">
        <span class="badge">Recommended now</span>
        <h3>${escapeHtml(action.exercise.name)}</h3>
        <p>${escapeHtml(action.body)}</p>
        <div class="action-grid">
          <span><strong>${action.sets}</strong> sets</span>
          <span><strong>${escapeHtml(action.exercise.reps)}</strong> reps</span>
          <span><strong>${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax}</strong> RIR</span>
          <span><strong>${escapeHtml(action.exercise.rest)}</strong> rest</span>
        </div>
        <p class="muted small">${escapeHtml(action.exercise.cue)}</p>
      </section>
    ` : ""}
    <section class="section chart-panel">
      <div class="chart-header"><h3>Muscle set audit</h3><span class="muted small">10 set floor, 12-20 growth zone</span></div>
      ${muscleProgressMarkup(muscleSetStats())}
    </section>
    <section class="section grid">
      ${recs.map((rec) => `<div class="coach-card ${rec.tone}"><strong>${escapeHtml(rec.title)}</strong><p>${escapeHtml(rec.body)}</p></div>`).join("")}
    </section>
  `;
}

async function storageEstimateMarkup() {
  if (!navigator.storage?.estimate) {
    return `<p class="muted">Storage estimate is unavailable in this browser.</p>`;
  }
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 1;
  const pct = Math.min(100, Math.round((usage / quota) * 100));
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return `
    <div class="storage-meter"><span style="width:${pct}%"></span></div>
    <p class="muted small">${fmt(usage / 1024 / 1024, 1)} MB used of about ${fmt(quota / 1024 / 1024, 0)} MB - ${persisted ? "persistent mode" : "best-effort mode"}</p>
  `;
}

function supabaseStatus() {
  const session = state.settings.supabaseSession;
  if (session?.access_token) return `Signed in as ${state.settings.supabaseEmail || "Supabase user"}`;
  if (state.settings.supabaseUrl && state.settings.supabaseAnonKey) return "Configured, not signed in";
  return "Not configured";
}

function hypertrophySettings() {
  return {
    goal: "hypertrophy",
    volumeStyle: "minimum-first",
    equipmentScope: "home-basics",
    scheduleStyle: "flexible",
    minimumSets: HYPERTROPHY.minimumSets,
    growthLow: HYPERTROPHY.growthLow,
    growthHigh: HYPERTROPHY.growthHigh,
    proteinFloorGPerKg: HYPERTROPHY.proteinFloorGPerKg,
    proteinUpperGPerKg: HYPERTROPHY.proteinUpperGPerKg
  };
}

async function renderSettings() {
  const estimate = await storageEstimateMarkup();
  const sampleWorkouts = state.workouts.filter(isSampleEntry).length;
  const sampleMetrics = state.metrics.filter(isSampleEntry).length;
  return `
    <section class="settings-panel">
      <h2>Hypertrophy defaults</h2>
      <div class="settings-list">
        <span>Weekly floor <strong>${HYPERTROPHY.minimumSets} hard sets/muscle</strong></span>
        <span>Growth zone <strong>${HYPERTROPHY.growthLow}-${HYPERTROPHY.growthHigh} sets</strong></span>
        <span>Effort target <strong>${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR</strong></span>
        <span>Protein floor <strong>${HYPERTROPHY.proteinFloorGPerKg} g/kg/day</strong></span>
      </div>
      <p class="muted small">This is training guidance for personal tracking, not medical advice.</p>
    </section>

    <section class="section settings-panel">
      <h2>Sample chart data</h2>
      <p class="muted small">${sampleWorkouts + sampleMetrics ? `${sampleWorkouts} sample lifts and ${sampleMetrics} sample metrics are loaded.` : "Load demo logs to test every chart and recommendation without touching your real backups."}</p>
      <div class="grid two">
        <button class="primary-button" type="button" data-action="load-sample-data">Load sample data</button>
        <button class="ghost-button" type="button" data-action="remove-sample-data">Remove sample data</button>
      </div>
    </section>

    <section class="section settings-panel">
      <h2>Storage</h2>
      ${estimate}
      <div class="grid two">
        <button class="primary-button" type="button" data-action="export-data">Export backup</button>
        <button class="ghost-button" type="button" data-action="import-click">Import backup</button>
      </div>
      <input class="hidden" id="import-file" type="file" accept="application/json">
    </section>

    <section class="section settings-panel">
      <h2>Supabase sync</h2>
      <p class="muted small">Status: ${escapeHtml(supabaseStatus())}</p>
      <div class="field">
        <label for="supabaseUrl">Project URL</label>
        <input id="supabaseUrl" value="${escapeHtml(state.settings.supabaseUrl || "")}" placeholder="https://your-project.supabase.co">
      </div>
      <div class="field">
        <label for="supabaseAnonKey">Anon public key</label>
        <input id="supabaseAnonKey" value="${escapeHtml(state.settings.supabaseAnonKey || "")}" placeholder="Paste your Supabase anon key">
      </div>
      <div class="field">
        <label for="supabaseEmail">Email</label>
        <input id="supabaseEmail" type="email" value="${escapeHtml(state.settings.supabaseEmail || "")}" placeholder="you@example.com">
      </div>
      <div class="field">
        <label for="supabasePassword">Password</label>
        <input id="supabasePassword" type="password" placeholder="Only used for sign in or account creation">
      </div>
      <div class="grid two">
        <button class="ghost-button" type="button" data-action="save-supabase">Save settings</button>
        <button class="ghost-button" type="button" data-action="signup-supabase">Create account</button>
        <button class="primary-button" type="button" data-action="signin-supabase">Sign in</button>
        <button class="ghost-button" type="button" data-action="push-supabase">Push backup</button>
        <button class="ghost-button" type="button" data-action="pull-supabase">Pull latest</button>
      </div>
    </section>

    <section class="section settings-panel">
      <h2>Danger zone</h2>
      <p class="muted small">Export a backup before clearing data.</p>
      <button class="danger-button" type="button" data-action="clear-all">Clear local data</button>
    </section>
  `;
}

async function render() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.activeTab);
  });

  if (state.activeTab === "dashboard") els.app.innerHTML = renderDashboard();
  if (state.activeTab === "log") els.app.innerHTML = renderLog();
  if (state.activeTab === "trends") els.app.innerHTML = renderTrends();
  if (state.activeTab === "coach") els.app.innerHTML = renderCoach();
  if (state.activeTab === "settings") els.app.innerHTML = await renderSettings();
}

async function saveWorkout(form) {
  const data = Object.fromEntries(new FormData(form));
  const exerciseName = data.exercise.trim();
  const meta = resolveExerciseMeta(exerciseName, data.targetMuscle);
  const entry = {
    id: uid(),
    date: data.date,
    exercise: exerciseName,
    exerciseId: meta.id,
    primaryMuscles: [...meta.primaryMuscles],
    secondaryMuscles: [...meta.secondaryMuscles],
    equipment: meta.equipment,
    sets: Math.max(1, parseNum(data.sets)),
    reps: Math.max(1, parseNum(data.reps)),
    weight: Math.max(0, parseNum(data.weight)),
    rir: data.rir === "" ? null : parseNum(data.rir),
    notes: data.notes.trim(),
    createdAt: new Date().toISOString()
  };
  state.selectedExercise = entry.exercise;
  await dbPut("workouts", entry);
  await loadState();
  await render();
  toast("Hypertrophy set saved.");
}

async function saveMetric(form) {
  const data = Object.fromEntries(new FormData(form));
  const entry = {
    id: uid(),
    date: data.date,
    bodyWeight: parseNum(data.bodyWeight),
    calories: parseNum(data.calories),
    protein: parseNum(data.protein),
    notes: data.notes.trim(),
    createdAt: new Date().toISOString()
  };
  await dbPut("metrics", entry);
  await loadState();
  await render();
  toast("Metrics saved.");
}

function isSampleEntry(entry) {
  return entry?.sample === true || entry?.sampleBatch === SAMPLE_BATCH;
}

function sampleWorkout({ exercise, daysAgo, sets, reps, weight, rir, note }) {
  const date = dateDaysAgo(daysAgo);
  const meta = resolveExerciseMeta(exercise);
  return {
    id: `${SAMPLE_BATCH}-workout-${date}-${meta.id}`,
    sample: true,
    sampleBatch: SAMPLE_BATCH,
    date,
    exercise: meta.name,
    exerciseId: meta.id,
    primaryMuscles: [...meta.primaryMuscles],
    secondaryMuscles: [...meta.secondaryMuscles],
    equipment: meta.equipment,
    sets,
    reps,
    weight,
    rir,
    notes: note || "Sample hypertrophy data for chart testing.",
    createdAt: `${date}T12:00:00.000Z`
  };
}

function sampleMetric(daysAgo) {
  const date = dateDaysAgo(daysAgo);
  const progress = 41 - daysAgo;
  const wave = Math.sin(progress / 3);
  return {
    id: `${SAMPLE_BATCH}-metric-${date}`,
    sample: true,
    sampleBatch: SAMPLE_BATCH,
    date,
    bodyWeight: 181 + progress * 0.08 + wave * 0.25,
    calories: Math.round(2380 + progress * 7 + wave * 70),
    protein: Math.round(126 + progress * 0.95 + wave * 6),
    notes: "Sample nutrition data for chart testing.",
    createdAt: `${date}T08:00:00.000Z`
  };
}

function generateSampleData() {
  const workoutPlan = [
    { offset: 6, exercise: "Dumbbell Bench Press", sets: 3, reps: 10, base: 30, step: 2.5, rir: 2 },
    { offset: 6, exercise: "Dumbbell Row", sets: 3, reps: 10, base: 35, step: 2.5, rir: 2 },
    { offset: 6, exercise: "Lateral Raise", sets: 3, reps: 16, base: 10, step: 1, rir: 2 },
    { offset: 5, exercise: "Goblet Squat", sets: 3, reps: 12, base: 35, step: 2.5, rir: 2 },
    { offset: 5, exercise: "Romanian Deadlift", sets: 3, reps: 10, base: 40, step: 2.5, rir: 2 },
    { offset: 5, exercise: "Standing Calf Raise", sets: 3, reps: 18, base: 25, step: 2, rir: 2 },
    { offset: 4, exercise: "Push-up", sets: 3, reps: 15, base: 0, step: 0, rir: 2 },
    { offset: 4, exercise: "Band Row", sets: 3, reps: 18, base: 0, step: 0, rir: 2 },
    { offset: 4, exercise: "Dumbbell Shoulder Press", sets: 3, reps: 10, base: 22.5, step: 1.5, rir: 2 },
    { offset: 4, exercise: "Dumbbell Fly", sets: 2, reps: 15, base: 12.5, step: 1, rir: 4 },
    { offset: 3, exercise: "Bulgarian Split Squat", sets: 3, reps: 10, base: 20, step: 2, rir: 2 },
    { offset: 3, exercise: "Hip Thrust / Glute Bridge", sets: 3, reps: 15, base: 35, step: 2.5, rir: 2 },
    { offset: 3, exercise: "Plank / Dead Bug", sets: 3, reps: 45, base: 0, step: 0, rir: 2 },
    { offset: 2, exercise: "Overhead Triceps Extension", sets: 2, reps: 14, base: 15, step: 1, rir: 2 },
    { offset: 2, exercise: "Dumbbell Curl", sets: 2, reps: 12, base: 15, step: 1, rir: 2 },
    { offset: 2, exercise: "Hammer Curl", sets: 2, reps: 12, base: 15, step: 1, rir: 2 }
  ];

  const workouts = [];
  for (let week = 5; week >= 0; week -= 1) {
    const progression = 5 - week;
    for (const item of workoutPlan) {
      workouts.push(sampleWorkout({
        exercise: item.exercise,
        daysAgo: week * 7 + item.offset,
        sets: item.sets,
        reps: item.reps + (progression % 2),
        weight: Math.max(0, item.base + progression * item.step),
        rir: item.rir,
        note: `Sample week ${progression + 1}: ${item.exercise}`
      }));
    }
  }

  const metrics = [];
  for (let daysAgo = 41; daysAgo >= 0; daysAgo -= 1) {
    metrics.push(sampleMetric(daysAgo));
  }

  return { workouts, metrics };
}

async function deleteSampleEntries() {
  const [workouts, metrics] = await Promise.all([dbAll("workouts"), dbAll("metrics")]);
  const deletes = [
    ...workouts.filter(isSampleEntry).map((entry) => dbDelete("workouts", entry.id)),
    ...metrics.filter(isSampleEntry).map((entry) => dbDelete("metrics", entry.id))
  ];
  await Promise.all(deletes);
}

async function loadSampleData() {
  await deleteSampleEntries();
  const sample = generateSampleData();
  for (const entry of sample.workouts) await dbPut("workouts", entry);
  for (const entry of sample.metrics) await dbPut("metrics", entry);
  await saveSetting("sampleDataLoadedAt", new Date().toISOString());
  state.selectedExercise = "Dumbbell Bench Press";
  state.activeTab = "trends";
  await loadState();
  await render();
  toast("Sample data loaded.");
}

async function removeSampleData() {
  await deleteSampleEntries();
  await saveSetting("sampleDataLoadedAt", null);
  await loadState();
  await render();
  toast("Sample data removed.");
}

function exportSafeSettings() {
  return {
    hypertrophyProfile: hypertrophySettings(),
    lastBackupAt: new Date().toISOString()
  };
}

function exportPayload() {
  return {
    app: "TrainWise",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: exportSafeSettings(),
    workouts: state.workouts.filter((entry) => !isSampleEntry(entry)),
    metrics: state.metrics.filter((entry) => !isSampleEntry(entry))
  };
}

function downloadBackup() {
  const payload = exportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trainwise-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  saveSetting("lastBackupAt", payload.exportedAt);
  toast("Backup exported.");
}

async function importPayload(payload) {
  if (!payload?.workouts || !payload?.metrics) throw new Error("Backup file is missing workouts or metrics.");
  await Promise.all(STORES.filter((store) => store !== "settings").map((store) => dbClear(store)));
  for (const entry of payload.workouts) await dbPut("workouts", entry);
  for (const entry of payload.metrics) await dbPut("metrics", entry);
  if (payload.settings?.hypertrophyProfile) {
    await saveSetting("hypertrophyProfile", payload.settings.hypertrophyProfile);
  }
  await loadState();
  await render();
}

async function importFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!confirm("Replace local TrainWise data with this backup?")) return;
  await importPayload(payload);
  toast("Backup restored.");
}

function readSupabaseFields() {
  const url = document.getElementById("supabaseUrl").value.trim().replace(/\/$/, "");
  const key = document.getElementById("supabaseAnonKey").value.trim();
  const email = document.getElementById("supabaseEmail").value.trim();
  const password = document.getElementById("supabasePassword").value;
  return { url, key, email, password };
}

async function saveSupabaseSettings({ renderAfter = true, notify = true } = {}) {
  const { url, key, email } = readSupabaseFields();
  await saveSetting("supabaseUrl", url);
  await saveSetting("supabaseAnonKey", key);
  await saveSetting("supabaseEmail", email);
  if (renderAfter) await render();
  if (notify) toast("Supabase settings saved.");
}

function supabaseConfig() {
  const { supabaseUrl, supabaseAnonKey, supabaseSession } = state.settings;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Add your Supabase URL and anon key first.");
  return { url: supabaseUrl.replace(/\/$/, ""), key: supabaseAnonKey, session: supabaseSession };
}

async function supabaseAuth(mode) {
  const fields = readSupabaseFields();
  await saveSupabaseSettings({ renderAfter: false, notify: false });
  const { url, key } = supabaseConfig();
  const { email, password } = fields;
  if (!email || !password) throw new Error("Email and password are required.");
  const endpoint = mode === "signup" ? `${url}/auth/v1/signup` : `${url}/auth/v1/token?grant_type=password`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.msg || json.message || "Supabase auth failed.");
  if (!json.access_token) {
    toast("Account created. Confirm your email if Supabase asks for it, then sign in.");
    return;
  }
  await saveSetting("supabaseSession", {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at
  });
  await render();
  toast("Signed in to Supabase.");
}

async function pushSupabaseBackup() {
  const { url, key, session } = supabaseConfig();
  if (!session?.access_token) throw new Error("Sign in to Supabase first.");
  const response = await fetch(`${url}/rest/v1/fitness_snapshots`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ payload: exportPayload(), app_version: APP_VERSION })
  });
  if (!response.ok) throw new Error(await response.text());
  toast("Cloud backup pushed.");
}

async function pullSupabaseBackup() {
  const { url, key, session } = supabaseConfig();
  if (!session?.access_token) throw new Error("Sign in to Supabase first.");
  const response = await fetch(`${url}/rest/v1/fitness_snapshots?select=payload,created_at&order=created_at.desc&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`
    }
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Could not fetch latest backup.");
  if (!json.length) {
    toast("No cloud backups found.");
    return;
  }
  if (!confirm(`Replace local data with cloud backup from ${json[0].created_at}?`)) return;
  await importPayload(json[0].payload);
  toast("Cloud backup restored.");
}

async function clearAll() {
  if (!confirm("Clear all local workout and nutrition data? Export a backup first if you need it.")) return;
  await Promise.all(["workouts", "metrics"].map((store) => dbClear(store)));
  await loadState();
  await render();
  toast("Local data cleared.");
}

async function handleAction(action, target) {
  if (action === "quick-backup" || action === "export-data") downloadBackup();
  if (action === "import-click") document.getElementById("import-file")?.click();
  if (action === "delete-workout") {
    await dbDelete("workouts", target.dataset.id);
    await loadState();
    await render();
    toast("Lift deleted.");
  }
  if (action === "delete-metric") {
    await dbDelete("metrics", target.dataset.id);
    await loadState();
    await render();
    toast("Metric deleted.");
  }
  if (action === "choose-exercise") {
    state.selectedExercise = target.dataset.exercise;
    await render();
  }
  if (action === "save-supabase") await saveSupabaseSettings();
  if (action === "signup-supabase") await supabaseAuth("signup");
  if (action === "signin-supabase") await supabaseAuth("signin");
  if (action === "push-supabase") await pushSupabaseBackup();
  if (action === "pull-supabase") await pullSupabaseBackup();
  if (action === "load-sample-data") await loadSampleData();
  if (action === "remove-sample-data") await removeSampleData();
  if (action === "clear-all") await clearAll();
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-tab]");
  const logMode = event.target.closest("[data-log-mode]");
  const action = event.target.closest("[data-action]");

  try {
    if (tab) {
      state.activeTab = tab.dataset.tab;
      await render();
    }
    if (logMode) {
      state.logMode = logMode.dataset.logMode;
      await render();
    }
    if (action) {
      await handleAction(action.dataset.action, action);
    }
  } catch (error) {
    toast(error.message || "Something went wrong.");
  }
});

document.addEventListener("change", async (event) => {
  try {
    if (event.target.matches("#trend-exercise")) {
      state.selectedExercise = event.target.value;
      await render();
    }
    if (event.target.matches("#import-file") && event.target.files?.[0]) {
      await importFile(event.target.files[0]);
      event.target.value = "";
    }
  } catch (error) {
    toast(error.message || "Import failed.");
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.matches("#strength-form")) await saveWorkout(event.target);
    if (event.target.matches("#metric-form")) await saveMetric(event.target);
  } catch (error) {
    toast(error.message || "Could not save.");
  }
});

async function init() {
  state.db = await openDB();
  await loadState();

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  await render();
}

init().catch((error) => {
  els.app.innerHTML = `<div class="empty">TrainWise could not start: ${escapeHtml(error.message)}</div>`;
});
