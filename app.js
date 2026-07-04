"use strict";

const DB_NAME = "trainwise-db";
const DB_VERSION = 3;
const STORES = ["workouts", "metrics", "settings", "syncQueue"];
const APP_VERSION = "1.5.45";
const SAMPLE_BATCH = "hypertrophy-demo-v1";
const DRAFT_RECOVERY_KEY = "trainwise-draft-recovery-v1";
const COPIED_COACH_PLAN_KEY = "trainwise-copied-coach-plan-v1";
const SYNC_BOOTSTRAP_VERSION = 1;
const SYNC_POLL_MS = 60000;
const SYNC_SAFE_PREFERENCES = ["hypertrophyProfile", "nutritionGoal", "dashboardWidgets", "dashboardWidgetOrder"];
const COLLAPSE_ANIMATION_MS = 240;
const COLLAPSE_REVEAL_MS = 760;
const COLLAPSIBLE_SELECTOR = "details.collapsible-panel, details.coverage-row, details.inline-disclosure";
let dbOpenPromise = null;
let chartId = 0;
let reloadingForUpdate = false;
let renderToken = 0;
let scrollTopTimer = null;
let recordSyncTimer = null;
let recordSyncPromise = null;
let recordSyncLifecycleStarted = false;
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
const TODAY_WIDGET_OPTIONS = [
  { id: "nextLift", label: "Next lift" },
  { id: "lowestSets", label: "Lowest set counts" },
  { id: "health", label: "Health coach" },
  { id: "weeklySets", label: "Weekly hard sets" },
  { id: "bodyWeight", label: "Body weight" },
  { id: "protein", label: "Protein" }
];
const DEFAULT_TODAY_WIDGETS = TODAY_WIDGET_OPTIONS.map((option) => option.id);

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

const RIR_MIN = 0;
const RIR_MAX = 100;

const COACH_GROWTH_MODE_OPTIONS = [
  { id: "soft", label: "Soft", targetSets: 16, allowHighVolume: false, startSets: 2, rank: 0 },
  { id: "medium", label: "Medium", targetSets: HYPERTROPHY.growthHigh, allowHighVolume: false, startSets: 3, rank: 1 },
  { id: "aggressive", label: "Aggressive", targetSets: HYPERTROPHY.highVolumeFillMax, allowHighVolume: true, startSets: 4, rank: 2 }
];

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
const COACH_DAILY_MUSCLE_CAP = 5;
const COACH_MUSCLE_RECOVERY_DAYS = 2;
const COACH_WEEKLY_EXERCISE_USE_CAP = 2;
const COACH_SAME_EXERCISE_COOLDOWN_DAYS = 4;
const COACH_FAILURE_ROTATION_DAYS = 7;
const COACH_PERFORMANCE_DROP_THRESHOLD = 0.025;

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
  selectedExercise: "",
  selectedMuscle: "chest",
  editingExerciseId: null,
  exerciseSearch: "",
  exerciseMuscleFilter: "all",
  exerciseSort: "recent",
  exerciseFormDraft: null,
  exerciseFormErrors: {},
  metricFormDraft: null,
  openExerciseActionMenu: null,
  editingWorkoutId: null,
  openExerciseMenu: null,
  logHistoryExercise: "",
  workoutDraft: [],
  loadedWorkoutDateIds: [],
  historyMode: "exercises",
  historyExercise: "",
  historySearch: "",
  historyDate: "",
  weeklyMuscleDetail: null,
  returnStack: [],
  coachTimeframeMinutes: SESSION_LIMIT_MINUTES,
  coachGlobalGrowthMode: "medium",
  coachTargetMuscles: [],
  coachGrowthModes: {},
  copiedCoachPlan: null,
  previewNextCoachPlan: false,
  settingsOpenPanels: [],
  draggingDraftId: null,
  dragPendingDraftId: null,
  appBanner: null,
  logDraftNotice: null,
  undoAction: null,
  pendingImport: null,
  syncQueue: [],
  syncStatus: "idle",
  syncMessage: "",
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

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function shiftISODate(value, deltaDays) {
  const date = parseLocalDate(value || todayISO());
  if (Number.isNaN(date.getTime())) return todayISO();
  date.setDate(date.getDate() + deltaDays);
  return isoFromLocalDate(date);
}

function renderDateControl({ id, name = "", label = "Date", value = todayISO(), className = "", inputClass = "", clearable = false, required = true } = {}) {
  const safeId = escapeHtml(id);
  const safeValue = escapeHtml(value || todayISO());
  return `
    <div class="field date-control-field ${escapeHtml(className)}">
      <label for="${safeId}">${escapeHtml(label)}</label>
      <div class="date-control">
        <button class="date-step-button" type="button" data-action="date-step" data-date-input="${safeId}" data-date-delta="-1" aria-label="Previous day">&lsaquo;</button>
        <input id="${safeId}" class="${escapeHtml(inputClass)}" ${name ? `name="${escapeHtml(name)}"` : ""} type="date" ${required ? "required" : ""} value="${safeValue}" data-shared-date-input>
        <button class="date-step-button" type="button" data-action="date-step" data-date-input="${safeId}" data-date-delta="1" aria-label="Next day">&rsaquo;</button>
        <button class="ghost-button date-today-button" type="button" data-action="date-today" data-date-input="${safeId}">Today</button>
        ${clearable ? `<button class="ghost-button date-clear-button" type="button" data-action="date-clear" data-date-input="${safeId}">Clear</button>` : ""}
      </div>
    </div>
  `;
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

function toast(message, options = {}) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), options.duration || 2600);
}

function showBanner(message, options = {}) {
  state.appBanner = {
    id: uid(),
    message,
    tone: options.tone || "info",
    action: options.action || "",
    actionLabel: options.actionLabel || "",
    detail: options.detail || ""
  };
}

function announce(message, options = {}) {
  showBanner(message, options);
  toast(message);
}

function notifyMetricSaved(existing) {
  toast(existing ? "Metrics updated." : "Metrics saved.", { duration: 2000 });
}

function scrollTopButtonShouldShow(scrollY = 0, scrollHeight = 0, clientHeight = 0) {
  if (!scrollHeight || !clientHeight || scrollHeight <= clientHeight * 1.5) return false;
  const scrollable = Math.max(scrollHeight - clientHeight, 1);
  return scrollY / scrollable > 0.55;
}

function scrollTopButtonTopOffset(scrollY = 0, viewport = null, innerHeightValue = 0, tabbarHeight = 76, buttonSize = 42, containingBlockOffset = 0) {
  const safeGap = 12;
  const visualLift = 22;
  const visibleTop = viewport?.offsetTop || 0;
  const visibleHeight = viewport?.height || innerHeightValue;
  return Math.max(0, scrollY + visibleTop + visibleHeight - tabbarHeight - safeGap - buttonSize - visualLift - containingBlockOffset);
}

function clearBanner() {
  state.appBanner = null;
}

function showLogDraftNotice() {
  if (state.activeTab !== "log") return;
  clearLogDraftNotice();
  showDraftSavedToast();
}

function clearLogDraftNotice() {
  state.logDraftNotice = null;
}

function showDraftSavedToast() {
  const now = Date.now();
  if (now - (showDraftSavedToast.lastShownAt || 0) < 2200) return;
  showDraftSavedToast.lastShownAt = now;
  toast("Draft saved.", { duration: 1400 });
}

function setUndoAction(label, payload) {
  state.undoAction = {
    id: uid(),
    label,
    payload,
    createdAt: new Date().toISOString()
  };
}

function clearUndoAction() {
  state.undoAction = null;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function selectedDashboardWidgets() {
  const valid = new Set(TODAY_WIDGET_OPTIONS.map((option) => option.id));
  const saved = Array.isArray(state.settings.dashboardWidgets) ? state.settings.dashboardWidgets : DEFAULT_TODAY_WIDGETS;
  const filtered = saved.filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
  return filtered.length ? filtered : [...DEFAULT_TODAY_WIDGETS];
}

function dashboardWidgetOrder() {
  const valid = new Set(TODAY_WIDGET_OPTIONS.map((option) => option.id));
  const saved = Array.isArray(state.settings.dashboardWidgetOrder) ? state.settings.dashboardWidgetOrder : DEFAULT_TODAY_WIDGETS;
  const ordered = saved.filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
  const missing = DEFAULT_TODAY_WIDGETS.filter((id) => !ordered.includes(id));
  return [...ordered, ...missing];
}

async function saveDashboardWidgets(enabled, order = dashboardWidgetOrder()) {
  const valid = new Set(TODAY_WIDGET_OPTIONS.map((option) => option.id));
  const nextEnabled = enabled.filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
  const nextOrder = order.filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
  await saveSetting("dashboardWidgets", nextEnabled.length ? nextEnabled : [...DEFAULT_TODAY_WIDGETS]);
  await saveSetting("dashboardWidgetOrder", nextOrder.length ? nextOrder : [...DEFAULT_TODAY_WIDGETS]);
  await queueSyncChange("preference", "dashboardWidgets", { value: selectedDashboardWidgets() });
  await queueSyncChange("preference", "dashboardWidgetOrder", { value: dashboardWidgetOrder() });
  scheduleRecordSync();
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
      if (!db.objectStoreNames.contains("syncQueue")) {
        const store = db.createObjectStore("syncQueue", { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("createdAt", "createdAt");
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
  const [workouts, metrics, settingsRows, syncQueue] = await Promise.all([
    dbAll("workouts"),
    dbAll("metrics"),
    dbAll("settings"),
    dbAll("syncQueue")
  ]);
  state.workouts = sortByDateDesc(workouts);
  state.metrics = sortByDateDesc(metrics);
  state.settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  state.syncQueue = syncQueue;
}

async function saveSetting(key, value) {
  state.settings[key] = value;
  await dbPut("settings", { key, value });
}

function syncRecordKey(recordType, recordId) {
  return `${String(recordType || "").trim()}:${String(recordId || "").trim()}`;
}

function localSyncRecord(recordType, recordId, payload) {
  return {
    recordType,
    recordId: String(recordId),
    payload: clonePlain(payload)
  };
}

function safePreferenceValue(key) {
  if (key === "hypertrophyProfile") return hypertrophySettings();
  if (key === "nutritionGoal") return selectedNutritionGoal();
  if (key === "dashboardWidgets") return selectedDashboardWidgets();
  if (key === "dashboardWidgetOrder") return dashboardWidgetOrder();
  return undefined;
}

function buildLocalSyncRecords() {
  const records = [];
  state.workouts
    .filter((entry) => !isSampleEntry(entry) && entry?.id)
    .forEach((entry) => records.push(localSyncRecord("workout", entry.id, entry)));
  canonicalMetricEntries(state.metrics.filter((entry) => !isSampleEntry(entry)))
    .filter((entry) => entry?.date)
    .forEach((entry) => records.push(localSyncRecord("metric", entry.date, entry)));
  getCustomExercises({ includeArchived: true })
    .filter((entry) => entry?.id)
    .forEach((entry) => records.push(localSyncRecord("exercise", entry.id, entry)));
  getDayTemplates()
    .filter((entry) => entry?.id)
    .forEach((entry) => records.push(localSyncRecord("template", entry.id, entry)));
  SYNC_SAFE_PREFERENCES.forEach((key) => {
    records.push(localSyncRecord("preference", key, { value: safePreferenceValue(key) }));
  });
  return records;
}

function syncConflictFromRemote(pending, remoteRecord) {
  return {
    ...pending,
    status: "conflict",
    remoteRecord: clonePlain(remoteRecord),
    conflictAt: new Date().toISOString()
  };
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

  const normalized = {
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
  if (exercise.archivedAt) normalized.archivedAt = String(exercise.archivedAt);
  return normalized;
}

function getCustomExercises(options = {}) {
  const includeArchived = options.includeArchived === true;
  const source = Array.isArray(state.settings.customExercises) ? state.settings.customExercises : [];
  const seen = new Set();
  return source
    .map(normalizeExerciseDefinition)
    .filter(Boolean)
    .filter((exercise) => includeArchived || !exercise.archivedAt)
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
  return [...getCustomExercises({ includeArchived: true }), ...legacyExerciseMetadata.map((exercise) => ({
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

function exerciseIdentity(exerciseOrName, fallbackMuscle = "chest") {
  if (exerciseOrName && typeof exerciseOrName === "object") {
    return {
      id: String(exerciseOrName.id || "").trim(),
      name: String(exerciseOrName.name || "").trim(),
      primaryMuscles: exerciseOrName.primaryMuscles || [],
      secondaryMuscles: exerciseOrName.secondaryMuscles || [],
      reps: exerciseOrName.reps || "8-15",
      rest: exerciseOrName.rest || "60-120 sec"
    };
  }
  const meta = resolveExerciseMeta(exerciseOrName, fallbackMuscle);
  return {
    id: String(meta.id || "").trim(),
    name: String(meta.name || exerciseOrName || "").trim(),
    primaryMuscles: meta.primaryMuscles || [],
    secondaryMuscles: meta.secondaryMuscles || [],
    reps: meta.reps || "8-15",
    rest: meta.rest || "60-120 sec"
  };
}

function sameExerciseIdentity(entry, exerciseOrName) {
  const identity = exerciseIdentity(exerciseOrName);
  const entryId = String(entry?.exerciseId || "").trim();
  if (identity.id && entryId && identity.id === entryId) return true;
  const targetName = normalizeName(identity.name || exerciseOrName);
  return !!targetName && normalizeName(entry?.exercise) === targetName;
}

function exerciseHistoryForIdentity(exerciseOrName, workouts = state.workouts, newestFirst = true) {
  const entries = workouts
    .filter((entry) => sameExerciseIdentity(entry, exerciseOrName))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return newestFirst ? entries.reverse() : entries;
}

function exerciseUsageStats(exerciseOrName) {
  const entries = exerciseHistoryForIdentity(exerciseOrName, state.workouts, true);
  return {
    sessionCount: entries.length,
    lastUsedAt: entries[0]?.date || "",
    hasLogs: entries.length > 0
  };
}

function exerciseRemovalMode(exerciseOrName) {
  return exerciseUsageStats(exerciseOrName).hasLogs ? "archive" : "delete";
}

function exerciseCoverageStats() {
  const active = getCustomExercises();
  return muscleGroups.map((muscle) => {
    const exercises = active.filter((exercise) => (exercise.primaryMuscles || []).includes(muscle.id));
    return { ...muscle, exercises, count: exercises.length, missing: exercises.length === 0 };
  });
}

function exerciseMatchesMuscle(exercise, muscleId) {
  if (!muscleId || muscleId === "all") return true;
  return (exercise.primaryMuscles || []).includes(muscleId) || (exercise.secondaryMuscles || []).includes(muscleId);
}

function filteredExerciseList(options = {}) {
  const search = normalizeName(options.search ?? state.exerciseSearch);
  const muscle = options.muscle ?? state.exerciseMuscleFilter ?? "all";
  const sort = options.sort ?? state.exerciseSort ?? "recent";
  let exercises = getCustomExercises({ includeArchived: options.includeArchived === true })
    .filter((exercise) => options.archivedOnly ? !!exercise.archivedAt : !exercise.archivedAt)
    .filter((exercise) => !search || normalizeName(exercise.name).includes(search))
    .filter((exercise) => exerciseMatchesMuscle(exercise, muscle));

  const usageById = new Map(exercises.map((exercise) => [exercise.id, exerciseUsageStats(exercise)]));
  exercises = exercises.sort((a, b) => {
    const aUsage = usageById.get(a.id);
    const bUsage = usageById.get(b.id);
    if (sort === "most") {
      return (bUsage.sessionCount - aUsage.sessionCount) || a.name.localeCompare(b.name);
    }
    if (sort === "muscle") {
      const muscleCompare = muscleLabel(a.primaryMuscles?.[0]).localeCompare(muscleLabel(b.primaryMuscles?.[0]));
      return muscleCompare || a.name.localeCompare(b.name);
    }
    if (sort === "az") return a.name.localeCompare(b.name);
    return String(bUsage.lastUsedAt || "").localeCompare(String(aUsage.lastUsedAt || "")) || a.name.localeCompare(b.name);
  });
  return exercises;
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
      rir: row.rir === null || row.rir === undefined || row.rir === "" ? null : Math.min(RIR_MAX, Math.max(RIR_MIN, parseNum(row.rir))),
      restSeconds: parseRestSeconds(row.restSeconds ?? row.rest ?? row.restTime)
    }));
  }
  const sets = Math.max(1, parseNum(workout.sets));
  return Array.from({ length: sets }, () => ({
    weight: Math.max(0, parseNum(workout.weight)),
    reps: Math.max(1, parseNum(workout.reps)),
    rir: workout.rir === null || workout.rir === undefined || workout.rir === "" ? null : Math.min(RIR_MAX, Math.max(RIR_MIN, parseNum(workout.rir))),
    restSeconds: parseRestSeconds(workout.restSeconds ?? workout.rest ?? workout.restTime)
  }));
}

function normalizeSetRows(rows) {
  const cleaned = (rows || [])
    .map((row) => ({
      weight: Math.max(0, parseNum(row.weight)),
      reps: Math.max(1, parseNum(row.reps)),
      rir: row.rir === "" || row.rir === null || row.rir === undefined ? null : Math.min(RIR_MAX, Math.max(RIR_MIN, parseNum(row.rir))),
      restSeconds: parseRestSeconds(row.restSeconds ?? row.rest ?? row.restTime)
    }))
    .filter((row) => row.reps > 0);
  return cleaned.length ? cleaned : [{ weight: 0, reps: 10, rir: 2, restSeconds: null }];
}

function copiedRowSnapshot(row = {}) {
  const normalized = normalizeSetRows([row])[0];
  return {
    weight: normalized.weight,
    reps: normalized.reps,
    rir: normalized.rir,
    restSeconds: normalized.restSeconds
  };
}

function copiedRowMatches(row = {}, snapshot = {}) {
  const current = copiedRowSnapshot(row);
  return current.weight === Number(snapshot.weight)
    && current.reps === Number(snapshot.reps)
    && current.rir === (snapshot.rir === null || snapshot.rir === undefined ? null : Number(snapshot.rir))
    && current.restSeconds === (snapshot.restSeconds === null || snapshot.restSeconds === undefined ? null : Number(snapshot.restSeconds));
}

function isCoachCopiedRowUnchanged(draft = {}, row = {}, index = 0) {
  if (!Array.isArray(draft.coachCopiedRows) || !draft.coachCopiedRows[index]) return false;
  if ((draft.coachCopiedDirtyRows || []).includes(index)) return false;
  return copiedRowMatches(row, draft.coachCopiedRows[index]);
}

function clearCoachCopiedDraftMarkers(draft = {}) {
  delete draft.coachCopiedRows;
  delete draft.coachCopiedDirtyRows;
}

function markCoachCopiedRowDirty(draftId, index) {
  const draft = state.workoutDraft.find((item) => item.draftId === draftId);
  if (!draft || !Array.isArray(draft.coachCopiedRows)) return;
  const rowIndex = Number(index);
  if (!Number.isFinite(rowIndex)) return;
  draft.coachCopiedDirtyRows = [...new Set([...(draft.coachCopiedDirtyRows || []), rowIndex])];
}

function clampRirValue(value) {
  return Math.min(RIR_MAX, Math.max(RIR_MIN, Math.round(parseNum(value))));
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

function normalizeRepRangeInput(value) {
  const text = String(value || "").trim();
  if (!text) return "8-15";
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(text);
  if (!match) return null;
  const low = Number(match[1]);
  const high = match[2] ? Number(match[2]) : null;
  if (low <= 0 || (high !== null && (high <= 0 || high < low))) return null;
  return high === null ? String(low) : `${low}-${high}`;
}

function parseRestInputPart(value) {
  const text = String(value || "").trim().toLowerCase();
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const simple = /^(\d+)(?:\s*(sec|secs|second|seconds|s|min|mins|minute|minutes|m))?$/.exec(text);
  if (!simple) return null;
  const amount = Number(simple[1]);
  if (amount <= 0) return null;
  const unit = simple[2] || "sec";
  return unit.startsWith("m") && unit !== "ms" ? amount * 60 : amount;
}

function normalizeRestRangeInput(value) {
  const text = String(value || "").trim();
  if (!text) return "60-120 sec";
  const parts = text.split(/\s*-\s*/);
  if (parts.length > 2) return null;
  const first = parseRestInputPart(parts[0]);
  const second = parts.length === 2 ? parseRestInputPart(parts[1]) : null;
  if (!Number.isFinite(first) || first <= 0) return null;
  if (parts.length === 2 && (!Number.isFinite(second) || second < first)) return null;
  return parts.length === 2 ? `${first}-${second} sec` : `${first} sec`;
}

function formDataValue(data, key) {
  if (data?.get) return data.get(key);
  return data?.[key];
}

function formDataValues(data, key) {
  if (data?.getAll) return data.getAll(key);
  const value = data?.[key];
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function exerciseFormValuesFromInput(data = {}) {
  return {
    name: String(formDataValue(data, "name") || "").trim(),
    primaryMuscle: String(formDataValue(data, "primaryMuscle") || "chest"),
    secondaryMuscles: formDataValues(data, "secondaryMuscles").map((value) => String(value)),
    equipment: String(formDataValue(data, "equipment") || "").trim(),
    reps: String(formDataValue(data, "reps") || "").trim(),
    rest: String(formDataValue(data, "rest") || "").trim(),
    cue: String(formDataValue(data, "cue") || "").trim()
  };
}

function validateExerciseFormInput(data = {}, editingId = state.editingExerciseId) {
  const values = exerciseFormValuesFromInput(data);
  const errors = {};
  const validMuscleIds = new Set(muscleGroups.map((muscle) => muscle.id));
  if (!values.name) errors.name = "Exercise name is required.";
  const primaryMuscle = validMuscleIds.has(values.primaryMuscle) ? values.primaryMuscle : "chest";
  const duplicate = getCustomExercises({ includeArchived: true }).find((exercise) => (
    exercise.id !== editingId && normalizeName(exercise.name) === normalizeName(values.name)
  ));
  if (duplicate) errors.name = "That custom exercise already exists.";
  const reps = normalizeRepRangeInput(values.reps);
  if (!reps) errors.reps = "Use a rep target like 10 or 8-15.";
  const rest = normalizeRestRangeInput(values.rest);
  if (!rest) errors.rest = "Use rest like 60 sec, 90-120 sec, or 1:30.";
  const secondaryMuscles = uniqueMuscles(values.secondaryMuscles).filter((muscle) => muscle !== primaryMuscle);

  if (Object.keys(errors).length) return { ok: false, errors, values: { ...values, primaryMuscle } };
  return {
    ok: true,
    errors: {},
    values: { ...values, primaryMuscle },
    exercise: {
      name: values.name,
      primaryMuscles: [primaryMuscle],
      secondaryMuscles,
      equipment: values.equipment || "custom",
      reps,
      rest,
      cue: values.cue || "Custom exercise. Keep form strict and progress gradually."
    }
  };
}

function exerciseHistoryEntries(exerciseName, newestFirst = true) {
  return exerciseHistoryForIdentity(exerciseName, state.workouts, newestFirst);
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

function weeklyWorkouts(workouts = state.workouts) {
  const start = currentTrainingWeekStart();
  return workouts.filter((entry) => parseLocalDate(entry.date) >= start);
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

function metricDraftFromForm(form = document.getElementById("metric-form")) {
  if (!form || typeof FormData === "undefined") return null;
  const data = Object.fromEntries(new FormData(form));
  const date = data.date || state.metricDate || todayISO();
  const hasInput = parseNum(data.bodyWeight) > 0
    || parseNum(data.calories) > 0
    || parseNum(data.protein) > 0
    || String(data.notes || "").trim()
    || nutritionMealsHaveData(nutritionMealsFromData(data));
  return hasInput ? { date, data, updatedAt: new Date().toISOString() } : null;
}

function metricEntryForForm(date = state.metricDate || todayISO()) {
  const saved = metricForDate(date);
  if (state.metricFormDraft?.date === date) {
    return metricEntryFromFormData(state.metricFormDraft.data, saved);
  }
  return saved || { date, bodyWeight: 0, calories: 0, protein: 0, meals: emptyNutritionMeals(), notes: "" };
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

function muscleSetStats(workouts = weeklyWorkouts()) {
  const totals = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, 0]));
  const sessions = Object.fromEntries(muscleGroups.map((muscle) => [muscle.id, new Set()]));
  const highRir = [];
  const unknown = [];

  for (const workout of workouts) {
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

function weeklyMuscleContributionRows(muscleId) {
  return weeklyWorkouts()
    .map((workout) => {
      const factor = muscleCreditFactor(workout, muscleId);
      if (!factor) return null;
      const rows = setRowsFromWorkout(workout).map((row, index) => {
        const hardSet = rowEffortMultiplier(row);
        return {
          ...row,
          index,
          hardSet,
          creditedSets: hardSet * factor
        };
      });
      const meta = workoutMeta(workout);
      const role = (meta.primaryMuscles || []).includes(muscleId) ? "primary" : "secondary";
      const rawSets = rows.reduce((sum, row) => sum + row.hardSet, 0);
      const creditedSets = rows.reduce((sum, row) => sum + row.creditedSets, 0);
      return {
        workout,
        role,
        factor,
        rows,
        rawSets,
        creditedSets,
        volume: workoutVolume(workout),
        avgRir: averageRir(workout)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date) || (a.workout.order || 0) - (b.workout.order || 0));
}

function weeklyMuscleDetailSummary(muscleId) {
  const muscle = muscleGroups.find((item) => item.id === muscleId) || muscleGroups[0];
  const entries = weeklyMuscleContributionRows(muscle.id);
  const primarySets = entries.filter((entry) => entry.role === "primary").reduce((sum, entry) => sum + entry.creditedSets, 0);
  const secondarySets = entries.filter((entry) => entry.role === "secondary").reduce((sum, entry) => sum + entry.creditedSets, 0);
  const totalSets = primarySets + secondarySets;
  return { muscle, entries, primarySets, secondarySets, totalSets };
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

function latestWorkout(workouts = state.workouts) {
  return workoutsNewestFirst(workouts)[0] || null;
}

function draftHasMeaningfulWorkoutInput(draft) {
  if (!draft) return false;
  if (draft.editingWorkoutId) return true;
  if (String(draft.notes || "").trim()) return true;
  if (String(draft.exercise || "") !== defaultLogExerciseName()) return true;
  return normalizeSetRows(draft.setRows).some((row) => (
    row.weight > 0
    || row.reps !== 10
    || (row.rir !== null && row.rir !== 2)
    || (row.restSeconds !== null && row.restSeconds > 0)
  ));
}

function hasMeaningfulStrengthDraft() {
  return Array.isArray(state.workoutDraft) && state.workoutDraft.some(draftHasMeaningfulWorkoutInput);
}

function exerciseFormDraftFromForm(form = document.getElementById("exercise-form")) {
  if (!form || typeof FormData === "undefined") return null;
  const values = exerciseFormValuesFromInput(new FormData(form));
  const hasInput = values.name
    || values.equipment
    || values.reps
    || values.rest
    || values.cue
    || (values.secondaryMuscles || []).length
    || values.primaryMuscle !== "chest";
  return hasInput ? values : null;
}

function draftRecoveryPayload(reason = "draft") {
  return {
    version: APP_VERSION,
    reason,
    savedAt: new Date().toISOString(),
    strength: hasMeaningfulStrengthDraft()
      ? {
          date: state.draftDate,
          selectedExercise: state.selectedExercise,
          draftTargetMuscle: state.draftTargetMuscle,
          workoutDraft: state.workoutDraft
        }
      : null,
    metric: state.metricFormDraft || metricDraftFromForm(),
    exercise: state.exerciseFormDraft || exerciseFormDraftFromForm()
  };
}

function saveDraftRecovery(reason = "draft") {
  const payload = draftRecoveryPayload(reason);
  if (!payload.strength && !payload.metric && !payload.exercise) {
    safeLocalStorageRemove(DRAFT_RECOVERY_KEY);
    return false;
  }
  safeLocalStorageSet(DRAFT_RECOVERY_KEY, JSON.stringify(payload));
  return true;
}

function clearDraftRecovery() {
  safeLocalStorageRemove(DRAFT_RECOVERY_KEY);
}

function savedStrengthDraftRecovery() {
  let recovery = null;
  try {
    recovery = JSON.parse(safeLocalStorageGet(DRAFT_RECOVERY_KEY) || "null");
  } catch {
    recovery = null;
  }
  if (!recovery?.strength?.workoutDraft?.length) return null;
  return recovery.strength;
}

function clearDraftRecoveryScope(scope) {
  let recovery = null;
  try {
    recovery = JSON.parse(safeLocalStorageGet(DRAFT_RECOVERY_KEY) || "null");
  } catch {
    recovery = null;
  }
  if (!recovery || typeof recovery !== "object") return;
  if (scope === "strength") recovery.strength = null;
  if (scope === "metric") recovery.metric = null;
  if (scope === "exercise") recovery.exercise = null;
  if (!recovery.strength && !recovery.metric && !recovery.exercise) {
    clearDraftRecovery();
    return;
  }
  recovery.savedAt = new Date().toISOString();
  safeLocalStorageSet(DRAFT_RECOVERY_KEY, JSON.stringify(recovery));
}

function restoreDraftRecovery(payload = null) {
  let recovery = payload;
  if (!recovery) {
    try {
      recovery = JSON.parse(safeLocalStorageGet(DRAFT_RECOVERY_KEY) || "null");
    } catch {
      recovery = null;
    }
  }
  if (!recovery || typeof recovery !== "object") return false;
  if (recovery.strength?.workoutDraft?.length) {
    state.draftDate = recovery.strength.date || todayISO();
    state.selectedExercise = recovery.strength.selectedExercise || state.selectedExercise;
    state.draftTargetMuscle = recovery.strength.draftTargetMuscle || state.draftTargetMuscle;
    state.workoutDraft = recovery.strength.workoutDraft.map((draft) => ({
      ...draft,
      draftId: draft.draftId || uid(),
      setRows: normalizeSetRows(draft.setRows)
    }));
    syncLegacyDraftFromFirst();
  }
  if (recovery.metric?.data) {
    state.metricFormDraft = recovery.metric;
    state.metricDate = recovery.metric.date || state.metricDate || todayISO();
  }
  if (recovery.exercise) {
    state.exerciseFormDraft = recovery.exercise;
    state.exerciseFormErrors = {};
  }
  return true;
}

function loadMetricDateDraft(date = todayISO()) {
  state.metricDate = date || todayISO();
  state.metricFormDraft = null;
  clearLogDraftNotice();
}

function preserveVisibleDraft(reason = "navigation") {
  const active = state.activeTab;
  if (active === "log" && state.logMode === "strength") readDraftFromForm();
  if (active === "log" && state.logMode === "metrics") state.metricFormDraft = metricDraftFromForm();
  if (active === "exercises") state.exerciseFormDraft = exerciseFormDraftFromForm() || state.exerciseFormDraft;
  saveDraftRecovery(reason);
}

function coachPendingWorkoutEntries() {
  const date = state.draftDate || todayISO();
  const draftDate = parseLocalDate(date);
  const today = parseLocalDate(todayISO());
  if (Number.isNaN(draftDate.getTime()) || draftDate < currentTrainingWeekStart() || draftDate > today) return [];
  const drafts = Array.isArray(state.workoutDraft) ? state.workoutDraft : [];
  return drafts.map((draft, index) => {
    const touched = draftHasMeaningfulWorkoutInput(draft);
    const setRows = normalizeSetRows(draft.setRows).filter((row) => row.reps > 0 && (row.weight > 0 || touched));
    if (!draft.exercise || !setRows.length) return null;
    const meta = resolveExerciseMeta(draft.exercise, draft.targetMuscle);
    const best = setRows.reduce((winner, row) => {
      const score = row.weight * (1 + row.reps / 30);
      return !winner || score > winner.score ? { ...row, score } : winner;
    }, null);
    return {
      id: `pending-${draft.draftId || index}`,
      pendingDraft: true,
      editingWorkoutId: draft.editingWorkoutId || null,
      date,
      exercise: draft.exercise,
      exerciseId: meta.id,
      primaryMuscles: [...meta.primaryMuscles],
      secondaryMuscles: [...meta.secondaryMuscles],
      equipment: meta.equipment,
      setRows,
      sets: setRows.length,
      reps: best?.reps || 1,
      weight: best?.weight || 0,
      rir: averageRir({ setRows }),
      notes: draft.notes || "",
      order: Number.isFinite(Number(draft.order)) ? Number(draft.order) : index,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function coachWorkoutEntries() {
  return state.workouts;
}

function coachWeeklyWorkouts(workouts = coachWorkoutEntries()) {
  return weeklyWorkouts(workouts);
}

function exerciseHistoryForDefinition(exercise, workouts = state.workouts) {
  return exerciseHistoryForIdentity(exercise, workouts, true);
}

function coachExerciseMemory(exercise, workouts = coachWorkoutEntries()) {
  const history = exerciseHistoryForDefinition(exercise, workouts);
  const last = history[0] || null;
  const daysSince = last ? daysBetween(last.date, todayISO()) : null;
  const weeklyUses = weeklyWorkouts(history).length;
  return {
    exercise,
    history,
    last,
    daysSince,
    weeklyUses,
    usedThisWeekTooOften: weeklyUses >= COACH_WEEKLY_EXERCISE_USE_CAP,
    recentlyUsed: daysSince !== null && daysSince < COACH_SAME_EXERCISE_COOLDOWN_DAYS
  };
}

function comparableRepDrop(current, previous) {
  const currentRows = setRowsFromWorkout(current);
  const previousRows = setRowsFromWorkout(previous);
  return currentRows.reduce((drops, row, index) => {
    const prior = previousRows[index];
    if (!prior || row.weight <= 0 || prior.weight <= 0) return drops;
    const similarOrHeavier = row.weight >= prior.weight * 0.98;
    return similarOrHeavier && row.reps < prior.reps ? drops + 1 : drops;
  }, 0);
}

function exerciseProgressEvidence(current, priorHistory = []) {
  const rows = setRowsFromWorkout(current).filter((row) => row.weight > 0 && row.reps > 0);
  const priorRows = priorHistory.flatMap((workout) => setRowsFromWorkout(workout)).filter((row) => row.weight > 0 && row.reps > 0);
  const latestE1rm = e1rm(current);
  const priorBestE1rm = priorHistory.reduce((best, workout) => Math.max(best, e1rm(workout)), 0);
  const latestTopSet = bestSet(current);
  const priorTopSetScore = priorHistory.reduce((best, workout) => Math.max(best, bestSet(workout)?.score || 0), 0);
  const bestRepsByWeight = new Map();
  priorRows.forEach((row) => {
    const key = recordWeightKey(row.weight);
    bestRepsByWeight.set(key, Math.max(bestRepsByWeight.get(key) || 0, row.reps));
  });
  const priorMaxWeight = priorRows.reduce((max, row) => Math.max(max, row.weight), 0);
  const repPrRows = rows.filter((row) => {
    const priorReps = bestRepsByWeight.get(recordWeightKey(row.weight)) || 0;
    return priorReps > 0 && row.reps > priorReps;
  });
  const weightPrRows = rows.filter((row) => row.weight > priorMaxWeight && row.reps >= 8);
  const e1rmImproved = priorBestE1rm > 0 && latestE1rm > priorBestE1rm * 1.01;
  const topSetPr = priorTopSetScore > 0 && latestTopSet && latestTopSet.score > priorTopSetScore * 1.005;
  const reasons = [];
  if (topSetPr) reasons.push("top set PR");
  if (e1rmImproved) reasons.push("estimated 1RM improved");
  if (repPrRows.length) reasons.push("rep PR at matched load");
  if (weightPrRows.length) reasons.push("new 8+ rep load PR");
  return {
    progressed: reasons.length > 0,
    reasons,
    latestE1rm,
    priorBestE1rm,
    topSetPr: Boolean(topSetPr),
    e1rmImproved,
    repPrCount: repPrRows.length,
    weightPrCount: weightPrRows.length
  };
}

function exerciseUnderperformed(current, previous, options = {}) {
  if (!current || !previous) return false;
  const currentE1rm = e1rm(current);
  const previousE1rm = e1rm(previous);
  const e1rmDrop = previousE1rm > 0 && currentE1rm < previousE1rm * (1 - COACH_PERFORMANCE_DROP_THRESHOLD);
  const repDrops = comparableRepDrop(current, previous);
  const failureRir = (averageRir(current) ?? HYPERTROPHY.idealRirMin) <= 0;
  if (options.progressEvidence?.progressed) {
    return failureRir && repDrops >= 3 && e1rmDrop;
  }
  return e1rmDrop || repDrops >= 2 || (failureRir && (e1rmDrop || repDrops > 0 || currentE1rm <= previousE1rm));
}

function coachExercisePerformanceSignal(exercise, workouts = coachWorkoutEntries()) {
  const history = exerciseHistoryForDefinition(exercise, workouts);
  if (history.length < 2) {
    return {
      status: "neutral",
      tone: "",
      history,
      latest: history[0] || null,
      previous: null,
      message: ""
    };
  }
  const latest = history[0];
  const previous = history[1];
  const latestProgress = exerciseProgressEvidence(latest, history.slice(1));
  if (latestProgress.progressed) {
    return {
      status: "progressing",
      tone: "good",
      history,
      latest,
      previous,
      progressEvidence: latestProgress,
      message: `${exercise.name} progressed last session (${latestProgress.reasons.join(", ")}); keep recovery-managed volume and use the next small overload target.`
    };
  }
  const latestUnder = exerciseUnderperformed(latest, previous, { progressEvidence: latestProgress });
  const previousProgress = history.length >= 3 ? exerciseProgressEvidence(previous, history.slice(2)) : null;
  const previousUnder = history.length >= 3 && exerciseUnderperformed(previous, history[2], { progressEvidence: previousProgress });
  if (latestUnder && previousUnder) {
    return {
      status: "repeated-failure",
      tone: "warn",
      history,
      latest,
      previous,
      progressEvidence: latestProgress,
      message: `${exercise.name} has stalled across recent sessions; rotate or deload before adding more volume.`
    };
  }
  if (latestUnder) {
    return {
      status: "isolated-failure",
      tone: "warn",
      history,
      latest,
      previous,
      progressEvidence: latestProgress,
      message: `${exercise.name} dipped last session; use a small load reduction and keep 1-2 RIR.`
    };
  }
  const latestE1rm = e1rm(latest);
  const previousE1rm = e1rm(previous);
  if (latestE1rm > previousE1rm * 1.01) {
    return {
      status: "progressing",
      tone: "good",
      history,
      latest,
      previous,
      progressEvidence: latestProgress,
      message: `${exercise.name} is progressing; use the next small overload target.`
    };
  }
  return {
    status: "steady",
    tone: "",
    history,
    latest,
    previous,
    progressEvidence: latestProgress,
    message: `${exercise.name} is steady; progress with a small rep or load target.`
  };
}

function roundLoadTarget(weight) {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const step = weight >= 50 ? 5 : 2.5;
  return Math.max(step, Math.round(weight / step) * step);
}

function coachPlanTargetForExercise(exercise, signal = coachExercisePerformanceSignal(exercise)) {
  const latest = signal.latest || exerciseHistoryForDefinition(exercise)[0];
  const top = latest ? bestSet(latest) : null;
  const range = parseRepRange(exercise.reps);
  if (!top) {
    return {
      kind: "baseline",
      label: `Target ${exercise.reps} reps`,
      detail: `${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR`,
      tone: "",
      message: ""
    };
  }
  if (signal.status === "repeated-failure") {
    const targetWeight = roundLoadTarget(top.weight * 0.9);
    return {
      kind: "deload",
      label: `Deload target ${fmt(targetWeight, 1)} lb`,
      detail: `Rebuild at ${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR before pushing load again.`,
      tone: "warn",
      loadMultiplier: 0.9,
      repOffset: 0,
      message: signal.message
    };
  }
  if (signal.status === "isolated-failure") {
    const targetWeight = roundLoadTarget(top.weight * 0.95);
    return {
      kind: "reset",
      label: `Reset target ${fmt(targetWeight, 1)} lb`,
      detail: `Keep reps controlled and stop around 1-2 RIR.`,
      tone: "warn",
      loadMultiplier: 0.95,
      repOffset: 0,
      message: signal.message
    };
  }
  const progression = progressionTargetForExercise(exercise.name);
  if (progression) {
    return {
      kind: "progression",
      label: `Target ${progression.target}`,
      detail: `${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR`,
      tone: progression.indicator.tone,
      loadMultiplier: 1,
      repOffset: top.reps < range.high ? 1 : 0,
      message: signal.message
    };
  }
  return {
    kind: "baseline",
    label: `Target ${exercise.reps} reps`,
    detail: `${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR`,
    tone: "",
    message: signal.message
  };
}

function logLoadDirectionForExercise(exercise, options = {}) {
  const workouts = options.excludeId
    ? state.workouts.filter((entry) => entry.id !== options.excludeId)
    : state.workouts;
  const signal = coachExercisePerformanceSignal(exercise, workouts);
  if (signal.status === "progressing") {
    return {
      direction: "up",
      symbol: "\u2191",
      label: "Coach recommends raising workload",
      message: signal.message || `${exercise.name} progressed last session; use the next small overload target.`
    };
  }
  if (signal.status === "isolated-failure" || signal.status === "repeated-failure") {
    return {
      direction: "down",
      symbol: "\u2193",
      label: "Coach recommends lowering workload",
      message: signal.message || `${exercise.name} dipped last session; reduce load and rebuild with controlled reps.`
    };
  }
  return {
    direction: "neutral",
    symbol: "",
    label: "Coach recommends holding workload",
    message: signal.message || ""
  };
}

function logLoadDirectionIndicator(exercise, draft = {}) {
  const direction = logLoadDirectionForExercise(exercise, { excludeId: draft.editingWorkoutId });
  if (direction.direction === "neutral") return "";
  return `
    <button class="load-direction-indicator ${direction.direction}" type="button" data-action="show-load-direction" data-message="${escapeHtml(direction.message)}" aria-label="${escapeHtml(direction.label)}" title="${escapeHtml(direction.message || direction.label)}">
      ${escapeHtml(direction.symbol)}
    </button>
  `;
}

function isMuscleAvailableForPlanning(target) {
  return target.primaryDaysSince === null || target.primaryDaysSince >= COACH_MUSCLE_RECOVERY_DAYS;
}

function muscleDateGapReason(target) {
  const when = target.primaryDaysSince === 0 ? "today" : "yesterday";
  return `${target.label} was directly trained ${when}; Coach uses a 2-day gap by date before direct work returns.`;
}

function coachTargetSelectionWarning(muscleId, context = coachPlanningContext()) {
  const target = context.rankedStats.find((stat) => stat.id === muscleId);
  if (!target || isMuscleAvailableForPlanning(target)) return "";
  const when = target.primaryDaysSince === 0 ? "today" : "yesterday";
  return `${target.label} was directly trained ${when}. Coach will protect recovery and skip direct ${target.label} work today.`;
}

function scoreExerciseForMuscle(exercise, muscleId, options = {}) {
  const workouts = options.workouts || coachWorkoutEntries();
  const memory = coachExerciseMemory(exercise, workouts);
  const history = memory.history;
  const last = history[0] || null;
  const daysSince = memory.daysSince;
  const usageScore = Math.min(12, history.length * 2);
  const recencyPenalty = daysSince === null ? 0 : Math.max(0, 12 - daysSince);
  const weeklyUsePenalty = Math.max(0, memory.weeklyUses - 1) * 9;
  const customScore = exercise.userCreated ? 3 : 0;
  const selectedScore = exercise.name === state.selectedExercise ? 1 : 0;
  const specificityScore = (exercise.primaryMuscles || []).length === 1 ? 1 : 0;
  const targetIndex = (exercise.primaryMuscles || []).indexOf(muscleId);
  const targetScore = targetIndex === 0 ? 1 : 0;
  const effortScore = last ? Math.max(0, 4 - (averageRir(last) ?? 2)) : 0;
  const signal = coachExercisePerformanceSignal(exercise, workouts);
  const performancePenalty = signal.status === "repeated-failure" ? 12 : signal.status === "isolated-failure" ? 5 : 0;
  let progressionScore = 0;
  if (history.length >= 2) {
    const recent3 = history.slice(0, 3);
    const prior3 = history.slice(3, 6);
    const recentE1rm = recent3.reduce((sum, w) => sum + e1rm(w), 0) / recent3.length;
    const priorE1rm = prior3.length ? prior3.reduce((sum, w) => sum + e1rm(w), 0) / prior3.length : recentE1rm;
    if (recentE1rm > priorE1rm) progressionScore = 3;
    else if (recentE1rm === priorE1rm && prior3.length) progressionScore = 1;
  }
  return usageScore + customScore + selectedScore + specificityScore + targetScore + effortScore + progressionScore - recencyPenalty - weeklyUsePenalty - performancePenalty;
}

function chooseExerciseForMuscle(muscleId, usedExerciseIds = new Set(), options = {}) {
  const workouts = options.workouts || coachWorkoutEntries();
  const candidates = exerciseDatabase()
    .filter((exercise) => exercise.primaryMuscles.includes(muscleId) && !usedExerciseIds.has(exercise.id));
  if (!candidates.length) return null;
  const scored = candidates
    .map((exercise) => {
      const memory = coachExerciseMemory(exercise, workouts);
      const signal = coachExercisePerformanceSignal(exercise, workouts);
      return {
        exercise,
        memory,
        signal,
        score: scoreExerciseForMuscle(exercise, muscleId, { workouts })
      };
    })
    .sort((a, b) => b.score - a.score);
  const alternatives = scored.filter((item) => {
    const repeatedFailure = item.signal.status === "repeated-failure" && item.memory.daysSince !== null && item.memory.daysSince < COACH_FAILURE_ROTATION_DAYS;
    const tooRecent = item.memory.recentlyUsed;
    const overWeeklyCap = item.memory.usedThisWeekTooOften;
    return !repeatedFailure && !tooRecent && !overWeeklyCap;
  });
  return (alternatives[0] || scored[0]).exercise;
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

function exercisePlanType(exercise = {}) {
  const primaryCount = (exercise.primaryMuscles || []).length;
  const secondaryCount = (exercise.secondaryMuscles || []).length;
  return primaryCount > 1 || secondaryCount > 0 ? "compound" : "isolation";
}

function coachItemPrimaryMuscle(item = {}) {
  return item.muscle?.id || item.exercise?.primaryMuscles?.[0] || "";
}

function orderCoachSessionItems(items = []) {
  const remaining = items.map((item, index) => ({ item, index }));
  const ordered = [];

  while (remaining.length) {
    const lastMuscle = coachItemPrimaryMuscle(ordered[ordered.length - 1]);
    const canGap = remaining.some(({ item }) => coachItemPrimaryMuscle(item) !== lastMuscle);
    const muscleCounts = remaining.reduce((counts, { item }) => {
      const muscle = coachItemPrimaryMuscle(item);
      counts.set(muscle, (counts.get(muscle) || 0) + 1);
      return counts;
    }, new Map());

    const [next] = remaining
      .map((entry) => {
        const muscle = coachItemPrimaryMuscle(entry.item);
        const targetPenalty = isCoachTargetMuscle(muscle) ? 0 : 20;
        const sameMusclePenalty = canGap && muscle === lastMuscle ? 100 : 0;
        const spacingPriority = muscleCounts.get(muscle) > 1 && ordered.length ? -2 : 0;
        const typeRank = exercisePlanType(entry.item.exercise) === "compound" ? 0 : 1;
        return { ...entry, rank: targetPenalty + sameMusclePenalty + spacingPriority + typeRank };
      })
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    ordered.push(next.item);
    remaining.splice(remaining.findIndex((entry) => entry.index === next.index), 1);
  }

  return ordered;
}

function averageRestSecondsForExercise(exercise) {
  const values = exerciseHistoryForDefinition(exercise)
    .map(averageRestSeconds)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestWorkoutForMuscle(muscleId, mode = "any", workouts = state.workouts) {
  if (!Array.isArray(workouts)) workouts = state.workouts;
  return workoutsNewestFirst(workouts).find((workout) => {
    const meta = workoutMeta(workout);
    const primary = (meta.primaryMuscles || []).includes(muscleId);
    const secondary = (meta.secondaryMuscles || []).includes(muscleId);
    if (mode === "primary") return primary;
    if (mode === "secondary") return secondary && !primary;
    return primary || secondary;
  }) || null;
}

function muscleReadiness(stat, workouts = state.workouts) {
  if (!Array.isArray(workouts)) workouts = state.workouts;
  const lastPrimaryWorkout = latestWorkoutForMuscle(stat.id, "primary", workouts);
  const lastSecondaryWorkout = latestWorkoutForMuscle(stat.id, "secondary", workouts);
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
  if (primaryDaysSince !== null && primaryDaysSince < COACH_MUSCLE_RECOVERY_DAYS) {
    readiness = "recent";
    reason = `Directly trained ${primaryDaysSince === 0 ? "today" : "yesterday"}; direct work returns after a 2-day date gap.`;
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
  const aPrimaryRecent = a.primaryDaysSince !== null && a.primaryDaysSince < COACH_MUSCLE_RECOVERY_DAYS;
  const bPrimaryRecent = b.primaryDaysSince !== null && b.primaryDaysSince < COACH_MUSCLE_RECOVERY_DAYS;
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

function coachPlanningContext(workouts = coachWorkoutEntries()) {
  const weekly = coachWeeklyWorkouts(workouts);
  const rankedStats = muscleSetStats(weekly)
    .map((stat) => muscleReadiness(stat, workouts))
    .sort(coachMusclePrioritySort);
  return { workouts, weekly, rankedStats };
}

function rankedCoachMuscles(context = coachPlanningContext()) {
  return context.rankedStats;
}

function coachMuscleSetStats() {
  const workouts = coachWorkoutEntries();
  return muscleSetStats(coachWeeklyWorkouts(workouts));
}

function optimumSetGap(stat) {
  return Math.max(0, HYPERTROPHY.growthHigh - stat.sets);
}

function plannedOptimumGap(item) {
  return Math.max(0, HYPERTROPHY.growthHigh - (item.muscle.sets + item.sets));
}

function planSetCeilingForTarget(target, allowHighVolume = false, growthMode = coachGrowthModeForMuscle(target.id)) {
  const option = coachGrowthModeOption(growthMode);
  if (target.sets < HYPERTROPHY.minimumSets && option.id === "soft") return HYPERTROPHY.minimumSets;
  return allowHighVolume && option.allowHighVolume ? HYPERTROPHY.highVolumeFillMax : option.targetSets;
}

function planSetGap(target, allowHighVolume = false, growthMode = coachGrowthModeForMuscle(target.id)) {
  return Math.max(0, Math.ceil(planSetCeilingForTarget(target, allowHighVolume, growthMode) - target.sets));
}

function plannedSetGap(item, allowHighVolume = false, growthMode = item.growthMode) {
  return Math.max(0, Math.ceil(planSetCeilingForTarget(item.muscle, allowHighVolume, growthMode) - (item.muscle.sets + item.sets)));
}

function planPriorityReason(item) {
  if (item.phase === "target-extra") {
    const modeLabel = item.growthMode ? `${coachGrowthModeLabel(item.growthMode)} target: ` : "";
    const touchLabel = item.muscle.sessions >= 2
      ? "Touches satisfied; adding selected target volume because recovery is clear"
      : `${item.muscle.sessions}/2 touches`;
    const parts = [
      `${modeLabel}${item.muscle.label} is ${fmt(item.muscle.sets, 1)}/${HYPERTROPHY.growthHigh}+; adding selected extra volume`,
      touchLabel
    ];
    if (item.muscle.daysSince !== null) parts.push(`last hit ${item.muscle.daysSince}d ago`);
    return parts.join(" - ");
  }
  const highVolume = item.phase === "high-volume";
  const targetSets = planSetCeilingForTarget(item.muscle, highVolume, item.growthMode);
  const modeLabel = item.growthMode ? `${coachGrowthModeLabel(item.growthMode)} mode: ` : "";
  const targetLabel = item.muscle.sets < HYPERTROPHY.minimumSets ? "weekly floor" : "upper growth target";
  const prefix = highVolume && isCoachTargetMuscle(item.muscle.id)
    ? "Target selected; above default growth zone: "
    : highVolume ? "High-volume filler: " : modeLabel;
  const touchLabel = isCoachTargetMuscle(item.muscle.id) && item.muscle.sessions >= 2
    ? "Touches satisfied; adding selected target volume because recovery is clear"
    : `${item.muscle.sessions}/2 touches`;
  const parts = [
    `${prefix}${item.muscle.label} is ${fmt(item.muscle.sets, 1)}/${targetSets} ${targetLabel}`,
    touchLabel
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

function selectedCoachGlobalGrowthMode() {
  const raw = state.coachGlobalGrowthMode;
  return COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === raw) ? raw : "medium";
}

function coachGrowthModeForMuscle(muscleId, globalMode = selectedCoachGlobalGrowthMode()) {
  const raw = state.coachGrowthModes && typeof state.coachGrowthModes === "object" ? state.coachGrowthModes[muscleId] : "";
  return COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === raw) ? raw : globalMode;
}

function coachGrowthModeOption(mode) {
  return COACH_GROWTH_MODE_OPTIONS.find((option) => option.id === mode) || COACH_GROWTH_MODE_OPTIONS[0];
}

function coachGrowthModeLabel(mode) {
  return coachGrowthModeOption(mode).label;
}

function coachGrowthModeRank(mode) {
  return coachGrowthModeOption(mode).rank || 0;
}

function selectedCoachGrowthModes(targetMuscles = selectedCoachTargetMuscles()) {
  const modes = state.coachGrowthModes && typeof state.coachGrowthModes === "object" ? state.coachGrowthModes : {};
  return Object.fromEntries(targetMuscles
    .filter((muscleId) => COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === modes[muscleId]))
    .map((muscleId) => [muscleId, modes[muscleId]]));
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

function coachModePlanningBehavior(growthMode, caps, isTarget = false) {
  const option = coachGrowthModeOption(growthMode);
  const mode = option.id;
  const maxSets = mode === "soft"
    ? Math.max(caps.minSets, caps.maxSets - 2)
    : mode === "aggressive"
      ? caps.maxSets + (isTarget ? 3 : 2)
      : caps.maxSets;
  return {
    ...option,
    maxSets,
    startSets: Math.max(caps.minSets, option.startSets || caps.minSets),
    fillRank: option.rank || 0
  };
}

function maxSetsForMode(caps, growthMode, isTarget = false) {
  const mode = coachModePlanningBehavior(growthMode, caps, isTarget);
  return mode.maxSets;
}

function modeAdjustedGrowthMode(item, floorGrowthMode = "") {
  return floorGrowthMode && item.growthMode === "aggressive" ? floorGrowthMode : item.growthMode;
}

function totalPlanSets(plan) {
  return (plan?.items || []).reduce((sum, item) => sum + (Number(item.sets) || 0), 0);
}

function planItemsReducedFromBaseline(plan, baselinePlan) {
  const baselineByMuscle = new Map((baselinePlan?.items || []).map((item) => [item.muscle.id, item]));
  return (plan?.items || []).filter((item) => {
    const baseline = baselineByMuscle.get(item.muscle.id);
    return baseline && item.sets < baseline.sets;
  });
}

function aggressivePlanLimitingReason(plan, baselinePlan) {
  if (!plan || !baselinePlan) return "";
  const lowerItems = planItemsReducedFromBaseline(plan, baselinePlan);
  if (totalPlanSets(plan) > totalPlanSets(baselinePlan) && !lowerItems.length) return "";
  if (plan.totalMinutes >= plan.hardLimitMinutes || baselinePlan.totalMinutes >= baselinePlan.hardLimitMinutes) {
    return "Aggressive held at Medium-level volume because the selected timeframe is already filled.";
  }
  if (plan.performanceNotes?.length) {
    return "Aggressive held at Medium-level volume because performance or deload safeguards are active.";
  }
  if (plan.missing?.length) {
    return "Aggressive held at Medium-level volume because library-safe coverage is missing.";
  }
  if (plan.deprioritized?.length || baselinePlan.deprioritized?.length) {
    return "Aggressive held at Medium-level volume because remaining useful muscles are inside the 2-day recovery gap.";
  }
  const atCeiling = (plan.items || []).length && plan.items.every((item) => plannedSetGap(item, item.phase === "high-volume") <= 0);
  if (atCeiling) {
    return "Aggressive held at Medium-level volume because planned muscles are already near the upper growth zone.";
  }
  return "Aggressive held at Medium-level volume because current guardrails leave no recoverable extra volume.";
}

function initialSetsForPlanTarget(target, caps, allowHighVolume = false, growthMode = coachGrowthModeForMuscle(target.id)) {
  const gap = planSetGap(target, allowHighVolume, growthMode);
  if (!gap) return 0;
  const behavior = coachModePlanningBehavior(growthMode, caps);
  return Math.max(1, Math.min(behavior.maxSets, gap, behavior.startSets));
}

function maxSetsForPlanTarget(target, caps, fillToTime = false, allowHighVolume = false, growthMode = coachGrowthModeForMuscle(target.id), isTarget = false) {
  const targetGap = planSetGap(target, allowHighVolume, growthMode);
  const modeMaxSets = maxSetsForMode(caps, growthMode, isTarget);
  if (!targetGap) return 0;
  if (fillToTime) return Math.max(1, Math.min(modeMaxSets, targetGap));
  return Math.max(1, Math.min(modeMaxSets, Math.max(1, Math.ceil(target.deficit))));
}

function targetReserveSetCount(target, growthMode, limitMinutes = selectedCoachTimeframeMinutes()) {
  const mode = coachGrowthModeOption(growthMode).id;
  const base = mode === "soft" ? 2 : mode === "aggressive" ? 4 : 3;
  const timed = limitMinutes <= 40 ? Math.min(base, 2) : limitMinutes >= 75 && mode === "aggressive" ? 5 : base;
  const highVolumeRoom = Math.max(0, Math.floor(HYPERTROPHY.highVolumeFillMax - target.sets));
  return Math.min(timed, highVolumeRoom);
}

function mediumComparisonGrowthModes(growthModes = {}) {
  return Object.fromEntries(Object.entries(growthModes).map(([muscleId, mode]) => [
    muscleId,
    mode === "aggressive" ? "medium" : mode
  ]));
}

function lowerCoachGrowthMode(mode) {
  const rank = coachGrowthModeRank(mode);
  const lower = COACH_GROWTH_MODE_OPTIONS
    .filter((option) => option.rank < rank)
    .sort((a, b) => b.rank - a.rank)[0];
  return lower?.id || "";
}

function targetModeContractSetFloors(limitMinutes = SESSION_LIMIT_MINUTES, options = {}) {
  const targetMuscles = Array.isArray(options.targetMuscles) ? options.targetMuscles : selectedCoachTargetMuscles();
  if (!targetMuscles.length) return {};
  const growthModes = options.growthModes && typeof options.growthModes === "object" ? options.growthModes : selectedCoachGrowthModes(targetMuscles);
  const globalGrowthMode = COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === options.globalGrowthMode)
    ? options.globalGrowthMode
    : selectedCoachGlobalGrowthMode();
  const floors = {};

  for (const muscleId of targetMuscles) {
    let mode = lowerCoachGrowthMode(growthModes[muscleId] || globalGrowthMode);
    while (mode) {
      const baselinePlan = buildSessionPlan(limitMinutes, {
        restart: options.restart || false,
        targetMuscles,
        globalGrowthMode,
        growthModes: { ...growthModes, [muscleId]: mode },
        context: options.context,
        skipTargetModeContracts: true
      });
      const baselineItem = baselinePlan.items.find((item) => item.muscle.id === muscleId);
      if (baselineItem?.sets) floors[muscleId] = Math.max(floors[muscleId] || 0, baselineItem.sets);
      mode = lowerCoachGrowthMode(mode);
    }
  }

  return floors;
}

function sessionShortfallReason({ totalMinutes, cappedLimit, targetFloor, allStats, items, missing }) {
  if (totalMinutes >= targetFloor) return "";
  const base = `Estimated ${totalMinutes}/${cappedLimit} min`;
  const plannedIds = new Set(items.map((item) => item.muscle.id));
  const libraryBlocked = allStats.some((target) => (
    planSetGap(target, false) > 0
    && !plannedIds.has(target.id)
    && !hasPrimaryExerciseForMuscle(target.id)
  ));
  if (missing?.length || libraryBlocked) {
    return `${base} because library-safe coverage is missing or no library-safe remaining work fits.`;
  }
  const recoveryBlocked = allStats.some((target) => (
    planSetGap(target, false) > 0
    && !plannedIds.has(target.id)
    && hasPrimaryExerciseForMuscle(target.id)
    && !isMuscleAvailableForPlanning(target)
  ));
  if (recoveryBlocked) {
    return `${base} because remaining useful muscles are inside the 2-day recovery gap.`;
  }
  return `${base} because remaining muscles are at the volume limits.`;
}

function buildSessionPlan(limitMinutes = SESSION_LIMIT_MINUTES, options = {}) {
  const restart = options.restart || false;
  const targetMuscles = Array.isArray(options.targetMuscles) ? options.targetMuscles : selectedCoachTargetMuscles();
  const growthModes = options.growthModes && typeof options.growthModes === "object" ? options.growthModes : selectedCoachGrowthModes(targetMuscles);
  const globalGrowthMode = COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === options.globalGrowthMode)
    ? options.globalGrowthMode
    : selectedCoachGlobalGrowthMode();
  const cappedLimit = Math.min(75, Math.max(30, Number(limitMinutes) || SESSION_LIMIT_MINUTES));
  const targetFloor = Math.max(0, cappedLimit - COACH_TIME_TOLERANCE_MINUTES);
  const hardLimit = cappedLimit + COACH_TIME_TOLERANCE_MINUTES;
  const caps = sessionPlanCaps(cappedLimit, restart);
  const muscleCap = Math.max(COACH_DAILY_MUSCLE_CAP, caps.maxItems);
  const planningContext = options.context || coachPlanningContext();
  const coachWorkouts = planningContext.workouts;
  const allStats = planningContext.rankedStats;
  const stats = allStats.filter((stat) => stat.sets < HYPERTROPHY.minimumSets);
  const growthModeFor = (muscleId) => growthModes[muscleId] || globalGrowthMode;
  const isAggressiveTarget = (target) => growthModeFor(target.id) === "aggressive";
  const allowsHighVolumeTarget = (target) => isAggressiveTarget(target) && target.readiness !== "high";
  const optimumCandidates = allStats.filter((stat) => planSetGap(stat, false, growthModeFor(stat.id)) > 0);
  const items = [];
  const missing = [];
  const missingIds = new Set();
  const performanceNotes = [];
  const contractNotes = [];
  const performanceNoteKeys = new Set();
  let totalMinutes = 0;
  const usedExercises = new Set();

  const addPerformanceNote = (signal) => {
    if (!signal?.message || !["isolated-failure", "repeated-failure"].includes(signal.status)) return;
    if (performanceNoteKeys.has(signal.message)) return;
    performanceNoteKeys.add(signal.message);
    performanceNotes.push(signal.message);
  };

  const addTargetToPlan = (target, addOptions = {}) => {
    const trackMissing = addOptions.trackMissing !== false;
    const growthMode = addOptions.growthMode || growthModeFor(target.id);
    const allowHighVolume = addOptions.allowHighVolume === true && coachGrowthModeOption(growthMode).allowHighVolume;
    const phase = addOptions.phase || (target.sets < HYPERTROPHY.minimumSets ? "floor" : "optimum");
    if (!items.some((item) => item.muscle.id === target.id) && new Set(items.map((item) => item.muscle.id)).size >= muscleCap) {
      return false;
    }
    const candidateSignals = exerciseDatabase()
      .filter((exercise) => exercise.primaryMuscles.includes(target.id) && !usedExercises.has(exercise.id))
      .map((exercise) => ({ exercise, signal: coachExercisePerformanceSignal(exercise, coachWorkouts) }));
    const exercise = chooseExerciseForMuscle(target.id, usedExercises, { workouts: coachWorkouts });
    if (!exercise) {
      if (trackMissing && !missingIds.has(target.id)) {
        missing.push(target);
        missingIds.add(target.id);
      }
      return false;
    }
    candidateSignals
      .filter((candidate) => candidate.exercise.id !== exercise.id)
      .forEach((candidate) => addPerformanceNote(candidate.signal));
    const performanceSignal = coachExercisePerformanceSignal(exercise, coachWorkouts);
    const planTarget = coachPlanTargetForExercise(exercise, performanceSignal);
    addPerformanceNote(performanceSignal);
    let sets = Number.isFinite(addOptions.setCount)
      ? Math.max(1, addOptions.setCount)
      : initialSetsForPlanTarget(target, caps, allowHighVolume, growthMode);
    if (Number.isFinite(addOptions.setCap)) sets = Math.min(sets, Math.max(1, addOptions.setCap));
    if (planTarget.kind === "deload") sets = Math.max(1, sets - 1);
    if (!sets) return false;
    let minutes = estimateExerciseMinutes(exercise, sets);
    while (sets > 1 && totalMinutes + minutes > hardLimit) {
      sets -= 1;
      minutes = estimateExerciseMinutes(exercise, sets);
    }
    if (totalMinutes + minutes > hardLimit) return false;
    items.push({ muscle: target, exercise, sets, minutes, reason: "", phase, planTarget, performanceSignal, growthMode });
    usedExercises.add(exercise.id);
    totalMinutes += minutes;
    return true;
  };

  const freshTargets = balancedCoverageTargets(stats.filter(isMuscleAvailableForPlanning));

  for (const target of freshTargets) {
    if (items.some((item) => item.muscle.id === target.id)) continue;
    addTargetToPlan(target);
    if (items.length >= caps.maxItems) break;
  }

  if (!restart && targetMuscles.length) {
    const targetSupplemental = allStats.filter((target) => (
      isCoachTargetMuscle(target.id, targetMuscles)
      && planSetGap(target, false, growthModeFor(target.id)) > 0
      && target.sets < HYPERTROPHY.growthHigh
      && !items.some((item) => item.muscle.id === target.id)
      && isMuscleAvailableForPlanning(target)
    )).sort((a, b) => (
      (planSetGap(b, false, growthModeFor(b.id)) - planSetGap(a, false, growthModeFor(a.id)))
      || (coachGrowthModeRank(growthModeFor(b.id)) - coachGrowthModeRank(growthModeFor(a.id)))
      || coachMusclePrioritySort(a, b)
    ));

    for (const target of targetSupplemental) {
      if (items.length >= caps.maxItems) break;
      addTargetToPlan(target, { phase: "optimum", trackMissing: stats.length === 0, growthMode: growthModeFor(target.id) });
    }

    const targetReserve = allStats.filter((target) => (
      isCoachTargetMuscle(target.id, targetMuscles)
      && !items.some((item) => item.muscle.id === target.id)
      && isMuscleAvailableForPlanning(target)
      && target.sets < HYPERTROPHY.highVolumeFillMax
    )).sort((a, b) => (
      (coachGrowthModeRank(growthModeFor(b.id)) - coachGrowthModeRank(growthModeFor(a.id)))
      || (a.sets - b.sets)
      || coachMusclePrioritySort(a, b)
    ));

    for (const target of targetReserve) {
      if (items.length >= caps.maxItems) break;
      const growthMode = growthModeFor(target.id);
      const setCount = targetReserveSetCount(target, growthMode, cappedLimit);
      if (!setCount) continue;
      addTargetToPlan(target, {
        phase: "target-extra",
        trackMissing: stats.length === 0,
        growthMode,
        allowHighVolume: true,
        setCount
      });
    }

    let targetFillChanged = true;
    while (targetFillChanged) {
      targetFillChanged = false;
      const eligibleTargetItems = items
        .filter((item) => isCoachTargetMuscle(item.muscle.id, targetMuscles))
        .map((item) => {
          const allowHighVolume = coachGrowthModeOption(item.growthMode).allowHighVolume;
          const maxSets = maxSetsForPlanTarget(item.muscle, caps, true, allowHighVolume, item.growthMode, true);
          return { item, allowHighVolume, maxSets };
        })
        .filter(({ item, maxSets }) => item.sets < maxSets)
        .sort((a, b) => (
          (coachGrowthModeRank(b.item.growthMode) - coachGrowthModeRank(a.item.growthMode))
          || (plannedSetGap(b.item, b.allowHighVolume, b.item.growthMode) - plannedSetGap(a.item, a.allowHighVolume, a.item.growthMode))
          || (a.item.sets - b.item.sets)
        ));

      for (const { item, allowHighVolume } of eligibleTargetItems) {
        const nextMinutes = plannedExerciseMinutes(item, item.sets + 1);
        const extraMinutes = nextMinutes - item.minutes;
        if (totalMinutes + extraMinutes > hardLimit) continue;
        item.sets += 1;
        item.minutes = nextMinutes;
        if (allowHighVolume && item.muscle.sets + item.sets > HYPERTROPHY.growthHigh) item.phase = "high-volume";
        totalMinutes += extraMinutes;
        targetFillChanged = true;
        break;
      }
    }
  }

  if (!restart && (optimumCandidates.length || targetMuscles.length)) {
    const supplementalTargets = allStats.filter((target) => (
      planSetGap(target, false, growthModeFor(target.id)) > 0
      && target.sets < HYPERTROPHY.growthHigh
      && !isCoachTargetMuscle(target.id, targetMuscles)
      && !items.some((item) => item.muscle.id === target.id)
      && isMuscleAvailableForPlanning(target)
    )).sort((a, b) => (
      (optimumSetGap(b) - optimumSetGap(a)) || coachMusclePrioritySort(a, b)
    ));
    const freshSupplemental = balancedCoverageTargets(supplementalTargets);

    for (const target of freshSupplemental) {
      if (totalMinutes >= targetFloor || items.length >= caps.maxItems) break;
      addTargetToPlan(target, { phase: "optimum", trackMissing: stats.length === 0, growthMode: growthModeFor(target.id) });
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
    const floorGrowthMode = fillOptions.floorGrowthMode || "";
    let changed = true;
    while (changed) {
      changed = false;
      const eligible = items
        .map((item) => {
          const effectiveGrowthMode = modeAdjustedGrowthMode(item, floorGrowthMode);
          const maxSets = maxSetsForPlanTarget(
            item.muscle,
            caps,
            allowHighVolume || (!restart && (optimumCandidates.length > 0 || targetMuscles.length > 0)),
            allowHighVolume,
            effectiveGrowthMode,
            isCoachTargetMuscle(item.muscle.id, targetMuscles)
          );
          return { item, effectiveGrowthMode, maxSets };
        })
        .filter(({ item, maxSets }) => item.sets < maxSets)
        .sort((a, b) => (
          Number(isCoachTargetMuscle(b.item.muscle.id, targetMuscles)) - Number(isCoachTargetMuscle(a.item.muscle.id, targetMuscles))
        ) || (coachGrowthModeRank(b.item.growthMode) - coachGrowthModeRank(a.item.growthMode)) || (plannedSetGap(b.item, allowHighVolume, b.effectiveGrowthMode) - plannedSetGap(a.item, allowHighVolume, a.effectiveGrowthMode)) || (plannedOptimumGap(b.item) - plannedOptimumGap(a.item)) || (b.item.muscle.deficit - a.item.muscle.deficit) || (a.item.sets - b.item.sets) || (plannedExerciseMinutes(a.item, a.item.sets + 1) - plannedExerciseMinutes(b.item, b.item.sets + 1)));
      for (const { item } of eligible) {
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

  const freeNonTargetMinutesForTarget = (neededMinutes, protectedMuscleId) => {
    while (totalMinutes + neededMinutes > hardLimit) {
      const candidate = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => (
          item.muscle.id !== protectedMuscleId
          && !isCoachTargetMuscle(item.muscle.id, targetMuscles)
          && item.sets > 0
          && item.muscle.sets + item.sets - 1 >= HYPERTROPHY.minimumSets
        ))
        .sort((a, b) => (
          coachGrowthModeRank(a.item.growthMode) - coachGrowthModeRank(b.item.growthMode)
        ) || (plannedSetGap(a.item, false) - plannedSetGap(b.item, false)) || (b.item.sets - a.item.sets))[0];
      if (!candidate) return false;

      const previousMinutes = candidate.item.minutes;
      if (candidate.item.sets > 1) {
        candidate.item.sets -= 1;
        candidate.item.minutes = plannedExerciseMinutes(candidate.item);
        const freedMinutes = previousMinutes - candidate.item.minutes;
        if (freedMinutes <= 0) return false;
        totalMinutes -= freedMinutes;
      } else {
        totalMinutes -= previousMinutes;
        usedExercises.delete(candidate.item.exercise.id);
        items.splice(candidate.index, 1);
      }
    }
    return true;
  };

  const enforceTargetModeContracts = () => {
    if (options.skipTargetModeContracts || !targetMuscles.length) return false;
    let changed = false;
    const setFloors = targetModeContractSetFloors(cappedLimit, {
      restart,
      targetMuscles,
      globalGrowthMode,
      growthModes,
      context: planningContext
    });
    for (const [muscleId, minimumSets] of Object.entries(setFloors)) {
      const item = items.find((candidate) => candidate.muscle.id === muscleId);
      if (!item || item.sets >= minimumSets) continue;
      const label = item.muscle.label;
      const modeLabel = coachGrowthModeLabel(item.growthMode);
      while (item.sets < minimumSets) {
        const nextMinutes = plannedExerciseMinutes(item, item.sets + 1);
        const extraMinutes = nextMinutes - item.minutes;
        if (totalMinutes + extraMinutes > hardLimit && !freeNonTargetMinutesForTarget(extraMinutes, muscleId)) break;
        if (totalMinutes + extraMinutes > hardLimit) break;
        item.sets += 1;
        item.minutes = nextMinutes;
        totalMinutes += extraMinutes;
        changed = true;
      }
      if (item.sets < minimumSets) {
        contractNotes.push(`${label} ${modeLabel} target held at ${item.sets}/${minimumSets} sets because protected floor work, recovery guardrails, or the selected timeframe blocked more volume.`);
      }
    }
    return changed;
  };

  if (globalGrowthMode === "aggressive" || items.some((item) => item.growthMode === "aggressive")) {
    addSetsToExisting({ floorGrowthMode: "medium" });
  }
  addSetsToExisting();

  if (!restart && totalMinutes < targetFloor) {
    if (globalGrowthMode === "aggressive") {
      addSetsToExisting({ allowHighVolume: true });
    }
    const highVolumeTargets = balancedCoverageTargets(allStats.filter((target) => (
      target.sets < HYPERTROPHY.highVolumeFillMax
      && !items.some((item) => item.muscle.id === target.id)
      && isMuscleAvailableForPlanning(target)
      && allowsHighVolumeTarget(target)
    )).sort((a, b) => (
      Number(isCoachTargetMuscle(b.id, targetMuscles)) - Number(isCoachTargetMuscle(a.id, targetMuscles))
    ) || (a.sets - b.sets) || coachMusclePrioritySort(a, b)));

    for (const target of highVolumeTargets) {
      if (totalMinutes >= targetFloor || items.length >= caps.maxItems) break;
      addTargetToPlan(target, { phase: "high-volume", allowHighVolume: true, trackMissing: false, growthMode: growthModeFor(target.id) });
    }
  }

  if (totalMinutes < targetFloor) {
    addSetsToExisting({ allowHighVolume: !restart });
  }

  if (enforceTargetModeContracts()) {
    addSetsToExisting({ allowHighVolume: !restart });
  }

  const shortfallReason = sessionShortfallReason({ totalMinutes, cappedLimit, targetFloor, allStats, items, missing });

  const plannedIds = new Set(items.map((item) => item.muscle.id));
  const deprioritized = stats
    .filter((target) => !isMuscleAvailableForPlanning(target) && !plannedIds.has(target.id))
    .map((target) => ({ muscle: target, reason: muscleDateGapReason(target) }));
  const targetLimitations = targetMuscles
    .map((muscleId) => allStats.find((stat) => stat.id === muscleId))
    .filter(Boolean)
    .filter((target) => !plannedIds.has(target.id) && !missingIds.has(target.id))
    .map((target) => {
      const mode = growthModeFor(target.id);
      const targetSets = planSetCeilingForTarget(target, false, mode);
      let reason;
      if (!isMuscleAvailableForPlanning(target)) {
        reason = `${target.label} target was held back because ${muscleDateGapReason(target)}`;
      } else if (planSetGap(target, false, mode) <= 0) {
        reason = `${target.label} target was limited by the selected timeframe or exercise slots after already reaching ${fmt(target.sets, 1)}/${targetSets}.`;
      } else if (items.length >= caps.maxItems || totalMinutes >= hardLimit) {
        reason = `${target.label} target was limited by the selected timeframe.`;
      } else {
        reason = `${target.label} target was limited after weekly floor work was protected.`;
      }
      return { muscle: target, reason };
    });
  const orderedItems = orderCoachSessionItems(items);

  return {
    items: orderedItems.map((item) => ({ ...item, reason: planPriorityReason(item) })),
    missing,
    deprioritized,
    targetLimitations,
    performanceNotes,
    contractNotes,
    totalMinutes,
    limitMinutes: cappedLimit,
    targetFloorMinutes: targetFloor,
    hardLimitMinutes: hardLimit,
    shortfallReason,
    restart
  };
}

function buildTodayPlan(limitMinutes = selectedCoachTimeframeMinutes()) {
  const planningContext = coachPlanningContext();
  const coachWorkouts = planningContext.workouts;
  const lastWorkout = latestWorkout(coachWorkouts);
  const daysSinceWorkout = lastWorkout ? daysBetween(lastWorkout.date, todayISO()) : null;
  const restart = daysSinceWorkout === null || daysSinceWorkout >= 4;
  const targetMuscles = selectedCoachTargetMuscles();
  const globalGrowthMode = selectedCoachGlobalGrowthMode();
  const growthModes = selectedCoachGrowthModes(targetMuscles);
  const ranked = rankedCoachMuscles(planningContext);
  const sessionPlan = buildSessionPlan(limitMinutes, { restart, targetMuscles, globalGrowthMode, growthModes, context: planningContext });
  const mediumComparisonPlan = globalGrowthMode === "aggressive" || Object.values(growthModes).includes("aggressive")
    ? buildSessionPlan(limitMinutes, {
      restart,
      targetMuscles,
      globalGrowthMode: globalGrowthMode === "aggressive" ? "medium" : globalGrowthMode,
      growthModes: mediumComparisonGrowthModes(growthModes),
      context: planningContext
    })
    : null;
  const aggressiveLimitReason = aggressivePlanLimitingReason(sessionPlan, mediumComparisonPlan);
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
    selectedReasons.push(`${coachGrowthModeLabel(globalGrowthMode)} plan intensity.`);
    selectedReasons.push(...sessionPlan.items.map((item) => item.reason));
    if (targetMuscles.length) {
      const targetLabels = muscleGroups
        .filter((muscle) => targetMuscles.includes(muscle.id))
        .map((muscle) => growthModes[muscle.id]
          ? `${muscle.label} ${coachGrowthModeLabel(growthModes[muscle.id])}`
          : `${muscle.label} ${coachGrowthModeLabel(globalGrowthMode)}`);
      selectedReasons.unshift(`Targets selected: ${targetLabels.join(", ")}. Soft targets get conservative priority after weekly floors.`);
    }
    why.push(...selectedReasons.slice(0, 3));
  }
  if (sessionPlan.targetLimitations?.length) {
    const targetLimitReasons = sessionPlan.targetLimitations.map((item) => item.reason);
    skippedReasons.push(...targetLimitReasons);
    notes.push(...targetLimitReasons);
    why.push(...targetLimitReasons.slice(0, 2));
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
  if (aggressiveLimitReason) {
    notes.push(aggressiveLimitReason);
    why.push(aggressiveLimitReason);
  }
  if (sessionPlan.contractNotes?.length) {
    notes.push(...sessionPlan.contractNotes);
    why.push(...sessionPlan.contractNotes.slice(0, 2));
  }
  if (sessionPlan.performanceNotes?.length) {
    notes.push(...sessionPlan.performanceNotes);
    why.push(...sessionPlan.performanceNotes.slice(0, 2));
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
  return exerciseHistoryForIdentity(exercise, state.workouts, false)
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

function rollingAverageSeries(points = [], windowSize = 7) {
  if (points.length < 2) return [];
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
    const value = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    return { label: point.label, value };
  });
}

function latestRollingAverage(points = [], windowSize = 7) {
  const series = rollingAverageSeries(points, windowSize);
  return series.length ? series[series.length - 1].value : 0;
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

function lineChart(points, color = "#35d58c", unit = "", options = {}) {
  if (!points.length) {
    return `<div class="empty">No data yet. Your chart will appear after the first few logs.</div>`;
  }
  const comparisonPoints = Array.isArray(options.comparisonPoints) ? options.comparisonPoints : [];
  const comparisonColor = options.comparisonColor || "rgba(255,255,255,0.68)";

  const chartPoints = points.length > 1 ? points : [
    { label: points[0].label, value: points[0].value - 1, hidden: true },
    points[0]
  ];
  const rangePoints = [...chartPoints, ...comparisonPoints];
  const min = Math.min(...rangePoints.map((point) => point.value));
  const max = Math.max(...rangePoints.map((point) => point.value));
  const range = max - min || 1;
  const coords = chartPoints.map((point, index) => {
    const x = 8 + (index / Math.max(chartPoints.length - 1, 1)) * 84;
    const y = 84 - ((point.value - min) / range) * 68;
    return { x, y, ...point };
  });
  const comparisonCoords = comparisonPoints.map((point, index) => {
    const x = 8 + (index / Math.max(comparisonPoints.length - 1, 1)) * 84;
    const y = 84 - ((point.value - min) / range) * 68;
    return { x, y, ...point };
  });
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const comparisonPolyline = comparisonCoords.map((point) => `${point.x},${point.y}`).join(" ");
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
    <div class="chart interactive-chart" data-points="${payload}" data-unit="${escapeHtml(unit)}" tabindex="0" aria-label="Interactive chart. Tap or press to inspect the nearest point.">
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
          ${comparisonPolyline ? `<polyline class="comparison-polyline" points="${comparisonPolyline}" fill="none" stroke="${escapeHtml(comparisonColor)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2"></polyline>` : ""}
          ${visibleCoords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.7" fill="${color}"></circle>`).join("")}
        </svg>
        <div class="chart-marker" style="left:${last.x}%; top:${last.y}%"></div>
      </div>
      <p class="chart-readout" aria-live="polite">${escapeHtml(chartReadout(last, unit))}</p>
      <p class="muted small">${escapeHtml(first.label)} to ${escapeHtml(last.label)}</p>
    </div>
  `;
}

function muscleProgressMarkup(stats = muscleSetStats(), compact = false) {
  const rows = stats.map((stat) => `
    <button class="muscle-card ${stat.zone.tone}" type="button" data-action="open-weekly-muscle-detail" data-muscle="${escapeHtml(stat.id)}">
      <div class="muscle-card-top">
        <strong>${escapeHtml(stat.label)}</strong>
        <span>${fmt(stat.sets, 1)}/${HYPERTROPHY.growthHigh}</span>
      </div>
      <div class="progress-bar"><span style="width:${stat.percent}%"></span></div>
      <div class="muscle-card-meta">
        <span>${escapeHtml(stat.zone.label)}</span>
        <span>${stat.sessions}/2 touches</span>
      </div>
    </button>
  `).join("");
  return `<div class="muscle-grid ${compact ? "compact" : ""}">${rows}</div>`;
}

function weeklyMuscleDetailScreen(detail = state.weeklyMuscleDetail) {
  const summary = weeklyMuscleDetailSummary(detail?.muscleId || "chest");
  const entriesMarkup = summary.entries.length ? summary.entries.map((entry) => {
    const setRows = entry.rows.map((row) => `
      <tr>
        <td>${row.index + 1}</td>
        <td>${fmt(row.weight, 1)}</td>
        <td>${fmt(row.reps)}</td>
        <td>${row.rir === null ? "--" : fmt(row.rir, 1)}</td>
        <td>${escapeHtml(restInputValue(row.restSeconds) || "--")}</td>
        <td>${fmt(row.creditedSets, 1)}</td>
      </tr>
    `).join("");
    return `
      <section class="weekly-muscle-entry">
        <div class="weekly-muscle-entry-top">
          <div>
            <strong>${escapeHtml(entry.workout.exercise)}</strong>
            <span class="muted small">${escapeHtml(formatShortDate(entry.workout.date))} - ${entry.role} ${fmt(entry.factor, 1)}x stimulus</span>
          </div>
          <span class="exercise-status-pill ${entry.role === "primary" ? "active" : "archived"}">${fmt(entry.creditedSets, 1)} sets</span>
        </div>
        <div class="action-grid weekly-muscle-stats">
          <div><strong>${fmt(entry.rawSets, 1)}</strong><small>raw hard sets</small></div>
          <div><strong>${fmt(entry.volume)}</strong><small>load volume</small></div>
          <div><strong>${escapeHtml(bestSetLabel(entry.workout))}</strong><small>best set</small></div>
          <div><strong>${entry.avgRir === null ? "--" : fmt(entry.avgRir, 1)}</strong><small>avg RIR</small></div>
        </div>
        <div class="set-table-wrap weekly-muscle-set-wrap">
          <table class="weekly-set-table">
            <thead>
              <tr><th>Set</th><th>lbs</th><th>Reps</th><th>RIR</th><th>Rest</th><th>Credit</th></tr>
            </thead>
            <tbody>${setRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }).join("") : `
    <div class="empty compact-empty">No ${escapeHtml(summary.muscle.label)} work has been logged in this Monday-start week.</div>
  `;
  return `
    <section class="hero weekly-muscle-detail-hero">
      <div>
        <p class="eyebrow">Weekly set detail</p>
        <h2 class="hero-title">${escapeHtml(summary.muscle.label)}</h2>
        <p class="hero-copy">Monday-start week credits primary work at 1.0x and secondary work at 0.5x, with existing RIR hard-set discounts.</p>
      </div>
      <button class="ghost-button" type="button" data-action="close-weekly-muscle-detail">Back</button>
    </section>
    <section class="section weekly-muscle-summary">
      <div class="grid three">
        <div class="stat"><span class="label">Total</span><span class="value">${fmt(summary.totalSets, 1)}</span><span class="hint">credited sets</span></div>
        <div class="stat"><span class="label">Primary</span><span class="value">${fmt(summary.primarySets, 1)}</span><span class="hint">direct work</span></div>
        <div class="stat"><span class="label">Secondary</span><span class="value">${fmt(summary.secondarySets, 1)}</span><span class="hint">support work</span></div>
      </div>
    </section>
    <section class="weekly-muscle-entry-list">${entriesMarkup}</section>
  `;
}

function topUnderTargetMuscles(limit = 4) {
  return muscleSetStats()
    .filter((stat) => stat.sets < HYPERTROPHY.minimumSets)
    .sort((a, b) => a.sets - b.sets)
    .slice(0, limit);
}

function recommendations(todayPlan = null) {
  const recs = [];
  const stats = todayPlan ? coachMuscleSetStats() : muscleSetStats();
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
  if (state.weeklyMuscleDetail?.returnTab === "dashboard") return weeklyMuscleDetailScreen();
  const weeklyVolume = getWeeklyVolume();
  const bodyWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  const bodyWeightSeries = seriesFromMetrics("bodyWeight");
  const bodyWeightAverage = latestRollingAverage(bodyWeightSeries, 7);
  const bodyWeightAverageSeries = rollingAverageSeries(bodyWeightSeries, 7);
  const proteinAvg = getAverage("protein", 7);
  const protein = proteinTargets();
  const health = healthCoachSummary();
  const stats = muscleSetStats();
  const covered = stats.filter((stat) => stat.sets >= HYPERTROPHY.minimumSets).length;
  const underTarget = topUnderTargetMuscles(4);
  const todayPlan = buildTodayPlan();
  const action = actionFromSessionPlan(todayPlan);
  const firstExercise = todayPlan.sessionPlan.items[0]?.exercise;
  const widgetMarkup = {
    nextLift: `
      <section class="section card coach-action dashboard-widget" data-dashboard-widget="nextLift">
        <span class="badge">Next best lift</span>
        <h3>${escapeHtml(action.title)}</h3>
        <p>${escapeHtml(action.body)}</p>
        ${firstExercise ? `<p class="muted small">Rest ${escapeHtml(firstExercise.rest)}. ${escapeHtml(firstExercise.cue)}</p>` : ""}
      </section>
    `,
    lowestSets: `
      <details class="section card dashboard-widget collapsible-panel dashboard-lowestSets-panel" data-dashboard-widget="lowestSets" open>
        <summary><span>Lowest set counts</span><small>${underTarget.length ? `${underTarget.length} under target` : "covered"}</small></summary>
        <div class="list">
          ${underTarget.length ? underTarget.map((stat) => `
            <div class="list-item simple">
              <strong>${escapeHtml(stat.label)}</strong>
              <span class="muted small">${fmt(stat.sets, 1)}/${HYPERTROPHY.minimumSets} hard sets - ${stat.sessions}/2 touches</span>
            </div>
          `).join("") : `<div class="empty">All tracked muscles have reached the weekly floor.</div>`}
        </div>
      </details>
    `,
    health: `
      <details class="section card coach-action dashboard-widget collapsible-panel dashboard-health-panel" data-dashboard-widget="health" open>
        <summary><span>Health coach</span><small>${escapeHtml(health.goalLabel)}</small></summary>
        <span class="badge">Health coach</span>
        <h3>${escapeHtml(health.goalLabel)} nutrition check</h3>
        <p>${escapeHtml(health.recommendation)}</p>
        ${healthCoachStatMarkup(health)}
      </details>
    `,
    weeklySets: `
      <details class="section chart-panel dashboard-widget collapsible-panel dashboard-weeklySets-panel" data-dashboard-widget="weeklySets" open>
        <summary><span>This week's hard sets</span><small>Monday-start week - ${fmt(weeklyVolume)} lb load</small></summary>
        ${muscleProgressMarkup(stats, true)}
      </details>
    `,
    bodyWeight: `
      <details class="section chart-panel dashboard-widget collapsible-panel dashboard-bodyWeight-panel" data-dashboard-widget="bodyWeight" open>
        <summary><span>Body weight</span><small>${bodyWeight ? `${fmt(bodyWeight, 1)} lb${bodyWeightAverage ? ` - ${fmt(bodyWeightAverage, 1)} 7d avg` : ""}` : "preview"}</small></summary>
        ${lineChart(bodyWeightSeries.length ? bodyWeightSeries : previewSeries("bodyWeight"), "#f2d06b", " lb", { comparisonPoints: bodyWeightAverageSeries, comparisonColor: "rgba(255,255,255,0.62)" })}
      </details>
    `,
    protein: `
      <details class="section chart-panel dashboard-widget collapsible-panel dashboard-protein-panel" data-dashboard-widget="protein" open>
        <summary><span>Protein</span><small>${proteinAvg ? `${fmt(proteinAvg)}g avg` : "preview"}</small></summary>
        ${lineChart(seriesFromMetrics("protein").length ? seriesFromMetrics("protein") : previewSeries("protein"), "#ff6b5f", "g")}
      </details>
    `
  };

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
    ${selectedDashboardWidgets().map((id) => widgetMarkup[id] || "").join("")}
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
        <button class="ghost-mini" type="button" data-action="open-exercise-trend" data-exercise="${escapeHtml(entry.exercise)}">Trend</button>
        <button class="ghost-mini" type="button" data-action="open-exercise-history-global" data-exercise="${escapeHtml(entry.exercise)}">History</button>
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

function syncSecondaryMuscleCheckboxes(form = document.getElementById("exercise-form")) {
  if (!form) return;
  const primary = form.querySelector("#exercise-primary")?.value || "";
  form.querySelectorAll('input[name="secondaryMuscles"]').forEach((input) => {
    const isPrimary = input.value === primary;
    input.disabled = isPrimary;
    if (isPrimary) input.checked = false;
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
  const fallback = exerciseName || defaultLogExerciseName();
  const meta = resolveExerciseMeta(fallback, state.draftTargetMuscle);
  return {
    draftId: uid(),
    editingWorkoutId: null,
    exercise: fallback,
    targetMuscle: meta.primaryMuscles[0] || "chest",
    notes: "",
    setRows: defaultSetRows()
  };
}

function ensureWorkoutDraft() {
  if (!Array.isArray(state.workoutDraft) || !state.workoutDraft.length) {
    const exercise = state.selectedExercise || defaultLogExerciseName();
    state.workoutDraft = exercise ? [defaultDraftExercise(exercise)] : [];
  }
  return state.workoutDraft;
}

function syncLegacyDraftFromFirst() {
  const first = Array.isArray(state.workoutDraft) ? state.workoutDraft[0] : null;
  if (!first) {
    state.selectedExercise = "";
    state.draftTargetMuscle = "chest";
    state.draftNotes = "";
    state.setRows = [];
    state.editingWorkoutId = null;
    return;
  }
  state.selectedExercise = first.exercise;
  state.draftTargetMuscle = first.targetMuscle;
  state.draftNotes = first.notes || "";
  state.setRows = normalizeSetRows(first.setRows);
  state.editingWorkoutId = first.editingWorkoutId || null;
}

function removeExerciseDraftTable(draftId) {
  const drafts = Array.isArray(state.workoutDraft) ? state.workoutDraft : [];
  state.workoutDraft = drafts.filter((draft) => draft.draftId !== draftId);
  syncLegacyDraftFromFirst();
  saveDraftRecovery("strength-remove");
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
      coachCopiedRows: existing.coachCopiedRows,
      coachCopiedDirtyRows: existing.coachCopiedDirtyRows,
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
  return exerciseHistoryForIdentity(exercise, state.workouts, true)
    .filter((entry) => entry.id !== excludeId)[0] || null;
}

function previousSetLabel(exercise, index, excludeId = state.editingWorkoutId) {
  const last = lastSessionForExercise(exercise, excludeId);
  if (!last) return "--";
  const row = setRowsFromWorkout(last)[index];
  return row ? `${fmt(row.weight)} x ${fmt(row.reps)}` : "--";
}

function adjustedCoachPlanRow(row, exercise, planTarget = null) {
  const next = { ...row };
  if (!planTarget) return next;
  const meta = exerciseIdentity(exercise);
  const range = parseRepRange(meta.reps);
  if (["deload", "reset"].includes(planTarget.kind) && next.weight > 0) {
    next.weight = roundLoadTarget(next.weight * (planTarget.loadMultiplier || 1));
    next.rir = 2;
    return next;
  }
  if (planTarget.kind === "progression") {
    if (next.reps < range.high) {
      next.reps += 1;
    } else if (next.weight > 0) {
      next.weight = roundLoadTarget(next.weight + (next.weight >= 50 ? 5 : 2.5));
      next.reps = range.low;
    }
    next.rir = next.rir ?? 2;
  }
  return next;
}

function plannedSetRowsFromPreviousSession(exercise, setCount, planTarget = null) {
  const count = Math.max(1, Math.round(parseNum(setCount)));
  const last = lastSessionForExercise(exercise);
  const previousRows = last ? setRowsFromWorkout(last) : [];
  if (!previousRows.length) return defaultSetRows(count);
  return Array.from({ length: count }, (_, index) => {
    const source = previousRows[index] || previousRows[previousRows.length - 1];
    return adjustedCoachPlanRow({
      weight: source.weight,
      reps: source.reps,
      rir: source.rir ?? 2,
      restSeconds: source.restSeconds ?? null
    }, exercise, planTarget);
  });
}

function cloneCoachPlanSnapshot(plan) {
  return JSON.parse(JSON.stringify(plan || buildTodayPlan(selectedCoachTimeframeMinutes())));
}

function copiedCoachPlanSnapshot(plan) {
  return {
    ...cloneCoachPlanSnapshot(plan),
    copiedDate: todayISO(),
    copiedAt: new Date().toISOString(),
    timeframeMinutes: selectedCoachTimeframeMinutes(),
    globalGrowthMode: selectedCoachGlobalGrowthMode(),
    growthModes: selectedCoachGrowthModes()
  };
}

function persistCopiedCoachPlan(plan) {
  if (!plan) {
    safeLocalStorageRemove(COPIED_COACH_PLAN_KEY);
    return;
  }
  safeLocalStorageSet(COPIED_COACH_PLAN_KEY, JSON.stringify(plan));
}

function activeCopiedCoachPlan() {
  const copied = state.copiedCoachPlan;
  if (!copied) return null;
  if ((copied.copiedDate || todayISO()) !== todayISO()) return null;
  return copied;
}

function restoreCopiedCoachPlan() {
  let copied = null;
  try {
    copied = JSON.parse(safeLocalStorageGet(COPIED_COACH_PLAN_KEY) || "null");
  } catch {
    copied = null;
  }
  if (!copied || typeof copied !== "object") return;
  if ((copied.copiedDate || "") !== todayISO()) {
    safeLocalStorageRemove(COPIED_COACH_PLAN_KEY);
    return;
  }
  state.copiedCoachPlan = copied;
}

function simulatedWorkoutFromPlanItem(item, index = 0) {
  const rows = plannedSetRowsFromPreviousSession(item.exercise, item.sets, item.planTarget);
  return {
    id: `coach-sim-${item.exercise.id || item.exercise.name}-${index}`,
    date: todayISO(),
    exercise: item.exercise.name,
    exerciseId: item.exercise.id || null,
    primaryMuscles: item.exercise.primaryMuscles || [item.muscle.id],
    secondaryMuscles: item.exercise.secondaryMuscles || [],
    setRows: rows,
    sets: rows.length,
    reps: rows[0]?.reps || 0,
    weight: rows[0]?.weight || 0,
    rir: rows[0]?.rir ?? 2,
    restSeconds: rows[0]?.restSeconds ?? null,
    notes: `Simulated Coach preview for ${item.muscle.label}.`,
    order: index,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function buildNextCoachPlanPreview(copiedPlan = activeCopiedCoachPlan()) {
  const sourcePlan = copiedPlan || buildTodayPlan(selectedCoachTimeframeMinutes());
  const simulated = (sourcePlan.sessionPlan?.items || []).map(simulatedWorkoutFromPlanItem);
  const context = coachPlanningContext([...state.workouts, ...simulated]);
  const restart = false;
  const targetMuscles = selectedCoachTargetMuscles();
  const globalGrowthMode = selectedCoachGlobalGrowthMode();
  const growthModes = selectedCoachGrowthModes(targetMuscles);
  const sessionPlan = buildSessionPlan(selectedCoachTimeframeMinutes(), { restart, targetMuscles, globalGrowthMode, growthModes, context });
  return {
    notice: "This is only the next plan if you complete the current copied plan.",
    plan: {
      ...buildTodayPlan(selectedCoachTimeframeMinutes()),
      mode: sessionPlan.items.length ? "session" : "recovery",
      title: "Next plan preview",
      subtitle: "Projected from the copied plan being completed.",
      sessionPlan,
      why: sessionPlan.items.map((item) => item.reason),
      explanation: { selected: sessionPlan.items.map((item) => item.reason), skipped: [], missing: [], notes: ["This preview does not save workouts."] },
      notes: ["This preview does not save workouts."]
    }
  };
}

function copyCoachPlanToLog(plan = buildTodayPlan(selectedCoachTimeframeMinutes())) {
  const items = plan.sessionPlan.items || [];
  if (!items.length) throw new Error("Coach needs a plan before it can copy to Log.");
  state.copiedCoachPlan = copiedCoachPlanSnapshot(plan);
  persistCopiedCoachPlan(state.copiedCoachPlan);
  state.previewNextCoachPlan = false;
  state.workoutDraft = items.map((item) => {
    const setRows = plannedSetRowsFromPreviousSession(item.exercise, item.sets, item.planTarget);
    return {
      draftId: uid(),
      editingWorkoutId: null,
      exercise: item.exercise.name,
      targetMuscle: item.muscle.id,
      notes: `Coach plan: ${item.reason}${item.growthMode ? ` ${coachGrowthModeLabel(item.growthMode)} mode.` : ""}${item.planTarget ? ` ${item.planTarget.label}.` : ""}`,
      setRows,
      coachCopiedRows: setRows.map(copiedRowSnapshot),
      coachCopiedDirtyRows: []
    };
  });
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
  const entries = exerciseHistoryForIdentity(exercise, state.workouts, true).filter((entry) => entry.id !== excludeId);
  const bestRepsByWeight = new Map();
  const setBestRepsByWeight = new Map();
  const setMaxWeight = new Map();
  let maxWeight = 0;
  let bestVolume = 0;

  for (const entry of entries) {
    bestVolume = Math.max(bestVolume, workoutVolume(entry));
    for (const [index, row] of setRowsFromWorkout(entry).entries()) {
      if (row.weight <= 0 || row.reps <= 0) continue;
      maxWeight = Math.max(maxWeight, row.weight);
      const key = recordWeightKey(row.weight);
      bestRepsByWeight.set(key, Math.max(bestRepsByWeight.get(key) || 0, row.reps));
      const setWeightKey = `${index}|${key}`;
      setBestRepsByWeight.set(setWeightKey, Math.max(setBestRepsByWeight.get(setWeightKey) || 0, row.reps));
      setMaxWeight.set(index, Math.max(setMaxWeight.get(index) || 0, row.weight));
    }
  }

  return {
    hasHistory: entries.length > 0,
    bestRepsByWeight,
    setBestRepsByWeight,
    setMaxWeight,
    maxWeight,
    bestVolume
  };
}

function setRecordReasons(row, stats, index = null) {
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
  if (Number.isInteger(index) && index >= 0) {
    const setNumber = index + 1;
    const setWeightKey = `${index}|${recordWeightKey(weight)}`;
    const priorSetReps = stats.setBestRepsByWeight?.get(setWeightKey) || 0;
    const priorSetMaxWeight = stats.setMaxWeight?.get(index) || 0;
    if (priorSetReps > 0 && reps > priorSetReps) {
      reasons.push(`Set ${setNumber} rep record at ${fmt(weight, 1)} lb: ${fmt(priorSetReps)} to ${fmt(reps)}`);
    }
    if (priorSetMaxWeight > 0 && weight > priorSetMaxWeight && reps >= 8) {
      reasons.push(`Set ${setNumber} weight record: ${fmt(weight, 1)} lb for ${fmt(reps)} reps`);
    }
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
    parseNum(row.reps)
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
  const reasons = setRecordReasons(row, recordStats, index);
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
    const rirValue = clampRirValue(row.rir ?? 2);
    const copiedClass = isCoachCopiedRowUnchanged(draft, row, index) ? " coach-copied-row" : "";
    return `
    <tr class="set-row${copiedClass}" data-index="${index}">
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
      <td>
        <div class="rir-stepper" aria-label="Set ${index + 1} RIR">
          <button class="rir-stepper-btn" type="button" data-action="decrement-rir" data-draft-id="${escapeHtml(draft.draftId)}" data-index="${index}" aria-label="Decrease set ${index + 1} RIR">-</button>
          <input class="rir-stepper-input" data-set-field="rir" type="number" inputmode="none" min="${RIR_MIN}" max="${RIR_MAX}" step="1" value="${rirValue}" aria-label="Set ${index + 1} RIR" readonly>
          <button class="rir-stepper-btn" type="button" data-action="increment-rir" data-draft-id="${escapeHtml(draft.draftId)}" data-index="${index}" aria-label="Increase set ${index + 1} RIR">+</button>
        </div>
      </td>
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
  const sessions = exerciseHistoryForIdentity(state.selectedExercise).slice(0, 6);
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
  const sessions = exerciseHistoryForIdentity(exerciseName);
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
          <details class="history-session-card collapsible-panel">
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
  const template = {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    exercises
  };
  templates.push(template);
  await saveSetting("dayTemplates", templates);
  await queueSyncChange("template", template.id, template);
  scheduleRecordSync();
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
  await queueSyncChange("template", template.id, null, { deleted: true });
  scheduleRecordSync();
  state.templateQueue = [];
  await render();
  toast("Template deleted.");
}

function secondaryMuscleCheckboxes(selected = [], primaryMuscle = "") {
  const selectedSet = new Set(selected);
  return muscleGroups.map((muscle) => `
    <label class="check-card">
      <input type="checkbox" name="secondaryMuscles" value="${muscle.id}" ${selectedSet.has(muscle.id) ? "checked" : ""} ${primaryMuscle === muscle.id ? "disabled" : ""}>
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

function exerciseFormErrorMarkup(errors = {}, key) {
  return errors[key] ? `<p class="exercise-form-error" role="alert">${escapeHtml(errors[key])}</p>` : "";
}

function exerciseFormValues(editing = null) {
  if (state.exerciseFormDraft) return state.exerciseFormDraft;
  return {
    name: editing?.name || "",
    primaryMuscle: editing?.primaryMuscles?.[0] || state.draftTargetMuscle || "chest",
    secondaryMuscles: editing?.secondaryMuscles || [],
    equipment: editing?.equipment || "",
    reps: editing?.reps || "",
    rest: editing?.rest || "",
    cue: editing?.cue || ""
  };
}

function exerciseUsageMetaMarkup(exercise) {
  const usage = exerciseUsageStats(exercise);
  return `
    <div class="exercise-card-meta">
      <span><strong>${usage.sessionCount}</strong><small>sessions</small></span>
      <span><strong>${usage.lastUsedAt ? escapeHtml(formatShortDate(usage.lastUsedAt)) : "--"}</strong><small>last used</small></span>
      <span class="exercise-status-pill ${exercise.archivedAt ? "archived" : "active"}">${exercise.archivedAt ? "Archived" : "Active"}</span>
    </div>
  `;
}

function exerciseCardActions(exercise, editable = false) {
  if (!editable) return "";
  const archived = !!exercise.archivedAt;
  const removalMode = exerciseRemovalMode(exercise);
  const actions = archived
    ? `
      <button class="ghost-mini" type="button" data-action="restore-exercise" data-id="${escapeHtml(exercise.id)}">Restore</button>
      ${removalMode === "delete" ? `<button class="delete-small text-delete" type="button" data-action="delete-exercise" data-id="${escapeHtml(exercise.id)}">Delete</button>` : ""}
    `
    : `
      <button class="ghost-mini" type="button" data-action="edit-exercise" data-id="${escapeHtml(exercise.id)}">Edit</button>
      <button class="ghost-mini" type="button" data-action="open-exercise-trend" data-exercise="${escapeHtml(exercise.name)}">Trend</button>
      <button class="ghost-mini" type="button" data-action="open-exercise-history-global" data-exercise="${escapeHtml(exercise.name)}">History</button>
      <button class="ghost-mini" type="button" data-action="archive-exercise" data-id="${escapeHtml(exercise.id)}">${removalMode === "archive" ? "Archive" : "Delete"}</button>
    `;
  return `
    <div class="row-actions exercise-card-actions">
      ${archived ? "" : `<button class="ghost-mini primary-card-action" type="button" data-action="log-exercise" data-exercise="${escapeHtml(exercise.name)}">Log</button>`}
      <div class="exercise-secondary-actions">${actions}</div>
    </div>
  `;
}

function exerciseCard(exercise, editable = false) {
  return `
    <div class="exercise-definition ${editable ? "custom" : ""} ${exercise.archivedAt ? "removed-exercise" : ""}">
      <div>
        <div class="exercise-definition-title">
          <strong>${escapeHtml(exercise.name)}</strong>
        </div>
        ${exerciseMuscleBadges(exercise)}
        ${exerciseUsageMetaMarkup(exercise)}
        <p class="muted small">${escapeHtml(exercise.equipment || "custom")} - ${escapeHtml(exercise.reps || "8-15")} reps - ${escapeHtml(exercise.rest || "60-120 sec")}</p>
        <p class="muted micro">${escapeHtml(exercise.cue || "Keep form strict and progress gradually.")}</p>
      </div>
      ${exerciseCardActions(exercise, editable)}
    </div>
  `;
}

function exerciseCoverageMarkup() {
  const coveredCount = exerciseCoverageStats().filter((item) => !item.missing).length;
  return `
    <details class="section chart-panel collapsible-panel exercise-coverage-panel" open>
      <summary><span>Primary coverage</span><small>${coveredCount}/${muscleGroups.length} muscles covered</small></summary>
      <div class="exercise-coverage-list">
        ${exerciseCoverageStats().map((item) => `
          <details class="coverage-row ${item.missing ? "is-missing" : ""}">
            <summary>
              <span class="coverage-row-title"><strong>${escapeHtml(item.label)}</strong><small>${item.missing ? "Missing primary exercise" : `${item.count} primary`}</small></span>
            </summary>
            ${item.missing ? `
              <div class="coverage-empty-row">
                <p class="muted small">Add a primary ${escapeHtml(item.label)} exercise so Coach can recommend it.</p>
                <button class="ghost-mini" type="button" data-action="exercise-add-primary" data-muscle-id="${item.id}">Add primary</button>
              </div>
            ` : `
              <div class="coverage-detail-list">
                ${item.exercises.map((exercise) => {
                  const usage = exerciseUsageStats(exercise);
                  return `
                    <div class="coverage-exercise-row">
                      <strong>${escapeHtml(exercise.name)}</strong>
                      <span class="muted micro">${usage.lastUsedAt ? `Last ${escapeHtml(formatShortDate(usage.lastUsedAt))}` : "Never used"} - ${usage.sessionCount} sessions</span>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
          </details>
        `).join("")}
      </div>
    </details>
  `;
}

function exerciseLibraryControlsMarkup() {
  return `
    <details class="section form-panel collapsible-panel exercise-library-controls" open>
      <summary><span>Find exercises</span><small>search, filter, sort</small></summary>
      <div class="field exercise-search-field">
        <label for="exercise-search">Search exercises</label>
        <input id="exercise-search" data-exercise-search value="${escapeHtml(state.exerciseSearch)}" placeholder="Bench, row, curl">
      </div>
      <div class="exercise-control-row">
        <div class="exercise-filter-row" aria-label="Filter exercises by muscle">
          <button class="pill ${state.exerciseMuscleFilter === "all" ? "is-active" : ""}" type="button" data-action="exercise-filter-muscle" data-muscle-id="all">All</button>
          ${muscleGroups.map((muscle) => `
            <button class="pill ${state.exerciseMuscleFilter === muscle.id ? "is-active" : ""}" type="button" data-action="exercise-filter-muscle" data-muscle-id="${muscle.id}">${escapeHtml(muscle.label)}</button>
          `).join("")}
        </div>
        <div class="field compact-field exercise-sort-field">
          <label for="exercise-sort">Sort</label>
          <select id="exercise-sort" data-exercise-sort>
            <option value="recent" ${state.exerciseSort === "recent" ? "selected" : ""}>Recent</option>
            <option value="az" ${state.exerciseSort === "az" ? "selected" : ""}>A-Z</option>
            <option value="muscle" ${state.exerciseSort === "muscle" ? "selected" : ""}>Muscle</option>
            <option value="most" ${state.exerciseSort === "most" ? "selected" : ""}>Most logged</option>
          </select>
        </div>
      </div>
    </details>
  `;
}

function renderExercises() {
  const allCustomExercises = getCustomExercises({ includeArchived: true });
  const editing = allCustomExercises.find((exercise) => exercise.id === state.editingExerciseId);
  const values = exerciseFormValues(editing);
  const errors = state.exerciseFormErrors || {};
  const primary = values.primaryMuscle || "chest";
  const primaryOptions = muscleGroups.map((muscle) => `
    <option value="${muscle.id}" ${primary === muscle.id ? "selected" : ""}>${escapeHtml(muscle.label)}</option>
  `).join("");
  const visibleExercises = filteredExerciseList();
  const archivedExercises = filteredExerciseList({ includeArchived: true, archivedOnly: true, search: state.exerciseSearch, muscle: state.exerciseMuscleFilter, sort: "az" });

  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Exercises</h2>
        <p class="hero-copy">Build the movement database TrainWise uses for logging, hard-set credits, charts, and coaching.</p>
      </div>
    </section>

    ${exerciseCoverageMarkup()}

    <details class="section form-panel collapsible-panel exercise-form-panel ${editing ? "is-editing" : ""}" data-edit-focus-target open>
      <summary><span>${editing ? "Edit exercise" : "Add exercise"}</span><small>${editing ? escapeHtml(editing.name) : "custom movement"}</small></summary>
      <form id="exercise-form" data-edit-focus-target>
        <div class="field-row exercise-form-grid">
          <div class="field">
            <label for="exercise-name">Exercise name</label>
            <input id="exercise-name" name="name" required placeholder="V-Bar Pulldown" value="${escapeHtml(values.name || "")}">
            ${exerciseFormErrorMarkup(errors, "name")}
          </div>
          <div class="field">
            <label for="exercise-primary">Primary muscle</label>
            <select id="exercise-primary" name="primaryMuscle">${primaryOptions}</select>
          </div>
        </div>
        <div class="field">
          <label>Secondary muscles</label>
          <div class="checkbox-grid">${secondaryMuscleCheckboxes(values.secondaryMuscles || [], primary)}</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="exercise-equipment">Equipment</label>
            <input id="exercise-equipment" name="equipment" placeholder="Cable, dumbbell, machine" value="${escapeHtml(values.equipment || "")}">
          </div>
          <div class="field">
            <label for="exercise-reps">Rep range</label>
            <input id="exercise-reps" name="reps" placeholder="8-15" value="${escapeHtml(values.reps || "")}">
            ${exerciseFormErrorMarkup(errors, "reps")}
          </div>
          <div class="field">
            <label for="exercise-rest">Rest range</label>
            <input id="exercise-rest" name="rest" placeholder="60-120 sec" value="${escapeHtml(values.rest || "")}">
            ${exerciseFormErrorMarkup(errors, "rest")}
          </div>
        </div>
        <div class="field">
          <label for="exercise-cue">Cue / notes</label>
          <textarea id="exercise-cue" name="cue" placeholder="Setup, form cues, pain-free path, progression notes.">${escapeHtml(values.cue || "")}</textarea>
        </div>
        <div class="grid two">
          <button class="primary-button" type="submit">${editing ? "Update exercise" : "Save exercise"}</button>
          ${editing ? `<button class="ghost-button" type="button" data-action="cancel-exercise-edit">Cancel edit</button>` : `<button class="ghost-button" type="button" data-action="exercise-clear-form">Clear form</button>`}
        </div>
      </form>
    </details>

    ${exerciseLibraryControlsMarkup()}

    <details class="section chart-panel collapsible-panel exercise-database-panel" open>
      <summary><span>Your exercise database</span><small>${visibleExercises.length}/${getCustomExercises().length} active</small></summary>
      <div class="exercise-list">
        ${visibleExercises.length ? visibleExercises.map((exercise) => exerciseCard(exercise, true)).join("") : `<div class="empty">No active exercises match this view.</div>`}
      </div>
    </details>

    <details class="section chart-panel collapsible-panel archived-exercise-panel">
      <summary><span>Archived exercises</span><small>${archivedExercises.length} archived</small></summary>
      <div class="exercise-list">
        ${archivedExercises.length ? archivedExercises.map((exercise) => exerciseCard(exercise, true)).join("") : `<div class="empty">Archived movements will appear here when you retire them.</div>`}
      </div>
    </details>
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
  const activeNames = exerciseNames();
  const options = activeNames.map((name) => `
    <option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>
  `);
  if (selected && !activeNames.includes(selected)) {
    const archived = getCustomExercises({ includeArchived: true }).find((exercise) => normalizeName(exercise.name) === normalizeName(selected) && exercise.archivedAt);
    const label = archived ? `${selected} (archived)` : `${selected} (not in library)`;
    options.unshift(`
    <option value="${escapeHtml(selected)}" selected>${escapeHtml(label)}</option>
  `);
  }
  return options.join("");
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
    <section class="exercise-draft ${state.draggingDraftId === draft.draftId ? "is-dragging" : ""} ${state.dragPendingDraftId === draft.draftId ? "is-drag-pending" : ""}" data-draft-id="${escapeHtml(draft.draftId)}" data-editing-workout-id="${escapeHtml(draft.editingWorkoutId || "")}">
      <div class="exercise-table-top">
        <div class="exercise-table-title">
          <button class="drag-handle" type="button" aria-label="Drag exercise table" data-drag-handle data-draft-id="${escapeHtml(draft.draftId)}">::</button>
          ${exerciseMuscleIcons(meta)}
          ${volumeRecordTrophySlot(draft, recordStats)}
          ${logLoadDirectionIndicator(meta, draft)}
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
        <button class="ghost-button" type="button" data-action="remove-exercise-table" data-draft-id="${escapeHtml(draft.draftId)}">Remove</button>
        ${index === total - 1 ? `<button class="add-exercise-icon-btn" type="button" data-action="add-exercise-table" aria-label="Add exercise"><img src="./assets/dumbbell.svg" alt="" width="36" height="36"></button>` : ""}
        <div class="reorder-arrows">
          <button type="button" aria-label="Move up" data-action="move-exercise-up" data-draft-id="${escapeHtml(draft.draftId)}" ${index === 0 ? "disabled" : ""}>&#9650;</button>
          <button type="button" aria-label="Move down" data-action="move-exercise-down" data-draft-id="${escapeHtml(draft.draftId)}" ${index === total - 1 ? "disabled" : ""}>&#9660;</button>
        </div>
      </div>
    </section>
  `;
}

function emptyStrengthLogMarkup(canAddExerciseTable = false) {
  const savedDraft = savedStrengthDraftRecovery();
  const restoreMarkup = savedDraft ? `
      <div class="empty-restore-row">
        <div>
          <strong>Unsaved strength draft</strong>
          <small>${escapeHtml(savedDraft.date || "Saved locally")}</small>
        </div>
        <button class="ghost-mini" type="button" data-action="restore-draft">Restore</button>
      </div>
    ` : "";
  return `
    <section class="empty log-empty-state">
      <h3>Add an exercise to start logging strength.</h3>
      <p class="muted small">${canAddExerciseTable ? "Add a library exercise, load a template, or copy Coach's plan before logging sets." : "Create a library exercise, load a template, or copy Coach's plan before logging sets."}</p>
      <button class="primary-button" type="button" data-action="${canAddExerciseTable ? "add-exercise-table" : "quick-add-exercise"}">Add exercise</button>
      ${restoreMarkup}
    </section>
  `;
}

function renderLog() {
  const templates = getDayTemplates();
  const draft = Array.isArray(state.workoutDraft) ? state.workoutDraft : [];
  const canAddExerciseTable = exerciseNames().length > 0;
  const lockLabel = draft.some((item) => item.editingWorkoutId) ? "Update workout" : "Lock in workout";
  if (state.logHistoryExercise) return exerciseHistoryScreen(state.logHistoryExercise);
  const metricDate = state.metricDate || todayISO();
  const metric = metricForDate(metricDate);
  const metricFormEntry = metricEntryForForm(metricDate);
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
            <button class="ghost-button" type="button" data-action="${canAddExerciseTable ? "add-exercise-table" : "quick-add-exercise"}">Add exercise</button>
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
            ${renderDateControl({ id: "workout-date", name: "date", label: "Date", value: state.draftDate || todayISO() })}
          </div>

          ${draft.length ? `
            <div class="exercise-draft-list">
              ${draft.map((item, index) => exerciseDraftTable(item, index, draft.length)).join("")}
            </div>

            <button class="primary-button lock-button" type="submit">${lockLabel}</button>
            <p class="muted micro form-note">Most hypertrophy work should stop 1-3 reps before failure. Keep the whole workout inside roughly ${SESSION_LIMIT_MINUTES} minutes.</p>
          ` : emptyStrengthLogMarkup(canAddExerciseTable)}
        </form>
      ` : `
        <form id="metric-form">
          ${renderDateControl({ id: "metric-date", name: "date", label: "Date", value: metricDate })}
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
    <details class="section form-panel collapsible-panel history-filter-panel" open>
      <summary><span>Search exercises</span><small>${exercises.length} match${exercises.length === 1 ? "" : "es"}</small></summary>
      <div class="field history-search-field">
        <label for="history-search">Search exercises</label>
        <input id="history-search" class="search-input" data-history-search value="${escapeHtml(state.historySearch)}" placeholder="Bench press, row, squat">
      </div>
    </details>

    <details class="section chart-panel collapsible-panel history-exercises-panel" open>
      <summary><span>Exercise records</span><small>${exercises.length} exercise${exercises.length === 1 ? "" : "s"}</small></summary>
      <div class="history-exercise-grid">
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
      </div>
    </details>
  `;
}

function renderHistoryDatesMode() {
  const recentDates = recentHistoryDates();
  const selectedDate = effectiveHistoryDate(recentDates);
  const dateWorkouts = selectedDate ? workoutsForDate(selectedDate) : [];
  return `
    <details class="section form-panel collapsible-panel history-date-panel" open>
      <summary><span>Browse by date</span><small>${selectedDate ? formatShortDate(selectedDate) : "no workouts"}</small></summary>
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
        ${renderDateControl({ id: "history-date", label: "Browse by date", value: selectedDate || todayISO(), className: "history-date-field", inputClass: "history-date-input", clearable: !!state.historyDate, required: false })}
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
    </details>
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

    <details class="section chart-panel collapsible-panel history-summary-panel" open>
      <summary><span>Exercise summary</span><small>${stats.sessions} session${stats.sessions === 1 ? "" : "s"}</small></summary>
      <div class="grid four history-summary-grid">
        <div class="stat"><span class="label">Sessions</span><strong class="value">${stats.sessions}</strong><span class="hint">${escapeHtml(stats.firstDate || "--")} to ${escapeHtml(stats.lastDate || "--")}</span></div>
        <div class="stat"><span class="label">Load volume</span><strong class="value">${fmt(stats.totalLoadVolume)}</strong><span class="hint">lb total tonnage</span></div>
        <div class="stat"><span class="label">Best set</span><strong class="value">${stats.bestSet ? `${fmt(stats.bestSet.weight, 1)} x ${fmt(stats.bestSet.reps)}` : "--"}</strong><span class="hint">${escapeHtml(stats.bestSet?.date || "No PR yet")}</span></div>
        <div class="stat"><span class="label">Best session</span><strong class="value">${fmt(stats.bestLoadVolume)}</strong><span class="hint">${escapeHtml(stats.bestLoadVolumeDate || "No tonnage yet")}</span></div>
      </div>
    </details>

    <section class="section grid two history-chart-grid">
      <details class="chart-panel collapsible-panel history-load-panel" open>
        <summary><span>Load volume</span><small>sets x reps x load</small></summary>
        ${lineChart(seriesFromWorkouts(exerciseName, workoutVolume), "#9b8cff", " lb")}
      </details>
      <details class="chart-panel collapsible-panel history-e1rm-panel" open>
        <summary><span>Estimated 1RM</span><small>best set estimate</small></summary>
        ${lineChart(seriesFromWorkouts(exerciseName, e1rm), "#ff6b5f", " lb")}
      </details>
    </section>

    <details class="section chart-panel collapsible-panel history-sessions-panel" open>
      <summary><span>Logged sessions</span><small>${entries.length} session${entries.length === 1 ? "" : "s"}</small></summary>
      <div class="history-session-list">
        ${entries.length ? entries.map((entry) => {
          const rows = setRowsFromWorkout(entry);
          return `
            <details class="history-session-card collapsible-panel">
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
      </div>
    </details>
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
  const bodyWeightSeries = seriesFromMetrics("bodyWeight");
  const bodyWeightAverageSeries = rollingAverageSeries(bodyWeightSeries, 7);
  const bodyWeightAverage = latestRollingAverage(bodyWeightSeries, 7);

  return `
    <details class="section trend-section collapsible-panel muscle-trends-panel" open>
      <summary><span>Muscle trends</span><small>${escapeHtml(selectedMuscleLabel)}</small></summary>
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
    </details>

    <details class="section trend-section collapsible-panel exercise-performance-panel" open>
      <summary><span>Exercise performance</span><small>${escapeHtml(selectedExercise || "No exercise")}</small></summary>
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
    </details>

    <details class="section trend-section collapsible-panel health-trends-panel" open>
      <summary><span>Health trends</span><small>${escapeHtml(health.goalLabel)}</small></summary>
      <div class="trend-section-header">
        <div>
          <h2>Health trends</h2>
          <p class="muted small">${escapeHtml(health.recommendation)}</p>
        </div>
      </div>
      ${healthCoachStatMarkup(health)}
      <div class="grid two">
        <div class="chart-panel">
          <div class="chart-header"><h3>Body weight</h3><span class="muted small">${bodyWeightAverage ? `${fmt(bodyWeightAverage, 1)} lb 7d avg` : "daily weight"}</span></div>
          ${lineChart(bodyWeightSeries, "#f2d06b", " lb", { comparisonPoints: bodyWeightAverageSeries, comparisonColor: "rgba(255,255,255,0.62)" })}
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
    </details>
  `;
}

function renderTodayPlan(plan) {
  const items = plan.sessionPlan.items;
  const muscles = [...new Set(items.map((item) => item.muscle.label))];
  return `
    <details class="section card coach-action featured-action today-plan-card collapsible-panel" open>
      <summary><span>Today's Plan</span><small>${plan.sessionPlan.totalMinutes || "--"} min</small></summary>
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
                ${item.planTarget ? `<span class="today-plan-target">${escapeHtml(item.planTarget.label)} - ${escapeHtml(item.planTarget.detail)}</span>` : ""}
                <div class="mini-action-row">
                  <button class="ghost-mini" type="button" data-action="log-exercise" data-exercise="${escapeHtml(item.exercise.name)}">Log</button>
                  <button class="ghost-mini" type="button" data-action="open-exercise-trend" data-exercise="${escapeHtml(item.exercise.name)}">Trend</button>
                  <button class="ghost-mini" type="button" data-action="open-exercise-history-global" data-exercise="${escapeHtml(item.exercise.name)}">History</button>
                </div>
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
    </details>
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

function renderCoachGrowthModeSelector() {
  const selected = selectedCoachGlobalGrowthMode();
  return `
    <section class="section card coach-growth-card">
      <div class="chart-header"><h3>Plan intensity</h3><span class="muted small">${escapeHtml(coachGrowthModeLabel(selected))}</span></div>
      <div class="coach-growth-mode-options coach-global-growth-options" aria-label="Coach plan intensity">
        ${COACH_GROWTH_MODE_OPTIONS.map((option) => `
          <button class="growth-mode-chip ${option.id === selected ? "is-active" : ""}" type="button" data-action="coach-global-growth-mode" data-growth-mode="${escapeHtml(option.id)}" aria-pressed="${option.id === selected}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCoachTargetSelector() {
  const selected = selectedCoachTargetMuscles();
  const selectedMuscles = muscleGroups.filter((muscle) => selected.includes(muscle.id));
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
      ${selectedMuscles.length ? `
        <div class="coach-growth-mode-list">
          ${selectedMuscles.map((muscle) => {
            const mode = coachGrowthModeForMuscle(muscle.id);
            return `
              <div class="coach-growth-mode-row">
                <span>${escapeHtml(muscle.label)}</span>
                <div class="coach-growth-mode-options" aria-label="${escapeHtml(`${muscle.label} growth mode`)}">
                  ${COACH_GROWTH_MODE_OPTIONS.map((option) => `
                    <button class="growth-mode-chip ${mode === option.id ? "is-active" : ""}" type="button" data-action="coach-growth-mode" data-muscle-id="${escapeHtml(muscle.id)}" data-growth-mode="${escapeHtml(option.id)}" aria-pressed="${mode === option.id}">
                      ${escapeHtml(option.label)}
                    </button>
                  `).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
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
    <details class="section card coach-why-card collapsible-panel" open>
      <summary><span>Why this?</span><small>readiness + gaps</small></summary>
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
    </details>
  `;
}

function renderCopiedCoachPlan() {
  const copied = activeCopiedCoachPlan();
  if (!copied) {
    return `
      <section class="section card coach-copied-plan-card compact-empty">
        <div class="chart-header">
          <h3>Next plan preview</h3>
          <span class="muted small">locked</span>
        </div>
        <p class="muted small">Copy today's plan to preview the next one.</p>
      </section>
    `;
  }
  const itemCount = copied.sessionPlan?.items?.length || 0;
  const preview = state.previewNextCoachPlan ? buildNextCoachPlanPreview(copied) : null;
  return `
    <section class="section card coach-copied-plan-card">
      <div class="chart-header">
        <h3>Copied plan</h3>
        <span class="muted small">${itemCount} lift${itemCount === 1 ? "" : "s"}</span>
      </div>
      <p class="muted small">${escapeHtml(copied.title || "Coach plan")} copied to Log. Return here to keep context while logging.</p>
      <div class="grid two">
        <button class="ghost-button" type="button" data-action="preview-next-coach-plan">Preview next plan</button>
        <button class="ghost-button" type="button" data-action="clear-copied-coach-plan">Clear copied plan</button>
      </div>
      ${preview ? `
        <div class="coach-next-preview">
          <strong>Next plan preview</strong>
          <p>${escapeHtml(preview.notice)}</p>
          ${preview.plan.sessionPlan.items.length ? preview.plan.sessionPlan.items.map((item) => `
            <div class="today-plan-item">
              <span><strong>${escapeHtml(item.exercise.name)}</strong> ${escapeHtml(item.muscle.label)} - ${escapeHtml(coachGrowthModeLabel(item.growthMode || "soft"))}</span>
              <span class="set-pill">${fmt(item.sets)} sets</span>
            </div>
          `).join("") : `<div class="empty compact-empty">No next session is needed if the copied plan fills current gaps.</div>`}
        </div>
      ` : ""}
    </section>
  `;
}

function renderCoach() {
  if (state.weeklyMuscleDetail?.returnTab === "coach") return weeklyMuscleDetailScreen();
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
    ${renderCoachGrowthModeSelector()}
    ${renderCoachTargetSelector()}
    ${renderCopiedCoachPlan()}
    ${renderTodayPlan(todayPlan)}
    ${renderCoachWhy(todayPlan)}
    <details class="section chart-panel collapsible-panel muscle-audit-panel" open>
      <summary><span>Muscle set audit</span><small>10 set floor, 12-20 growth zone</small></summary>
      ${muscleProgressMarkup(coachMuscleSetStats())}
    </details>
    <details class="section chart-panel collapsible-panel coach-notes-panel">
      <summary><span>Coach notes</span><small>secondary checks</small></summary>
      ${recs.map((rec) => `<div class="coach-card ${rec.tone}"><strong>${escapeHtml(rec.title)}</strong><p>${escapeHtml(rec.body)}</p></div>`).join("")}
    </details>
  `;
}

function renderAppBanner() {
  if (!state.appBanner) return "";
  const banner = state.appBanner;
  return `
    <section class="app-banner ${escapeHtml(banner.tone)}" role="status" aria-live="polite">
      <div>
        <strong>${escapeHtml(banner.message)}</strong>
        ${banner.detail ? `<p>${escapeHtml(banner.detail)}</p>` : ""}
      </div>
      <div class="app-banner-actions">
        ${banner.action && banner.actionLabel ? `<button class="ghost-mini" type="button" data-action="${escapeHtml(banner.action)}">${escapeHtml(banner.actionLabel)}</button>` : ""}
        <button class="icon-button" type="button" data-action="dismiss-banner" aria-label="Dismiss message">x</button>
      </div>
    </section>
  `;
}

function renderLogDraftNotice() {
  return "";
}

function syncLogDraftNoticeDom() {
  const existing = document.querySelector(".log-draft-notice");
  const markup = renderLogDraftNotice();
  if (!markup) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = markup;
    return;
  }
  els.app.insertAdjacentHTML("afterbegin", markup);
}

function renderScrollTopButton() {
  return `
    <button class="scroll-top-button" type="button" data-action="scroll-top" aria-label="Back to top">
      ↑
    </button>
  `;
}

function hideScrollTopButton() {
  window.clearTimeout(scrollTopTimer);
  scrollTopTimer = null;
  document.querySelector(".scroll-top-button")?.classList.remove("is-visible");
}

function updateScrollTopButton() {
  const button = document.querySelector(".scroll-top-button");
  if (!button) return;
  const doc = document.documentElement;
  const scrollY = window.scrollY || doc.scrollTop || 0;
  const tabbar = document.querySelector(".tabbar");
  const tabbarHeight = tabbar ? tabbar.getBoundingClientRect().height : 76;
  const buttonSize = button.getBoundingClientRect().height || 42;
  const offsetParent = button.offsetParent;
  const parentOffset = offsetParent ? scrollY + offsetParent.getBoundingClientRect().top : 0;
  const topOffset = scrollTopButtonTopOffset(scrollY, window.visualViewport || null, window.innerHeight || doc.clientHeight || 0, tabbarHeight, buttonSize, parentOffset);
  button.style.setProperty("--scroll-top-top", `${Math.round(topOffset)}px`);
  const shouldShow = scrollTopButtonShouldShow(scrollY, doc.scrollHeight, doc.clientHeight);
  if (!shouldShow) {
    hideScrollTopButton();
    return;
  }
  button.classList.add("is-visible");
  window.clearTimeout(scrollTopTimer);
  scrollTopTimer = window.setTimeout(() => {
    button.classList.remove("is-visible");
  }, 3000);
}

function renderImportPreview() {
  const pending = state.pendingImport;
  if (!pending) return "";
  const summary = pending.summary || {};
  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
      <div class="modal-panel import-preview-panel">
        <h2 id="import-preview-title">Review backup import</h2>
        <p class="muted small">${escapeHtml(pending.source || pending.fileName || "Backup file")} will replace local workout and nutrition data.</p>
        <div class="action-grid import-preview-grid">
          <span><strong>${fmt(summary.workouts || 0)}</strong> workouts</span>
          <span><strong>${fmt(summary.metrics || 0)}</strong> nutrition logs</span>
          <span><strong>${fmt(summary.customExercises || 0)}</strong> exercises</span>
          <span><strong>${escapeHtml(summary.newestDate || "--")}</strong> newest date</span>
        </div>
        <div class="grid two">
          <button class="primary-button" type="button" data-action="confirm-import">Replace local data</button>
          <button class="ghost-button" type="button" data-action="cancel-import">Cancel</button>
        </div>
      </div>
    </section>
  `;
}

function renderAppChrome() {
  return `${renderAppBanner()}${renderImportPreview()}${renderLogDraftNotice()}`;
}

function dataSafetySummaryMarkup() {
  const pending = state.syncQueue.filter((entry) => entry.status === "pending").length;
  const conflicts = syncConflictCount();
  return `
    <div class="data-safety-grid">
      <span><strong>${escapeHtml(formatDateTime(state.settings.lastBackupAt))}</strong><small>last local backup</small></span>
      <span><strong>${escapeHtml(formatDateTime(state.settings.lastRecordSyncAt))}</strong><small>last cloud sync</small></span>
      <span><strong>${fmt(pending)}</strong><small>changes queued</small></span>
      <span><strong>${fmt(conflicts)}</strong><small>sync conflicts</small></span>
      <span><strong>v${escapeHtml(APP_VERSION)}</strong><small>installed shell</small></span>
    </div>
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

function renderRecordSyncConflicts() {
  const conflicts = state.syncQueue.filter((entry) => entry.status === "conflict");
  if (!conflicts.length) return "";
  return `
    <div class="notice-card sync-conflict-list" role="status">
      <strong>Sync review needed</strong>
      <p class="muted micro">The same saved record changed on two devices. Both versions are preserved.</p>
      ${conflicts.map((entry) => `
        <div class="sync-conflict-item">
          <span><strong>${escapeHtml(entry.recordType)}</strong><small>${escapeHtml(entry.recordId)}</small></span>
          <div class="button-row compact-actions">
            <button class="ghost-mini" type="button" data-action="resolve-sync-conflict" data-sync-id="${escapeHtml(entry.id)}" data-choice="local">Keep this device</button>
            <button class="ghost-mini" type="button" data-action="resolve-sync-conflict" data-sync-id="${escapeHtml(entry.id)}" data-choice="cloud">Use cloud</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
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

function renderDashboardWidgetSelector() {
  const enabled = selectedDashboardWidgets();
  const order = dashboardWidgetOrder();
  return `
    <div class="widget-preference-list">
      ${order.map((id, index) => {
        const option = TODAY_WIDGET_OPTIONS.find((item) => item.id === id);
        if (!option) return "";
        const active = enabled.includes(id);
        return `
          <div class="widget-preference-row ${active ? "is-active" : ""}">
            <button class="pill widget-toggle ${active ? "is-active" : ""}" type="button" data-action="toggle-dashboard-widget" data-widget-id="${escapeHtml(id)}" aria-pressed="${active}">
              ${active ? "Shown" : "Hidden"}
            </button>
            <strong>${escapeHtml(option.label)}</strong>
            <div class="reorder-arrows compact-reorder">
              <button type="button" aria-label="Move ${escapeHtml(option.label)} up" data-action="move-dashboard-widget" data-widget-id="${escapeHtml(id)}" data-widget-direction="-1" ${index === 0 ? "disabled" : ""}>&#9650;</button>
              <button type="button" aria-label="Move ${escapeHtml(option.label)} down" data-action="move-dashboard-widget" data-widget-id="${escapeHtml(id)}" data-widget-direction="1" ${index === order.length - 1 ? "disabled" : ""}>&#9660;</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function settingsPanelIdFromTitle(title) {
  return String(title || "panel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "panel";
}

function isSettingsPanelOpen(panelId) {
  return Array.isArray(state.settingsOpenPanels) && state.settingsOpenPanels.includes(panelId);
}

function setSettingsPanelOpen(panelId, open) {
  if (!panelId) return;
  if (!Array.isArray(state.settingsOpenPanels)) state.settingsOpenPanels = [];
  const panels = new Set(state.settingsOpenPanels);
  if (open) panels.add(panelId);
  else panels.delete(panelId);
  state.settingsOpenPanels = [...panels];
}

function forceSettingsPanelOpen(panelId) {
  setSettingsPanelOpen(panelId, true);
}

function renderSettingsPanel(title, detail, body, options = {}) {
  const panelId = options.id || settingsPanelIdFromTitle(title);
  const open = options.open || isSettingsPanelOpen(panelId);
  return `
    <details class="section settings-panel collapsible-panel" data-settings-panel="${escapeHtml(panelId)}" ${open ? "open" : ""}>
      <summary><span>${escapeHtml(title)}</span><small>${escapeHtml(detail)}</small></summary>
      ${body}
    </details>
  `;
}

async function renderSettings() {
  const estimate = await storageEstimateMarkup();
  const sampleWorkouts = state.workouts.filter(isSampleEntry).length;
  const sampleMetrics = state.metrics.filter(isSampleEntry).length;
  return `
    ${renderSettingsPanel("Hypertrophy defaults", "training rules", `
      <div class="settings-list">
        <span>Weekly floor <strong>${HYPERTROPHY.minimumSets} hard sets/muscle</strong></span>
        <span>Growth zone <strong>${HYPERTROPHY.growthLow}-${HYPERTROPHY.growthHigh} sets</strong></span>
        <span>Effort target <strong>${HYPERTROPHY.idealRirMin}-${HYPERTROPHY.idealRirMax} RIR</strong></span>
        <span>Protein floor <strong>${HYPERTROPHY.proteinFloorGPerKg} g/kg/day</strong></span>
      </div>
      <p class="muted small">This is training guidance for personal tracking, not medical advice.</p>
    `, { id: "hypertrophy-defaults" })}

    ${renderSettingsPanel("Nutrition goal", nutritionGoalLabel(selectedNutritionGoal()), `
      <p class="muted small">Coach uses this to interpret calories and body-weight trend.</p>
      ${renderNutritionGoalSelector()}
    `, { id: "nutrition-goal" })}

    ${renderSettingsPanel("Today widgets", `${selectedDashboardWidgets().length} shown`, `
      <p class="muted small">Choose what appears below the Today summary and put the most useful cards first.</p>
      ${renderDashboardWidgetSelector()}
    `, { id: "today-widgets" })}

    ${renderSettingsPanel("Data safety", "backup status", `
      <p class="muted small">A quick confidence check before imports, cloud sync, or app updates.</p>
      ${dataSafetySummaryMarkup()}
    `, { id: "data-safety" })}

    ${renderSettingsPanel("Troubleshooting", "Coach debug", `
      <p class="muted small">Export a safe diagnostic report when Coach advice looks wrong. It separates submitted workouts from unsaved drafts and never includes sync secrets.</p>
      <button class="ghost-button full-button" type="button" data-action="export-coach-debug">Export Coach debug report</button>
    `, { id: "troubleshooting" })}

    ${renderSettingsPanel("Storage", "backup/import", `
      ${estimate}
      <div class="grid two">
        <button class="primary-button" type="button" data-action="export-data">Export backup</button>
        <button class="ghost-button" type="button" data-action="import-click">Import backup</button>
      </div>
      <input class="hidden" id="import-file" type="file" accept="application/json">
    `, { id: "storage" })}

    ${renderSettingsPanel("Sample chart data", sampleWorkouts + sampleMetrics ? `${sampleWorkouts} lifts/metrics loaded` : "optional", `
      <p class="muted small">${sampleWorkouts + sampleMetrics ? `${sampleWorkouts} sample lifts and ${sampleMetrics} sample metrics are loaded.` : "Load demo logs to test every chart and recommendation without touching your real backups."}</p>
      <div class="grid two">
        <button class="primary-button" type="button" data-action="load-sample-data">Load sample data</button>
        <button class="ghost-button" type="button" data-action="remove-sample-data">Remove sample data</button>
      </div>
    `, { id: "sample-chart-data" })}

    ${renderSettingsPanel("App update", `v${APP_VERSION}`, `
      <div class="settings-list">
        <span>Installed shell <strong>v${APP_VERSION}</strong></span>
      </div>
      <p class="muted small">Refresh the app shell if iPhone Safari keeps showing an older screen. This clears cached app files only; workouts and metrics stay in browser storage.</p>
      <button class="ghost-button full-button" type="button" data-action="refresh-app-shell">Refresh app shell</button>
    `, { id: "app-update" })}

    ${renderSettingsPanel("Supabase sync", supabaseStatus(), `
      <p class="muted small">Status: ${escapeHtml(supabaseStatus())}</p>
      <p class="muted small">Record sync: <strong data-record-sync-status>${escapeHtml(syncStatusText())}</strong></p>
      <p class="muted micro">Completed logs sync automatically. Unsaved strength and nutrition drafts stay on this device.</p>
      ${renderRecordSyncConflicts()}
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
          <p class="muted micro">Stored only in this browser on this device. Backups and exports never include it.</p>
        </div>
      <div class="grid two">
        <button class="ghost-button" type="button" data-action="save-supabase">Save settings</button>
        <button class="ghost-button" type="button" data-action="signup-supabase">Create account</button>
        <button class="primary-button" type="button" data-action="signin-supabase">Sign in</button>
        <button class="ghost-button" type="button" data-action="push-supabase-sync">Push to cloud</button>
        <button class="ghost-button" type="button" data-action="pull-supabase-sync">Pull from cloud</button>
      </div>
      <details class="inline-disclosure">
        <summary>Legacy cloud recovery</summary>
        <p class="muted micro">Review and restore snapshots created by older TrainWise versions.</p>
        <button class="ghost-button" type="button" data-action="pull-supabase">Review latest legacy backup</button>
      </details>
    `, { id: "supabase-sync" })}

    ${renderSettingsPanel("Danger zone", "destructive", `
      <p class="muted small">Export a backup before clearing data.</p>
      <button class="danger-button" type="button" data-action="clear-all">Clear local data</button>
    `, { id: "danger-zone" })}
  `;
}

function applyStaggerAnimations() {
  const animated = els.app.querySelectorAll(".card, .chart-panel, .stat, .coach-card, .exercise-definition, .exercise-draft, .coverage-row, .history-exercise-card, .history-session-card, .form-panel, .settings-panel");
  animated.forEach((element, index) => {
    element.style.setProperty("--i", String(Math.min(index, 12)));
  });
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function directCollapseSummary(panel) {
  return Array.from(panel?.children || []).find((child) => child.tagName?.toLowerCase?.() === "summary") || null;
}

function ensureCollapseContent(panel) {
  const summary = directCollapseSummary(panel);
  if (!summary) return null;
  let content = Array.from(panel.children).find((child) => child.classList?.contains("collapse-content"));
  if (!content) {
    content = document.createElement("div");
    content.className = "collapse-content";
    let node = summary.nextSibling;
    while (node) {
      const next = node.nextSibling;
      content.appendChild(node);
      node = next;
    }
    panel.appendChild(content);
  }
  panel.classList.add("collapse-enhanced");
  return { summary, content };
}

function flashCollapseBorder(panel, opening) {
  if (prefersReducedMotion()) return;
  clearTimeout(panel._collapseFlashTimer);
  panel.classList.remove("collapse-flash-open", "collapse-flash-close");
  void panel.offsetWidth;
  panel.classList.add(opening ? "collapse-flash-open" : "collapse-flash-close");
  panel._collapseFlashTimer = setTimeout(() => {
    panel.classList.remove("collapse-flash-open", "collapse-flash-close");
  }, 420);
}

function triggerCollapseDataReveal(panel) {
  if (prefersReducedMotion()) return;
  const lines = panel.querySelectorAll("svg polyline");
  const progressBars = panel.querySelectorAll(".progress-bar span");
  const muscleRows = panel.querySelectorAll(".muscle-card");
  if (!lines.length && !progressBars.length && !muscleRows.length) return;

  lines.forEach((line) => {
    try {
      line.style.setProperty("--collapse-line-length", String(Math.max(1, line.getTotalLength())));
    } catch {
      line.style.setProperty("--collapse-line-length", "100");
    }
  });
  muscleRows.forEach((row, index) => row.style.setProperty("--reveal-i", String(Math.min(index, 10))));
  clearTimeout(panel._collapseRevealTimer);
  panel.classList.remove("is-data-revealing");
  void panel.offsetWidth;
  panel.classList.add("is-data-revealing");
  panel._collapseRevealTimer = setTimeout(() => panel.classList.remove("is-data-revealing"), COLLAPSE_REVEAL_MS);
}

function finishCollapseAnimation(panel, content, opening) {
  if (!opening) panel.open = false;
  content.style.removeProperty("height");
  content.style.removeProperty("opacity");
  content.style.removeProperty("transform");
  panel.classList.remove("is-collapse-animating");
  delete panel.dataset.collapseTarget;
  delete panel._collapseAnimationTimer;
}

function animateCollapsiblePanel(panel, opening) {
  const parts = ensureCollapseContent(panel);
  if (!parts) return;
  const { content } = parts;
  clearTimeout(panel._collapseAnimationTimer);
  panel.dataset.collapseTarget = String(opening);
  flashCollapseBorder(panel, opening);

  if (prefersReducedMotion()) {
    panel.open = opening;
    finishCollapseAnimation(panel, content, opening);
    return;
  }

  const currentHeight = panel.open ? content.getBoundingClientRect().height : 0;
  if (opening && !panel.open) panel.open = true;
  content.style.height = `${currentHeight}px`;
  content.style.opacity = currentHeight > 0 ? "1" : "0";
  content.style.transform = currentHeight > 0 ? "translateY(0)" : "translateY(-8px)";
  panel.classList.add("is-collapse-animating");

  requestAnimationFrame(() => {
    content.style.height = opening ? `${content.scrollHeight}px` : "0px";
    content.style.opacity = opening ? "1" : "0";
    content.style.transform = opening ? "translateY(0)" : "translateY(-8px)";
    if (opening) triggerCollapseDataReveal(panel);
  });

  panel._collapseAnimationTimer = setTimeout(
    () => finishCollapseAnimation(panel, content, opening),
    COLLAPSE_ANIMATION_MS
  );
}

function initializeCollapsiblePanels(root = els.app) {
  root.querySelectorAll(COLLAPSIBLE_SELECTOR).forEach((panel) => ensureCollapseContent(panel));
}

function handleCollapsibleSummaryClick(event) {
  const summary = event.target.closest?.("summary");
  if (!summary) return;
  const panel = summary.parentElement;
  if (!panel?.matches?.(COLLAPSIBLE_SELECTOR) || summary.parentElement !== panel) return;
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const pendingTarget = panel.dataset.collapseTarget;
  const opening = pendingTarget ? pendingTarget !== "true" : !panel.open;
  animateCollapsiblePanel(panel, opening);
}

async function flashSelection(target) {
  const element = target?.closest?.(".history-exercise-card, .exercise-definition, .exercise-draft, .history-session-card, button");
  if (!element) return;
  element.classList.add("is-selecting");
  await sleep(90);
}

function focusExerciseEditForm() {
  const target = document.querySelector("[data-edit-focus-target]");
  const input = document.getElementById("exercise-name");
  target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  target?.classList?.add?.("is-selecting");
  input?.focus?.();
  input?.select?.();
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

  let screen = "";
  if (state.activeTab === "dashboard") screen = renderDashboard();
  if (state.activeTab === "log") screen = renderLog();
  if (state.activeTab === "trends") screen = renderTrends();
  if (state.activeTab === "coach") screen = renderCoach();
  if (state.activeTab === "exercises") screen = renderExercises();
  if (state.activeTab === "history") screen = renderHistory();
  if (state.activeTab === "settings") screen = await renderSettings();
  els.app.innerHTML = `${renderAppChrome()}${screen}`;
  if (token !== renderToken) return;
  els.app.classList.remove("content-exit", "content-enter");
  if (animate) els.app.classList.add("content-enter");
  initializeCollapsiblePanels();
  applyStaggerAnimations();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateScrollTopButton);
  else updateScrollTopButton();
}

function validScrollY(value) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : 0;
}

function currentScrollY() {
  return validScrollY(window.scrollY ?? document.documentElement?.scrollTop ?? document.body?.scrollTop ?? 0);
}

function pushReturnContext(kind, extra = {}) {
  const context = {
    kind,
    activeTab: state.activeTab,
    scrollY: currentScrollY(),
    historyMode: state.historyMode,
    historyExercise: state.historyExercise,
    historyDate: state.historyDate,
    logHistoryExercise: state.logHistoryExercise,
    weeklyMuscleDetail: state.weeklyMuscleDetail ? { ...state.weeklyMuscleDetail } : null,
    selectedExercise: state.selectedExercise,
    selectedMuscle: state.selectedMuscle,
    ...extra
  };
  const stack = Array.isArray(state.returnStack) ? state.returnStack : [];
  state.returnStack = [...stack, context].slice(-8);
  return context;
}

function popReturnContext(kind) {
  const stack = Array.isArray(state.returnStack) ? [...state.returnStack] : [];
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (!kind || stack[index].kind === kind) {
      const [context] = stack.splice(index, 1);
      state.returnStack = stack;
      return context;
    }
  }
  return null;
}

function clearReturnContexts() {
  state.returnStack = [];
}

function restoreReturnViewContext(context) {
  if (!context) return;
  if (context.activeTab) state.activeTab = context.activeTab;
  state.historyMode = context.historyMode || "exercises";
  state.historyExercise = context.historyExercise || "";
  state.historyDate = context.historyDate || "";
  state.logHistoryExercise = context.logHistoryExercise || "";
  state.weeklyMuscleDetail = context.weeklyMuscleDetail || null;
  if (typeof context.selectedExercise === "string") state.selectedExercise = context.selectedExercise;
  if (typeof context.selectedMuscle === "string") state.selectedMuscle = context.selectedMuscle;
}

function restoreScrollAfterRender(y) {
  const top = validScrollY(y);
  const restore = () => window.scrollTo?.({ top, left: 0, behavior: "auto" });
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
  else setTimeout(restore, 0);
}

async function renderWithReturnScroll(context, options = { animate: true }) {
  await render(options);
  restoreScrollAfterRender(context?.scrollY);
}

async function saveExercise(form) {
  const formData = new FormData(form);
  const validation = validateExerciseFormInput(formData);
  if (!validation.ok) {
    state.exerciseFormDraft = validation.values;
    state.exerciseFormErrors = validation.errors;
    await render();
    toast("Fix exercise fields.");
    return;
  }
  const customExercises = getCustomExercises({ includeArchived: true });
  const existing = customExercises.find((exercise) => exercise.id === state.editingExerciseId);
  const exercise = normalizeExerciseDefinition({
    id: existing?.id || `user-${uid()}`,
    ...validation.exercise,
    archivedAt: existing?.archivedAt || "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const nextExercises = existing
    ? customExercises.map((item) => item.id === existing.id ? exercise : item)
    : [...customExercises, exercise];

  await saveSetting("customExercises", nextExercises);
  await queueSyncChange("exercise", exercise.id, exercise);
  scheduleRecordSync();
  state.editingExerciseId = null;
  state.exerciseFormDraft = null;
  state.exerciseFormErrors = {};
  state.selectedExercise = exercise.name;
  state.draftTargetMuscle = exercise.primaryMuscles[0] || "chest";
  clearDraftRecoveryScope("exercise");
  announce(existing ? "Exercise updated." : "Exercise saved.", { tone: "good" });
  await render();
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

  const staleWorkoutIds = staleWorkoutIdsForSavedDraft(data.date, entries);
  const undoPayload = workoutSaveUndoPayload(entries, staleWorkoutIds);
  setUndoAction(hadExisting ? "Undo workout update" : "Undo workout lock-in", undoPayload);
  await dbPutBatch("workouts", entries);
  await Promise.all(staleWorkoutIds.map((id) => dbDelete("workouts", id)));
  for (const entry of entries) await queueSyncChange("workout", entry.id, entry);
  for (const id of staleWorkoutIds) await queueSyncChange("workout", id, null, { deleted: true });
  scheduleRecordSync();
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
  state.loadedWorkoutDateIds = entries.map((entry) => entry.id).filter(Boolean);
  await loadState();
  clearDraftRecoveryScope("strength");
  announce(hadExisting ? "Workout updated." : "Workout locked in.", {
    tone: "good",
    detail: "Charts updated. Undo is available if this was accidental.",
    action: "undo-last-action",
    actionLabel: "Undo"
  });
  await render();
}

async function saveMetric(form) {
  const data = Object.fromEntries(new FormData(form));
  const date = data.date || todayISO();
  const existing = metricForDate(date);
  const entry = metricEntryFromFormData(data, existing);
  const duplicateIds = metricDuplicateIdsForDate(date, entry.id);
  await dbPut("metrics", entry);
  await Promise.all(duplicateIds.map((id) => dbDelete("metrics", id)));
  await queueSyncChange("metric", date, entry);
  scheduleRecordSync();
  await loadState();
  state.metricDate = date;
  state.metricFormDraft = null;
  clearDraftRecoveryScope("metric");
  clearLogDraftNotice();
  notifyMetricSaved(existing);
  await render();
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
  announce("Sample data loaded.", { tone: "good", detail: "Sample entries can be removed from Settings." });
  await render();
}

async function removeSampleData() {
  await deleteSampleEntries();
  await saveSetting("sampleDataLoadedAt", null);
  await loadState();
  announce("Sample data removed.", { tone: "good" });
  await render();
}

function exportSafeSettings() {
  return {
    hypertrophyProfile: hypertrophySettings(),
    nutritionGoal: selectedNutritionGoal(),
    dayTemplates: getDayTemplates(),
    customExercises: getCustomExercises({ includeArchived: true }),
    dashboardWidgets: selectedDashboardWidgets(),
    dashboardWidgetOrder: dashboardWidgetOrder(),
    lastBackupAt: new Date().toISOString(),
    lastCloudPushAt: String(state.settings.lastCloudPushAt || ""),
    lastCloudPullAt: String(state.settings.lastCloudPullAt || "")
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

function debugViewportInfo() {
  const root = document.documentElement || {};
  const visual = window.visualViewport || {};
  return {
    width: Number(window.innerWidth || visual.width || root.clientWidth || 0),
    height: Number(window.innerHeight || visual.height || root.clientHeight || 0),
    scrollWidth: Number(root.scrollWidth || 0),
    clientWidth: Number(root.clientWidth || 0)
  };
}

function workoutDebugSummary(workout) {
  const rows = setRowsFromWorkout(workout);
  return {
    id: workout.id || "",
    date: workout.date || "",
    exercise: workout.exercise || "",
    exerciseId: workout.exerciseId || "",
    primaryMuscles: workoutMeta(workout).primaryMuscles || [],
    secondaryMuscles: workoutMeta(workout).secondaryMuscles || [],
    sets: rows.length,
    setRows: rows,
    hardSets: hardSetCount(workout),
    volume: workoutVolume(workout),
    e1rm: e1rm(workout),
    bestSet: bestSet(workout),
    averageRir: averageRir(workout),
    restSeconds: averageRestSeconds(workout),
    order: Number.isFinite(Number(workout.order)) ? Number(workout.order) : null,
    pendingDraft: Boolean(workout.pendingDraft),
    editingWorkoutId: workout.editingWorkoutId || null,
    notes: workout.notes || ""
  };
}

function coachDebugPlanSummary(plan) {
  const sessionPlan = plan.sessionPlan || {};
  return {
    mode: plan.mode,
    title: plan.title,
    subtitle: plan.subtitle,
    totalMinutes: sessionPlan.totalMinutes || 0,
    limitMinutes: sessionPlan.limitMinutes || selectedCoachTimeframeMinutes(),
    targetFloorMinutes: sessionPlan.targetFloorMinutes || 0,
    hardLimitMinutes: sessionPlan.hardLimitMinutes || 0,
    restart: Boolean(sessionPlan.restart),
    shortfallReason: sessionPlan.shortfallReason || "",
    contractNotes: sessionPlan.contractNotes || [],
    items: (sessionPlan.items || []).map((item) => ({
      muscle: item.muscle?.label || "",
      muscleId: item.muscle?.id || "",
      exercise: item.exercise?.name || "",
      exerciseId: item.exercise?.id || "",
      sets: item.sets,
      minutes: item.minutes,
      phase: item.phase,
      growthMode: item.growthMode,
      reason: item.reason,
      planTarget: item.planTarget ? {
        kind: item.planTarget.kind,
        label: item.planTarget.label,
        detail: item.planTarget.detail,
        tone: item.planTarget.tone,
        message: item.planTarget.message || ""
      } : null,
      performanceSignal: item.performanceSignal ? {
        status: item.performanceSignal.status,
        tone: item.performanceSignal.tone,
        message: item.performanceSignal.message,
        progressEvidence: item.performanceSignal.progressEvidence || null,
        latest: item.performanceSignal.latest ? workoutDebugSummary(item.performanceSignal.latest) : null,
        previous: item.performanceSignal.previous ? workoutDebugSummary(item.performanceSignal.previous) : null
      } : null
    })),
    missing: (sessionPlan.missing || []).map((muscle) => ({ id: muscle.id, label: muscle.label })),
    deprioritized: (sessionPlan.deprioritized || []).map((item) => ({
      muscle: item.muscle?.label || "",
      muscleId: item.muscle?.id || "",
      reason: item.reason
    })),
    performanceNotes: sessionPlan.performanceNotes || [],
    why: plan.why || [],
    explanation: plan.explanation || {},
    notes: plan.notes || []
  };
}

function coachDebugModeComparison() {
  const originalMode = state.coachGlobalGrowthMode;
  const originalGrowthModes = state.coachGrowthModes && typeof state.coachGrowthModes === "object"
    ? { ...state.coachGrowthModes }
    : {};
  const targetGrowthModes = selectedCoachGrowthModes(selectedCoachTargetMuscles());
  try {
    const comparisons = Object.fromEntries(COACH_GROWTH_MODE_OPTIONS.map((option) => {
      state.coachGlobalGrowthMode = option.id;
      state.coachGrowthModes = { ...targetGrowthModes };
      const plan = buildTodayPlan(selectedCoachTimeframeMinutes());
      const summary = coachDebugPlanSummary(plan);
      return [option.id, {
        mode: option.id,
        label: option.label,
        totalMinutes: summary.totalMinutes,
        limitMinutes: summary.limitMinutes,
        totalSets: summary.items.reduce((sum, item) => sum + (Number(item.sets) || 0), 0),
        itemCount: summary.items.length,
        items: summary.items.map((item) => ({
          muscle: item.muscle,
          muscleId: item.muscleId,
          exercise: item.exercise,
          exerciseId: item.exerciseId,
          sets: item.sets,
          minutes: item.minutes,
          phase: item.phase,
          growthMode: item.growthMode,
          reason: item.reason,
          planTarget: item.planTarget,
          performanceStatus: item.performanceSignal?.status || ""
        })),
        missing: summary.missing,
        deprioritized: summary.deprioritized,
        performanceNotes: summary.performanceNotes,
        contractNotes: summary.contractNotes,
        shortfallReason: summary.shortfallReason,
        why: summary.why,
        notes: summary.notes
      }];
    }));
    if (comparisons.aggressive && comparisons.medium) {
      const aggressivePlan = {
        ...comparisons.aggressive,
        items: comparisons.aggressive.items.map((item) => ({
          ...item,
          muscle: { id: item.muscleId, label: item.muscle, sets: 0 },
          sets: Number(item.sets) || 0
        })),
        totalMinutes: comparisons.aggressive.totalMinutes,
        hardLimitMinutes: (comparisons.aggressive.limitMinutes || selectedCoachTimeframeMinutes()) + COACH_TIME_TOLERANCE_MINUTES,
        performanceNotes: comparisons.aggressive.performanceNotes,
        missing: comparisons.aggressive.missing,
        deprioritized: comparisons.aggressive.deprioritized
      };
      const mediumPlan = {
        ...comparisons.medium,
        items: comparisons.medium.items.map((item) => ({
          ...item,
          muscle: { id: item.muscleId, label: item.muscle, sets: 0 },
          sets: Number(item.sets) || 0
        })),
        totalMinutes: comparisons.medium.totalMinutes,
        hardLimitMinutes: (comparisons.medium.limitMinutes || selectedCoachTimeframeMinutes()) + COACH_TIME_TOLERANCE_MINUTES,
        performanceNotes: comparisons.medium.performanceNotes,
        missing: comparisons.medium.missing,
        deprioritized: comparisons.medium.deprioritized
      };
      comparisons.aggressive.limitingReason = aggressivePlanLimitingReason(aggressivePlan, mediumPlan);
    }
    return comparisons;
  } finally {
    state.coachGlobalGrowthMode = originalMode;
    state.coachGrowthModes = originalGrowthModes;
  }
}

function coachDebugMuscleAudit(context = coachPlanningContext()) {
  return context.rankedStats.map((stat, index) => ({
    rank: index + 1,
    id: stat.id,
    label: stat.label,
    sets: stat.sets,
    sessions: stat.sessions,
    deficit: stat.deficit,
    readiness: stat.readiness,
    reason: stat.reason,
    daysSince: stat.daysSince,
    primaryDaysSince: stat.primaryDaysSince,
    secondaryDaysSince: stat.secondaryDaysSince,
    growthMode: coachGrowthModeForMuscle(stat.id),
    targetMuscle: isCoachTargetMuscle(stat.id),
    floorGap: Math.max(0, HYPERTROPHY.minimumSets - stat.sets),
    growthGap: Math.max(0, HYPERTROPHY.growthHigh - stat.sets),
    planGap: planSetGap(stat, false, coachGrowthModeForMuscle(stat.id)),
    hasPrimaryExercise: hasPrimaryExerciseForMuscle(stat.id)
  }));
}

function coachDebugLibraryCoverage() {
  const active = exerciseDatabase();
  const archived = getCustomExercises({ includeArchived: true }).filter((exercise) => exercise.archivedAt);
  return muscleGroups.map((muscle) => ({
    id: muscle.id,
    label: muscle.label,
    activePrimary: active
      .filter((exercise) => exercise.primaryMuscles.includes(muscle.id))
      .map((exercise) => ({ id: exercise.id, name: exercise.name })),
    archivedPrimary: archived
      .filter((exercise) => exercise.primaryMuscles.includes(muscle.id))
      .map((exercise) => ({ id: exercise.id, name: exercise.name, archivedAt: exercise.archivedAt }))
  }));
}

function recentDebugWorkouts(days = 120) {
  return workoutsNewestFirst(state.workouts.filter((entry) => !isSampleEntry(entry)))
    .filter((entry) => {
      const age = daysBetween(entry.date, todayISO());
      return age === null || age <= days;
    })
    .map(workoutDebugSummary);
}

function recentDebugMetrics(days = 30) {
  return canonicalMetricEntries(state.metrics.filter((entry) => !isSampleEntry(entry)))
    .filter((entry) => {
      const age = daysBetween(entry.date, todayISO());
      return age === null || age <= days;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildCoachDebugReport() {
  const planningContext = coachPlanningContext();
  const todayPlan = buildTodayPlan(selectedCoachTimeframeMinutes());
  const copiedPlan = activeCopiedCoachPlan();
  const draftOnlyEntries = coachPendingWorkoutEntries().map(workoutDebugSummary);
  return {
    app: "TrainWise Coach Debug Report",
    reportVersion: 1,
    notBackup: true,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    runtime: {
      today: todayISO(),
      trainingWeekStart: isoFromLocalDate(currentTrainingWeekStart()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      activeTab: state.activeTab,
      logMode: state.logMode,
      strengthDate: state.draftDate,
      metricDate: state.metricDate,
      selectedExercise: state.selectedExercise,
      viewport: debugViewportInfo()
    },
    settings: {
      safe: exportSafeSettings(),
      coach: {
        timeframeMinutes: selectedCoachTimeframeMinutes(),
        timeframeLabel: coachTimeframeLabel(),
        globalGrowthMode: selectedCoachGlobalGrowthMode(),
        targetMuscles: selectedCoachTargetMuscles(),
        growthModes: selectedCoachGrowthModes(),
        copiedPlanDate: copiedPlan?.copiedDate || ""
      },
      sync: {
        configured: Boolean(state.settings.supabaseUrl),
        email: state.settings.supabaseEmail || "",
        status: supabaseStatus()
      }
    },
    coach: {
      todayPlan: coachDebugPlanSummary(todayPlan),
      copiedPlan: copiedPlan ? coachDebugPlanSummary(copiedPlan) : null,
      modeComparison: coachDebugModeComparison(),
      muscleAudit: coachDebugMuscleAudit(planningContext),
      libraryCoverage: coachDebugLibraryCoverage()
    },
    submitted: {
      workoutCount: state.workouts.filter((entry) => !isSampleEntry(entry)).length,
      recentWorkouts: recentDebugWorkouts()
    },
    draftOnly: {
      date: state.draftDate,
      entries: draftOnlyEntries,
      rawDrafts: (state.workoutDraft || []).map((draft) => ({
        draftId: draft.draftId || "",
        editingWorkoutId: draft.editingWorkoutId || null,
        exercise: draft.exercise || "",
        targetMuscle: draft.targetMuscle || "",
        notes: draft.notes || "",
        setRows: normalizeSetRows(draft.setRows)
      }))
    },
    nutrition: {
      summary: healthCoachSummary(),
      recentMetrics: recentDebugMetrics()
    }
  };
}

async function downloadCoachDebugReport() {
  const payload = buildCoachDebugReport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trainwise-debug-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  announce("Coach debug report exported.", { tone: "good", detail: "Safe diagnostic file only; it is not a backup." });
}

function backupImportSummary(payload) {
  const normalized = normalizeBackupPayload(payload);
  const dates = [
    ...normalized.workouts.map((entry) => entry.date),
    ...normalized.metrics.map((entry) => entry.date)
  ].filter(Boolean).sort();
  return {
    workouts: normalized.workouts.length,
    metrics: normalized.metrics.length,
    customExercises: normalized.settings.customExercises.length,
    newestDate: dates[dates.length - 1] || "",
    normalized
  };
}

async function downloadBackup() {
  const payload = exportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trainwise-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await saveSetting("lastBackupAt", payload.exportedAt);
  announce("Backup exported.", { tone: "good", detail: "Local browser data is still unchanged." });
  await render();
}

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = parseLocalDate(value);
  return !Number.isNaN(parsed.getTime()) && isoFromLocalDate(parsed) === value;
}

function normalizeBackupWorkout(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Backup contains an invalid workout entry.");
  if (!isValidISODate(entry.date)) throw new Error("Backup contains a workout with an invalid date.");
  const exerciseName = String(entry.exercise || "").trim();
  if (!exerciseName) throw new Error("Backup contains a workout without an exercise name.");
  const meta = resolveExerciseMeta(exerciseName, entry.primaryMuscles?.[0] || entry.targetMuscle || "chest");
  const setRows = normalizeSetRows(setRowsFromWorkout(entry));
  const best = setRows.reduce((winner, row) => {
    const score = row.weight * (1 + row.reps / 30);
    return !winner || score > winner.score ? { ...row, score } : winner;
  }, null);
  const primaryMuscles = uniqueMuscles(entry.primaryMuscles || meta.primaryMuscles);
  const secondaryMuscles = uniqueMuscles(entry.secondaryMuscles || meta.secondaryMuscles)
    .filter((muscle) => !primaryMuscles.includes(muscle));
  return {
    ...entry,
    id: String(entry.id || uid()),
    date: entry.date,
    exercise: exerciseName,
    exerciseId: String(entry.exerciseId || meta.id),
    primaryMuscles: primaryMuscles.length ? primaryMuscles : [...meta.primaryMuscles],
    secondaryMuscles,
    equipment: String(entry.equipment || meta.equipment || "custom"),
    setRows,
    sets: setRows.length,
    reps: best?.reps || 1,
    weight: best?.weight || 0,
    rir: averageRir({ setRows }),
    notes: String(entry.notes || "").trim(),
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : undefined,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  };
}

function normalizeBackupMetric(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Backup contains an invalid metric entry.");
  if (!isValidISODate(entry.date)) throw new Error("Backup contains a metric with an invalid date.");
  return normalizeMetricEntry(entry);
}

function normalizeBackupSettings(settings = {}) {
  const customExercises = Array.isArray(settings.customExercises)
    ? settings.customExercises.map(normalizeExerciseDefinition).filter(Boolean)
    : [];
  return {
    hypertrophyProfile: settings.hypertrophyProfile && typeof settings.hypertrophyProfile === "object"
      ? settings.hypertrophyProfile
      : hypertrophySettings(),
    nutritionGoal: NUTRITION_GOAL_OPTIONS.some((option) => option.id === settings.nutritionGoal)
      ? settings.nutritionGoal
      : "bulk",
    dayTemplates: Array.isArray(settings.dayTemplates) ? settings.dayTemplates : [],
    customExercises,
    dashboardWidgets: Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : [...DEFAULT_TODAY_WIDGETS],
    dashboardWidgetOrder: Array.isArray(settings.dashboardWidgetOrder) ? settings.dashboardWidgetOrder : [...DEFAULT_TODAY_WIDGETS],
    lastBackupAt: String(settings.lastBackupAt || ""),
    lastCloudPushAt: String(settings.lastCloudPushAt || ""),
    lastCloudPullAt: String(settings.lastCloudPullAt || "")
  };
}

function normalizeBackupPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Backup file is invalid.");
  if (!Array.isArray(payload.workouts) || !Array.isArray(payload.metrics)) {
    throw new Error("Backup file is missing workouts or metrics.");
  }
  return {
    settings: normalizeBackupSettings(payload.settings || {}),
    workouts: payload.workouts.map(normalizeBackupWorkout),
    metrics: payload.metrics.map(normalizeBackupMetric)
  };
}

async function importPayload(payload) {
  const normalized = payload?.normalized ? payload.normalized : normalizeBackupPayload(payload);
  await Promise.all(STORES.filter((store) => store !== "settings").map((store) => dbClear(store)));
  for (const entry of normalized.workouts) await dbPut("workouts", entry);
  for (const entry of normalized.metrics) await dbPut("metrics", entry);
  await saveSetting("hypertrophyProfile", normalized.settings.hypertrophyProfile);
  await saveSetting("nutritionGoal", normalized.settings.nutritionGoal);
  await saveSetting("dayTemplates", normalized.settings.dayTemplates);
  await saveSetting("customExercises", normalized.settings.customExercises);
  await saveSetting("dashboardWidgets", normalized.settings.dashboardWidgets);
  await saveSetting("dashboardWidgetOrder", normalized.settings.dashboardWidgetOrder);
  await saveSetting("lastBackupAt", normalized.settings.lastBackupAt);
  await saveSetting("lastCloudPushAt", normalized.settings.lastCloudPushAt);
  await saveSetting("lastCloudPullAt", normalized.settings.lastCloudPullAt);
  await saveSetting("syncRecordMeta", {});
  await saveSetting("syncCursor", "");
  await saveSetting("syncBootstrapVersion", 0);
  await loadState();
  await render();
}

async function importFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const summary = backupImportSummary(payload);
  state.pendingImport = {
    sourceType: "file",
    fileName: file.name || "Backup file",
    source: file.name || "Backup file",
    payload,
    summary
  };
  showBanner("Backup ready to review.", {
    tone: "warn",
    detail: "Import preview is open. Local data has not changed yet."
  });
  await render();
}

async function confirmPendingImport() {
  const pending = state.pendingImport;
  if (!pending) return;
  const previous = exportPayload();
  setUndoAction("Undo import", { type: "import", previous });
  await importPayload({ normalized: pending.summary.normalized });
  if (pending.sourceType === "cloud") await saveSetting("lastCloudPullAt", new Date().toISOString());
  state.pendingImport = null;
  scheduleRecordSync();
  announce("Backup restored.", {
    tone: "good",
    detail: "Previous local data can be restored with Undo.",
    action: "undo-last-action",
    actionLabel: "Undo"
  });
  await render();
}

async function undoLastAction() {
  const undo = state.undoAction;
  if (!undo?.payload) throw new Error("Nothing to undo.");
  const { payload } = undo;
  if (payload.type === "delete-workout" && payload.entry) {
    await dbPut("workouts", payload.entry);
    await queueSyncChange("workout", payload.entry.id, payload.entry);
  } else if (payload.type === "save-workout") {
    const restoredEntries = [...(payload.previousEntries || []), ...(payload.staleEntries || [])];
    await Promise.all((payload.savedEntryIds || []).map((id) => dbDelete("workouts", id)));
    await dbPutBatch("workouts", restoredEntries);
    for (const id of payload.savedEntryIds || []) await queueSyncChange("workout", id, null, { deleted: true });
    for (const entry of restoredEntries) await queueSyncChange("workout", entry.id, entry);
    clearWorkoutDraft(payload.date || todayISO());
  } else if (payload.type === "delete-metrics" && Array.isArray(payload.entries)) {
    for (const entry of payload.entries) await dbPut("metrics", entry);
    for (const entry of payload.entries) await queueSyncChange("metric", entry.date, entry);
  } else if (payload.type === "custom-exercises" && Array.isArray(payload.previous)) {
    await saveSetting("customExercises", payload.previous);
    await queueAllLocalSyncRecords();
  } else if (payload.type === "clear-all") {
    await Promise.all(["workouts", "metrics"].map((store) => dbClear(store)));
    for (const entry of payload.workouts || []) await dbPut("workouts", entry);
    for (const entry of payload.metrics || []) await dbPut("metrics", entry);
  } else if (payload.type === "clear-draft" && payload.recovery) {
    restoreDraftRecovery(payload.recovery);
  } else if (payload.type === "import" && payload.previous) {
    await importPayload(payload.previous);
  } else {
    throw new Error("Undo is no longer available.");
  }
  clearUndoAction();
  await loadState();
  scheduleRecordSync();
  showBanner("Undo complete.", { tone: "good" });
  await render();
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
  if (notify) announce("Supabase settings saved.", { tone: "good" });
  if (renderAfter) await render();
}

function supabaseConfig() {
  const { supabaseUrl, supabaseAnonKey, supabaseSession } = state.settings;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Add your Supabase URL and anon key first.");
  return { url: supabaseUrl.replace(/\/$/, ""), key: supabaseAnonKey, session: supabaseSession };
}

function supabaseSessionNeedsRefresh(session, now = Date.now()) {
  const expiresAt = Number(session?.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return expiresAt * 1000 <= now + 60000;
}

async function supabaseConfigWithFreshSession() {
  const config = supabaseConfig();
  if (!config.session?.access_token) throw new Error("Sign in to Supabase first.");
  if (!supabaseSessionNeedsRefresh(config.session)) return config;
  if (!config.session.refresh_token) throw new Error("Supabase session expired. Sign in again.");
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: config.session.refresh_token })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.msg || json.message || "Supabase session refresh failed.");
  const session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token || config.session.refresh_token,
    expires_at: json.expires_at || Math.floor(Date.now() / 1000) + Number(json.expires_in || 3600)
  };
  await saveSetting("supabaseSession", session);
  return { ...config, session };
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
    announce("Account created.", { tone: "good", detail: "Confirm your email if Supabase asks for it, then sign in." });
    await render();
    return;
  }
  await saveSetting("supabaseSession", {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at
  });
  announce("Signed in to Supabase.", { tone: "good" });
  await render();
  scheduleRecordSync({ immediate: true });
}

function recordSyncConfigured() {
  return Boolean(state.settings.supabaseUrl && state.settings.supabaseAnonKey && state.settings.supabaseSession?.access_token);
}

function syncRecordMetaMap() {
  return state.settings.syncRecordMeta && typeof state.settings.syncRecordMeta === "object"
    ? state.settings.syncRecordMeta
    : {};
}

function syncRecordMeta(recordType, recordId) {
  return syncRecordMetaMap()[syncRecordKey(recordType, recordId)] || {};
}

function canonicalSyncValue(value) {
  if (Array.isArray(value)) return value.map(canonicalSyncValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalSyncValue(value[key]);
    return result;
  }, {});
}

function syncPayloadFingerprint(payload, deleted = false) {
  return deleted ? "deleted" : JSON.stringify(canonicalSyncValue(payload ?? null));
}

async function saveSyncRecordMeta(recordType, recordId, revision, payload, deleted = false) {
  const key = syncRecordKey(recordType, recordId);
  const next = {
    ...syncRecordMetaMap(),
    [key]: {
      revision: Math.max(0, Number(revision) || 0),
      fingerprint: syncPayloadFingerprint(payload, deleted)
    }
  };
  state.settings.syncRecordMeta = next;
  await dbPut("settings", { key: "syncRecordMeta", value: next });
}

async function ensureSyncDeviceId() {
  if (state.settings.syncDeviceId) return state.settings.syncDeviceId;
  const deviceId = uid();
  state.settings.syncDeviceId = deviceId;
  await dbPut("settings", { key: "syncDeviceId", value: deviceId });
  return deviceId;
}

function normalizeRemoteSyncRecord(record = {}) {
  return {
    recordType: record.record_type ?? record.recordType,
    recordId: String(record.record_id ?? record.recordId ?? ""),
    payload: clonePlain(record.payload),
    revision: Math.max(0, Number(record.revision) || 0),
    updatedAt: record.updated_at ?? record.updatedAt ?? "",
    deletedAt: record.deleted_at ?? record.deletedAt ?? null,
    sourceDeviceId: record.source_device_id ?? record.sourceDeviceId ?? ""
  };
}

async function persistSyncQueueEntry(entry) {
  const normalized = { ...entry, id: syncRecordKey(entry.recordType, entry.recordId) };
  await dbPut("syncQueue", normalized);
  state.syncQueue = [...state.syncQueue.filter((item) => item.id !== normalized.id), normalized];
  return normalized;
}

async function removeSyncQueueEntry(id) {
  await dbDelete("syncQueue", id);
  state.syncQueue = state.syncQueue.filter((entry) => entry.id !== id);
}

function shouldQueueRecordSync() {
  return Boolean(state.settings.supabaseUrl || Number(state.settings.syncBootstrapVersion) >= SYNC_BOOTSTRAP_VERSION);
}

async function queueSyncChange(recordType, recordId, payload, { deleted = false, force = false } = {}) {
  if (!recordId || (!force && !shouldQueueRecordSync())) return null;
  const id = syncRecordKey(recordType, recordId);
  const existing = state.syncQueue.find((entry) => entry.id === id);
  const meta = syncRecordMeta(recordType, recordId);
  return persistSyncQueueEntry({
    id,
    recordType,
    recordId: String(recordId),
    payload: deleted ? null : clonePlain(payload),
    deleted,
    baseRevision: existing?.baseRevision ?? Math.max(0, Number(meta.revision) || 0),
    status: existing?.status === "conflict" ? "conflict" : "pending",
    remoteRecord: existing?.remoteRecord || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

async function queueAllLocalSyncRecords({ force = false } = {}) {
  for (const record of buildLocalSyncRecords()) {
    const meta = syncRecordMeta(record.recordType, record.recordId);
    if (force || meta.fingerprint !== syncPayloadFingerprint(record.payload)) {
      await queueSyncChange(record.recordType, record.recordId, record.payload, { force: true });
    }
  }
}

async function applyRemoteSyncRecord(remoteInput) {
  const remote = normalizeRemoteSyncRecord(remoteInput);
  if (!remote.recordType || !remote.recordId) return;
  const deleted = Boolean(remote.deletedAt);

  if (remote.recordType === "workout") {
    if (deleted) await dbDelete("workouts", remote.recordId);
    else await dbPut("workouts", { ...remote.payload, id: remote.recordId });
  } else if (remote.recordType === "metric") {
    const duplicateIds = state.metrics.filter((entry) => entry.date === remote.recordId).map((entry) => entry.id).filter(Boolean);
    await Promise.all(duplicateIds.map((id) => dbDelete("metrics", id)));
    if (!deleted) {
      const entry = { ...remote.payload, date: remote.recordId, id: remote.payload?.id || `metric-${remote.recordId}` };
      await dbPut("metrics", entry);
    }
  } else if (remote.recordType === "exercise") {
    const current = getCustomExercises({ includeArchived: true });
    const next = deleted
      ? current.filter((entry) => entry.id !== remote.recordId)
      : [...current.filter((entry) => entry.id !== remote.recordId), { ...remote.payload, id: remote.recordId }];
    await saveSetting("customExercises", next);
  } else if (remote.recordType === "template") {
    const current = getDayTemplates();
    const next = deleted
      ? current.filter((entry) => entry.id !== remote.recordId)
      : [...current.filter((entry) => entry.id !== remote.recordId), { ...remote.payload, id: remote.recordId }];
    await saveSetting("dayTemplates", next);
  } else if (remote.recordType === "preference" && SYNC_SAFE_PREFERENCES.includes(remote.recordId) && !deleted) {
    await saveSetting(remote.recordId, clonePlain(remote.payload?.value));
  }

  await saveSyncRecordMeta(remote.recordType, remote.recordId, remote.revision, remote.payload, deleted);
}

async function fetchRemoteSyncRecords(config, { full = false } = {}) {
  const select = "record_type,record_id,payload,revision,updated_at,deleted_at,source_device_id";
  const cursor = full ? "" : String(state.settings.syncCursor || "");
  const filter = cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`${config.url}/rest/v1/fitness_sync_records?select=${select}${filter}&order=updated_at.asc`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.session.access_token}`
    }
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Could not pull synchronized records.");
  return Array.isArray(json) ? json.map(normalizeRemoteSyncRecord) : [];
}

async function updateSyncCursor(records = []) {
  const newest = records.map((record) => record.updatedAt || "").filter(Boolean).sort().at(-1);
  if (!newest || newest <= String(state.settings.syncCursor || "")) return;
  state.settings.syncCursor = newest;
  await dbPut("settings", { key: "syncCursor", value: newest });
}

async function pullRecordSync(config, { full = false } = {}) {
  const remoteRecords = await fetchRemoteSyncRecords(config, { full });
  for (const remote of remoteRecords) {
    const id = syncRecordKey(remote.recordType, remote.recordId);
    const pending = state.syncQueue.find((entry) => entry.id === id);
    if (pending && remote.revision !== Number(pending.baseRevision || 0)) {
      await persistSyncQueueEntry(syncConflictFromRemote(pending, remote));
      continue;
    }
    if (!pending) await applyRemoteSyncRecord(remote);
  }
  await updateSyncCursor(remoteRecords);
  return remoteRecords;
}

async function bootstrapRecordSync(config) {
  if (Number(state.settings.syncBootstrapVersion) >= SYNC_BOOTSTRAP_VERSION) return;
  const remoteRecords = await fetchRemoteSyncRecords(config, { full: true });
  const remoteByKey = new Map(remoteRecords.map((record) => [syncRecordKey(record.recordType, record.recordId), record]));
  const localRecords = buildLocalSyncRecords();
  const localByKey = new Map(localRecords.map((record) => [syncRecordKey(record.recordType, record.recordId), record]));

  for (const remote of remoteRecords) {
    const id = syncRecordKey(remote.recordType, remote.recordId);
    const local = localByKey.get(id);
    if (!local) {
      await applyRemoteSyncRecord(remote);
    } else if (syncPayloadFingerprint(local.payload) === syncPayloadFingerprint(remote.payload, Boolean(remote.deletedAt))) {
      await saveSyncRecordMeta(remote.recordType, remote.recordId, remote.revision, remote.payload, Boolean(remote.deletedAt));
    } else {
      const pending = await queueSyncChange(local.recordType, local.recordId, local.payload, { force: true });
      await persistSyncQueueEntry(syncConflictFromRemote(pending, remote));
    }
  }

  for (const local of localRecords) {
    if (!remoteByKey.has(syncRecordKey(local.recordType, local.recordId))) {
      await queueSyncChange(local.recordType, local.recordId, local.payload, { force: true });
    }
  }

  state.settings.syncBootstrapVersion = SYNC_BOOTSTRAP_VERSION;
  await dbPut("settings", { key: "syncBootstrapVersion", value: SYNC_BOOTSTRAP_VERSION });
  await updateSyncCursor(remoteRecords);
}

async function applyQueuedSyncChange(config, entry, deviceId) {
  const response = await fetch(`${config.url}/rest/v1/rpc/apply_fitness_sync_change`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_record_type: entry.recordType,
      p_record_id: entry.recordId,
      p_payload: entry.deleted ? null : entry.payload,
      p_deleted: Boolean(entry.deleted),
      p_base_revision: Math.max(0, Number(entry.baseRevision) || 0),
      p_source_device_id: deviceId
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Could not push synchronized record.");
  return json;
}

async function flushRecordSyncQueue(config) {
  const deviceId = await ensureSyncDeviceId();
  const pending = state.syncQueue.filter((entry) => entry.status === "pending");
  for (const entry of pending) {
    const result = await applyQueuedSyncChange(config, entry, deviceId);
    const remote = result?.record ? normalizeRemoteSyncRecord(result.record) : null;
    if (result?.status === "conflict") {
      await persistSyncQueueEntry(syncConflictFromRemote(entry, remote));
      continue;
    }
    if (!remote) throw new Error("Cloud sync returned no saved record.");
    await saveSyncRecordMeta(entry.recordType, entry.recordId, remote.revision, entry.payload, entry.deleted);
    await updateSyncCursor([remote]);
    await removeSyncQueueEntry(entry.id);
  }
}

function syncConflictCount() {
  return state.syncQueue.filter((entry) => entry.status === "conflict").length;
}

function syncStatusText() {
  if (!recordSyncConfigured()) return "Sign in to sync";
  if (state.syncStatus === "syncing") return "Syncing";
  if (syncConflictCount()) return `${syncConflictCount()} conflict${syncConflictCount() === 1 ? "" : "s"} need review`;
  if (state.syncStatus === "offline") return "Offline - changes queued";
  if (state.syncStatus === "error") return state.syncMessage || "Sync failed";
  if (state.syncQueue.some((entry) => entry.status === "pending")) return `${state.syncQueue.filter((entry) => entry.status === "pending").length} change${state.syncQueue.filter((entry) => entry.status === "pending").length === 1 ? "" : "s"} queued`;
  return "Synced";
}

function syncSyncStatusDom() {
  const status = document.querySelector?.("[data-record-sync-status]");
  if (status) status.textContent = syncStatusText();
}

async function performRecordSync({ pull = true, push = true, reconcile = false, notify = false } = {}) {
  if (recordSyncPromise) return recordSyncPromise;
  recordSyncPromise = (async () => {
    if (!recordSyncConfigured()) {
      state.syncStatus = "idle";
      if (notify) throw new Error("Sign in to Supabase first.");
      return false;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      state.syncStatus = "offline";
      syncSyncStatusDom();
      return false;
    }
    state.syncStatus = "syncing";
    state.syncMessage = "";
    syncSyncStatusDom();
    try {
      const config = await supabaseConfigWithFreshSession();
      await ensureSyncDeviceId();
      await bootstrapRecordSync(config);
      if (pull) await pullRecordSync(config);
      if (reconcile) await queueAllLocalSyncRecords();
      if (push) await flushRecordSyncQueue(config);
      await loadState();
      state.syncStatus = syncConflictCount() ? "conflict" : "synced";
      const syncedAt = new Date().toISOString();
      state.settings.lastRecordSyncAt = syncedAt;
      await dbPut("settings", { key: "lastRecordSyncAt", value: syncedAt });
      if (!notify && state.activeTab !== "log") await render();
      if (notify) announce(syncConflictCount() ? "Sync needs review." : "Cloud sync complete.", { tone: syncConflictCount() ? "warn" : "good" });
      return true;
    } catch (error) {
      state.syncStatus = "error";
      state.syncMessage = error.message || "Sync failed";
      if (notify) throw error;
      return false;
    } finally {
      recordSyncPromise = null;
      syncSyncStatusDom();
    }
  })();
  return recordSyncPromise;
}

function scheduleRecordSync({ immediate = false } = {}) {
  if (recordSyncTimer) clearTimeout(recordSyncTimer);
  recordSyncTimer = setTimeout(() => {
    recordSyncTimer = null;
    performRecordSync().catch(() => {});
  }, immediate ? 0 : 250);
}

function startRecordSyncLifecycle() {
  if (recordSyncLifecycleStarted) return;
  recordSyncLifecycleStarted = true;
  window.addEventListener?.("online", () => scheduleRecordSync({ immediate: true }));
  document.addEventListener?.("visibilitychange", () => {
    if (!document.hidden) scheduleRecordSync({ immediate: true });
  });
  window.setInterval?.(() => {
    if (!document.hidden && recordSyncConfigured()) scheduleRecordSync({ immediate: true });
  }, SYNC_POLL_MS);
  if (recordSyncConfigured()) scheduleRecordSync({ immediate: true });
}

async function resolveRecordSyncConflict(id, choice) {
  const entry = state.syncQueue.find((item) => item.id === id && item.status === "conflict");
  if (!entry) throw new Error("Sync conflict is no longer available.");
  const remote = entry.remoteRecord ? normalizeRemoteSyncRecord(entry.remoteRecord) : null;
  if (choice === "cloud") {
    if (remote) await applyRemoteSyncRecord(remote);
    await removeSyncQueueEntry(entry.id);
    await loadState();
    return;
  }
  const next = {
    ...entry,
    baseRevision: remote?.revision || 0,
    status: "pending",
    remoteRecord: null,
    updatedAt: new Date().toISOString()
  };
  await persistSyncQueueEntry(next);
  await performRecordSync({ pull: false, push: true, notify: true });
}

async function pushSupabaseBackup() {
  const { url, key, session } = await supabaseConfigWithFreshSession();
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
  await saveSetting("lastCloudPushAt", new Date().toISOString());
  announce("Cloud backup pushed.", { tone: "good", detail: "Supabase now has the latest local backup." });
  await render();
}

async function pullSupabaseBackup() {
  const { url, key, session } = await supabaseConfigWithFreshSession();
  const response = await fetch(`${url}/rest/v1/fitness_snapshots?select=payload,created_at&order=created_at.desc&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`
    }
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Could not fetch latest backup.");
  if (!json.length) {
    announce("No cloud backups found.", { tone: "warn" });
    return;
  }
  const summary = backupImportSummary(json[0].payload);
  state.pendingImport = {
    sourceType: "cloud",
    source: `Cloud backup from ${formatDateTime(json[0].created_at)}`,
    payload: json[0].payload,
    summary
  };
  showBanner("Cloud backup ready to review.", {
    tone: "warn",
    detail: "Local data has not changed yet."
  });
  await render();
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
  setUndoAction("Restore local data", {
    type: "clear-all",
    workouts: state.workouts.filter((entry) => !isSampleEntry(entry)),
    metrics: state.metrics.filter((entry) => !isSampleEntry(entry))
  });
  await Promise.all(["workouts", "metrics"].map((store) => dbClear(store)));
  await loadState();
  announce("Local data cleared.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
  await render();
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
  return exerciseNames()[0] || "";
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

function staleWorkoutIdsForSavedDraft(date, savedEntries = []) {
  const savedIds = new Set(savedEntries.map((entry) => entry.id).filter(Boolean));
  return (state.loadedWorkoutDateIds || []).filter((id) => {
    if (savedIds.has(id)) return false;
    const existing = state.workouts.find((entry) => entry.id === id);
    return existing?.date === date;
  });
}

function clonePlain(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function workoutSaveUndoPayload(savedEntries = [], staleWorkoutIds = [], workouts = state.workouts) {
  const workoutById = new Map((workouts || []).map((entry) => [entry.id, entry]));
  const savedEntryIds = savedEntries.map((entry) => entry.id).filter(Boolean);
  const previousEntries = savedEntryIds
    .map((id) => workoutById.get(id))
    .filter(Boolean)
    .map(clonePlain);
  const staleEntries = (staleWorkoutIds || [])
    .map((id) => workoutById.get(id))
    .filter(Boolean)
    .map(clonePlain);
  return {
    type: "save-workout",
    date: savedEntries[0]?.date || previousEntries[0]?.date || staleEntries[0]?.date || state.draftDate || todayISO(),
    savedEntryIds,
    previousEntries,
    staleEntries
  };
}

function applyWorkoutSaveUndoSnapshot(workouts = [], payload = {}) {
  const removeIds = new Set(payload.savedEntryIds || []);
  const restored = [...(payload.previousEntries || []), ...(payload.staleEntries || [])].map(clonePlain);
  const restoredIds = new Set(restored.map((entry) => entry.id).filter(Boolean));
  return [
    ...(workouts || []).filter((entry) => !removeIds.has(entry.id) && !restoredIds.has(entry.id)),
    ...restored
  ];
}

function clearWorkoutDraft(date = todayISO()) {
  state.editingWorkoutId = null;
  state.loadedWorkoutDateIds = [];
  state.draftDate = date;
  state.draftNotes = "";
  state.selectedExercise = "";
  state.draftTargetMuscle = "chest";
  state.setRows = defaultSetRows();
  state.workoutDraft = [];
  state.logHistoryExercise = "";
  syncLegacyDraftFromFirst();
}

function loadWorkoutDateDraft(date) {
  state.draftDate = date;
  const entries = workoutsForDate(date);
  if (entries.length) {
    const first = entries[0];
    state.editingWorkoutId = first.id;
    state.loadedWorkoutDateIds = entries.map((entry) => entry.id).filter(Boolean);
    state.workoutDraft = entries.map(workoutEntryToDraft);
    syncLegacyDraftFromFirst();
    return;
  }
  clearWorkoutDraft(date);
}

async function applySharedDateInput(input) {
  if (!input) return;
  const value = input.value || todayISO();
  if (input.id === "workout-date") {
    preserveVisibleDraft("date-change");
    loadWorkoutDateDraft(value);
    await render();
    return;
  }
  if (input.id === "metric-date") {
    loadMetricDateDraft(value);
    await render();
    return;
  }
  if (input.id === "history-date") {
    state.historyMode = "dates";
    state.historyDate = value;
    await render();
  }
}

function applyStrengthTodayShortcut() {
  if (state.logMode !== "strength") return false;
  readDraftFromForm();
  const hasSavedWorkoutDraft = (state.workoutDraft || []).some((draft) => draft.editingWorkoutId);
  if (hasSavedWorkoutDraft || state.editingWorkoutId) return false;
  const hasMeaningfulDraft = (state.workoutDraft || []).some((draft) => !draft.editingWorkoutId && draftHasMeaningfulWorkoutInput(draft));
  if (!hasMeaningfulDraft) return false;
  state.draftDate = todayISO();
  state.loadedWorkoutDateIds = [];
  syncLegacyDraftFromFirst();
  saveDraftRecovery("date-today");
  return true;
}

function applyLogModeSwitch(nextMode) {
  if (nextMode === "metrics") {
    const date = state.draftDate || state.metricDate || todayISO();
    state.metricDate = date;
    if (state.metricFormDraft?.date !== date) state.metricFormDraft = null;
    clearLogDraftNotice();
    return;
  }
  if (nextMode === "strength") {
    loadWorkoutDateDraft(state.metricDate || state.draftDate || todayISO());
    clearLogDraftNotice();
  }
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

function updateDraftRowRir(draftId, index, delta) {
  const draft = state.workoutDraft.find((item) => item.draftId === draftId);
  if (!draft) return null;
  draft.setRows = normalizeSetRows(draft.setRows);
  const row = draft.setRows[Number(index)];
  if (!row) return null;
  row.rir = clampRirValue((row.rir ?? 2) + delta);
  return row.rir;
}

async function handleAction(action, target) {
  const actions = {
    async "app-retry"() { await init(); },
    async "dismiss-banner"() {
      clearBanner();
      await render();
    },
    async "dismiss-log-draft-notice"() {
      clearLogDraftNotice();
      syncLogDraftNoticeDom();
    },
    async "scroll-top"() {
      hideScrollTopButton();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    async "undo-last-action"() { await undoLastAction(); },
    async "restore-draft"() {
      if (!restoreDraftRecovery()) throw new Error("No saved draft found.");
      clearLogDraftNotice();
      toast("Draft restored.", { duration: 2000 });
      await render();
    },
    async "quick-add-exercise"() {
      preserveVisibleDraft("add-exercise");
      state.activeTab = "exercises";
      state.editingExerciseId = null;
      state.exerciseFormDraft = null;
      state.exerciseFormErrors = {};
      await render({ animate: true });
    },
    async "refresh-app-shell"() { await refreshAppShell(); },
    async "confirm-import"() { await confirmPendingImport(); },
    async "cancel-import"() {
      state.pendingImport = null;
      showBanner("Import canceled.", { tone: "info" });
      await render();
    },
    async "date-step"() {
      const input = document.getElementById(target.dataset.dateInput);
      const delta = Number(target.dataset.dateDelta || 0);
      if (!input) return;
      input.value = shiftISODate(input.value || todayISO(), delta);
      await applySharedDateInput(input);
    },
    async "date-today"() {
      const input = document.getElementById(target.dataset.dateInput);
      if (!input) return;
      if (input.id === "workout-date" && state.logMode === "strength") {
        if (applyStrengthTodayShortcut()) {
          await render();
          return;
        }
      }
      input.value = todayISO();
      await applySharedDateInput(input);
    },
    async "date-clear"() {
      const input = document.getElementById(target.dataset.dateInput);
      if (!input) return;
      if (input.id === "history-date") {
        state.historyDate = "";
        await render();
        return;
      }
      input.value = "";
      await applySharedDateInput(input);
    },
    async "toggle-dashboard-widget"() {
      const widgetId = target.dataset.widgetId;
      const enabled = selectedDashboardWidgets();
      const next = enabled.includes(widgetId)
        ? enabled.filter((id) => id !== widgetId)
        : [...enabled, widgetId];
      await saveDashboardWidgets(next.length ? next : enabled, dashboardWidgetOrder());
      showBanner("Today widgets updated.", { tone: "good" });
      await render();
    },
    async "move-dashboard-widget"() {
      const widgetId = target.dataset.widgetId;
      const direction = Number(target.dataset.widgetDirection || 0);
      const order = dashboardWidgetOrder();
      const index = order.indexOf(widgetId);
      const swap = index + direction;
      if (index < 0 || swap < 0 || swap >= order.length) return;
      [order[index], order[swap]] = [order[swap], order[index]];
      await saveDashboardWidgets(selectedDashboardWidgets(), order);
      showBanner("Today widgets reordered.", { tone: "good" });
      await render();
    },
    async "toggle-template-panel"() {
      readDraftFromForm();
      state.showTemplatePanel = !state.showTemplatePanel;
      await render();
    },
    async "history-select-exercise"() {
      await flashSelection(target);
      pushReturnContext("history-exercise-detail", { sourceAction: "history-select-exercise" });
      state.historyExercise = target.dataset.exercise || "";
      state.historyMode = "exercises";
      await render({ animate: true });
    },
    async "history-back"() {
      const context = popReturnContext("history-exercise-detail");
      if (context) {
        restoreReturnViewContext(context);
        await renderWithReturnScroll(context);
        return;
      }
      state.historyExercise = "";
      state.historyMode = "exercises";
      await render({ animate: true });
    },
    async "history-set-mode"() {
      state.historyMode = target.dataset.historyMode === "dates" ? "dates" : "exercises";
      await render({ animate: true });
    },
    async "open-weekly-muscle-detail"() {
      const muscleId = target.dataset.muscle || "";
      if (!muscleGroups.some((muscle) => muscle.id === muscleId)) return;
      pushReturnContext("weekly-muscle-detail", { sourceAction: "open-weekly-muscle-detail", muscleId });
      state.weeklyMuscleDetail = { muscleId, returnTab: state.activeTab };
      await render({ animate: true });
    },
    async "close-weekly-muscle-detail"() {
      const context = popReturnContext("weekly-muscle-detail");
      if (context) {
        restoreReturnViewContext(context);
        await renderWithReturnScroll(context);
        return;
      }
      state.weeklyMuscleDetail = null;
      await render({ animate: true });
    },
    async "history-date-chip"() {
      await flashSelection(target);
      pushReturnContext("history-date-filter", { sourceAction: "history-date-chip" });
      state.historyMode = "dates";
      state.historyDate = target.dataset.historyDateValue || "";
      await render({ animate: true });
    },
    async "clear-history-date"() {
      const context = popReturnContext("history-date-filter");
      if (context) {
        restoreReturnViewContext(context);
        await renderWithReturnScroll(context);
        return;
      }
      state.historyDate = "";
      await render({ animate: true });
    },
    async "coach-timeframe"() {
      const minutes = Number(target.dataset.coachMinutes);
      state.coachTimeframeMinutes = COACH_TIMEFRAME_OPTIONS.some((option) => option.minutes === minutes)
        ? minutes
        : SESSION_LIMIT_MINUTES;
      await render();
    },
    async "coach-global-growth-mode"() {
      const mode = target.dataset.growthMode;
      if (!COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === mode)) return;
      state.coachGlobalGrowthMode = mode;
      await render();
    },
    async "coach-target-muscle"() {
      const muscleId = target.dataset.muscleId;
      if (!muscleGroups.some((muscle) => muscle.id === muscleId)) return;
      const scrollLeft = target.closest(".coach-target-options")?.scrollLeft || 0;
      const selected = selectedCoachTargetMuscles();
      const wasSelected = selected.includes(muscleId);
      const warning = wasSelected ? "" : coachTargetSelectionWarning(muscleId);
      if (warning) {
        toast(warning);
        return;
      }
      state.coachTargetMuscles = selected.includes(muscleId)
        ? selected.filter((id) => id !== muscleId)
        : [...selected, muscleId];
      if (!state.coachTargetMuscles.includes(muscleId) && state.coachGrowthModes) delete state.coachGrowthModes[muscleId];
      await render();
      restoreCoachTargetScroll(scrollLeft);
    },
    async "coach-growth-mode"() {
      const muscleId = target.dataset.muscleId;
      const mode = target.dataset.growthMode;
      if (!selectedCoachTargetMuscles().includes(muscleId)) return;
      if (!COACH_GROWTH_MODE_OPTIONS.some((option) => option.id === mode)) return;
      state.coachGrowthModes = { ...(state.coachGrowthModes || {}), [muscleId]: mode };
      await render();
    },
    async "clear-coach-targets"() {
      state.coachTargetMuscles = [];
      state.coachGrowthModes = {};
      await render();
    },
    async "copy-coach-plan"() {
      copyCoachPlanToLog(buildTodayPlan(selectedCoachTimeframeMinutes()));
      announce("Coach plan copied to Log.", { tone: "good", detail: "Exercises and planned sets are ready as an unsaved draft." });
      await render({ animate: true });
    },
    async "export-coach-debug"() { await downloadCoachDebugReport(); },
    async "preview-next-coach-plan"() {
      state.previewNextCoachPlan = true;
      await render();
    },
    async "clear-copied-coach-plan"() {
      state.copiedCoachPlan = null;
      state.previewNextCoachPlan = false;
      persistCopiedCoachPlan(null);
      await render();
    },
    async "dismiss-record-trophy"() {
      readDraftFromForm();
      const key = target.dataset.recordKey;
      if (key) state.dismissedRecordTrophies.add(key);
      await render();
    },
    async "show-load-direction"() {
      toast(target.dataset.message || "Coach load direction is based on your last comparable sessions.");
    },
    async "return-to-today"() {
      readDraftFromForm();
      const today = todayISO();
      loadWorkoutDateDraft(today);
      await render();
    },
    async "add-exercise-table"() {
      readDraftFromForm();
      const exercise = defaultLogExerciseName();
      if (!exercise) {
        state.activeTab = "exercises";
        state.editingExerciseId = null;
        state.exerciseFormDraft = null;
        state.exerciseFormErrors = {};
        await render({ animate: true });
        return;
      }
      state.workoutDraft.push(defaultDraftExercise(exercise));
      await render();
    },
    async "remove-exercise-table"() {
      readDraftFromForm();
      removeExerciseDraftTable(target.dataset.draftId);
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
      await flashSelection(target);
      pushReturnContext("log-exercise-history", { sourceAction: "open-exercise-history" });
      state.logHistoryExercise = target.dataset.exercise;
      state.openExerciseMenu = null;
      await render({ animate: true });
    },
    async "close-log-history"() {
      const context = popReturnContext("log-exercise-history");
      if (context) {
        restoreReturnViewContext(context);
        await renderWithReturnScroll(context);
        return;
      }
      state.logHistoryExercise = "";
      await render({ animate: true });
    },
    async "edit-exercise"() {
      state.activeTab = "exercises";
      state.editingExerciseId = target.dataset.id;
      state.exerciseFormDraft = null;
      state.exerciseFormErrors = {};
      state.openExerciseActionMenu = null;
      await render();
      focusExerciseEditForm();
    },
    async "cancel-exercise-edit"() {
      state.editingExerciseId = null;
      state.exerciseFormDraft = null;
      state.exerciseFormErrors = {};
      await render();
    },
    async "exercise-clear-form"() {
      state.editingExerciseId = null;
      state.exerciseFormDraft = null;
      state.exerciseFormErrors = {};
      await render();
    },
    async "toggle-exercise-action-menu"() {
      state.openExerciseActionMenu = state.openExerciseActionMenu === target.dataset.id ? null : target.dataset.id;
      await render();
    },
    async "exercise-filter-muscle"() {
      state.exerciseMuscleFilter = target.dataset.muscleId || "all";
      await render();
    },
    async "exercise-add-primary"() {
      const muscleId = target.dataset.muscleId;
      if (!muscleGroups.some((muscle) => muscle.id === muscleId)) return;
      state.editingExerciseId = null;
      state.exerciseFormErrors = {};
      state.exerciseFormDraft = {
        name: "",
        primaryMuscle: muscleId,
        secondaryMuscles: [],
        equipment: "",
        reps: "",
        rest: "",
        cue: ""
      };
      await render();
    },
    async "archive-exercise"() {
      const exercises = getCustomExercises({ includeArchived: true });
      const exercise = exercises.find((item) => item.id === target.dataset.id);
      if (!exercise) throw new Error("Exercise not found.");
      const mode = exerciseRemovalMode(exercise);
      if (mode === "delete") {
        if (!confirm(`Delete "${exercise.name}" from your exercise database?`)) return;
        setUndoAction("Undo exercise change", { type: "custom-exercises", previous: exercises });
        await saveSetting("customExercises", exercises.filter((item) => item.id !== exercise.id));
        await queueSyncChange("exercise", exercise.id, null, { deleted: true });
        announce("Exercise deleted.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
      } else {
        if (!confirm(`Archive "${exercise.name}"? Existing logs stay intact.`)) return;
        setUndoAction("Undo exercise change", { type: "custom-exercises", previous: exercises });
        const archived = { ...exercise, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await saveSetting("customExercises", exercises.map((item) => item.id === exercise.id ? archived : item));
        await queueSyncChange("exercise", archived.id, archived);
        announce("Exercise archived.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
      }
      scheduleRecordSync();
      if (state.editingExerciseId === exercise.id) state.editingExerciseId = null;
      state.openExerciseActionMenu = null;
      await render();
    },
    async "restore-exercise"() {
      const exercises = getCustomExercises({ includeArchived: true });
      const exercise = exercises.find((item) => item.id === target.dataset.id);
      if (!exercise) throw new Error("Exercise not found.");
      setUndoAction("Undo exercise restore", { type: "custom-exercises", previous: exercises });
      const restored = { ...exercise, updatedAt: new Date().toISOString() };
      delete restored.archivedAt;
      await saveSetting("customExercises", exercises.map((item) => item.id === exercise.id ? restored : item));
      await queueSyncChange("exercise", restored.id, restored);
      scheduleRecordSync();
      state.openExerciseActionMenu = null;
      toast("Exercise restored.", { duration: 2000 });
      await render();
    },
    async "delete-exercise"() {
      const exercises = getCustomExercises({ includeArchived: true });
      const exercise = exercises.find((item) => item.id === target.dataset.id);
      if (!exercise) throw new Error("Exercise not found.");
      if (exerciseRemovalMode(exercise) !== "delete") throw new Error("Archived exercises with logs can be restored, not permanently deleted.");
      if (!confirm(`Permanently delete "${exercise.name}" from your exercise database?`)) return;
      setUndoAction("Undo exercise delete", { type: "custom-exercises", previous: exercises });
      await saveSetting("customExercises", exercises.filter((item) => item.id !== exercise.id));
      await queueSyncChange("exercise", exercise.id, null, { deleted: true });
      scheduleRecordSync();
      if (state.editingExerciseId === exercise.id) state.editingExerciseId = null;
      state.openExerciseActionMenu = null;
      announce("Exercise deleted.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
      await render();
    },
    async "log-exercise"() {
      await flashSelection(target);
      preserveVisibleDraft("log-exercise");
      state.activeTab = "log";
      state.logMode = "strength";
      state.editingWorkoutId = null;
      state.selectedExercise = target.dataset.exercise;
      state.draftTargetMuscle = resolveExerciseMeta(state.selectedExercise).primaryMuscles[0] || "chest";
      state.setRows = defaultSetRows();
      state.workoutDraft = [defaultDraftExercise(state.selectedExercise)];
      await render();
    },
    async "open-exercise-trend"() {
      const exercise = target.dataset.exercise;
      if (!exercise) return;
      await flashSelection(target);
      preserveVisibleDraft("cross-tab");
      pushReturnContext("exercise-trend", { sourceAction: "open-exercise-trend", exercise });
      state.selectedExercise = exercise;
      state.activeTab = "trends";
      await render({ animate: true });
    },
    async "open-exercise-history-global"() {
      const exercise = target.dataset.exercise;
      if (!exercise) return;
      await flashSelection(target);
      preserveVisibleDraft("cross-tab");
      pushReturnContext("history-exercise-detail", { sourceAction: "open-exercise-history-global", exercise });
      state.historyExercise = exercise;
      state.historyMode = "exercises";
      state.activeTab = "history";
      await render({ animate: true });
    },
    async "export-data"() { await downloadBackup(); },
    "import-click"() { document.getElementById("import-file")?.click(); },
    async "add-set"() {
      readDraftFromForm();
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      const last = draft.setRows[draft.setRows.length - 1] || { weight: "", reps: 10, rir: 2 };
      draft.setRows.push({ ...last });
      clearCoachCopiedDraftMarkers(draft);
      syncLegacyDraftFromFirst();
      await render();
    },
    async "remove-set"() {
      readDraftFromForm();
      const index = Number(target.dataset.index);
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      if (draft.setRows.length > 1) draft.setRows.splice(index, 1);
      clearCoachCopiedDraftMarkers(draft);
      syncLegacyDraftFromFirst();
      await render();
    },
    async "decrement-rir"() {
      readDraftFromForm();
      markCoachCopiedRowDirty(target.dataset.draftId, target.dataset.index);
      target.closest(".set-row")?.classList.remove("coach-copied-row");
      const value = updateDraftRowRir(target.dataset.draftId, target.dataset.index, -1);
      if (value === null) return;
      syncLegacyDraftFromFirst();
      if (saveDraftRecovery("strength-input")) {
        showLogDraftNotice();
        syncLogDraftNoticeDom();
      }
      target.closest(".rir-stepper")?.querySelector('[data-set-field="rir"]')?.setAttribute("value", value);
      const input = target.closest(".rir-stepper")?.querySelector('[data-set-field="rir"]');
      if (input) input.value = value;
      const section = target.closest(".exercise-draft");
      if (section?.dataset.draftId) refreshDraftRecordTrophies(section.dataset.draftId);
    },
    async "increment-rir"() {
      readDraftFromForm();
      markCoachCopiedRowDirty(target.dataset.draftId, target.dataset.index);
      target.closest(".set-row")?.classList.remove("coach-copied-row");
      const value = updateDraftRowRir(target.dataset.draftId, target.dataset.index, 1);
      if (value === null) return;
      syncLegacyDraftFromFirst();
      if (saveDraftRecovery("strength-input")) {
        showLogDraftNotice();
        syncLogDraftNoticeDom();
      }
      target.closest(".rir-stepper")?.querySelector('[data-set-field="rir"]')?.setAttribute("value", value);
      const input = target.closest(".rir-stepper")?.querySelector('[data-set-field="rir"]');
      if (input) input.value = value;
      const section = target.closest(".exercise-draft");
      if (section?.dataset.draftId) refreshDraftRecordTrophies(section.dataset.draftId);
    },
    async "use-last-session"() {
      readDraftFromForm();
      const draft = state.workoutDraft.find((item) => item.draftId === target.dataset.draftId) || state.workoutDraft[0];
      const last = lastSessionForExercise(draft.exercise, draft.editingWorkoutId);
      if (!last) throw new Error("No previous session for this exercise yet.");
      draft.setRows = setRowsFromWorkout(last);
      draft.notes = last.notes || draft.notes;
      clearCoachCopiedDraftMarkers(draft);
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
      setUndoAction("Restore draft", { type: "clear-draft", recovery: draftRecoveryPayload("clear-draft") });
      clearWorkoutDraft();
      announce("Draft cleared.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
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
      if (!confirm("Delete this workout? This cannot be undone.")) return;
      const entry = state.workouts.find((workout) => workout.id === target.dataset.id);
      if (entry) setUndoAction("Restore lift", { type: "delete-workout", entry });
      await dbDelete("workouts", target.dataset.id);
      await queueSyncChange("workout", target.dataset.id, null, { deleted: true });
      scheduleRecordSync();
      if (state.editingWorkoutId === target.dataset.id) clearWorkoutDraft();
      await loadState();
      announce("Lift deleted.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
      await render();
    },
    async "delete-metric"() {
      if (!confirm(`Delete nutrition entry${target.dataset.date ? ` for ${target.dataset.date}` : ""}? This cannot be undone.`)) return;
      const ids = target.dataset.date
        ? metricEntriesForDate(target.dataset.date).map((entry) => entry.id).filter(Boolean)
        : [target.dataset.id].filter(Boolean);
      const entries = state.metrics.filter((entry) => ids.includes(entry.id));
      const metricDate = target.dataset.date || entries[0]?.date || "";
      if (entries.length) setUndoAction("Restore nutrition", { type: "delete-metrics", entries });
      await Promise.all(ids.map((id) => dbDelete("metrics", id)));
      if (metricDate) await queueSyncChange("metric", metricDate, null, { deleted: true });
      scheduleRecordSync();
      await loadState();
      announce("Metric deleted.", { tone: "warn", action: "undo-last-action", actionLabel: "Undo" });
      await render();
    },
    async "choose-exercise"() {
      readDraftFromForm();
      state.workoutDraft.push(defaultDraftExercise(target.dataset.exercise));
      syncLegacyDraftFromFirst();
      await render();
    },
    async "save-supabase"() {
      forceSettingsPanelOpen("supabase-sync");
      await saveSupabaseSettings();
    },
    async "signup-supabase"() {
      forceSettingsPanelOpen("supabase-sync");
      await supabaseAuth("signup");
    },
    async "signin-supabase"() {
      forceSettingsPanelOpen("supabase-sync");
      await supabaseAuth("signin");
    },
    async "push-supabase-sync"() {
      forceSettingsPanelOpen("supabase-sync");
      await performRecordSync({ pull: true, push: true, reconcile: true, notify: true });
      await render();
    },
    async "pull-supabase-sync"() {
      forceSettingsPanelOpen("supabase-sync");
      await performRecordSync({ pull: true, push: false, notify: true });
      await render();
    },
    async "resolve-sync-conflict"() {
      forceSettingsPanelOpen("supabase-sync");
      await resolveRecordSyncConflict(target.dataset.syncId, target.dataset.choice);
      await render();
    },
    async "push-supabase"() {
      forceSettingsPanelOpen("supabase-sync");
      await pushSupabaseBackup();
    },
    async "pull-supabase"() {
      forceSettingsPanelOpen("supabase-sync");
      await pullSupabaseBackup();
    },
    async "nutrition-goal"() {
      const goal = target.dataset.nutritionGoal;
      if (!NUTRITION_GOAL_OPTIONS.some((option) => option.id === goal)) return;
      await saveSetting("nutritionGoal", goal);
      await queueSyncChange("preference", "nutritionGoal", { value: goal });
      scheduleRecordSync();
      announce(`Nutrition goal set to ${nutritionGoalLabel(goal)}.`, { tone: "good" });
      await render();
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
  state.dragPendingDraftId = null;
  handle.classList.remove("is-pending");
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
  state.dragPendingDraftId = handle.dataset?.draftId || null;
  handle.classList.add("is-pending");
  clearTimeout(dragState.dragTimer);
  dragState.dragTimer = setTimeout(activateDrag, dragState.holdDelay);
}

function cancelPendingDrag() {
  clearTimeout(dragState.dragTimer);
  dragState.handle?.classList?.remove("is-pending");
  dragState.pending = false;
  dragState.handle = null;
  state.dragPendingDraftId = null;
}

function updatePendingExerciseDrag(event) {
  if (!dragState.pending) return;
  dragState.currentY = event.clientY;
  if (Math.abs(dragState.currentY - dragState.startY) > 14) cancelPendingDrag();
}

function resetDragState() {
  dragState.id = null;
  dragState.active = false;
  dragState.pending = false;
  dragState.moved = false;
  dragState.handle = null;
  state.draggingDraftId = null;
  state.dragPendingDraftId = null;
  document.querySelectorAll(".drag-handle.is-pending").forEach((handle) => handle.classList.remove("is-pending"));
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

document.addEventListener("toggle", (event) => {
  const panel = event.target?.closest?.("details[data-settings-panel]");
  if (panel && state.activeTab === "settings") {
    setSettingsPanelOpen(panel.dataset.settingsPanel, panel.open);
  }
}, true);

document.addEventListener("click", handleCollapsibleSummaryClick, true);

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-tab]");
  const logMode = event.target.closest("[data-log-mode]");
  const action = event.target.closest("[data-action]");

  try {
    if (tab) {
      if (tab.dataset.tab !== state.activeTab) preserveVisibleDraft("tab-change");
      state.activeTab = tab.dataset.tab;
      state.weeklyMuscleDetail = null;
      clearReturnContexts();
      await render({ animate: true });
    }
    if (logMode) {
      const nextMode = logMode.dataset.logMode;
      if (nextMode !== state.logMode) {
        preserveVisibleDraft("log-mode-change");
        applyLogModeSwitch(nextMode);
      }
      state.logMode = nextMode;
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
        clearCoachCopiedDraftMarkers(draft);
      }
      syncLegacyDraftFromFirst();
      saveDraftRecovery("strength-change");
      await render();
    }
    if (event.target.matches("[data-shared-date-input]")) await applySharedDateInput(event.target);
    if (event.target.matches("#trend-exercise")) {
      state.selectedExercise = event.target.value;
      await render();
    }
    if (event.target.matches("#exercise-primary")) {
      syncSecondaryMuscleCheckboxes(event.target.closest("#exercise-form"));
    }
    if (event.target.closest("#exercise-form")) {
      state.exerciseFormDraft = exerciseFormDraftFromForm(event.target.closest("#exercise-form"));
      saveDraftRecovery("exercise-change");
    }
    if (event.target.matches("[data-exercise-sort]")) {
      state.exerciseSort = ["recent", "az", "muscle", "most"].includes(event.target.value) ? event.target.value : "recent";
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
    if (event.target.closest("#metric-form") && !event.target.matches("[data-shared-date-input]")) {
      state.metricFormDraft = metricDraftFromForm(event.target.closest("#metric-form"));
      if (saveDraftRecovery("nutrition-input")) {
        showLogDraftNotice();
        syncLogDraftNoticeDom();
      }
    }
    if (event.target.matches("[data-set-field]")) {
      const section = event.target.closest(".exercise-draft");
      if (section?.dataset.draftId) markCoachCopiedRowDirty(section.dataset.draftId, event.target.closest(".set-row")?.dataset.index);
      event.target.closest(".set-row")?.classList.remove("coach-copied-row");
      readDraftFromForm();
      if (saveDraftRecovery("strength-input")) {
        showLogDraftNotice();
        syncLogDraftNoticeDom();
      }
      if (section?.dataset.draftId) refreshDraftRecordTrophies(section.dataset.draftId);
    }
    if (event.target.matches("[data-draft-field='notes']")) {
      readDraftFromForm();
      if (saveDraftRecovery("strength-input")) {
        showLogDraftNotice();
        syncLogDraftNoticeDom();
      }
    }
    if (event.target.matches("[data-history-search]")) {
      const caret = event.target.selectionStart || 0;
      state.historySearch = event.target.value;
      await render();
      const input = document.getElementById("history-search");
      input?.focus();
      input?.setSelectionRange?.(caret, caret);
    }
    if (event.target.matches("[data-exercise-search]")) {
      const caret = event.target.selectionStart || 0;
      state.exerciseSearch = event.target.value;
      await render();
      const input = document.getElementById("exercise-search");
      input?.focus();
      input?.setSelectionRange?.(caret, caret);
    }
    if (event.target.closest("#exercise-form") && !event.target.matches("[data-exercise-search]")) {
      state.exerciseFormDraft = exerciseFormDraftFromForm(event.target.closest("#exercise-form"));
      saveDraftRecovery("exercise-input");
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
  if (dragState.pending) {
    updatePendingExerciseDrag(event);
    return;
  }
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
    state.dragPendingDraftId = null;
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
    const touch = event.touches[0];
    updatePendingExerciseDrag({ clientY: touch.clientY });
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
  state.dragPendingDraftId = null;
  document.querySelectorAll(".drag-handle.is-pending").forEach((handle) => handle.classList.remove("is-pending"));
  document.querySelectorAll(".exercise-draft.is-dragging").forEach((section) => {
    section.classList.remove("is-dragging");
    section.style.transform = "";
  });
});

if (window.addEventListener) {
  window.addEventListener("scroll", updateScrollTopButton, { passive: true });
  window.addEventListener("resize", updateScrollTopButton);
  window.visualViewport?.addEventListener("scroll", updateScrollTopButton, { passive: true });
  window.visualViewport?.addEventListener("resize", updateScrollTopButton);
}

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

  restoreDraftRecovery();
  restoreCopiedCoachPlan();

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  await render();
  startRecordSyncLifecycle();
  registerServiceWorker().catch(() => {});
}

init().catch((error) => {
  renderStartupFailure(error);
});
