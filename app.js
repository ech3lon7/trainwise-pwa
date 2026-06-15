"use strict";

const DB_NAME = "trainwise-db";
const DB_VERSION = 2;
const STORES = ["workouts", "metrics", "settings"];
const APP_VERSION = "1.5.15";
const SAMPLE_BATCH = "hypertrophy-demo-v1";
let dbOpenPromise = null;
let chartId = 0;
let reloadingForUpdate = false;
let renderToken = 0;
const SESSION_LIMIT_MINUTES = 60;
const COACH_TIME_TOLERANCE_MINUTES = 3;
const COACH_TIMEFRAME_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "40 min", minutes: 40 },
  { label: "50 min", minutes: 50 },
  { label: "1 hour", minutes: 60 },
  { label: "1 hour+", minutes: 75 }
];
const NUTRITION_GOAL_OPTIONS = [
  { id: "bulk", label: "Bulk", hint: "Lean gain" },
  { id: "maintain", label: "Maintain", hint: "Hold steady" },
  { id: "cut", label: "Cut", hint: "Slow loss" }
];
const NUTRITION_MEALS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" }
];

const HYPERTROPHY = {
  minimumSets: 10,
  growthLow: 12,
  growthHigh: 20,
  highVolumeFillMax: 22,
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

const COACH_MUSCLE_REGIONS = {
  chest: "push",
  shoulders: "push",
  triceps: "push",
  back: "pull",
  biceps: "pull",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  abs: "core"
};
const COACH_REGION_ORDER = ["push", "pull", "legs", "core"];

const muscleIconPaths = {
  chest: "./assets/muscles/chest.png",
  back: "./assets/muscles/back.png",
  shoulders: "./assets/muscles/shoulders.png",
  biceps: "./assets/muscles/bicep.png",
  triceps: "./assets/muscles/triceps.png",
  quads: "./assets/muscles/quads.png",
  hamstrings: "./assets/muscles/hamstrings.png",
  glutes: "./assets/muscles/glutes.png",
  calves: "./assets/muscles/calves.png",
  abs: "./assets/muscles/abs.png"
};


const legacyExerciseMetadata = [
  { name: "Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell", reps: "6-12", rest: "90-180 sec" },
  { name: "Squat", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings", "abs"], equipment: "barbell", reps: "6-12", rest: "120-180 sec" },
  { name: "Deadlift", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["back", "quads"], equipment: "barbell", reps: "5-10", rest: "120-180 sec" },
  { name: "Overhead Press", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"], equipment: "barbell", reps: "6-12", rest: "90-180 sec" },
  { name: "Barbell Row", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: "barbell", reps: "8-12", rest: "90-180 sec" },
  { name: "Pull-up", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: "bar", reps: "6-15", rest: "90-180 sec" },
  { name: "Incline Dumbbell Press", primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], equipment: "dumbbells, bench", reps: "8-15", rest: "90-180 sec" }
];

const state = {
  db: null,
  activeTab: "dashboard",
  logMode: "strength",
  selectedExercise: "Push-up",
  selectedMuscle: "chest",
  editingExerciseId: null,
  editingWorkoutId: null,
  openExerciseMenu: null,
  logHistoryExercise: "",
  workoutDraft: [],
  historyMode: "exercises",
  historyExercise: "",
  historySearch: "",
  historyDate: "",
  coachTimeframeMinutes: SESSION_LIMIT_MINUTES,
  coachTargetMuscles: [],
  draggingDraftId: null,
  dismissedRecordTrophies: new Set(),
  templateQueue: [],
  draftDate: todayISO(),
  metricDate: todayISO(),
  draftNotes: "",
  setRows: [
    { weight: "", reps: 10, rir: 2, restSeconds: null },
    { weight: "", reps: 10, rir: 2, restSeconds: null },
    { weight: "", reps: 10, rir: 2, restSeconds: null }
  ],
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

function formatShortDate(value) {
  if (!value) return "";
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseRestSeconds(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+:\d{1,2}$/.test(text)) {
    const [minutes, seconds] = text.split(":").map(Number);
    return Math.max(0, minutes * 60 + seconds);
  }
  const minuteMatch = text.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?$/i);
  if (minuteMatch) return Math.max(0, Math.round(Number(minuteMatch[1]) * 60));
  const secondMatch = text.match(/^(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?$/i);
  if (secondMatch) return Math.max(0, Math.round(Number(secondMatch[1])));
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function formatRest(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function restInputValue(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? formatRest(seconds) : "";
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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        if (state.db === db) state.db = null;
        toast("Storage updated. Reload if the app feels stale.");
      };
      db.onclose = () => {
        if (state.db === db) state.db = null;
      };
      resolve(db);
    };
    request.onblocked = () => reject(new Error("Storage update is blocked by another TrainWise tab. Close other TrainWise tabs and retry."));
    request.onerror = () => reject(request.error);
  });
}

async function ensureDB() {
  if (state.db) return state.db;
  if (!dbOpenPromise) {
    dbOpenPromise = openDB()
      .then((db) => {
        state.db = db;
        return db;
      })
      .finally(() => {
        dbOpenPromise = null;
      });
  }
  return dbOpenPromise;
}

function isDBConnectionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("transaction") || message.includes("database connection") || message.includes("closed");
}

async function runStoreRequest(name, mode, createRequest, retried = false) {
  const db = await ensureDB();
  try {
    return await new Promise((resolve, reject) => {
      let request;
      try {
        request = createRequest(db.transaction(name, mode).objectStore(name));
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    if (!retried && isDBConnectionError(error)) {
      if (state.db === db) state.db = null;
      try {
        db.close();
      } catch {}
      return runStoreRequest(name, mode, createRequest, true);
    }
    throw error;
  }
}

async function dbAll(name) {
  return (await runStoreRequest(name, "readonly", (store) => store.getAll())) || [];
}

async function dbPut(name, value) {
  await runStoreRequest(name, "readwrite", (store) => store.put(value));
  return value;
}

async function dbPutBatch(name, values) {
  if (!values.length) return;
  const db = await ensureDB();
  const tx = db.transaction(name, "readwrite");
  const store = tx.objectStore(name);
  for (const value of values) store.put(value);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(name, id) {
  await runStoreRequest(name, "readwrite", (store) => store.delete(id));
}

async function dbClear(name) {
  await runStoreRequest(name, "readwrite", (store) => store.clear());
}

function sortByDateDesc(items) {
  return items.sort((a, b) => {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function workoutOrderValue(entry) {
  const order = Number(entry?.order);
  return Number.isFinite(order) ? order : Number.POSITIVE_INFINITY;
}

function sortWorkoutsForDate(entries = []) {
  return [...entries].sort((a, b) => {
    const orderCompare = workoutOrderValue(a) - workoutOrderValue(b);
    if (orderCompare) return orderCompare;
    const createdCompare = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (createdCompare) return createdCompare;
    return String(a.exercise || "").localeCompare(String(b.exercise || ""));
  });
}

function workoutsForDate(date) {
  return sortWorkoutsForDate(state.workouts.filter((workout) => workout.date === date));
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

function currentTrainingWeekStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
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

function uniqueMuscles(values = []) {
  const input = Array.isArray(values) ? values : [values];
  const valid = new Set(muscleGroups.map((muscle) => muscle.id));
  const seen = new Set();
  return input
    .map((value) => String(value || "").trim())
    .filter((value) => valid.has(value) && !seen.has(value) && seen.add(value));
}

function normalizeExerciseDefinition(exercise) {
  const name = String(exercise?.name || "").trim();
  if (!name) return null;
  const primaryMuscles = uniqueMuscles(exercise.primaryMuscles || exercise.primaryMuscle || exercise.targetMuscle || "chest");
  if (!primaryMuscles.length) primaryMuscles.push("chest");
  const secondaryMuscles = uniqueMuscles(exercise.secondaryMuscles || [])
    .filter((muscle) => !primaryMuscles.includes(muscle));
  const id = String(exercise.id || `user-${normalizeName(name)}`).trim();

  return {
    id,
    name,
    primaryMuscles,
    secondaryMuscles,
    equipment: String(exercise.equipment || "custom").trim() || "custom",
    reps: String(exercise.reps || "8-15").trim() || "8-15",
    rest: String(exercise.rest || "60-120 sec").trim() || "60-120 sec",
    cue: String(exercise.cue || "Custom exercise. Keep form strict and progress gradually.").trim(),
    userCreated: true,
    createdAt: exercise.createdAt || new Date().toISOString(),
    updatedAt: exercise.updatedAt || exercise.createdAt || new Date().toISOString()
  };
}

function getCustomExercises() {
  const source = Array.isArray(state.settings.customExercises) ? state.settings.customExercises : [];
  const seen = new Set();
  return source
    .map(normalizeExerciseDefinition)
    .filter(Boolean)
    .filter((exercise) => {
      const key = normalizeName(exercise.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getHiddenExercises() {
  return Array.isArray(state.settings.hiddenExercises) ? state.settings.hiddenExercises : [];
}

function exerciseDatabase() {
  const hidden = new Set(getHiddenExercises());
  const seen = new Set();
  return getCustomExercises()
    .filter((exercise) => {
      if (hidden.has(exercise.id)) return false;
      const key = normalizeName(exercise.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function exerciseNames() {
  return exerciseDatabase().map((exercise) => exercise.name);
}

function allExerciseMetadata() {
  return [...exerciseDatabase(), ...legacyExerciseMetadata.map((exercise) => ({
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

function setRowsFromWorkout(workout) {
  if (Array.isArray(workout.setRows) && workout.setRows.length) {
    return workout.setRows.map((row) => ({
      weight: parseNum(row.weight),
      reps: Math.max(1, parseNum(row.reps)),
      rir: row.rir === null || row.rir === undefined || row.rir === "" ? null : parseNum(row.rir),
      restSeconds: parseRestSeconds(row.restSeconds ?? row.rest ?? row.restTime)
    }));
  }
  const sets = Math.max(1, parseNum(workout.sets));
  return Array.from({ length: sets }, () => ({
    weight: Math.max(0, parseNum(workout.weight)),
    reps: Math.max(1, parseNum(workout.reps)),
    rir: workout.rir === null || workout.rir === undefined || workout.rir === "" ? null : parseNum(workout.rir),
    restSeconds: parseRestSeconds(workout.restSeconds ?? workout.rest ?? workout.restTime)
  }));
}

function normalizeSetRows(rows) {
  const cleaned = (rows || [])
    .map((row) => ({
      weight: Math.max(0, parseNum(row.weight)),
      reps: Math.max(1, parseNum(row.reps)),
      rir: row.rir === "" || row.rir === null || row.rir === undefined ? null : Math.max(0, parseNum(row.rir)),
      restSeconds: parseRestSeconds(row.restSeconds ?? row.rest ?? row.restTime)
    }))
    .filter((row) => row.reps > 0);
  return cleaned.length ? cleaned : [{ weight: 0, reps: 10, rir: 2, restSeconds: null }];
}

function workoutVolume(workout) {
  return setRowsFromWorkout(workout).reduce((sum, row) => sum + row.weight * row.reps, 0);
}

function draftVolume(draft) {
  return normalizeSetRows(draft.setRows).reduce((sum, row) => sum + row.weight * row.reps, 0);
}

function e1rm(workout) {
  return setRowsFromWorkout(workout).reduce((best, row) => Math.max(best, row.weight * (1 + row.reps / 30)), 0);
}

function rowEffortMultiplier(row) {
  if (row.rir === null || row.rir === undefined || row.rir === "") return 1;
  return Number(row.rir) <= HYPERTROPHY.idealRirMax ? 1 : HYPERTROPHY.highRirDiscount;
}

function hardSetCount(workout) {
  return setRowsFromWorkout(workout).reduce((sum, row) => sum + rowEffortMultiplier(row), 0);
}

function creditedSetsForWorkout(workout) {
  const meta = workoutMeta(workout);
  const base = hardSetCount(workout);
  const credits = {};
  for (const muscle of meta.primaryMuscles || []) {
    credits[muscle] = (credits[muscle] || 0) + base;
  }
  for (const muscle of meta.secondaryMuscles || []) {
    credits[muscle] = (credits[muscle] || 0) + base * 0.5;
  }
  return credits;
}

function bestSetLabel(workout) {
  const best = bestSet(workout);
  return best ? `${fmt(best.weight)} x ${fmt(best.reps)}` : "--";
}

function bestSet(workout) {
  return setRowsFromWorkout(workout).reduce((winner, row) => {
    const score = row.weight * (1 + row.reps / 30);
    return !winner || score > winner.score ? { ...row, score } : winner;
  }, null);
}

function averageRir(workout) {
  const values = setRowsFromWorkout(workout)
    .map((row) => row.rir)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRestSeconds(workout) {
  const values = setRowsFromWorkout(workout)
    .map((row) => row.restSeconds)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseRepRange(value) {
  const nums = String(value || "").match(/\d+/g)?.map(Number) || [];
  if (!nums.length) return { low: 8, high: 15 };
  if (nums.length === 1) return { low: Math.max(1, nums[0] - 2), high: nums[0] };
  return { low: Math.max(1, nums[0]), high: Math.max(nums[0], nums[1]) };
}

function exerciseHistoryEntries(exerciseName, newestFirst = true) {
  const entries = state.workouts
    .filter((entry) => entry.exercise === exerciseName)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return newestFirst ? entries.reverse() : entries;
}

function exerciseStats(exerciseName) {
  const entries = exerciseHistoryEntries(exerciseName, false);
  const allSets = entries.flatMap(setRowsFromWorkout);
  const best = entries.reduce((winner, entry) => {
    const current = bestSet(entry);
    return current && (!winner || current.score > winner.score) ? { ...current, date: entry.date } : winner;
  }, null);
  const bestVolumeEntry = entries.reduce((winner, entry) => (
    !winner || workoutVolume(entry) > workoutVolume(winner) ? entry : winner
  ), null);
  return {
    entries,
    sessions: entries.length,
    totalLoadVolume: entries.reduce((sum, entry) => sum + workoutVolume(entry), 0),
    bestSet: best,
    bestWeight: allSets.reduce((max, row) => Math.max(max, row.weight), 0),
    bestLoadVolume: bestVolumeEntry ? workoutVolume(bestVolumeEntry) : 0,
    bestLoadVolumeDate: bestVolumeEntry?.date || "",
    lastDate: entries[entries.length - 1]?.date || "",
    firstDate: entries[0]?.date || ""
  };
}

function progressiveOverloadIndicator(exerciseName) {
  const entries = exerciseHistoryEntries(exerciseName);
  if (entries.length < 2) return { symbol: "-", tone: "flat", label: "Need another session" };
  const latest = e1rm(entries[0]);
  const previous = e1rm(entries[1]);
  if (latest > previous * 1.01) return { symbol: "+", tone: "up", label: `e1RM up ${fmt(latest - previous, 1)} lb` };
  if (latest < previous * 0.99) return { symbol: "-", tone: "down", label: `e1RM down ${fmt(previous - latest, 1)} lb` };
  return { symbol: "=", tone: "flat", label: "e1RM steady" };
}

function progressionTargetForExercise(exerciseName) {
  const latest = exerciseHistoryEntries(exerciseName)[0];
  if (!latest) return null;
  const top = bestSet(latest);
  if (!top) return null;
  const meta = resolveExerciseMeta(exerciseName);
  const range = parseRepRange(meta.reps);
  const nextRep = Math.min(range.high, top.reps + 1);
  const loadStep = top.weight >= 50 ? 5 : 2.5;
  const indicator = progressiveOverloadIndicator(exerciseName);
  const target = top.reps < range.high
    ? `${fmt(top.weight, 1)} lb x ${fmt(nextRep)}-${fmt(range.high)}`
    : `${fmt(top.weight + loadStep, 1)} lb x ${fmt(range.low)}-${fmt(Math.max(range.low, top.reps - 2))}`;
  return {
    exercise: exerciseName,
    latest,
    top,
    indicator,
    target,
    body: `Last ${exerciseName}: ${fmt(top.weight, 1)} lb x ${fmt(top.reps)}. Next target: ${target}, while keeping ${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR.`
  };
}

function weeklyWorkouts() {
  const start = currentTrainingWeekStart();
  return state.workouts.filter((entry) => parseLocalDate(entry.date) >= start);
}

function getWeeklyVolume() {
  return weeklyWorkouts().reduce((sum, entry) => sum + workoutVolume(entry), 0);
}

function emptyNutritionMeals() {
  return Object.fromEntries(NUTRITION_MEALS.map((meal) => [meal.id, { calories: 0, protein: 0 }]));
}

function nutritionMealsHaveData(meals = {}) {
  return NUTRITION_MEALS.some((meal) => {
    const source = meals?.[meal.id];
    return parseNum(source?.calories) > 0 || parseNum(source?.protein) > 0;
  });
}

function metricHasMealData(entry = {}) {
  return nutritionMealsHaveData(entry.meals);
}

function nutritionMealsFromData(data = {}) {
  const meals = emptyNutritionMeals();
  for (const meal of NUTRITION_MEALS) {
    meals[meal.id] = {
      calories: parseNum(data[`meal-${meal.id}-calories`]),
      protein: parseNum(data[`meal-${meal.id}-protein`])
    };
  }
  return meals;
}

function normalizeMetricMeals(entry = {}) {
  const meals = emptyNutritionMeals();
  for (const meal of NUTRITION_MEALS) {
    meals[meal.id] = {
      calories: parseNum(entry.meals?.[meal.id]?.calories),
      protein: parseNum(entry.meals?.[meal.id]?.protein)
    };
  }
  return meals;
}

function nutritionMealTotals(meals = emptyNutritionMeals()) {
  return NUTRITION_MEALS.reduce((totals, meal) => {
    totals.calories += parseNum(meals[meal.id]?.calories);
    totals.protein += parseNum(meals[meal.id]?.protein);
    return totals;
  }, { calories: 0, protein: 0 });
}

function nutritionQuickTotalsFromData(data = {}) {
  return {
    calories: parseNum(data.calories),
    protein: parseNum(data.protein)
  };
}

function nutritionFormTotalsFromData(data = {}) {
  const meals = nutritionMealsFromData(data);
  if (nutritionMealsHaveData(meals)) return nutritionMealTotals(meals);
  return nutritionQuickTotalsFromData(data);
}

function metricTimestamp(entry = {}) {
  return String(entry.updatedAt || entry.createdAt || "");
}

function sortMetricsAsc(entries = []) {
  return [...entries].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare) return dateCompare;
    return metricTimestamp(a).localeCompare(metricTimestamp(b));
  });
}

function normalizeMetricEntry(entry = {}) {
  const meals = normalizeMetricMeals(entry);
  const mealDetail = nutritionMealsHaveData(meals);
  const quickTotals = mealDetail
    ? { calories: 0, protein: 0 }
    : {
        calories: parseNum(entry.quickCalories ?? entry.calories),
        protein: parseNum(entry.quickProtein ?? entry.protein)
      };
  const mealTotals = nutritionMealTotals(meals);
  const totals = mealDetail ? mealTotals : quickTotals;
  return {
    ...entry,
    id: entry.id || uid(),
    date: entry.date || todayISO(),
    bodyWeight: parseNum(entry.bodyWeight),
    calories: totals.calories,
    protein: totals.protein,
    meals,
    mealDetail,
    quickCalories: quickTotals.calories,
    quickProtein: quickTotals.protein,
    notes: String(entry.notes || "").trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  };
}

function metricEntriesForDate(date, entries = state.metrics) {
  return entries.filter((entry) => entry.date === date);
}

function mergeMetricEntries(entries = [], date = entries[0]?.date || todayISO()) {
  const dated = sortMetricsAsc(entries.filter((entry) => (entry.date || date) === date));
  if (!dated.length) return null;
  const mergedMeals = emptyNutritionMeals();
  const normalized = dated.map(normalizeMetricEntry);
  let quickCalories = 0;
  let quickProtein = 0;
  let mealDetail = false;
  for (const entry of normalized) {
    if (entry.mealDetail) {
      mealDetail = true;
      for (const meal of NUTRITION_MEALS) {
        mergedMeals[meal.id].calories += parseNum(entry.meals[meal.id]?.calories);
        mergedMeals[meal.id].protein += parseNum(entry.meals[meal.id]?.protein);
      }
    } else {
      quickCalories += parseNum(entry.quickCalories);
      quickProtein += parseNum(entry.quickProtein);
    }
  }
  const mealTotals = nutritionMealTotals(mergedMeals);
  const totals = {
    calories: quickCalories + mealTotals.calories,
    protein: quickProtein + mealTotals.protein
  };
  const latest = normalized[normalized.length - 1];
  const first = normalized[0];
  const latestWeight = [...normalized].reverse().find((entry) => entry.bodyWeight > 0)?.bodyWeight || 0;
  const latestNotes = [...normalized].reverse().find((entry) => entry.notes)?.notes || "";
  return {
    ...latest,
    date,
    bodyWeight: latestWeight,
    calories: totals.calories,
    protein: totals.protein,
    meals: mergedMeals,
    mealDetail,
    quickCalories,
    quickProtein,
    notes: latestNotes,
    createdAt: first.createdAt,
    updatedAt: latest.updatedAt || latest.createdAt
  };
}

function canonicalMetricEntries(entries = state.metrics) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!entry?.date) continue;
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  return [...byDate.entries()]
    .map(([date, items]) => mergeMetricEntries(items, date))
    .filter(Boolean)
    .sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare) return dateCompare;
      return metricTimestamp(b).localeCompare(metricTimestamp(a));
    });
}

function metricForDate(date) {
  return mergeMetricEntries(metricEntriesForDate(date), date);
}

function metricDuplicateIdsForDate(date, keepId) {
  return metricEntriesForDate(date)
    .filter((entry) => entry.id && entry.id !== keepId)
    .map((entry) => entry.id);
}

function metricEntryFromFormData(data = {}, existing = null) {
  const meals = nutritionMealsFromData(data);
  const mealDetail = nutritionMealsHaveData(meals);
  const quickTotals = nutritionQuickTotalsFromData(data);
  const totals = mealDetail ? nutritionMealTotals(meals) : quickTotals;
  return {
    id: existing?.id || uid(),
    date: data.date || existing?.date || todayISO(),
    bodyWeight: parseNum(data.bodyWeight),
    calories: totals.calories,
    protein: totals.protein,
    meals: mealDetail ? meals : emptyNutritionMeals(),
    mealDetail,
    quickCalories: mealDetail ? 0 : quickTotals.calories,
    quickProtein: mealDetail ? 0 : quickTotals.protein,
    notes: String(data.notes || "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function getAverage(field, days) {
  const start = recentDays(days);
  const values = canonicalMetricEntries()
    .filter((entry) => parseLocalDate(entry.date) >= start && entry[field] > 0)
    .map((entry) => entry[field]);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lastMetric(field) {
  return canonicalMetricEntries().find((entry) => Number.isFinite(entry[field]) && entry[field] > 0);
}

function weightTrend(days = 14) {
  const start = recentDays(days);
  const entries = canonicalMetricEntries()
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

function selectedNutritionGoal() {
  const goal = state.settings.nutritionGoal;
  return NUTRITION_GOAL_OPTIONS.some((option) => option.id === goal) ? goal : "bulk";
}

function nutritionGoalLabel(goal = selectedNutritionGoal()) {
  return NUTRITION_GOAL_OPTIONS.find((option) => option.id === goal)?.label || "Bulk";
}

function metricEntriesForField(field, days) {
  const start = recentDays(days);
  return canonicalMetricEntries()
    .filter((entry) => parseLocalDate(entry.date) >= start && Number.isFinite(entry[field]) && entry[field] > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function healthCoachSummary() {
  const goal = selectedNutritionGoal();
  const protein = proteinTargets();
  const calorieAverage = getAverage("calories", 7);
  const proteinAverage = getAverage("protein", 7);
  const latestWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  const weightEntries = metricEntriesForField("bodyWeight", 14);
  const weightTrendLb = weightEntries.length >= 2
    ? weightEntries[weightEntries.length - 1].bodyWeight - weightEntries[0].bodyWeight
    : null;
  const daySpan = weightEntries.length >= 2
    ? Math.max(1, daysBetween(weightEntries[0].date, weightEntries[weightEntries.length - 1].date))
    : 0;
  const weeklyWeightRate = weightTrendLb === null ? null : (weightTrendLb / daySpan) * 7;
  const summary = {
    goal,
    goalLabel: nutritionGoalLabel(goal),
    calorieAverage,
    proteinAverage,
    latestWeight,
    weightTrendLb,
    weeklyWeightRate,
    proteinFloor: protein.floor,
    proteinUpper: protein.upper,
    tone: "warn",
    recommendation: ""
  };

  if (!calorieAverage) {
    summary.recommendation = "Log calories for a few days before Coach adjusts intake.";
    return summary;
  }
  if (weightEntries.length < 2) {
    summary.recommendation = "Log body weight consistently before judging the calorie trend.";
    return summary;
  }
  if (protein.bodyWeightLb && proteinAverage && proteinAverage < protein.floor) {
    summary.tone = "hot";
    summary.recommendation = `Protein is below target: ${fmt(proteinAverage)}g avg vs ${fmt(protein.floor)}g floor. Bring protein up before judging calories.`;
    return summary;
  }
  if (!protein.bodyWeightLb || !proteinAverage) {
    summary.recommendation = "Log body weight and protein so Coach can verify the hypertrophy protein floor.";
    return summary;
  }

  if (goal === "bulk") {
    if (weeklyWeightRate <= 0) {
      summary.recommendation = "Bulk trend is flat or down. Add about +150-250 cal/day and watch the next 2 weeks.";
    } else {
      summary.tone = "good";
      summary.recommendation = "Bulk trend is moving up. Keep calories steady unless weight jumps faster than intended.";
    }
  } else if (goal === "cut") {
    if (weeklyWeightRate >= 0) {
      summary.recommendation = "Cut trend is flat or up. Reduce about -150-250 cal/day and watch the next 2 weeks.";
    } else {
      summary.tone = "good";
      summary.recommendation = "Cut trend is moving down. Keep protein high and avoid rushing the deficit.";
    }
  } else if (Math.abs(weeklyWeightRate) <= 0.25) {
    summary.tone = "good";
    summary.recommendation = "Stay the course. Maintenance trend is stable and protein is covered.";
  } else if (weeklyWeightRate > 0.25) {
    summary.recommendation = "Maintenance trend is drifting up. Trim about -150-250 cal/day if you want weight steadier.";
  } else {
    summary.recommendation = "Maintenance trend is drifting down. Add about +150-250 cal/day if you want weight steadier.";
  }
  return summary;
}

function healthCoachStatMarkup(summary) {
  const trend = summary.weightTrendLb === null ? "--" : `${summary.weightTrendLb >= 0 ? "+" : ""}${fmt(summary.weightTrendLb, 1)} lb`;
  const weekly = summary.weeklyWeightRate === null ? "--" : `${summary.weeklyWeightRate >= 0 ? "+" : ""}${fmt(summary.weeklyWeightRate, 2)} lb/wk`;
  return `
    <div class="grid four health-summary-grid">
      <div class="stat"><span class="label">Goal</span><span class="value">${escapeHtml(summary.goalLabel)}</span><span class="hint">nutrition phase</span></div>
      <div class="stat"><span class="label">Calories</span><span class="value">${summary.calorieAverage ? fmt(summary.calorieAverage) : "--"}</span><span class="hint">7-day avg</span></div>
      <div class="stat"><span class="label">Protein</span><span class="value">${summary.proteinAverage ? `${fmt(summary.proteinAverage)}g` : "--"}</span><span class="hint">${summary.proteinFloor ? `${fmt(summary.proteinFloor)}g floor` : "needs weight"}</span></div>
      <div class="stat"><span class="label">Weight</span><span class="value">${trend}</span><span class="hint">${weekly}</span></div>
    </div>
  `;
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

    if (setRowsFromWorkout(workout).some((row) => row.rir !== null && Number(row.rir) > HYPERTROPHY.idealRirMax)) {
      highRir.push({ ...workout, meta });
    }
  }

  return muscleGroups.map((muscle) => {
    const sets = totals[muscle.id];
    return {
      ...muscle,
      sets,
      sessions: sessions[muscle.id].size,
      percent: Math.min(100, (sets / HYPERTROPHY.growthHigh) * 100),
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
  return { key: "high", label: "High volume", tone: "high-volume" };
}

function workoutsNewestFirst(workouts = state.workouts) {
  return [...workouts].sort((a, b) => {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
  });
}

function latestWorkout() {
  return workoutsNewestFirst()[0] || null;
}

function exerciseHistoryForDefinition(exercise) {
  const normalizedName = normalizeName(exercise.name);
  return workoutsNewestFirst().filter((workout) => (
    workout.exerciseId === exercise.id || normalizeName(workout.exercise) === normalizedName
  ));
}

function scoreExerciseForMuscle(exercise, muscleId) {
  const history = exerciseHistoryForDefinition(exercise);
  const last = history[0] || null;
  const daysSince = last ? daysBetween(last.date, todayISO()) : null;
  const usageScore = Math.min(12, history.length * 2);
  const recencyPenalty = daysSince === null ? 0 : Math.max(0, 12 - daysSince);
  const customScore = exercise.userCreated ? 3 : 0;
  const selectedScore = exercise.name === state.selectedExercise ? 1 : 0;
  const specificityScore = (exercise.primaryMuscles || []).length === 1 ? 1 : 0;
  const targetIndex = (exercise.primaryMuscles || []).indexOf(muscleId);
  const targetScore = targetIndex === 0 ? 1 : 0;
  const effortScore = last ? Math.max(0, 4 - (averageRir(last) ?? 2)) : 0;
  let progressionScore = 0;
  if (history.length >= 2) {
    const recent3 = history.slice(0, 3);
    const prior3 = history.slice(3, 6);
    const recentE1rm = recent3.reduce((sum, w) => sum + e1rm(w), 0) / recent3.length;
    const priorE1rm = prior3.length ? prior3.reduce((sum, w) => sum + e1rm(w), 0) / prior3.length : recentE1rm;
    if (recentE1rm > priorE1rm) progressionScore = 3;
    else if (recentE1rm === priorE1rm && prior3.length) progressionScore = 1;
  }
  return usageScore + customScore + selectedScore + specificityScore + targetScore + effortScore + progressionScore - recencyPenalty;
}

function chooseExerciseForMuscle(muscleId, usedExerciseIds = new Set()) {
  return exerciseDatabase()
    .filter((exercise) => exercise.primaryMuscles.includes(muscleId) && !usedExerciseIds.has(exercise.id))
    .sort((a, b) => scoreExerciseForMuscle(b, muscleId) - scoreExerciseForMuscle(a, muscleId))
    [0] || null;
}

function hasPrimaryExerciseForMuscle(muscleId) {
  return exerciseDatabase().some((exercise) => exercise.primaryMuscles.includes(muscleId));
}

function estimateExerciseMinutes(exercise, sets) {
  const personalRestSeconds = averageRestSecondsForExercise(exercise);
  const restMatch = String(exercise.rest || "90 sec").match(/(\d+)(?:-(\d+))?/);
  const restSeconds = personalRestSeconds
    || (restMatch ? (Number(restMatch[2] || restMatch[1]) + Number(restMatch[1])) / 2 : 90);
  const isCompound = (exercise.secondaryMuscles || []).length > 0;
  const compoundMultiplier = isCompound ? 1.15 : 1;
  const perSetMinutes = (0.75 + restSeconds / 60) * compoundMultiplier;
  return Math.ceil(3 + sets * perSetMinutes);
}

function averageRestSecondsForExercise(exercise) {
  const values = exerciseHistoryForDefinition(exercise)
    .map(averageRestSeconds)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestWorkoutForMuscle(muscleId, mode = "any") {
  return workoutsNewestFirst().find((workout) => {
    const meta = workoutMeta(workout);
    const primary = (meta.primaryMuscles || []).includes(muscleId);
    const secondary = (meta.secondaryMuscles || []).includes(muscleId);
    if (mode === "primary") return primary;
    if (mode === "secondary") return secondary && !primary;
    return primary || secondary;
  }) || null;
}

function muscleReadiness(stat) {
  const lastPrimaryWorkout = latestWorkoutForMuscle(stat.id, "primary");
  const lastSecondaryWorkout = latestWorkoutForMuscle(stat.id, "secondary");
  const lastWorkout = lastPrimaryWorkout || lastSecondaryWorkout;
  const primaryDaysSince = lastPrimaryWorkout ? daysBetween(lastPrimaryWorkout.date, todayISO()) : null;
  const secondaryDaysSince = lastSecondaryWorkout ? daysBetween(lastSecondaryWorkout.date, todayISO()) : null;
  const daysSince = primaryDaysSince ?? secondaryDaysSince;
  let readiness = "ready";
  let reason;
  if (!lastPrimaryWorkout && !lastSecondaryWorkout) {
    reason = "No recent work logged.";
  } else if (lastPrimaryWorkout && lastSecondaryWorkout) {
    reason = `Directly trained ${primaryDaysSince} day${primaryDaysSince === 1 ? "" : "s"} ago, secondary work ${secondaryDaysSince} day${secondaryDaysSince === 1 ? "" : "s"} ago.`;
  } else if (lastPrimaryWorkout) {
    reason = `Directly trained ${primaryDaysSince} day${primaryDaysSince === 1 ? "" : "s"} ago.`;
  } else {
    reason = `Secondary work ${secondaryDaysSince} day${secondaryDaysSince === 1 ? "" : "s"} ago.`;
  }
  if (primaryDaysSince !== null && primaryDaysSince <= 1) {
    readiness = "recent";
    reason = `Directly trained ${primaryDaysSince === 0 ? "today" : "yesterday"}, so it can wait if another gap is useful.`;
  } else if (secondaryDaysSince !== null && secondaryDaysSince <= 1) {
    readiness = "secondary-recent";
    reason = `Only secondary work ${secondaryDaysSince === 0 ? "today" : "yesterday"}; direct work can still be useful if the gap is large.`;
  } else if (stat.sessions < 2 && stat.sets >= 5) {
    readiness = "needs-touch";
    reason = `${stat.sessions}/2 weekly touches; a second exposure would help.`;
  } else if (stat.sets > HYPERTROPHY.growthHigh) {
    readiness = "high";
    reason = `Above the default growth zone; monitor performance and recovery.`;
  }
  return { ...stat, lastWorkout, lastPrimaryWorkout, lastSecondaryWorkout, daysSince, primaryDaysSince, secondaryDaysSince, readiness, readinessReason: reason };
}

function coachMusclePrioritySort(a, b) {
  const aPrimaryRecent = a.primaryDaysSince !== null && a.primaryDaysSince <= 1;
  const bPrimaryRecent = b.primaryDaysSince !== null && b.primaryDaysSince <= 1;
  const aSecondaryRecent = a.secondaryDaysSince !== null && a.secondaryDaysSince <= 1;
  const bSecondaryRecent = b.secondaryDaysSince !== null && b.secondaryDaysSince <= 1;
  return (aPrimaryRecent - bPrimaryRecent)
    || (b.deficit - a.deficit)
    || (a.sessions - b.sessions)
    || (aSecondaryRecent - bSecondaryRecent)
    || (a.sets - b.sets)
    || (muscleGroups.findIndex((muscle) => muscle.id === a.id) - muscleGroups.findIndex((muscle) => muscle.id === b.id));
}

function muscleRegion(muscleId) {
  return COACH_MUSCLE_REGIONS[muscleId] || "other";
}

function balancedCoverageTargets(targets) {
  const buckets = new Map();
  const orderedRegions = [...COACH_REGION_ORDER, "other"];
  for (const target of targets) {
    const region = muscleRegion(target.id);
    if (!buckets.has(region)) buckets.set(region, []);
    buckets.get(region).push(target);
    if (!orderedRegions.includes(region)) orderedRegions.push(region);
  }

  const ordered = [];
  while ([...buckets.values()].some((items) => items.length)) {
    for (const region of orderedRegions) {
      const bucket = buckets.get(region);
      if (bucket?.length) ordered.push(bucket.shift());
    }
  }
  return ordered;
}

function rankedCoachMuscles() {
  return muscleSetStats().map(muscleReadiness).sort(coachMusclePrioritySort);
}

function optimumSetGap(stat) {
  return Math.max(0, HYPERTROPHY.growthHigh - stat.sets);
}

function plannedOptimumGap(item) {
  return Math.max(0, HYPERTROPHY.growthHigh - (item.muscle.sets + item.sets));
}

function planSetCeilingForTarget(target, allowHighVolume = false) {
  if (target.sets < HYPERTROPHY.minimumSets) return HYPERTROPHY.minimumSets;
  return allowHighVolume ? HYPERTROPHY.highVolumeFillMax : HYPERTROPHY.growthHigh;
}

function planSetGap(target, allowHighVolume = false) {
  return Math.max(0, Math.ceil(planSetCeilingForTarget(target, allowHighVolume) - target.sets));
}

function plannedSetGap(item, allowHighVolume = false) {
  return Math.max(0, Math.ceil(planSetCeilingForTarget(item.muscle, allowHighVolume) - (item.muscle.sets + item.sets)));
}

function planPriorityReason(item) {
  const highVolume = item.phase === "high-volume";
  const targetSets = planSetCeilingForTarget(item.muscle, highVolume);
  const parts = [
    `${highVolume ? "High-volume filler: " : ""}${item.muscle.label} is ${fmt(item.muscle.sets, 1)}/${targetSets} hard sets`,
    `${item.muscle.sessions}/2 touches`
  ];
  if (item.muscle.daysSince !== null) parts.push(`last hit ${item.muscle.daysSince}d ago`);
  return parts.join(" - ");
}

function selectedCoachTimeframeMinutes() {
  const selected = Number(state.coachTimeframeMinutes) || SESSION_LIMIT_MINUTES;
  return COACH_TIMEFRAME_OPTIONS.some((option) => option.minutes === selected) ? selected : SESSION_LIMIT_MINUTES;
}

function selectedCoachTargetMuscles() {
  const valid = new Set(muscleGroups.map((muscle) => muscle.id));
  return Array.isArray(state.coachTargetMuscles)
    ? state.coachTargetMuscles.filter((id, index, items) => valid.has(id) && items.indexOf(id) === index)
    : [];
}

function isCoachTargetMuscle(muscleId, targetMuscles = selectedCoachTargetMuscles()) {
  return targetMuscles.includes(muscleId);
}

function coachTimeframeLabel(minutes = selectedCoachTimeframeMinutes()) {
  return COACH_TIMEFRAME_OPTIONS.find((option) => option.minutes === minutes)?.label || "1 hour";
}

function coachTimeframeSelectionLabel(minutes = selectedCoachTimeframeMinutes()) {
  return `Selected: ${coachTimeframeLabel(minutes)}`;
}

function sessionPlanCaps(limitMinutes, restart = false) {
  const limit = Math.min(75, Math.max(30, Number(limitMinutes) || SESSION_LIMIT_MINUTES));
  const maxItems = limit <= 30 ? 4 : limit <= 40 ? 5 : limit <= 50 ? 6 : limit <= 60 ? 8 : 10;
  if (restart) {
    return {
      maxItems,
      minSets: 2,
      maxSets: limit <= 40 ? 2 : limit <= 60 ? 3 : 4
    };
  }
  return {
    maxItems,
    minSets: 2,
    maxSets: limit <= 30 ? 4 : limit <= 40 ? 5 : limit <= 50 ? 6 : limit <= 60 ? 8 : 10
  };
}

function plannedExerciseMinutes(item, sets = item.sets) {
  return estimateExerciseMinutes(item.exercise, sets);
}

function initialSetsForPlanTarget(target, caps, allowHighVolume = false) {
  const gap = planSetGap(target, allowHighVolume);
  if (!gap) return 0;
  return Math.max(1, Math.min(caps.minSets, caps.maxSets, gap));
}

function maxSetsForPlanTarget(target, caps, fillToTime = false, allowHighVolume = false) {
  const targetGap = planSetGap(target, allowHighVolume);
  if (!targetGap) return 0;
  if (fillToTime) return Math.max(1, Math.min(caps.maxSets, targetGap));
  return Math.max(1, Math.min(caps.maxSets, Math.max(1, Math.ceil(target.deficit))));
}

function buildSessionPlan(limitMinutes = SESSION_LIMIT_MINUTES, options = {}) {
  const restart = options.restart || false;
  const targetMuscles = Array.isArray(options.targetMuscles) ? options.targetMuscles : selectedCoachTargetMuscles();
  const cappedLimit = Math.min(75, Math.max(30, Number(limitMinutes) || SESSION_LIMIT_MINUTES));
  const targetFloor = Math.max(0, cappedLimit - COACH_TIME_TOLERANCE_MINUTES);
  const hardLimit = cappedLimit + COACH_TIME_TOLERANCE_MINUTES;
  const caps = sessionPlanCaps(cappedLimit, restart);
  const allStats = muscleSetStats()
    .map(muscleReadiness)
    .sort(coachMusclePrioritySort);
  const stats = allStats.filter((stat) => stat.sets < HYPERTROPHY.minimumSets);
  const optimumCandidates = allStats.filter((stat) => stat.sets < HYPERTROPHY.growthHigh);
  const items = [];
  const missing = [];
  const missingIds = new Set();
  let totalMinutes = 0;
  const usedExercises = new Set();

  const addTargetToPlan = (target, addOptions = {}) => {
    const trackMissing = addOptions.trackMissing !== false;
    const allowHighVolume = addOptions.allowHighVolume === true;
    const phase = addOptions.phase || (target.sets < HYPERTROPHY.minimumSets ? "floor" : "optimum");
    const exercise = chooseExerciseForMuscle(target.id, usedExercises);
    if (!exercise) {
      if (trackMissing && !missingIds.has(target.id)) {
        missing.push(target);
        missingIds.add(target.id);
      }
      return false;
    }
    let sets = initialSetsForPlanTarget(target, caps, allowHighVolume);
    if (!sets) return false;
    let minutes = estimateExerciseMinutes(exercise, sets);
    while (sets > 1 && totalMinutes + minutes > hardLimit) {
      sets -= 1;
      minutes = estimateExerciseMinutes(exercise, sets);
    }
    if (totalMinutes + minutes > hardLimit) return false;
    items.push({ muscle: target, exercise, sets, minutes, reason: "", phase });
    usedExercises.add(exercise.id);
    totalMinutes += minutes;
    return true;
  };

  const freshTargets = balancedCoverageTargets(stats.filter((target) => !(target.primaryDaysSince !== null && target.primaryDaysSince <= 1)));
  const recentPrimaryTargets = balancedCoverageTargets(stats.filter((target) => target.primaryDaysSince !== null && target.primaryDaysSince <= 1));

  for (const group of [freshTargets, recentPrimaryTargets]) {
    for (const target of group) {
      if (items.some((item) => item.muscle.id === target.id)) continue;
      addTargetToPlan(target);
      if (items.length >= caps.maxItems) break;
    }
    if (items.length >= caps.maxItems) break;
  }

  if (!restart && (optimumCandidates.length || targetMuscles.length)) {
    const supplementalTargets = allStats.filter((target) => (
      target.sets < HYPERTROPHY.growthHigh
      && !items.some((item) => item.muscle.id === target.id)
    )).sort((a, b) => (
      Number(isCoachTargetMuscle(b.id, targetMuscles)) - Number(isCoachTargetMuscle(a.id, targetMuscles))
    ) || (optimumSetGap(b) - optimumSetGap(a)) || coachMusclePrioritySort(a, b));
    const freshSupplemental = balancedCoverageTargets(supplementalTargets.filter((target) => !(target.primaryDaysSince !== null && target.primaryDaysSince <= 1)));
    const recentSupplemental = balancedCoverageTargets(supplementalTargets.filter((target) => target.primaryDaysSince !== null && target.primaryDaysSince <= 1));

    for (const group of [freshSupplemental, recentSupplemental]) {
      for (const target of group) {
        if (totalMinutes >= targetFloor || items.length >= caps.maxItems) break;
        addTargetToPlan(target, { phase: "optimum", trackMissing: stats.length === 0 });
      }
      if (totalMinutes >= targetFloor || items.length >= caps.maxItems) break;
    }
  }

  for (const target of stats) {
    if (!hasPrimaryExerciseForMuscle(target.id) && !missingIds.has(target.id)) {
      missing.push(target);
      missingIds.add(target.id);
    }
  }
  for (const muscleId of targetMuscles) {
    const target = allStats.find((stat) => stat.id === muscleId);
    if (target && !hasPrimaryExerciseForMuscle(target.id) && !missingIds.has(target.id)) {
      missing.push(target);
      missingIds.add(target.id);
    }
  }

  const addSetsToExisting = (fillOptions = {}) => {
    const allowHighVolume = fillOptions.allowHighVolume === true;
    let changed = true;
    while (changed) {
      changed = false;
      const eligible = items
        .filter((item) => item.sets < maxSetsForPlanTarget(
          item.muscle,
          caps,
          allowHighVolume || (!restart && (optimumCandidates.length > 0 || targetMuscles.length > 0)),
          allowHighVolume
        ))
        .sort((a, b) => (
          Number(isCoachTargetMuscle(b.muscle.id, targetMuscles)) - Number(isCoachTargetMuscle(a.muscle.id, targetMuscles))
        ) || (plannedSetGap(b, allowHighVolume) - plannedSetGap(a, allowHighVolume)) || (plannedOptimumGap(b) - plannedOptimumGap(a)) || (b.muscle.deficit - a.muscle.deficit) || (a.sets - b.sets) || (plannedExerciseMinutes(a, a.sets + 1) - plannedExerciseMinutes(b, b.sets + 1)));
      for (const item of eligible) {
        const nextMinutes = plannedExerciseMinutes(item, item.sets + 1);
        const extraMinutes = nextMinutes - item.minutes;
        if (totalMinutes + extraMinutes > hardLimit) continue;
        item.sets += 1;
        item.minutes = nextMinutes;
        if (allowHighVolume && item.muscle.sets + item.sets > HYPERTROPHY.growthHigh) item.phase = "high-volume";
        totalMinutes += extraMinutes;
        changed = true;
        break;
      }
    }
  };

  addSetsToExisting();

  if (!restart && totalMinutes < targetFloor) {
    const highVolumeTargets = balancedCoverageTargets(allStats.filter((target) => (
      target.sets < HYPERTROPHY.highVolumeFillMax
      && !items.some((item) => item.muscle.id === target.id)
    )).sort((a, b) => (
      Number(isCoachTargetMuscle(b.id, targetMuscles)) - Number(isCoachTargetMuscle(a.id, targetMuscles))
    ) || (a.sets - b.sets) || coachMusclePrioritySort(a, b)));

    for (const target of highVolumeTargets) {
      if (totalMinutes >= targetFloor || items.length >= caps.maxItems) break;
      addTargetToPlan(target, { phase: "high-volume", allowHighVolume: true, trackMissing: false });
    }
  }

  if (totalMinutes < targetFloor) {
    addSetsToExisting({ allowHighVolume: !restart });
  }

  const shortfallReason = totalMinutes < targetFloor
    ? `Estimated ${totalMinutes}/${cappedLimit} min because no library-safe remaining work fits without exceeding time or volume limits.`
    : "";

  const plannedIds = new Set(items.map((item) => item.muscle.id));
  const deprioritized = stats
    .filter((target) => target.primaryDaysSince !== null && target.primaryDaysSince <= 1 && !plannedIds.has(target.id))
    .map((target) => ({ muscle: target, reason: `${target.label} was directly trained ${target.primaryDaysSince === 0 ? "today" : "yesterday"}.` }));

  return {
    items: items.map((item) => ({ ...item, reason: planPriorityReason(item) })),
    missing,
    deprioritized,
    totalMinutes,
    limitMinutes: cappedLimit,
    targetFloorMinutes: targetFloor,
    hardLimitMinutes: hardLimit,
    shortfallReason,
    restart
  };
}

function buildTodayPlan(limitMinutes = selectedCoachTimeframeMinutes()) {
  const lastWorkout = latestWorkout();
  const daysSinceWorkout = lastWorkout ? daysBetween(lastWorkout.date, todayISO()) : null;
  const restart = daysSinceWorkout === null || daysSinceWorkout >= 4;
  const targetMuscles = selectedCoachTargetMuscles();
  const ranked = rankedCoachMuscles();
  const sessionPlan = buildSessionPlan(limitMinutes, { restart, targetMuscles });
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const highVolume = ranked.filter((stat) => stat.sets > HYPERTROPHY.growthHigh);
  const belowMinimum = ranked.filter((stat) => stat.sets < HYPERTROPHY.minimumSets);
  const belowOptimum = ranked.filter((stat) => stat.sets < HYPERTROPHY.growthHigh);
  const progression = progressionTargetForExercise(state.selectedExercise) || progressionTargetForExercise(lastWorkout?.exercise);
  const why = [];
  const selectedReasons = [];
  const skippedReasons = [];
  const missingReasons = [];
  const notes = [];

  if (restart) {
    why.push(daysSinceWorkout === null
      ? "No lifting baseline yet, so the plan starts with a small session."
      : `${daysSinceWorkout} days since your last lift, so volume is capped for a restart.`);
  }
  if (sessionPlan.items.length) {
    selectedReasons.push(...sessionPlan.items.map((item) => item.reason));
    if (targetMuscles.length) {
      const targetLabels = muscleGroups.filter((muscle) => targetMuscles.includes(muscle.id)).map((muscle) => muscle.label);
      selectedReasons.unshift(`Target focus: ${targetLabels.join(", ")} after weekly floors are covered.`);
    }
    why.push(...selectedReasons.slice(0, 3));
  }
  if (sessionPlan.deprioritized.length) {
    skippedReasons.push(...sessionPlan.deprioritized.map((item) => `${item.reason} Coach picked another gap first.`));
    why.push(...skippedReasons.slice(0, 2));
  }
  if (sessionPlan.missing.length) {
    missingReasons.push(...sessionPlan.missing.map((muscle) => `Add a primary exercise for ${muscle.label}.`));
    why.push(`Add a primary exercise for ${sessionPlan.missing.map((muscle) => muscle.label).join(", ")} to unlock better plans.`);
  }
  if (sessionPlan.shortfallReason) {
    notes.push(sessionPlan.shortfallReason);
    why.push(sessionPlan.shortfallReason);
  }
  if (protein.bodyWeightLb && proteinAvg && proteinAvg < protein.floor) {
    notes.push(`Protein is under target: ${fmt(proteinAvg)}g avg vs ${fmt(protein.floor)}g floor.`);
  } else if (!protein.bodyWeightLb || !proteinAvg) {
    notes.push("Log body weight and protein for nutrition-aware coaching.");
  }
  if (highVolume.length) {
    notes.push(`${highVolume.map((stat) => stat.label).join(", ")} are above the default growth zone; monitor performance and recovery.`);
  }

  if (sessionPlan.items.length) {
    return {
      mode: restart ? "restart" : "session",
      title: restart ? "Restart session" : "Today's Plan",
      subtitle: sessionPlan.shortfallReason
        ? `Estimated ${sessionPlan.totalMinutes}/${sessionPlan.limitMinutes} min; limited by library-safe coverage.`
        : restart
          ? `Small, useful work built for about ${coachTimeframeLabel(limitMinutes)}.`
          : belowMinimum.length
            ? `Best minimum gaps to train next, built for about ${coachTimeframeLabel(limitMinutes)}.`
            : `Best gaps toward 20 hard sets, built for about ${coachTimeframeLabel(limitMinutes)}.`,
      sessionPlan,
      why,
      explanation: { selected: selectedReasons, skipped: skippedReasons, missing: missingReasons, notes },
      notes,
      progression
    };
  }

  if (belowOptimum.length && sessionPlan.missing.length && !sessionPlan.items.length) {
    return {
      mode: "library-gap",
      title: "Add exercise coverage",
      subtitle: belowMinimum.length
        ? "Coach needs more movement options before it can build a full plan."
        : "Coach needs more movement options before it can build toward 20 hard sets.",
      sessionPlan,
      why,
      explanation: { selected: selectedReasons, skipped: skippedReasons, missing: missingReasons, notes },
      notes,
      progression
    };
  }

  return {
    mode: progression ? "progression" : "recovery",
    title: progression ? "Progression focus" : "Recovery or maintenance",
    subtitle: progression ? progression.body : "20-set targets are covered. Progress slowly or recover if joints feel beat up.",
    sessionPlan,
    why: why.length ? why : ["Weekly 20-set targets are covered, so Coach is not forcing extra volume."],
    explanation: { selected: selectedReasons, skipped: skippedReasons, missing: missingReasons, notes },
    notes,
    progression
  };
}

function actionFromSessionPlan(plan) {
  const items = plan.sessionPlan.items;
  if (!items.length) {
    return {
      mode: plan.mode,
      sessionPlan: plan.sessionPlan,
      title: plan.title,
      body: plan.subtitle
    };
  }
  const sets = items.reduce((sum, item) => sum + item.sets, 0);
  const muscles = [...new Set(items.map((item) => item.muscle.label))].join(", ");
  return {
    mode: plan.mode,
    sessionPlan: plan.sessionPlan,
    title: plan.mode === "restart" ? "Restart session is the priority" : "Today's Plan is the priority",
    body: `${sets} sets across ${muscles}. Estimated ${plan.sessionPlan.totalMinutes}/${plan.sessionPlan.limitMinutes} min.`
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
  return canonicalMetricEntries()
    .filter((entry) => entry[field] > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      label: entry.date.slice(5, 10),
      value: entry[field]
    }));
}

function aggregateByDate(entries, valueForEntry) {
  const byDate = new Map();
  for (const entry of entries) {
    const value = valueForEntry(entry);
    if (!Number.isFinite(value) || value <= 0) continue;
    byDate.set(entry.date, (byDate.get(entry.date) || 0) + value);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ label: date.slice(5, 10), value }));
}

function muscleCreditFactor(workout, muscleId) {
  const meta = workoutMeta(workout);
  if ((meta.primaryMuscles || []).includes(muscleId)) return 1;
  if ((meta.secondaryMuscles || []).includes(muscleId)) return 0.5;
  return 0;
}

function seriesFromMuscle(muscleId, metric) {
  return aggregateByDate(state.workouts, (workout) => {
    const factor = muscleCreditFactor(workout, muscleId);
    if (!factor) return 0;
    if (metric === "sets") return hardSetCount(workout) * factor;
    return workoutVolume(workout) * factor;
  });
}

function chartReadout(point, unit) {
  return `${point.label}: ${fmt(point.value, 1)}${unit}`;
}

function lineChart(points, color = "#35d58c", unit = "") {
  if (!points.length) {
    return `<div class="empty">No data yet. Your chart will appear after the first few logs.</div>`;
  }

  const chartPoints = points.length > 1 ? points : [
    { label: points[0].label, value: points[0].value - 1, hidden: true },
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
  const visibleCoords = coords.filter((point) => !point.hidden);
  const last = visibleCoords[visibleCoords.length - 1];
  const first = visibleCoords[0];
  chartId += 1;
  const gradientId = `area-${color.slice(1)}-${chartId}`;
  const payload = escapeHtml(JSON.stringify(visibleCoords.map((point) => ({
    x: point.x,
    y: point.y,
    label: point.label,
    value: point.value
  }))));

  return `
    <div class="chart interactive-chart" data-points="${payload}" data-unit="${escapeHtml(unit)}">
      <div class="chart-stage">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Interactive trend chart">
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
          ${visibleCoords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.7" fill="${color}"></circle>`).join("")}
        </svg>
        <div class="chart-marker" style="left:${last.x}%; top:${last.y}%"></div>
      </div>
      <p class="chart-readout">${escapeHtml(chartReadout(last, unit))}</p>
      <p class="muted small">${escapeHtml(first.label)} to ${escapeHtml(last.label)}</p>
    </div>
  `;
}

function muscleProgressMarkup(stats = muscleSetStats(), compact = false) {
  const rows = stats.map((stat) => `
    <div class="muscle-card ${stat.zone.tone}">
      <div class="muscle-card-top">
        <strong>${escapeHtml(stat.label)}</strong>
        <span>${fmt(stat.sets, 1)}/${HYPERTROPHY.growthHigh}</span>
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

function recommendations(todayPlan = null) {
  const recs = [];
  const stats = muscleSetStats();
  const action = actionFromSessionPlan(todayPlan);
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const health = healthCoachSummary();
  const highRir = stats[0]?.highRir || [];
  const highVolume = stats.filter((stat) => stat.sets > HYPERTROPHY.growthHigh);
  const lowFrequency = stats.filter((stat) => stat.sets >= 5 && stat.sessions < 2).slice(0, 3);
  const lastWorkout = latestWorkout();
  const daysSinceWorkout = lastWorkout ? daysBetween(lastWorkout.date, todayISO()) : null;

  recs.push({
    tone: action.mode === "minimum" ? "hot" : action.mode === "library-gap" ? "warn" : action.mode === "session" || action.mode === "restart" ? "good" : "",
    title: action.title,
    body: action.body,
    action
  });

  const progression = todayPlan?.progression || action.progression || progressionTargetForExercise(lastWorkout?.exercise);
  if (progression && action.mode !== "progression") {
    recs.push({
      tone: progression.indicator.tone === "down" ? "warn" : "good",
      title: "Progression target",
      body: progression.body
    });
  }

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

  recs.push({
    tone: health.tone,
    title: `${health.goalLabel} nutrition check`,
    body: health.recommendation
  });

  if (highVolume.length) {
    recs.push({
      tone: "warn",
      title: "High volume muscles",
      body: `${highVolume.map((stat) => stat.label).join(", ")} are above the default growth zone. Monitor performance and recovery before adding more.`
    });
  }

  return recs.slice(0, 8);
}

function renderDashboard() {
  const weeklyVolume = getWeeklyVolume();
  const bodyWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const health = healthCoachSummary();
  const stats = muscleSetStats();
  const covered = stats.filter((stat) => stat.sets >= HYPERTROPHY.minimumSets).length;
  const underTarget = topUnderTargetMuscles(4);
  const todayPlan = buildTodayPlan();
  const action = actionFromSessionPlan(todayPlan);
  const firstExercise = todayPlan.sessionPlan.items[0]?.exercise;

  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Build the floor first.</h2>
        <p class="hero-copy">Reach 10 hard sets per muscle each Monday-start week, train muscles twice, and keep most work 1-3 reps from failure.</p>
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
        ${firstExercise ? `<p class="muted small">Rest ${escapeHtml(firstExercise.rest)}. ${escapeHtml(firstExercise.cue)}</p>` : ""}
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

    <section class="section card coach-action">
      <span class="badge">Health coach</span>
      <h3>${escapeHtml(health.goalLabel)} nutrition check</h3>
      <p>${escapeHtml(health.recommendation)}</p>
      ${healthCoachStatMarkup(health)}
    </section>

    <section class="section chart-panel">
      <div class="chart-header"><h3>This week's hard sets</h3><span class="muted small">${fmt(weeklyVolume)} lb total load logged</span></div>
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
  const avgRir = averageRir(entry);
  return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(entry.exercise)}</strong>
        <span class="muted small">${escapeHtml(entry.date)} - ${setRowsFromWorkout(entry).length} sets - best ${bestSetLabel(entry)} - ${fmt(workoutVolume(entry))} lb load volume</span>
        <span class="muted micro">${meta.primaryMuscles.map(muscleLabel).join(", ")}${avgRir !== null ? ` - ${fmt(avgRir, 1)} avg RIR` : ""}</span>
      </div>
      <div class="row-actions">
        <button class="ghost-mini" type="button" data-action="edit-workout" data-id="${escapeHtml(entry.id)}">Edit</button>
        <button class="delete-small" type="button" aria-label="Delete workout" data-action="delete-workout" data-id="${escapeHtml(entry.id)}">x</button>
      </div>
    </div>
  `;
}

function listMetric(entry) {
  const metric = normalizeMetricEntry(entry);
  const parts = [];
  if (metric.bodyWeight) parts.push(`${fmt(metric.bodyWeight, 1)} lb`);
  if (metric.calories) parts.push(`${fmt(metric.calories)} cal`);
  if (metric.protein) parts.push(`${fmt(metric.protein)}g protein`);
  return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(metric.date)}</strong>
        <span class="muted small">${escapeHtml(parts.join(" - ") || "Metric entry")}</span>
      </div>
      <button class="delete-small" type="button" aria-label="Delete metric" data-action="delete-metric" data-id="${escapeHtml(metric.id)}" data-date="${escapeHtml(metric.date)}">x</button>
    </div>
  `;
}

function renderNutritionQuickTotals(metric = {}) {
  const showQuickValues = !metric.mealDetail;
  const readOnly = metric.mealDetail ? " readonly aria-disabled=\"true\"" : "";
  return `
    <section class="nutrition-quick-card ${metric.mealDetail ? "is-overridden" : ""}">
      <h3>Daily total</h3>
      <div class="field-row compact-metric-row">
        <div class="field">
          <label for="calories">Calories</label>
          <input id="calories" name="calories" data-quick-field="calories" type="number" inputmode="decimal" min="0" step="1" value="${escapeHtml(showQuickValues && metric.calories ? metric.calories : "")}"${readOnly}>
        </div>
        <div class="field">
          <label for="protein">Protein</label>
          <input id="protein" name="protein" data-quick-field="protein" type="number" inputmode="decimal" min="0" step="1" value="${escapeHtml(showQuickValues && metric.protein ? metric.protein : "")}" placeholder="g"${readOnly}>
        </div>
      </div>
      <p class="nutrition-override-message ${metric.mealDetail ? "is-visible" : ""}" data-nutrition-override-message aria-live="polite">
        Using meal details for today's total. Clear meal entries to edit daily total.
      </p>
    </section>
  `;
}

function renderNutritionMealFields(meals = emptyNutritionMeals()) {
  return `
    <div class="nutrition-meal-grid">
      ${NUTRITION_MEALS.map((meal) => `
        <section class="nutrition-meal-card">
          <h3>${escapeHtml(meal.label)}</h3>
          <div class="field-row compact-metric-row">
            <div class="field">
              <label for="meal-${meal.id}-calories">Calories</label>
              <input id="meal-${meal.id}-calories" name="meal-${meal.id}-calories" data-meal-field="calories" type="number" inputmode="decimal" min="0" step="1" value="${escapeHtml(meals[meal.id]?.calories || "")}">
            </div>
            <div class="field">
              <label for="meal-${meal.id}-protein">Protein</label>
              <input id="meal-${meal.id}-protein" name="meal-${meal.id}-protein" data-meal-field="protein" type="number" inputmode="decimal" min="0" step="1" value="${escapeHtml(meals[meal.id]?.protein || "")}" placeholder="g">
            </div>
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function nutritionTotalSummaryMarkup(metric) {
  return `
    <div class="nutrition-total-strip" aria-live="polite">
      <span><strong data-nutrition-total="calories">${fmt(metric?.calories || 0)}</strong><small>calories</small></span>
      <span><strong data-nutrition-total="protein">${fmt(metric?.protein || 0)}</strong><small>g protein</small></span>
      <span><strong>${metric?.bodyWeight ? fmt(metric.bodyWeight, 1) : "--"}</strong><small>lb body weight</small></span>
    </div>
  `;
}

function refreshNutritionFormTotals(form = document.getElementById("metric-form")) {
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  const hasMealDetail = nutritionMealsHaveData(nutritionMealsFromData(data));
  const totals = nutritionFormTotalsFromData(data);
  const calories = form.querySelector('[data-nutrition-total="calories"]');
  const protein = form.querySelector('[data-nutrition-total="protein"]');
  if (calories) calories.textContent = fmt(totals.calories);
  if (protein) protein.textContent = fmt(totals.protein);
  const quickCard = form.querySelector(".nutrition-quick-card");
  const message = form.querySelector("[data-nutrition-override-message]");
  quickCard?.classList.toggle("is-overridden", hasMealDetail);
  message?.classList.toggle("is-visible", hasMealDetail);
  form.querySelectorAll("[data-quick-field]").forEach((input) => {
    input.readOnly = hasMealDetail;
    input.setAttribute("aria-disabled", String(hasMealDetail));
    if (!hasMealDetail) input.removeAttribute("aria-disabled");
  });
}

function defaultSetRows(count = 3) {
  return Array.from({ length: count }, () => ({ weight: "", reps: 10, rir: 2, restSeconds: null }));
}

function draftExerciseFromState() {
  const meta = resolveExerciseMeta(state.selectedExercise, state.draftTargetMuscle);
  return {
    draftId: uid(),
    editingWorkoutId: state.editingWorkoutId,
    exercise: state.selectedExercise,
    targetMuscle: state.draftTargetMuscle || meta.primaryMuscles[0] || "chest",
    notes: state.draftNotes || "",
    setRows: normalizeSetRows(state.setRows)
  };
}

function defaultDraftExercise(exerciseName = state.selectedExercise) {
  const meta = resolveExerciseMeta(exerciseName, state.draftTargetMuscle);
  return {
    draftId: uid(),
    editingWorkoutId: null,
    exercise: exerciseName,
    targetMuscle: meta.primaryMuscles[0] || "chest",
    notes: "",
    setRows: defaultSetRows()
  };
}

function ensureWorkoutDraft() {
  if (!Array.isArray(state.workoutDraft) || !state.workoutDraft.length) {
    state.workoutDraft = [defaultDraftExercise(state.selectedExercise)];
  }
  return state.workoutDraft;
}

function syncLegacyDraftFromFirst() {
  const first = ensureWorkoutDraft()[0];
  state.selectedExercise = first.exercise;
  state.draftTargetMuscle = first.targetMuscle;
  state.draftNotes = first.notes || "";
  state.setRows = normalizeSetRows(first.setRows);
  state.editingWorkoutId = first.editingWorkoutId || null;
}

function readWorkoutDraftFromForm() {
  const form = document.getElementById("strength-form");
  if (!form) {
    ensureWorkoutDraft();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  state.draftDate = data.date || state.draftDate || todayISO();
  state.workoutDraft = [...form.querySelectorAll(".exercise-draft")].map((section, index) => {
    const draftId = section.dataset.draftId || uid();
    const existing = state.workoutDraft.find((item) => item.draftId === draftId) || {};
    const exerciseName = section.querySelector("[data-draft-field='exercise']")?.value?.trim() || existing.exercise || "Custom exercise";
    const meta = resolveExerciseMeta(exerciseName, section.querySelector("[data-draft-field='targetMuscle']")?.value);
    return {
      draftId,
      editingWorkoutId: section.dataset.editingWorkoutId || existing.editingWorkoutId || null,
      exercise: exerciseName,
      targetMuscle: section.querySelector("[data-draft-field='targetMuscle']")?.value || meta.primaryMuscles[0] || "chest",
      notes: section.querySelector("[data-draft-field='notes']")?.value || "",
      setRows: normalizeSetRows([...section.querySelectorAll(".set-row")].map((row) => ({
        weight: row.querySelector('[data-set-field="weight"]')?.value,
        reps: row.querySelector('[data-set-field="reps"]')?.value,
        rir: row.querySelector('[data-set-field="rir"]')?.value,
        rest: row.querySelector('[data-set-field="rest"]')?.value
      }))),
      order: index
    };
  });
  syncLegacyDraftFromFirst();
}

function readDraftFromForm() {
  const form = document.getElementById("strength-form");
  if (form?.querySelector(".exercise-draft")) {
    readWorkoutDraftFromForm();
    return;
  }
  if (!form) return;
  readWorkoutDraftFromForm();
}

function lastSessionForExercise(exercise, excludeId = null) {
  return state.workouts
    .filter((entry) => entry.exercise === exercise && entry.id !== excludeId)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
}

function previousSetLabel(exercise, index, excludeId = state.editingWorkoutId) {
  const last = lastSessionForExercise(exercise, excludeId);
  if (!last) return "--";
  const row = setRowsFromWorkout(last)[index];
  return row ? `${fmt(row.weight)} x ${fmt(row.reps)}` : "--";
}

function plannedSetRowsFromPreviousSession(exercise, setCount) {
  const count = Math.max(1, Math.round(parseNum(setCount)));
  const last = lastSessionForExercise(exercise);
  const previousRows = last ? setRowsFromWorkout(last) : [];
  if (!previousRows.length) return defaultSetRows(count);
  return Array.from({ length: count }, (_, index) => {
    const source = previousRows[index] || previousRows[previousRows.length - 1];
    return {
      weight: source.weight,
      reps: source.reps,
      rir: source.rir ?? 2,
      restSeconds: source.restSeconds ?? null
    };
  });
}

function copyCoachPlanToLog(plan = buildTodayPlan(selectedCoachTimeframeMinutes())) {
  const items = plan.sessionPlan.items || [];
  if (!items.length) throw new Error("Coach needs a plan before it can copy to Log.");
  state.workoutDraft = items.map((item) => ({
    draftId: uid(),
    editingWorkoutId: null,
    exercise: item.exercise.name,
    targetMuscle: item.muscle.id,
    notes: `Coach plan: ${item.reason}`,
    setRows: plannedSetRowsFromPreviousSession(item.exercise.name, item.sets)
  }));
  state.templateQueue = state.workoutDraft.map((draft) => ({
    exercise: draft.exercise,
    targetMuscle: draft.targetMuscle,
    notes: draft.notes,
    setRows: draft.setRows
  }));
  state.activeTab = "log";
  state.logMode = "strength";
  state.draftDate = todayISO();
  state.editingWorkoutId = null;
  state.showTemplatePanel = false;
  syncLegacyDraftFromFirst();
}

function recordWeightKey(weight) {
  return String(Math.round(parseNum(weight) * 100) / 100);
}

function exerciseRecordStats(exercise, excludeId = null) {
  const entries = state.workouts.filter((entry) => entry.exercise === exercise && entry.id !== excludeId);
  const bestRepsByWeight = new Map();
  let maxWeight = 0;
  let bestVolume = 0;

  for (const entry of entries) {
    bestVolume = Math.max(bestVolume, workoutVolume(entry));
    for (const row of setRowsFromWorkout(entry)) {
      if (row.weight <= 0 || row.reps <= 0) continue;
      maxWeight = Math.max(maxWeight, row.weight);
      const key = recordWeightKey(row.weight);
      bestRepsByWeight.set(key, Math.max(bestRepsByWeight.get(key) || 0, row.reps));
    }
  }

  return {
    hasHistory: entries.length > 0,
    bestRepsByWeight,
    maxWeight,
    bestVolume
  };
}

function setRecordReasons(row, stats) {
  const reasons = [];
  const weight = parseNum(row.weight);
  const reps = parseNum(row.reps);
  if (!stats?.hasHistory || weight <= 0 || reps <= 0) return reasons;

  const previousReps = stats.bestRepsByWeight.get(recordWeightKey(weight)) || 0;
  if (previousReps > 0 && reps > previousReps) {
    reasons.push(`Rep record at ${fmt(weight, 1)} lb: ${fmt(previousReps)} to ${fmt(reps)}`);
  }
  if (stats.maxWeight > 0 && weight > stats.maxWeight && reps >= 8) {
    reasons.push(`Weight record: ${fmt(weight, 1)} lb for ${fmt(reps)} reps`);
  }
  return reasons;
}

function recordTrophyKey(parts = []) {
  return parts.map((part) => String(part ?? "")).join("|");
}

function isRecordTrophyDismissed(key) {
  return !!key && state.dismissedRecordTrophies instanceof Set && state.dismissedRecordTrophies.has(key);
}

function setRecordTrophyKey(draft, index, row, reasons) {
  return recordTrophyKey([
    "set",
    draft.draftId,
    index,
    recordWeightKey(row.weight),
    parseNum(row.reps),
    reasons.join("/")
  ]);
}

function volumeRecordTrophyKey(draft, reason) {
  return recordTrophyKey([
    "volume",
    draft.draftId,
    recordWeightKey(draftVolume(draft)),
    reason
  ]);
}

function exerciseVolumeRecordReason(draft, stats) {
  const volume = draftVolume(draft);
  if (!stats?.hasHistory || stats.bestVolume <= 0 || volume <= stats.bestVolume) return "";
  return `Exercise volume record: ${fmt(volume)} lb vs previous ${fmt(stats.bestVolume)} lb`;
}

function recordTrophyMarkup(label, className = "", key = "") {
  if (!label || isRecordTrophyDismissed(key)) return "";
  const title = `Hide trophy: ${label}`;
  return `<button class="record-trophy ${className}" type="button" data-action="dismiss-record-trophy" data-record-key="${escapeHtml(key)}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">&#127942;</button>`;
}

function setRecordTrophyMarkupForRow(draft, row, index, recordStats = exerciseRecordStats(draft.exercise, draft.editingWorkoutId)) {
  const reasons = setRecordReasons(row, recordStats);
  const trophyKey = setRecordTrophyKey(draft, index, row, reasons);
  return recordTrophyMarkup(reasons.join(" / "), "set-record-trophy", trophyKey);
}

function setRecordTrophySlot(draft, row, index, recordStats) {
  return `<span class="record-trophy-slot" data-record-slot="set" data-draft-id="${escapeHtml(draft.draftId)}" data-index="${index}">${setRecordTrophyMarkupForRow(draft, row, index, recordStats)}</span>`;
}

function volumeRecordTrophyMarkupForDraft(draft, recordStats = exerciseRecordStats(draft.exercise, draft.editingWorkoutId)) {
  const reason = exerciseVolumeRecordReason(draft, recordStats);
  const key = volumeRecordTrophyKey(draft, reason);
  return recordTrophyMarkup(reason, "volume-record-trophy", key);
}

function volumeRecordTrophySlot(draft, recordStats) {
  return `<span class="record-trophy-slot" data-record-slot="volume" data-draft-id="${escapeHtml(draft.draftId)}">${volumeRecordTrophyMarkupForDraft(draft, recordStats)}</span>`;
}

function renderSetRows(draft = draftExerciseFromState()) {
  const rows = normalizeSetRows(draft.setRows);
  const recordStats = exerciseRecordStats(draft.exercise, draft.editingWorkoutId);
  return rows.map((row, index) => {
    const previousLabel = previousSetLabel(draft.exercise, index, draft.editingWorkoutId);
    return `
    <tr class="set-row" data-index="${index}">
      <td class="mobile-set-meta" colspan="7">
        <span class="mobile-set-type"><span class="set-number">${index + 1}</span><strong>Set</strong>${setRecordTrophySlot(draft, row, index, recordStats)}</span>
        <span class="mobile-prev-label">Prev ${escapeHtml(previousLabel)}</span>
      </td>
      <td class="set-type">
        <span class="set-number">${index + 1}</span>
        <span class="set-label-wrap"><strong>Set</strong>${setRecordTrophySlot(draft, row, index, recordStats)}</span>
      </td>
      <td class="prev-cell">${escapeHtml(previousLabel)}</td>
      <td><input data-set-field="weight" type="number" inputmode="decimal" min="0" step="2.5" value="${escapeHtml(row.weight)}" aria-label="Set ${index + 1} weight"></td>
      <td><input data-set-field="reps" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(row.reps)}" aria-label="Set ${index + 1} reps"></td>
      <td><input data-set-field="rir" type="number" inputmode="numeric" min="0" max="5" step="1" value="${row.rir ?? ""}" aria-label="Set ${index + 1} RIR"></td>
      <td><input data-set-field="rest" type="text" inputmode="text" value="${escapeHtml(restInputValue(row.restSeconds))}" placeholder="1:30" aria-label="Set ${index + 1} rest"></td>
      <td><button class="ghost-mini delete-set-btn" type="button" data-action="remove-set" data-draft-id="${escapeHtml(draft.draftId)}" data-index="${index}" ${rows.length <= 1 ? "disabled" : ""}>x</button></td>
    </tr>
  `;
  }).join("");
}

function refreshDraftRecordTrophies(draftId) {
  const draft = state.workoutDraft.find((item) => item.draftId === draftId);
  if (!draft) return;
  const recordStats = exerciseRecordStats(draft.exercise, draft.editingWorkoutId);
  document.querySelectorAll(`[data-record-slot="set"]`).forEach((slot) => {
    if (slot.dataset.draftId !== draftId) return;
    const index = Number(slot.dataset.index);
    const row = normalizeSetRows(draft.setRows)[index];
    slot.innerHTML = row ? setRecordTrophyMarkupForRow(draft, row, index, recordStats) : "";
  });
  document.querySelectorAll(`[data-record-slot="volume"]`).forEach((slot) => {
    if (slot.dataset.draftId !== draftId) return;
    slot.innerHTML = volumeRecordTrophyMarkupForDraft(draft, recordStats);
  });
}

function exerciseInitial(name) {
  return escapeHtml((name || "?").trim().slice(0, 1).toUpperCase());
}

function exerciseHistoryMarkup() {
  if (state.historyExercise !== state.selectedExercise) return "";
  const sessions = state.workouts
    .filter((entry) => entry.exercise === state.selectedExercise)
    .slice(0, 6);
  return `
    <section class="section card exercise-history">
      <div class="chart-header"><h3>${escapeHtml(state.selectedExercise)} history</h3><span class="muted small">last ${sessions.length} sessions</span></div>
      <div class="list">
        ${sessions.length ? sessions.map((entry) => `
          <div class="list-item simple">
            <strong>${escapeHtml(entry.date)}</strong>
            <span class="muted small">${setRowsFromWorkout(entry).length} sets - best ${bestSetLabel(entry)} - ${fmt(workoutVolume(entry))} lb load volume</span>
          </div>
        `).join("") : `<div class="empty">No history for this exercise yet.</div>`}
      </div>
    </section>
  `;
}

function exerciseHistoryScreen(exerciseName) {
  const sessions = state.workouts
    .filter((entry) => entry.exercise === exerciseName)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">${escapeHtml(exerciseName)} history</h2>
        <p class="hero-copy">Every recorded session for this exercise, with each set preserved.</p>
      </div>
    </section>
    <section class="section">
      <button class="ghost-button" type="button" data-action="close-log-history">Back to log</button>
    </section>
    <section class="section history-session-list">
      ${sessions.length ? sessions.map((entry) => {
        const rows = setRowsFromWorkout(entry);
        return `
          <details class="history-session-card">
            <summary>
              <strong>${escapeHtml(entry.date)}</strong>
              <span>${rows.length} sets - best ${bestSetLabel(entry)} - ${fmt(workoutVolume(entry))} lb load volume</span>
            </summary>
            <div class="history-set-grid">
              ${rows.map((row, index) => `
                <div class="history-set">
                  <span>Set ${index + 1}</span>
                  <strong>${fmt(row.weight)} lb x ${fmt(row.reps)}</strong>
                  <small>${row.rir === null ? "--" : fmt(row.rir, 1)} RIR - Rest ${formatRest(row.restSeconds)}</small>
                </div>
              `).join("")}
            </div>
            <div class="row-actions">
              <button class="ghost-mini" type="button" data-action="edit-workout" data-id="${escapeHtml(entry.id)}">Edit</button>
              <button class="delete-small" type="button" aria-label="Delete workout" data-action="delete-workout" data-id="${escapeHtml(entry.id)}">x</button>
            </div>
            ${entry.notes ? `<p class="muted small">${escapeHtml(entry.notes)}</p>` : ""}
          </details>
        `;
      }).join("") : `<div class="empty">No recorded sessions for this exercise yet.</div>`}
    </section>
  `;
}

function getDayTemplates() {
  return Array.isArray(state.settings.dayTemplates) ? state.settings.dayTemplates : [];
}

function workoutToTemplateExercise(workout) {
  const meta = workoutMeta(workout);
  return {
    exercise: workout.exercise,
    targetMuscle: meta.primaryMuscles[0] || "chest",
    notes: workout.notes || "",
    setRows: setRowsFromWorkout(workout)
  };
}

function currentDraftTemplateExercise() {
  readDraftFromForm();
  return {
    exercise: state.selectedExercise,
    targetMuscle: state.draftTargetMuscle || resolveExerciseMeta(state.selectedExercise).primaryMuscles[0] || "chest",
    notes: state.draftNotes || "",
    setRows: normalizeSetRows(state.setRows)
  };
}

function templateOptionsMarkup(templates) {
  if (!templates.length) return `<option value="">No templates saved</option>`;
  return templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join("");
}

function renderTemplateQueue() {
  if (!state.templateQueue.length) return "";
  return `
    <div class="template-queue">
      ${state.templateQueue.map((item, index) => `
        <button class="pill ${item.exercise === state.selectedExercise ? "is-active" : ""}" type="button" data-action="template-exercise" data-index="${index}">${escapeHtml(item.exercise)}</button>
      `).join("")}
    </div>
  `;
}

function applyTemplateExercise(item) {
  const draft = {
    draftId: uid(),
    editingWorkoutId: null,
    exercise: item.exercise,
    targetMuscle: item.targetMuscle || resolveExerciseMeta(item.exercise).primaryMuscles[0] || "chest",
    notes: item.notes || "",
    setRows: normalizeSetRows(item.setRows)
  };
  state.workoutDraft = [draft];
  state.selectedExercise = draft.exercise;
  state.draftTargetMuscle = draft.targetMuscle;
  state.draftNotes = draft.notes;
  state.setRows = draft.setRows;
  state.editingWorkoutId = null;
}

async function saveDayTemplate() {
  readDraftFromForm();
  const date = state.draftDate || todayISO();
  let exercises = ensureWorkoutDraft().map((draft) => ({
    exercise: draft.exercise,
    targetMuscle: draft.targetMuscle,
    notes: draft.notes || "",
    setRows: normalizeSetRows(draft.setRows)
  }));
  if (!exercises.length) exercises = workoutsForDate(date).map(workoutToTemplateExercise);
  if (!exercises.length) exercises = [currentDraftTemplateExercise()];
  const defaultName = `Hypertrophy day ${getDayTemplates().length + 1}`;
  const name = (document.getElementById("template-name")?.value || defaultName).trim();
  if (!name) return;
  const templates = getDayTemplates().filter((template) => template.name !== name);
  templates.push({
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    exercises
  });
  await saveSetting("dayTemplates", templates);
  await render();
  toast("Template saved.");
}

async function loadDayTemplate() {
  const select = document.getElementById("template-select");
  const template = getDayTemplates().find((item) => item.id === select?.value);
  if (!template) throw new Error("Choose a template first.");
  state.templateQueue = template.exercises || [];
  state.workoutDraft = state.templateQueue.map((item) => ({
    draftId: uid(),
    editingWorkoutId: null,
    exercise: item.exercise,
    targetMuscle: item.targetMuscle || resolveExerciseMeta(item.exercise).primaryMuscles[0] || "chest",
    notes: item.notes || "",
    setRows: normalizeSetRows(item.setRows)
  }));
  if (state.workoutDraft.length) syncLegacyDraftFromFirst();
  state.draftDate = todayISO();
  await render();
  toast("Template loaded.");
}

async function deleteDayTemplate() {
  const select = document.getElementById("template-select");
  const template = getDayTemplates().find((item) => item.id === select?.value);
  if (!template) throw new Error("Choose a template first.");
  if (!confirm(`Delete template "${template.name}"?`)) return;
  await saveSetting("dayTemplates", getDayTemplates().filter((item) => item.id !== template.id));
  state.templateQueue = [];
  await render();
  toast("Template deleted.");
}

function secondaryMuscleCheckboxes(selected = []) {
  const selectedSet = new Set(selected);
  return muscleGroups.map((muscle) => `
    <label class="check-card">
      <input type="checkbox" name="secondaryMuscles" value="${muscle.id}" ${selectedSet.has(muscle.id) ? "checked" : ""}>
      <span>${escapeHtml(muscle.label)}</span>
    </label>
  `).join("");
}

function exerciseMuscleBadges(exercise) {
  const primary = (exercise.primaryMuscles || []).map((muscle) => `
    <span class="muscle-badge primary">${escapeHtml(muscleLabel(muscle))}</span>
  `).join("");
  const secondary = (exercise.secondaryMuscles || []).map((muscle) => `
    <span class="muscle-badge secondary">${escapeHtml(muscleLabel(muscle))}</span>
  `).join("");
  return `<div class="badge-row">${primary}${secondary}</div>`;
}

function exerciseCard(exercise, editable = false) {
  return `
    <div class="exercise-definition ${editable ? "custom" : ""}">
      <div>
        <div class="exercise-definition-title">
          <strong>${escapeHtml(exercise.name)}</strong>
        </div>
        ${exerciseMuscleBadges(exercise)}
        <p class="muted small">${escapeHtml(exercise.equipment || "custom")} - ${escapeHtml(exercise.reps || "8-15")} reps - ${escapeHtml(exercise.rest || "60-120 sec")}</p>
        <p class="muted micro">${escapeHtml(exercise.cue || "Keep form strict and progress gradually.")}</p>
      </div>
      <div class="row-actions">
        <button class="ghost-mini" type="button" data-action="log-exercise" data-exercise="${escapeHtml(exercise.name)}">Log</button>
        ${editable ? `<button class="ghost-mini" type="button" data-action="edit-exercise" data-id="${escapeHtml(exercise.id)}">Edit</button>` : ""}
        ${editable ? `<button class="delete-small" type="button" aria-label="Delete exercise" data-action="delete-exercise" data-id="${escapeHtml(exercise.id)}">x</button>` : ""}
      </div>
    </div>
  `;
}

function renderExercises() {
  const customExercises = getCustomExercises();
  const editing = customExercises.find((exercise) => exercise.id === state.editingExerciseId);
  const primary = editing?.primaryMuscles?.[0] || "chest";
  const primaryOptions = muscleGroups.map((muscle) => `
    <option value="${muscle.id}" ${primary === muscle.id ? "selected" : ""}>${escapeHtml(muscle.label)}</option>
  `).join("");

  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Exercises</h2>
        <p class="hero-copy">Build the movement database TrainWise uses for logging, hard-set credits, charts, and coaching.</p>
      </div>
    </section>

    <section class="section form-panel">
      <h3>${editing ? "Edit exercise" : "Add exercise"}</h3>
      <form id="exercise-form">
        <div class="field-row exercise-form-grid">
          <div class="field">
            <label for="exercise-name">Exercise name</label>
            <input id="exercise-name" name="name" required placeholder="V-Bar Pulldown" value="${escapeHtml(editing?.name || "")}">
          </div>
          <div class="field">
            <label for="exercise-primary">Primary muscle</label>
            <select id="exercise-primary" name="primaryMuscle">${primaryOptions}</select>
          </div>
        </div>
        <div class="field">
          <label>Secondary muscles</label>
          <div class="checkbox-grid">${secondaryMuscleCheckboxes(editing?.secondaryMuscles || [])}</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="exercise-equipment">Equipment</label>
            <input id="exercise-equipment" name="equipment" placeholder="Cable, dumbbell, machine" value="${escapeHtml(editing?.equipment || "")}">
          </div>
          <div class="field">
            <label for="exercise-reps">Rep range</label>
            <input id="exercise-reps" name="reps" placeholder="8-15" value="${escapeHtml(editing?.reps || "")}">
          </div>
          <div class="field">
            <label for="exercise-rest">Rest range</label>
            <input id="exercise-rest" name="rest" placeholder="60-120 sec" value="${escapeHtml(editing?.rest || "")}">
          </div>
        </div>
        <div class="field">
          <label for="exercise-cue">Cue / notes</label>
          <textarea id="exercise-cue" name="cue" placeholder="Setup, form cues, pain-free path, progression notes.">${escapeHtml(editing?.cue || "")}</textarea>
        </div>
        <div class="grid two">
          <button class="primary-button" type="submit">${editing ? "Update exercise" : "Save exercise"}</button>
          ${editing ? `<button class="ghost-button" type="button" data-action="cancel-exercise-edit">Cancel edit</button>` : `<button class="ghost-button" type="button" data-action="exercise-clear-form">Clear form</button>`}
        </div>
      </form>
    </section>

    <section class="section chart-panel">
      <div class="chart-header">
        <h3>Your exercise database</h3>
        <span class="muted small">${customExercises.length} custom</span>
      </div>
      <div class="exercise-list">
        ${customExercises.length ? customExercises.map((exercise) => exerciseCard(exercise, true)).join("") : `<div class="empty">Add the movements you actually do, then TrainWise can credit them to the right muscle groups.</div>`}
      </div>
    </section>
  `;
}

function muscleStrip(meta) {
  return `
    <div class="muscle-strip" aria-label="Muscles worked">
      ${(meta.primaryMuscles || []).map((muscle) => `<span class="muscle-token primary">${escapeHtml(muscleLabel(muscle))}</span>`).join("")}
      ${(meta.secondaryMuscles || []).map((muscle) => `<span class="muscle-token secondary">${escapeHtml(muscleLabel(muscle))}</span>`).join("")}
    </div>
  `;
}

function muscleIconChip(muscle, role) {
  const src = muscleIconPaths[muscle];
  if (!src) return "";
  const label = `${muscleLabel(muscle)} ${role}`;
  return `
    <span class="muscle-icon-chip ${role}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <img src="${escapeHtml(`${src}?v=${APP_VERSION}`)}" alt="${escapeHtml(muscleLabel(muscle))}" loading="lazy">
    </span>
  `;
}

function exerciseMuscleIcons(meta) {
  const primary = (meta.primaryMuscles || []).map((muscle) => ({ muscle, role: "primary" }));
  const secondary = (meta.secondaryMuscles || []).map((muscle) => ({ muscle, role: "secondary" }));
  const icons = [...primary, ...secondary].slice(0, 4).map(({ muscle, role }) => muscleIconChip(muscle, role)).join("");
  return `<div class="exercise-muscle-icons" aria-label="Exercise muscles">${icons || `<span class="muscle-icon-chip empty">?</span>`}</div>`;
}

function exerciseOptions(selected) {
  return exerciseNames().map((name) => `
    <option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>
  `).join("");
}

function muscleOptions(selected) {
  return muscleGroups.map((muscle) => `
    <option value="${muscle.id}" ${selected === muscle.id ? "selected" : ""}>${escapeHtml(muscle.label)}</option>
  `).join("");
}

function exerciseDraftTable(draft, index, total) {
  const meta = resolveExerciseMeta(draft.exercise, draft.targetMuscle);
  const menuOpen = state.openExerciseMenu === draft.draftId;
  const recordStats = exerciseRecordStats(draft.exercise, draft.editingWorkoutId);
  return `
    <section class="exercise-draft ${state.draggingDraftId === draft.draftId ? "is-dragging" : ""}" data-draft-id="${escapeHtml(draft.draftId)}" data-editing-workout-id="${escapeHtml(draft.editingWorkoutId || "")}">
      <div class="exercise-table-top">
        <div class="exercise-table-title">
          <button class="drag-handle" type="button" aria-label="Drag exercise table" data-drag-handle data-draft-id="${escapeHtml(draft.draftId)}">::</button>
          ${exerciseMuscleIcons(meta)}
          ${volumeRecordTrophySlot(draft, recordStats)}
          <div>
            <label for="exercise-${escapeHtml(draft.draftId)}">Exercise</label>
            <select id="exercise-${escapeHtml(draft.draftId)}" data-draft-field="exercise" data-action="draft-exercise-change" data-draft-id="${escapeHtml(draft.draftId)}">
              ${exerciseOptions(draft.exercise)}
            </select>
          </div>
        </div>
        <div class="table-menu-wrap">
          <button class="icon-button" type="button" aria-label="Exercise menu" data-action="toggle-exercise-menu" data-draft-id="${escapeHtml(draft.draftId)}">...</button>
          ${menuOpen ? `
            <div class="table-menu">
              <button type="button" data-action="open-exercise-history" data-exercise="${escapeHtml(draft.exercise)}">History</button>
              <button type="button" data-action="use-last-session" data-draft-id="${escapeHtml(draft.draftId)}">Use last session</button>
            </div>
          ` : ""}
        </div>
      </div>
      ${muscleStrip(meta)}
      <div class="field">
        <label>Notes</label>
        <input data-draft-field="notes" value="${escapeHtml(draft.notes || "")}" placeholder="Optional notes">
      </div>
      <div class="set-table-wrap">
        <table class="set-table">
          <thead>
            <tr>
              <th class="set-type-cell">Type</th>
              <th class="prev-cell">Prev</th>
              <th>lbs</th>
              <th>Reps</th>
              <th>RIR</th>
              <th>Rest</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${renderSetRows(draft)}</tbody>
        </table>
      </div>
      <div class="log-actions exercise-table-actions">
        <button class="round-add" type="button" aria-label="Add set" data-action="add-set" data-draft-id="${escapeHtml(draft.draftId)}">+</button>
        <button class="ghost-button" type="button" data-action="remove-exercise-table" data-draft-id="${escapeHtml(draft.draftId)}" ${total <= 1 ? "disabled" : ""}>Remove</button>
        ${index === total - 1 ? `<button class="add-exercise-icon-btn" type="button" data-action="add-exercise-table" aria-label="Add exercise"><img src="./assets/dumbbell.svg" alt="" width="36" height="36"></button>` : ""}
        <div class="reorder-arrows">
          <button type="button" aria-label="Move up" data-action="move-exercise-up" data-draft-id="${escapeHtml(draft.draftId)}" ${index === 0 ? "disabled" : ""}>&#9650;</button>
          <button type="button" aria-label="Move down" data-action="move-exercise-down" data-draft-id="${escapeHtml(draft.draftId)}" ${index === total - 1 ? "disabled" : ""}>&#9660;</button>
        </div>
      </div>
    </section>
  `;
}

function renderLog() {
  const templates = getDayTemplates();
  const draft = ensureWorkoutDraft();
  const lockLabel = draft.some((item) => item.editingWorkoutId) ? "Update workout" : "Lock in workout";
  if (state.logHistoryExercise) return exerciseHistoryScreen(state.logHistoryExercise);
  const metricDate = state.metricDate || todayISO();
  const metric = metricForDate(metricDate);
  const metricFormEntry = metric || { date: metricDate, bodyWeight: 0, calories: 0, protein: 0, meals: emptyNutritionMeals(), notes: "" };
  const metricButtonLabel = metric ? "Update metrics" : "Save metrics";

  return `
    <section class="form-panel">
      <div class="segment">
        <button type="button" data-log-mode="strength" class="${state.logMode === "strength" ? "is-active" : ""}">Strength</button>
        <button type="button" data-log-mode="metrics" class="${state.logMode === "metrics" ? "is-active" : ""}">Nutrition</button>
      </div>

      ${state.logMode === "strength" ? `
        <form id="strength-form">
          <div class="log-top-actions">
            <button class="ghost-button" type="button" data-action="toggle-template-panel">Templates</button>
            <button class="ghost-button" type="button" data-action="add-exercise-table">Add exercise</button>
            ${draft.some((item) => item.editingWorkoutId) ? `<button class="ghost-button" type="button" data-action="new-log">Clear all logged info</button>` : ""}
          </div>

          ${state.showTemplatePanel ? `
            <section class="template-panel compact-template-panel">
              <div class="field">
                <label for="template-name">Template name</label>
                <input id="template-name" placeholder="Upper A, Lower B, Push day">
              </div>
              <div class="field">
                <label for="template-select">Saved template</label>
                <select id="template-select">${templateOptionsMarkup(templates)}</select>
              </div>
              <div class="grid three">
                <button class="ghost-button" type="button" data-action="load-template" ${templates.length ? "" : "disabled"}>Load</button>
                <button class="ghost-button" type="button" data-action="delete-template" ${templates.length ? "" : "disabled"}>Delete</button>
                <button class="primary-button" type="button" data-action="save-day-template">Save</button>
              </div>
            </section>
          ` : ""}

          <div class="field-row log-date-row">
            <div class="field">
              <label for="workout-date">Date</label>
              <div style="display: flex; gap: 8px; align-items: end;">
                <input id="workout-date" name="date" type="date" required value="${escapeHtml(state.draftDate || todayISO())}" style="flex: 1;">
                ${state.draftDate && state.draftDate !== todayISO() ? `<button class="ghost-button" type="button" data-action="return-to-today" style="min-width: auto; white-space: nowrap;">Today</button>` : ""}
              </div>
            </div>
          </div>

          <div class="exercise-draft-list">
            ${draft.map((item, index) => exerciseDraftTable(item, index, draft.length)).join("")}
          </div>

          <button class="primary-button lock-button" type="submit">${lockLabel}</button>
          <p class="muted micro form-note">Most hypertrophy work should stop 1-3 reps before failure. Keep the whole workout inside roughly ${SESSION_LIMIT_MINUTES} minutes.</p>
        </form>
      ` : `
        <form id="metric-form">
          <div class="field">
            <label for="metric-date">Date</label>
            <input id="metric-date" name="date" type="date" required value="${escapeHtml(metricDate)}">
          </div>
          ${nutritionTotalSummaryMarkup(metricFormEntry)}
          <div class="field-row metric-daily-row">
            <div class="field"><label for="bodyWeight">Body weight</label><input id="bodyWeight" name="bodyWeight" type="number" inputmode="decimal" min="0" step="0.1" value="${escapeHtml(metricFormEntry.bodyWeight || "")}" placeholder="lb"></div>
          </div>
          ${renderNutritionQuickTotals(metricFormEntry)}
          ${renderNutritionMealFields(metricFormEntry.meals)}
          <div class="field">
            <label for="metric-notes">Notes</label>
            <textarea id="metric-notes" name="notes" placeholder="Sleep, hunger, stress, digestion, or anything that explains the trend.">${escapeHtml(metricFormEntry.notes || "")}</textarea>
          </div>
          <button class="primary-button" type="submit">${metricButtonLabel}</button>
        </form>
      `}
    </section>
  `;
}

function miniSparkline(points, color = "#35d58c") {
  if (!points.length) return `<div class="history-sparkline empty-spark">No chart yet</div>`;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = 6 + (index / Math.max(points.length - 1, 1)) * 88;
    const y = 82 - ((point.value - min) / range) * 64;
    return `${x},${y}`;
  }).join(" ");
  return `
    <div class="history-sparkline" aria-label="Mini performance chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <polyline points="${coords}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    </div>
  `;
}

function historyExerciseNames() {
  return [...new Set(state.workouts.map((entry) => entry.exercise))]
    .sort((a, b) => a.localeCompare(b));
}

function recentHistoryDates(limit = 7) {
  return [...new Set(state.workouts.map((entry) => entry.date).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
}

function effectiveHistoryDate(recentDates = recentHistoryDates()) {
  return state.historyDate || recentDates[0] || "";
}

function renderHistoryModeSegment() {
  return `
    <div class="segment history-mode-segment" role="tablist" aria-label="History view">
      <button class="${state.historyMode === "exercises" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.historyMode === "exercises"}" data-action="history-set-mode" data-history-mode="exercises">Exercises</button>
      <button class="${state.historyMode === "dates" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.historyMode === "dates"}" data-action="history-set-mode" data-history-mode="dates">Dates</button>
    </div>
  `;
}

function renderHistoryExercisesMode(exercises) {
  return `
    <section class="section form-panel history-filter-panel">
      <div class="field history-search-field">
        <label for="history-search">Search exercises</label>
        <input id="history-search" class="search-input" data-history-search value="${escapeHtml(state.historySearch)}" placeholder="Bench press, row, squat">
      </div>
    </section>

    <section class="section history-exercise-grid">
      ${exercises.length ? exercises.map((exercise) => {
        const meta = resolveExerciseMeta(exercise);
        const stats = exerciseStats(exercise);
        const indicator = progressiveOverloadIndicator(exercise);
        const volumeSeries = seriesFromWorkouts(exercise, workoutVolume);
        return `
          <button class="history-exercise-card" type="button" data-action="history-select-exercise" data-exercise="${escapeHtml(exercise)}">
            <div class="history-card-top">
              <div>
                <strong>${escapeHtml(exercise)}</strong>
                ${exerciseMuscleBadges(meta)}
              </div>
              <span class="history-overload-indicator ${indicator.tone}" title="${escapeHtml(indicator.label)}">${indicator.symbol}</span>
            </div>
            ${miniSparkline(volumeSeries.slice(-8), "#9b8cff")}
            <div class="history-stats-row">
              <span class="history-stat"><strong>${stats.sessions}</strong><small>sessions</small></span>
              <span class="history-stat"><strong>${fmt(stats.totalLoadVolume)}</strong><small>lb tonnage</small></span>
              <span class="history-stat"><strong>${escapeHtml(bestSetLabel(stats.entries[stats.entries.length - 1] || {}))}</strong><small>latest best</small></span>
            </div>
            <div class="history-pr-badge">PR: ${stats.bestSet ? `${fmt(stats.bestSet.weight, 1)} x ${fmt(stats.bestSet.reps)} on ${escapeHtml(stats.bestSet.date)}` : "not yet"}</div>
          </button>
        `;
      }).join("") : `<div class="empty">No exercise history matches that search.</div>`}
    </section>
  `;
}

function renderHistoryDatesMode() {
  const recentDates = recentHistoryDates();
  const selectedDate = effectiveHistoryDate(recentDates);
  const dateWorkouts = selectedDate ? workoutsForDate(selectedDate) : [];
  return `
    <section class="section form-panel history-date-panel">
      ${recentDates.length ? `
        <div class="history-date-chip-row" aria-label="Recent workout dates">
          ${recentDates.map((date) => `
            <button class="date-chip ${date === selectedDate ? "is-active" : ""}" type="button" data-action="history-date-chip" data-history-date-value="${escapeHtml(date)}" aria-pressed="${date === selectedDate}">
              ${escapeHtml(date === todayISO() ? "Today" : formatShortDate(date))}
            </button>
          `).join("")}
        </div>
      ` : ""}
      <div class="history-date-controls">
        <div class="field history-date-field">
          <label for="history-date">Browse by date</label>
          <input id="history-date" class="history-date-input" type="date" data-history-date value="${escapeHtml(selectedDate)}">
        </div>
        ${state.historyDate ? `<button class="ghost-button history-clear-button" type="button" data-action="clear-history-date">Clear date</button>` : ""}
      </div>
      ${selectedDate ? `
        <div class="history-date-results">
          <h3>${escapeHtml(formatShortDate(selectedDate))} - ${dateWorkouts.length} workout${dateWorkouts.length === 1 ? "" : "s"}</h3>
          ${dateWorkouts.length ? `
            <div class="list">
              ${dateWorkouts.map((entry) => listWorkout(entry)).join("")}
            </div>
          ` : `<div class="empty">No workouts logged on ${escapeHtml(selectedDate)}.</div>`}
        </div>
      ` : `<div class="empty">No workouts logged yet.</div>`}
    </section>
  `;
}

function renderHistoryList() {
  const search = state.historySearch.trim().toLowerCase();
  const exercises = historyExerciseNames().filter((name) => name.toLowerCase().includes(search));
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">History</h2>
        <p class="hero-copy">Exercise performance, PRs, load volume, and progressive overload from your logged sessions.</p>
      </div>
    </section>

    <section class="section history-mode-shell">
      ${renderHistoryModeSegment()}
    </section>

    ${state.historyMode === "dates" ? renderHistoryDatesMode() : renderHistoryExercisesMode(exercises)}
  `;
}

function renderHistoryDetail(exerciseName) {
  const stats = exerciseStats(exerciseName);
  const entries = exerciseHistoryEntries(exerciseName);
  const meta = resolveExerciseMeta(exerciseName);
  const progression = progressionTargetForExercise(exerciseName);
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">${escapeHtml(exerciseName)}</h2>
        <p class="hero-copy">${progression ? escapeHtml(progression.body) : "Log another session to unlock a progression target."}</p>
      </div>
    </section>

    <section class="section history-detail-header">
      <button class="ghost-button" type="button" data-action="history-back">Back</button>
      ${exerciseMuscleBadges(meta)}
    </section>

    <section class="section grid four history-summary-grid">
      <div class="stat"><span class="label">Sessions</span><strong class="value">${stats.sessions}</strong><span class="hint">${escapeHtml(stats.firstDate || "--")} to ${escapeHtml(stats.lastDate || "--")}</span></div>
      <div class="stat"><span class="label">Load volume</span><strong class="value">${fmt(stats.totalLoadVolume)}</strong><span class="hint">lb total tonnage</span></div>
      <div class="stat"><span class="label">Best set</span><strong class="value">${stats.bestSet ? `${fmt(stats.bestSet.weight, 1)} x ${fmt(stats.bestSet.reps)}` : "--"}</strong><span class="hint">${escapeHtml(stats.bestSet?.date || "No PR yet")}</span></div>
      <div class="stat"><span class="label">Best session</span><strong class="value">${fmt(stats.bestLoadVolume)}</strong><span class="hint">${escapeHtml(stats.bestLoadVolumeDate || "No tonnage yet")}</span></div>
    </section>

    <section class="section grid two">
      <div class="chart-panel">
        <div class="chart-header"><h3>Load volume</h3><span class="muted small">sets x reps x load</span></div>
        ${lineChart(seriesFromWorkouts(exerciseName, workoutVolume), "#9b8cff", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Estimated 1RM</h3><span class="muted small">best set estimate</span></div>
        ${lineChart(seriesFromWorkouts(exerciseName, e1rm), "#ff6b5f", " lb")}
      </div>
    </section>

    <section class="section history-session-list">
      ${entries.length ? entries.map((entry) => {
        const rows = setRowsFromWorkout(entry);
        return `
          <details class="history-session-card">
            <summary>
              <strong>${escapeHtml(entry.date)}</strong>
              <span>${rows.length} sets - best ${bestSetLabel(entry)} - ${fmt(workoutVolume(entry))} lb load volume</span>
            </summary>
            <div class="history-set-grid">
              ${rows.map((row, index) => `
                <div class="history-set">
                  <span>Set ${index + 1}</span>
                  <strong>${fmt(row.weight)} lb x ${fmt(row.reps)}</strong>
                  <small>${row.rir === null ? "--" : fmt(row.rir, 1)} RIR - Rest ${formatRest(row.restSeconds)}</small>
                </div>
              `).join("")}
            </div>
            <div class="row-actions">
              <button class="ghost-mini" type="button" data-action="edit-workout" data-id="${escapeHtml(entry.id)}">Edit</button>
              <button class="delete-small" type="button" aria-label="Delete workout" data-action="delete-workout" data-id="${escapeHtml(entry.id)}">x</button>
            </div>
            ${entry.notes ? `<p class="muted small">${escapeHtml(entry.notes)}</p>` : ""}
          </details>
        `;
      }).join("") : `<div class="empty">No recorded sessions for this exercise yet.</div>`}
    </section>
  `;
}

function renderHistory() {
  if (state.historyExercise) return renderHistoryDetail(state.historyExercise);
  return renderHistoryList();
}

function renderTrends() {
  const exercises = [...new Set([...exerciseNames(), ...state.workouts.map((entry) => entry.exercise)])];
  const selectedExercise = exercises.includes(state.selectedExercise) ? state.selectedExercise : exercises[0];
  const options = exercises.map((exercise) => `<option ${exercise === selectedExercise ? "selected" : ""}>${escapeHtml(exercise)}</option>`).join("");
  const muscleOptions = muscleGroups.map((muscle) => `<option value="${muscle.id}" ${muscle.id === state.selectedMuscle ? "selected" : ""}>${escapeHtml(muscle.label)}</option>`).join("");
  const selectedMuscleLabel = muscleLabel(state.selectedMuscle);
  const volumeSeries = seriesFromWorkouts(selectedExercise, workoutVolume);
  const e1rmSeries = seriesFromWorkouts(selectedExercise, e1rm);
  const muscleSetSeries = seriesFromMuscle(state.selectedMuscle, "sets");
  const muscleVolumeSeries = seriesFromMuscle(state.selectedMuscle, "volume");
  const health = healthCoachSummary();

  return `
    <section class="trend-section">
      <div class="trend-section-header">
        <div>
          <h2>Muscle trends</h2>
          <p class="muted small">Hypertrophy volume is hard-set credit; load volume is tonnage.</p>
        </div>
        <div class="field compact-field">
          <label for="trend-muscle">Muscle</label>
          <select id="trend-muscle">${muscleOptions}</select>
        </div>
      </div>
      <div class="grid two">
        <div class="chart-panel">
          <div class="chart-header"><h3>${escapeHtml(selectedMuscleLabel)} hard sets</h3><span class="muted small">daily credit</span></div>
          ${lineChart(muscleSetSeries, "#f2d06b", " sets")}
        </div>
        <div class="chart-panel">
          <div class="chart-header"><h3>${escapeHtml(selectedMuscleLabel)} load volume</h3><span class="muted small">credited tonnage</span></div>
          ${lineChart(muscleVolumeSeries, "#35d58c", " lb")}
        </div>
      </div>
    </section>

    <section class="section trend-section">
      <div class="trend-section-header">
        <div>
          <h2>Exercise performance</h2>
          <p class="muted small">Track the exercise you care about right now.</p>
        </div>
        <div class="field compact-field">
          <label for="trend-exercise">Exercise</label>
          <select id="trend-exercise" data-action="trend-exercise">${options}</select>
        </div>
      </div>
      <div class="grid two">
        <div class="chart-panel">
          <div class="chart-header"><h3>${escapeHtml(selectedExercise)} load volume</h3><span class="muted small">sets x reps x load</span></div>
          ${lineChart(volumeSeries, "#9b8cff", " lb")}
        </div>
        <div class="chart-panel">
          <div class="chart-header"><h3>Estimated 1RM</h3><span class="muted small">best set estimate</span></div>
          ${lineChart(e1rmSeries, "#ff6b5f", " lb")}
        </div>
      </div>
    </section>

    <section class="section trend-section">
      <div class="trend-section-header">
        <div>
          <h2>Health trends</h2>
          <p class="muted small">${escapeHtml(health.recommendation)}</p>
        </div>
      </div>
      ${healthCoachStatMarkup(health)}
      <div class="grid two">
        <div class="chart-panel">
          <div class="chart-header"><h3>Body weight</h3><span class="muted small">daily weight</span></div>
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
      </div>
    </section>
  `;
}

function renderTodayPlan(plan) {
  const items = plan.sessionPlan.items;
  const muscles = [...new Set(items.map((item) => item.muscle.label))];
  return `
    <section class="section card coach-action featured-action today-plan-card">
      <span class="badge">${escapeHtml(plan.mode === "restart" ? "Restart plan" : plan.mode === "progression" ? "Progression" : plan.mode === "library-gap" ? "Library gap" : "Today's plan")}</span>
      <div class="today-plan-header">
        <div>
          <h3>${escapeHtml(plan.title)}</h3>
          <p>${escapeHtml(plan.subtitle)}</p>
        </div>
        <span class="today-plan-time"><strong>${plan.sessionPlan.totalMinutes || "--"}</strong><small>min</small></span>
      </div>
      ${items.length ? `
        <div class="today-plan-list">
          ${items.map((item) => `
            <div class="today-plan-item">
              <div>
                <strong>${escapeHtml(item.exercise.name)}</strong>
                <span>${escapeHtml(item.muscle.label)} - ${escapeHtml(item.exercise.reps)} reps - ${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR</span>
              </div>
              <span class="today-plan-dose">${item.sets} sets</span>
            </div>
          `).join("")}
        </div>
        <div class="action-grid today-plan-summary">
          <span><strong>${items.length}</strong> lifts</span>
          <span><strong>${items.reduce((sum, item) => sum + item.sets, 0)}</strong> sets</span>
          <span><strong>${escapeHtml(muscles.join(", ") || "--")}</strong> muscles</span>
          <span><strong>${plan.sessionPlan.totalMinutes}</strong> min</span>
        </div>
        <button class="primary-button coach-copy-button" type="button" data-action="copy-coach-plan">Copy to Log</button>
      ` : plan.mode === "progression" && plan.progression ? `
        <div class="action-grid today-plan-summary">
          <span><strong>${escapeHtml(plan.progression.target)}</strong> target</span>
          <span><strong>${escapeHtml(plan.progression.indicator.symbol)}</strong> trend</span>
          <span><strong>${escapeHtml(plan.progression.exercise)}</strong> lift</span>
          <span><strong>${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax}</strong> RIR</span>
        </div>
      ` : `
        <div class="empty compact-empty">${escapeHtml(plan.subtitle)}</div>
      `}
      ${plan.sessionPlan.missing.length ? `
        <div class="session-plan-gap">
          Missing primary exercise: ${escapeHtml(plan.sessionPlan.missing.map((muscle) => muscle.label).join(", "))}.
        </div>
      ` : ""}
    </section>
  `;
}

function renderCoachTimeframeSelector() {
  const selected = selectedCoachTimeframeMinutes();
  return `
    <section class="section card coach-timeframe-card">
      <div class="chart-header"><h3>Workout time</h3><span class="muted small">${escapeHtml(coachTimeframeSelectionLabel(selected))}</span></div>
      <div class="coach-timeframe-options" aria-label="Workout timeframe">
        ${COACH_TIMEFRAME_OPTIONS.map((option) => `
          <button class="timeframe-chip ${option.minutes === selected ? "is-active" : ""}" type="button" data-action="coach-timeframe" data-coach-minutes="${option.minutes}" aria-pressed="${option.minutes === selected}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCoachTargetSelector() {
  const selected = selectedCoachTargetMuscles();
  return `
    <section class="section card coach-target-card">
      <div class="chart-header coach-target-header">
        <h3>Target muscles</h3>
        <div class="coach-target-controls">
          <span class="muted small">${selected.length ? `${selected.length} selected` : "optional focus"}</span>
          ${selected.length ? `<button class="coach-target-reset" type="button" data-action="clear-coach-targets">Reset choices</button>` : ""}
        </div>
      </div>
      <div class="coach-target-options" aria-label="Target muscle focus">
        ${muscleGroups.map((muscle) => {
          const active = selected.includes(muscle.id);
          return `
            <button class="target-muscle-chip ${active ? "is-active" : ""}" type="button" data-action="coach-target-muscle" data-muscle-id="${escapeHtml(muscle.id)}" aria-pressed="${active}">
              ${escapeHtml(muscle.label)}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderCoachWhy(plan) {
  const explanation = plan.explanation || {};
  const sections = [
    { title: "Selected", items: explanation.selected || plan.why || [] },
    { title: "Waiting", items: explanation.skipped || [] },
    { title: "Library gaps", items: explanation.missing || [] },
    { title: "Other checks", items: explanation.notes || plan.notes || [] }
  ].filter((section) => section.items.length);
  return `
    <section class="section card coach-why-card">
      <div class="chart-header"><h3>Why this?</h3><span class="muted small">readiness + gaps</span></div>
      ${sections.length ? `
        <div class="coach-why-list">
          ${sections.map((section) => `
            <div class="coach-why-section">
              <h4>${escapeHtml(section.title)}</h4>
              ${section.items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty compact-empty">No priority issues right now.</div>`}
    </section>
  `;
}

function renderCoach() {
  const timeframeMinutes = selectedCoachTimeframeMinutes();
  const todayPlan = buildTodayPlan(timeframeMinutes);
  const recs = recommendations(todayPlan);
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Hypertrophy is counted in hard sets.</h2>
        <p class="hero-copy">Minimum-first coaching: 10 hard sets per muscle each Monday-start week, 2 touches, 1-3 RIR, enough protein, and gradual overload.</p>
      </div>
    </section>
    ${renderCoachTimeframeSelector()}
    ${renderCoachTargetSelector()}
    ${renderTodayPlan(todayPlan)}
    ${renderCoachWhy(todayPlan)}
    <section class="section chart-panel">
      <div class="chart-header"><h3>Muscle set audit</h3><span class="muted small">10 set floor, 12-20 growth zone</span></div>
      ${muscleProgressMarkup(muscleSetStats())}
    </section>
    <section class="section grid">
      <div class="chart-header coach-notes-header"><h3>Coach notes</h3><span class="muted small">secondary checks</span></div>
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

function renderNutritionGoalSelector() {
  const selected = selectedNutritionGoal();
  return `
    <div class="coach-timeframe-options nutrition-goal-options" aria-label="Nutrition goal">
      ${NUTRITION_GOAL_OPTIONS.map((option) => `
        <button class="timeframe-chip ${option.id === selected ? "is-active" : ""}" type="button" data-action="nutrition-goal" data-nutrition-goal="${option.id}" aria-pressed="${option.id === selected}">
          <span>${escapeHtml(option.label)}</span>
          <small>${escapeHtml(option.hint)}</small>
        </button>
      `).join("")}
    </div>
  `;
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
      <h2>Nutrition goal</h2>
      <p class="muted small">Coach uses this to interpret calories and body-weight trend.</p>
      ${renderNutritionGoalSelector()}
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
      <h2>App update</h2>
      <div class="settings-list">
        <span>Installed shell <strong>v${APP_VERSION}</strong></span>
      </div>
      <p class="muted small">Refresh the app shell if iPhone Safari keeps showing an older screen. This clears cached app files only; workouts and metrics stay in browser storage.</p>
      <button class="ghost-button full-button" type="button" data-action="refresh-app-shell">Refresh app shell</button>
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
          <input id="supabasePassword" type="password" autocomplete="current-password" value="${escapeHtml(state.settings.supabaseRememberPassword ? state.settings.supabasePassword || "" : "")}" placeholder="Only used for sign in or account creation">
          <label class="checkbox-row" for="supabaseRememberPassword">
            <input id="supabaseRememberPassword" type="checkbox" ${state.settings.supabaseRememberPassword ? "checked" : ""}>
            <span>Remember password on this device</span>
          </label>
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

function applyStaggerAnimations() {
  const animated = els.app.querySelectorAll(".card, .chart-panel, .stat, .coach-card, .exercise-definition, .exercise-draft, .history-exercise-card, .history-session-card, .form-panel, .settings-panel");
  animated.forEach((element, index) => {
    element.style.setProperty("--i", String(Math.min(index, 12)));
  });
}

async function render({ animate = false } = {}) {
  const token = ++renderToken;
  if (animate && els.app.children.length) {
    els.app.classList.remove("content-enter");
    els.app.classList.add("content-exit");
    await sleep(100);
    if (token !== renderToken) return;
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.activeTab);
  });

  if (state.activeTab === "dashboard") els.app.innerHTML = renderDashboard();
  if (state.activeTab === "log") els.app.innerHTML = renderLog();
  if (state.activeTab === "trends") els.app.innerHTML = renderTrends();
  if (state.activeTab === "coach") els.app.innerHTML = renderCoach();
  if (state.activeTab === "exercises") els.app.innerHTML = renderExercises();
  if (state.activeTab === "history") els.app.innerHTML = renderHistory();
  if (state.activeTab === "settings") els.app.innerHTML = await renderSettings();
  if (token !== renderToken) return;
  els.app.classList.remove("content-exit", "content-enter");
  if (animate) els.app.classList.add("content-enter");
  applyStaggerAnimations();
}

async function saveExercise(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Exercise name is required.");
  const primaryMuscle = String(formData.get("primaryMuscle") || "chest");
  const secondaryMuscles = formData.getAll("secondaryMuscles")
    .map((value) => String(value))
    .filter((muscle) => muscle !== primaryMuscle);
  const customExercises = getCustomExercises();
  const duplicate = customExercises.find((exercise) => (
    exercise.id !== state.editingExerciseId && normalizeName(exercise.name) === normalizeName(name)
  ));
  if (duplicate) throw new Error("That custom exercise already exists.");

  const existing = customExercises.find((exercise) => exercise.id === state.editingExerciseId);
  const exercise = normalizeExerciseDefinition({
    id: existing?.id || `user-${uid()}`,
    name,
    primaryMuscles: [primaryMuscle],
    secondaryMuscles,
    equipment: String(formData.get("equipment") || "").trim() || "custom",
    reps: String(formData.get("reps") || "").trim() || "8-15",
    rest: String(formData.get("rest") || "").trim() || "60-120 sec",
    cue: String(formData.get("cue") || "").trim() || "Custom exercise. Keep form strict and progress gradually.",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const nextExercises = existing
    ? customExercises.map((item) => item.id === existing.id ? exercise : item)
    : [...customExercises, exercise];

  await saveSetting("customExercises", nextExercises);
  state.editingExerciseId = null;
  state.selectedExercise = exercise.name;
  state.draftTargetMuscle = exercise.primaryMuscles[0] || "chest";
  await render();
  toast(existing ? "Exercise updated." : "Exercise saved.");
}

async function saveWorkout(form) {
  readWorkoutDraftFromForm();
  const data = Object.fromEntries(new FormData(form));
  const hadExisting = ensureWorkoutDraft().some((draft) => draft.editingWorkoutId);
  const entries = ensureWorkoutDraft().map((draft, index) => {
    const exerciseName = draft.exercise.trim();
    const meta = resolveExerciseMeta(exerciseName, draft.targetMuscle);
    const setRows = normalizeSetRows(draft.setRows);
    const existing = draft.editingWorkoutId ? state.workouts.find((entry) => entry.id === draft.editingWorkoutId) : null;
    const best = setRows.reduce((winner, row) => {
      const score = row.weight * (1 + row.reps / 30);
      return !winner || score > winner.score ? { ...row, score } : winner;
    }, null);
    return {
      id: existing?.id || uid(),
      date: data.date,
      exercise: exerciseName,
      exerciseId: meta.id,
      primaryMuscles: [...meta.primaryMuscles],
      secondaryMuscles: [...meta.secondaryMuscles],
      equipment: meta.equipment,
      setRows,
      sets: setRows.length,
      reps: best?.reps || 1,
      weight: best?.weight || 0,
      rir: averageRir({ setRows }),
      notes: draft.notes.trim(),
      order: Number.isFinite(Number(draft.order)) ? Number(draft.order) : index,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  await dbPutBatch("workouts", entries);
  const first = entries[0];
  state.selectedExercise = first.exercise;
  state.draftDate = first.date;
  state.draftNotes = first.notes;
  state.draftTargetMuscle = first.primaryMuscles[0] || "chest";
  state.setRows = setRowsFromWorkout(first);
  state.editingWorkoutId = first.id;
  state.workoutDraft = entries.map((entry) => ({
    draftId: uid(),
    editingWorkoutId: entry.id,
    exercise: entry.exercise,
    targetMuscle: entry.primaryMuscles[0] || "chest",
    notes: entry.notes || "",
    setRows: setRowsFromWorkout(entry),
    order: entry.order
  }));
  await loadState();
  await render();
  toast(hadExisting ? "Workout updated." : "Workout locked in.");
}

async function saveMetric(form) {
  const data = Object.fromEntries(new FormData(form));
  const date = data.date || todayISO();
  const existing = metricForDate(date);
  const entry = metricEntryFromFormData(data, existing);
  const duplicateIds = metricDuplicateIdsForDate(date, entry.id);
  await dbPut("metrics", entry);
  await Promise.all(duplicateIds.map((id) => dbDelete("metrics", id)));
  await loadState();
  state.metricDate = date;
  await render();
  toast(existing ? "Metrics updated." : "Metrics saved.");
}

function isSampleEntry(entry) {
  return entry?.sample === true || entry?.sampleBatch === SAMPLE_BATCH;
}

function sampleWorkout({ exercise, daysAgo, sets, reps, weight, rir, note }) {
  const date = dateDaysAgo(daysAgo);
  const meta = resolveExerciseMeta(exercise);
  const setRows = Array.from({ length: sets }, (_, index) => ({
    weight: Math.max(0, weight - index * (weight ? 2.5 : 0)),
    reps: Math.max(1, reps - (index % 3)),
    rir,
    restSeconds: weight >= 30 ? 120 : 75
  }));
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
    setRows,
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
  const calories = Math.round(2380 + progress * 7 + wave * 70);
  const protein = Math.round(126 + progress * 0.95 + wave * 6);
  const meals = {
    breakfast: { calories: Math.round(calories * 0.24), protein: Math.round(protein * 0.24) },
    lunch: { calories: Math.round(calories * 0.32), protein: Math.round(protein * 0.32) },
    dinner: { calories: Math.round(calories * 0.34), protein: Math.round(protein * 0.34) },
    snacks: { calories: 0, protein: 0 }
  };
  meals.snacks.calories = calories - meals.breakfast.calories - meals.lunch.calories - meals.dinner.calories;
  meals.snacks.protein = protein - meals.breakfast.protein - meals.lunch.protein - meals.dinner.protein;
  return {
    id: `${SAMPLE_BATCH}-metric-${date}`,
    sample: true,
    sampleBatch: SAMPLE_BATCH,
    date,
    bodyWeight: 181 + progress * 0.08 + wave * 0.25,
    calories,
    protein,
    meals,
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
    nutritionGoal: selectedNutritionGoal(),
    dayTemplates: getDayTemplates(),
    customExercises: getCustomExercises(),
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
    metrics: canonicalMetricEntries(state.metrics.filter((entry) => !isSampleEntry(entry)))
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
  if (NUTRITION_GOAL_OPTIONS.some((option) => option.id === payload.settings?.nutritionGoal)) {
    await saveSetting("nutritionGoal", payload.settings.nutritionGoal);
  }
  if (Array.isArray(payload.settings?.dayTemplates)) {
    await saveSetting("dayTemplates", payload.settings.dayTemplates);
  }
  if (Array.isArray(payload.settings?.customExercises)) {
    await saveSetting("customExercises", payload.settings.customExercises.map(normalizeExerciseDefinition).filter(Boolean));
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
  const rememberPassword = !!document.getElementById("supabaseRememberPassword")?.checked;
  return { url, key, email, password, rememberPassword };
}

async function saveSupabaseSettings({ renderAfter = true, notify = true } = {}) {
  const { url, key, email, password, rememberPassword } = readSupabaseFields();
  await saveSetting("supabaseUrl", url);
  await saveSetting("supabaseAnonKey", key);
  await saveSetting("supabaseEmail", email);
  await saveSetting("supabaseRememberPassword", rememberPassword);
  await saveSetting("supabasePassword", rememberPassword ? password : "");
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
  const { email } = fields;
  const password = fields.password || (fields.rememberPassword ? state.settings.supabasePassword : "");
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

async function refreshAppShell() {
  toast("Refreshing app shell...");
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => {
        registration.waiting?.postMessage({ type: "CLEAR_APP_SHELL" });
        registration.active?.postMessage({ type: "CLEAR_APP_SHELL" });
        return registration.unregister();
      }));
    }
  } catch {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("trainwise-cache")).map((key) => caches.delete(key)));
    }
  } catch {}

  const refreshUrl = new URL(window.location.href);
  refreshUrl.searchParams.set("refresh", Date.now());
  window.location.replace(refreshUrl.toString());
}

async function clearAll() {
  if (!confirm("Clear all local workout and nutrition data? Export a backup first if you need it.")) return;
  await Promise.all(["workouts", "metrics"].map((store) => dbClear(store)));
  await loadState();
  await render();
  toast("Local data cleared.");
}

function editWorkout(id) {
  const entry = state.workouts.find((workout) => workout.id === id);
  if (!entry) throw new Error("Workout not found.");
  const meta = workoutMeta(entry);
  state.logMode = "strength";
  state.activeTab = "log";
  state.selectedExercise = entry.exercise;
  state.draftDate = entry.date;
  state.draftNotes = entry.notes || "";
  state.draftTargetMuscle = meta.primaryMuscles[0] || "chest";
  state.setRows = setRowsFromWorkout(entry);
  state.editingWorkoutId = entry.id;
  state.workoutDraft = [{
    draftId: uid(),
    editingWorkoutId: entry.id,
    exercise: entry.exercise,
    targetMuscle: meta.primaryMuscles[0] || "chest",
    notes: entry.notes || "",
    setRows: setRowsFromWorkout(entry),
    order: entry.order
  }];
  state.logHistoryExercise = "";
}

function defaultLogExerciseName() {
  return exerciseNames()[0] || "Custom exercise";
}

function workoutEntryToDraft(entry) {
  return {
    draftId: uid(),
    editingWorkoutId: entry.id,
    exercise: entry.exercise,
    targetMuscle: entry.primaryMuscles?.[0] || "chest",
    notes: entry.notes || "",
    setRows: setRowsFromWorkout(entry),
    order: entry.order
  };
}

function clearWorkoutDraft(date = todayISO()) {
  const exercise = defaultLogExerciseName();
  const meta = resolveExerciseMeta(exercise);
  state.editingWorkoutId = null;
  state.draftDate = date;
  state.draftNotes = "";
  state.selectedExercise = exercise;
  state.draftTargetMuscle = meta.primaryMuscles[0] || "chest";
  state.setRows = defaultSetRows();
  state.workoutDraft = [defaultDraftExercise(exercise)];
  state.logHistoryExercise = "";
  syncLegacyDraftFromFirst();
}

function loadWorkoutDateDraft(date) {
  state.draftDate = date;
  const entries = workoutsForDate(date);
  if (entries.length) {
    const first = entries[0];
    state.editingWorkoutId = first.id;
    state.workoutDraft = entries.map(workoutEntryToDraft);
    syncLegacyDraftFromFirst();
    return;
  }
  clearWorkoutDraft(date);
}

async function moveExerciseDraft(draftId, direction) {
  readDraftFromForm();
  const drafts = [...state.workoutDraft];
  const idx = drafts.findIndex((d) => d.draftId === draftId);
  if (idx < 0) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= drafts.length) return;
  [drafts[idx], drafts[swapIdx]] = [drafts[swapIdx], drafts[idx]];
  state.workoutDraft = drafts;
  syncLegacyDraftFromFirst();
  await render();
}

async function handleAction(action, target) {
  const actions = {
    async "app-retry"() { await init(); },
    async "refresh-app-shell"() { await refreshAppShell(); },
    async "toggle-template-panel"() {
      readDraftFromForm();
      state.showTemplatePanel = !state.showTemplatePanel;
      await render();
    },
    async "history-select-exercise"() {
      state.historyExercise = target.dataset.exercise || "";
      state.historyMode = "exercises";
      await render();
    },
    async "history-back"() {
      state.historyExercise = "";
      state.historyMode = "exercises";
      await render();
    },
    async "history-set-mode"() {
      state.historyMode = target.dataset.historyMode === "dates" ? "dates" : "exercises";
      await render();
    },
    async "history-date-chip"() {
      state.historyMode = "dates";
      state.historyDate = target.dataset.historyDateValue || "";
      await render();
    },
    async "clear-history-date"() {
      state.historyDate = "";
      await render();
    },
    async "coach-timeframe"() {
      const minutes = Number(target.dataset.coachMinutes);
      state.coachTimeframeMinutes = COACH_TIMEFRAME_OPTIONS.some((option) => option.minutes === minutes)
        ? minutes
        : SESSION_LIMIT_MINUTES;
      await render();
    },
    async "coach-target-muscle"() {
      const muscleId = target.dataset.muscleId;
      if (!muscleGroups.some((muscle) => muscle.id === muscleId)) return;
      const scrollLeft = target.closest(".coach-target-options")?.scrollLeft || 0;
      const selected = selectedCoachTargetMuscles();
      state.coachTargetMuscles = selected.includes(muscleId)
        ? selected.filter((id) => id !== muscleId)
        : [...selected, muscleId];
      await render();
      restoreCoachTargetScroll(scrollLeft);
    },
    async "clear-coach-targets"() {
      state.coachTargetMuscles = [];
      await render();
    },
    async "copy-coach-plan"() {
      copyCoachPlanToLog(buildTodayPlan(selectedCoachTimeframeMinutes()));
      await render({ animate: true });
      toast("Coach plan copied to Log.");
    },
    async "dismiss-record-trophy"() {
      readDraftFromForm();
      const key = target.dataset.recordKey;
      if (key) state.dismissedRecordTrophies.add(key);
      await render();
    },
    async "return-to-today"() {
      readDraftFromForm();
      const today = todayISO();
      loadWorkoutDateDraft(today);
      await render();
    },
    async "add-exercise-table"() {
      readDraftFromForm();
      state.workoutDraft.push(defaultDraftExercise(defaultLogExerciseName()));
      await render();
    },
    async "remove-exercise-table"() {
      readDraftFromForm();
      state.workoutDraft = ensureWorkoutDraft().filter((draft) => draft.draftId !== target.dataset.draftId);
      syncLegacyDraftFromFirst();
      await render();
    },
    async "move-exercise-up"() { await moveExerciseDraft(target.dataset.draftId, -1); },
    async "move-exercise-down"() { await moveExerciseDraft(target.dataset.draftId, 1); },
    async "toggle-exercise-menu"() {
      readDraftFromForm();
      state.openExerciseMenu = state.openExerciseMenu === target.dataset.draftId ? null : target.dataset.draftId;
      await render();
    },
    async "open-exercise-history"() {
      readDraftFromForm();
      state.logHistoryExercise = target.dataset.exercise;
      state.openExerciseMenu = null;
      await render();
    },
    async "close-log-history"() {
      state.logHistoryExercise = "";
      await render();
    },
    async "edit-exercise"() {
      state.activeTab = "exercises";
      state.editingExerciseId = target.dataset.id;
      await render();
    },
    async "cancel-exercise-edit"() { state.editingExerciseId = null; await render(); },
    async "exercise-clear-form"() { state.editingExerciseId = null; await render(); },
    async "delete-exercise"() {
      const exercise = getCustomExercises().find((item) => item.id === target.dataset.id);
      if (!exercise) throw new Error("Exercise not found.");
      if (!confirm(`Delete "${exercise.name}" from your exercise database? Existing logs stay intact.`)) return;
      await saveSetting("customExercises", getCustomExercises().filter((item) => item.id !== exercise.id));
      if (state.editingExerciseId === exercise.id) state.editingExerciseId = null;
      await render();
      toast("Exercise deleted.");
    },
    async "log-exercise"() {
      state.activeTab = "log";
      state.logMode = "strength";
      state.editingWorkoutId = null;
      state.selectedExercise = target.dataset.exercise;
      state.draftTargetMuscle = resolveExerciseMeta(state.selectedExercise).primaryMuscles[0] || "chest";
      state.setRows = defaultSetRows();
      state.workoutDraft = [defaultDraftExercise(state.selectedExercise)];
      await render();
    },
    "quick-backup"() { downloadBackup(); },
    "export-data"() { downloadBackup(); },
    "import-click"() { document.getElementById("import-file")?.click(); },
    async "add-set"() {
      readDraftFromForm();
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      const last = draft.setRows[draft.setRows.length - 1] || { weight: "", reps: 10, rir: 2 };
      draft.setRows.push({ ...last });
      syncLegacyDraftFromFirst();
      await render();
    },
    async "remove-set"() {
      readDraftFromForm();
      const index = Number(target.dataset.index);
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      if (draft.setRows.length > 1) draft.setRows.splice(index, 1);
      syncLegacyDraftFromFirst();
      await render();
    },
    async "use-last-session"() {
      readDraftFromForm();
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      const last = lastSessionForExercise(draft.exercise, draft.editingWorkoutId);
      if (!last) throw new Error("No previous session for this exercise yet.");
      draft.setRows = setRowsFromWorkout(last);
      draft.notes = last.notes || draft.notes;
      syncLegacyDraftFromFirst();
      await render();
      toast("Last session loaded.");
    },
    async "toggle-history"() {
      readDraftFromForm();
      state.historyExercise = state.historyExercise === state.selectedExercise ? "" : state.selectedExercise;
      await render();
    },
    async "new-log"() {
      if (!confirm("Clear all logged info? This will discard your current draft.")) return;
      readDraftFromForm();
      clearWorkoutDraft();
      await render();
    },
    async "edit-workout"() {
      editWorkout(target.dataset.id);
      await render();
    },
    async "save-day-template"() { await saveDayTemplate(); },
    async "load-template"() { await loadDayTemplate(); },
    async "delete-template"() { await deleteDayTemplate(); },
    async "template-exercise"() {
      readDraftFromForm();
      const item = state.templateQueue[Number(target.dataset.index)];
      if (item) {
        state.workoutDraft = [{
          draftId: uid(),
          editingWorkoutId: null,
          exercise: item.exercise,
          targetMuscle: item.targetMuscle || resolveExerciseMeta(item.exercise).primaryMuscles[0] || "chest",
          notes: item.notes || "",
          setRows: normalizeSetRows(item.setRows)
        }];
        syncLegacyDraftFromFirst();
      }
      await render();
    },
    async "delete-workout"() {
      await dbDelete("workouts", target.dataset.id);
      if (state.editingWorkoutId === target.dataset.id) clearWorkoutDraft();
      await loadState();
      await render();
      toast("Lift deleted.");
    },
    async "delete-metric"() {
      const ids = target.dataset.date
        ? metricEntriesForDate(target.dataset.date).map((entry) => entry.id).filter(Boolean)
        : [target.dataset.id].filter(Boolean);
      await Promise.all(ids.map((id) => dbDelete("metrics", id)));
      await loadState();
      await render();
      toast("Metric deleted.");
    },
    async "choose-exercise"() {
      readDraftFromForm();
      state.workoutDraft.push(defaultDraftExercise(target.dataset.exercise));
      syncLegacyDraftFromFirst();
      await render();
    },
    async "save-supabase"() { await saveSupabaseSettings(); },
    async "signup-supabase"() { await supabaseAuth("signup"); },
    async "signin-supabase"() { await supabaseAuth("signin"); },
    async "push-supabase"() { await pushSupabaseBackup(); },
    async "pull-supabase"() { await pullSupabaseBackup(); },
    async "nutrition-goal"() {
      const goal = target.dataset.nutritionGoal;
      if (!NUTRITION_GOAL_OPTIONS.some((option) => option.id === goal)) return;
      await saveSetting("nutritionGoal", goal);
      await render();
      toast(`Nutrition goal set to ${nutritionGoalLabel(goal)}.`);
    },
    async "load-sample-data"() { await loadSampleData(); },
    async "remove-sample-data"() { await removeSampleData(); },
    async "clear-all"() { await clearAll(); }
  };
  const handler = actions[action];
  if (handler) await handler();
}

const dragState = {
  id: null,
  startY: 0,
  currentY: 0,
  active: false,
  moved: false,
  pending: false,
  dragTimer: null,
  handle: null,
  holdDelay: 150
};

function activateDrag() {
  if (!dragState.pending || !dragState.handle) return;
  const handle = dragState.handle;
  const section = handle.closest(".exercise-draft");
  if (!section) return;
  readDraftFromForm();
  dragState.id = section.dataset.draftId;
  dragState.active = true;
  dragState.pending = false;
  state.draggingDraftId = dragState.id;
  section.classList.add("is-dragging");
  handle.setPointerCapture?.(dragState.pointerId);
}

function startExerciseDrag(handle, event) {
  dragState.handle = handle;
  dragState.startY = event.clientY;
  dragState.currentY = event.clientY;
  dragState.pending = true;
  dragState.moved = false;
  dragState.pointerId = event.pointerId;
  clearTimeout(dragState.dragTimer);
  dragState.dragTimer = setTimeout(activateDrag, dragState.holdDelay);
}

function cancelPendingDrag() {
  clearTimeout(dragState.dragTimer);
  dragState.pending = false;
  dragState.handle = null;
}

function resetDragState() {
  dragState.id = null;
  dragState.active = false;
  dragState.pending = false;
  dragState.moved = false;
  dragState.handle = null;
  state.draggingDraftId = null;
  document.querySelectorAll(".exercise-draft.is-dragging").forEach((section) => {
    section.classList.remove("is-dragging");
    section.style.transform = "";
  });
}

async function finishExerciseDrag(event) {
  clearTimeout(dragState.dragTimer);
  if (dragState.pending && !dragState.active) {
    cancelPendingDrag();
    return;
  }
  if (!dragState.active || !dragState.id) return;
  dragState.currentY = event.clientY;
  const draggedId = dragState.id;
  const movedEnough = Math.abs(dragState.currentY - dragState.startY) > 8;
  const sections = [...document.querySelectorAll(".exercise-draft")];
  const sourceIndex = state.workoutDraft.findIndex((draft) => draft.draftId === draggedId);
  let changed = false;
  if (sourceIndex >= 0 && sections.length > 1 && movedEnough) {
    let targetIndex = state.workoutDraft.length - 1;
    for (let index = 0; index < sections.length; index += 1) {
      const rect = sections[index].getBoundingClientRect();
      if (dragState.currentY < rect.top + rect.height / 2) {
        targetIndex = index;
        break;
      }
    }
    const nextDraft = [...state.workoutDraft];
    const [item] = nextDraft.splice(sourceIndex, 1);
    const insertIndex = Math.min(targetIndex, nextDraft.length);
    nextDraft.splice(insertIndex, 0, item);
    changed = nextDraft.some((draft, index) => draft.draftId !== state.workoutDraft[index]?.draftId);
    if (changed) {
      state.workoutDraft = nextDraft;
      syncLegacyDraftFromFirst();
    }
  }
  resetDragState();
  if (changed) await render();
}

function updateInteractiveChart(chart, event) {
  const stage = chart.querySelector(".chart-stage");
  const marker = chart.querySelector(".chart-marker");
  const readout = chart.querySelector(".chart-readout");
  if (!stage || !marker || !readout) return;
  let points = [];
  try {
    points = JSON.parse(chart.dataset.points || "[]");
  } catch {
    points = [];
  }
  if (!points.length) return;
  const rect = stage.getBoundingClientRect();
  const xPct = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
  const nearest = points.reduce((best, point) => (
    !best || Math.abs(point.x - xPct) < Math.abs(best.x - xPct) ? point : best
  ), null);
  if (!nearest) return;
  marker.style.left = `${nearest.x}%`;
  marker.style.top = `${nearest.y}%`;
  readout.textContent = chartReadout(nearest, chart.dataset.unit || "");
}

function restoreCoachTargetScroll(scrollLeft) {
  const restore = () => {
    const scroller = document.querySelector(".coach-target-options");
    if (scroller) scroller.scrollLeft = scrollLeft;
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
  else restore();
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-tab]");
  const logMode = event.target.closest("[data-log-mode]");
  const action = event.target.closest("[data-action]");

  try {
    if (tab) {
      state.activeTab = tab.dataset.tab;
      await render({ animate: true });
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
    if (event.target.matches("[data-draft-field='exercise']")) {
      readDraftFromForm();
      const draft = state.workoutDraft.find((item) => item.draftId === event.target.dataset.draftId);
      if (draft) {
        const meta = resolveExerciseMeta(draft.exercise, draft.targetMuscle);
        draft.targetMuscle = meta.primaryMuscles[0] || draft.targetMuscle || "chest";
      }
      syncLegacyDraftFromFirst();
      await render();
    }
    if (event.target.matches("#workout-date")) {
      readDraftFromForm();
      const newDate = event.target.value || todayISO();
      loadWorkoutDateDraft(newDate);
      await render();
    }
    if (event.target.matches("#metric-date")) {
      state.metricDate = event.target.value || todayISO();
      await render();
    }
    if (event.target.matches("#trend-exercise")) {
      state.selectedExercise = event.target.value;
      await render();
    }
    if (event.target.matches("#history-date")) {
      state.historyMode = "dates";
      state.historyDate = event.target.value || "";
      await render();
    }
    if (event.target.matches("#trend-muscle")) {
      state.selectedMuscle = event.target.value;
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

document.addEventListener("input", async (event) => {
  try {
    if (event.target.matches("[data-meal-field], [data-quick-field]")) {
      refreshNutritionFormTotals(event.target.closest("#metric-form"));
    }
    if (event.target.matches("[data-set-field]")) {
      const section = event.target.closest(".exercise-draft");
      readDraftFromForm();
      if (section?.dataset.draftId) refreshDraftRecordTrophies(section.dataset.draftId);
    }
    if (event.target.matches("[data-history-search]")) {
      const caret = event.target.selectionStart || 0;
      state.historySearch = event.target.value;
      await render();
      const input = document.getElementById("history-search");
      input?.focus();
      input?.setSelectionRange?.(caret, caret);
    }
  } catch (error) {
    toast(error.message || "Something went wrong.");
  }
});

document.addEventListener("pointermove", (event) => {
  if (dragState.active) {
    dragState.currentY = event.clientY;
    const delta = dragState.currentY - dragState.startY;
    if (Math.abs(delta) > 8) dragState.moved = true;
    const dragged = document.querySelector(`.exercise-draft[data-draft-id="${dragState.id}"]`);
    if (dragged) dragged.style.transform = `translateY(${delta}px)`;
    return;
  }
  cancelPendingDrag();
  const chart = event.target.closest(".interactive-chart");
  if (chart) updateInteractiveChart(chart, event);
});

document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (handle) {
    startExerciseDrag(handle, event);
    return;
  }
  const chart = event.target.closest(".interactive-chart");
  if (chart) updateInteractiveChart(chart, event);
});

document.addEventListener("pointerup", async (event) => {
  try {
    await finishExerciseDrag(event);
  } catch (error) {
    toast(error.message || "Could not reorder exercise.");
  }
});

document.addEventListener("pointercancel", async (event) => {
  try {
    await finishExerciseDrag(event);
  } catch {
    dragState.id = null;
    dragState.active = false;
    dragState.pending = false;
    dragState.moved = false;
    dragState.handle = null;
    state.draggingDraftId = null;
    document.querySelectorAll(".exercise-draft.is-dragging").forEach((section) => {
      section.classList.remove("is-dragging");
      section.style.transform = "";
    });
  }
});

document.addEventListener("touchstart", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (handle) {
    event.preventDefault();
    const touch = event.touches[0];
    startExerciseDrag(handle, { clientY: touch.clientY, pointerId: touch.identifier });
  }
}, { passive: false });

document.addEventListener("touchmove", (event) => {
  if (dragState.active) {
    event.preventDefault();
    const touch = event.touches[0];
    dragState.currentY = touch.clientY;
    const delta = dragState.currentY - dragState.startY;
    if (Math.abs(delta) > 8) dragState.moved = true;
    const dragged = document.querySelector(`.exercise-draft[data-draft-id="${dragState.id}"]`);
    if (dragged) dragged.style.transform = `translateY(${delta}px)`;
  } else if (dragState.pending) {
    cancelPendingDrag();
  }
}, { passive: false });

document.addEventListener("touchend", async (event) => {
  try {
    await finishExerciseDrag({ clientY: dragState.currentY });
  } catch (error) {
    toast(error.message || "Could not reorder exercise.");
  }
});

document.addEventListener("touchcancel", () => {
  clearTimeout(dragState.dragTimer);
  dragState.id = null;
  dragState.active = false;
  dragState.pending = false;
  dragState.moved = false;
  dragState.handle = null;
  state.draggingDraftId = null;
  document.querySelectorAll(".exercise-draft.is-dragging").forEach((section) => {
    section.classList.remove("is-dragging");
    section.style.transform = "";
  });
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.matches("#exercise-form")) await saveExercise(event.target);
    if (event.target.matches("#strength-form")) await saveWorkout(event.target);
    if (event.target.matches("#metric-form")) await saveMetric(event.target);
  } catch (error) {
    toast(error.message || "Could not save.");
  }
});

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`);
  const askWorkerToActivate = (worker) => worker?.postMessage({ type: "SKIP_WAITING" });

  if (registration.waiting) askWorkerToActivate(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        askWorkerToActivate(installing);
      }
    });
  });

  registration.update().catch(() => {});
}

function renderStartupFailure(error) {
  els.app.innerHTML = `
    <section class="settings-panel">
      <h2>TrainWise could not start</h2>
      <p class="muted small">${escapeHtml(error.message || "The app shell or browser storage did not open cleanly.")}</p>
      <div class="grid two">
        <button class="primary-button" type="button" data-action="app-retry">Retry startup</button>
        <button class="ghost-button" type="button" data-action="refresh-app-shell">Refresh app shell</button>
      </div>
      <p class="muted micro">Refreshing the app shell clears cached app files only. It does not delete workouts or nutrition logs.</p>
    </section>
  `;
}

async function init() {
  try {
    state.db = await openDB();
    await loadState();
  } catch (error) {
    await sleep(350);
    state.db = null;
    state.db = await openDB();
    await loadState();
  }

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  await render();
  registerServiceWorker().catch(() => {});
}

init().catch((error) => {
  renderStartupFailure(error);
});
