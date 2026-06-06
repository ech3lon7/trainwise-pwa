"use strict";

const DB_NAME = "trainwise-db";
const DB_VERSION = 1;
const STORES = ["workouts", "metrics", "settings"];
const APP_VERSION = "1.0.0";

const defaultExercises = [
  "Bench Press",
  "Squat",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Pull-up",
  "Romanian Deadlift",
  "Incline Dumbbell Press"
];

const state = {
  db: null,
  activeTab: "dashboard",
  logMode: "strength",
  selectedExercise: "Bench Press",
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(num, digits = 0) {
  if (!Number.isFinite(num)) return "--";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(num);
}

function parseNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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
      if (!db.objectStoreNames.contains("workouts")) {
        const store = db.createObjectStore("workouts", { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("exercise", "exercise");
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

async function loadState() {
  const [workouts, metrics, settingsRows] = await Promise.all([
    dbAll("workouts"),
    dbAll("metrics"),
    dbAll("settings")
  ]);
  state.workouts = workouts.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  state.metrics = metrics.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
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

function workoutVolume(workout) {
  return workout.sets * workout.reps * workout.weight;
}

function e1rm(workout) {
  return workout.weight * (1 + workout.reps / 30);
}

function lastMetric(field) {
  return state.metrics.find((entry) => Number.isFinite(entry[field]) && entry[field] > 0);
}

function getWeeklyVolume() {
  const start = recentDays(7);
  return state.workouts
    .filter((entry) => new Date(entry.date) >= start)
    .reduce((sum, entry) => sum + workoutVolume(entry), 0);
}

function getAverage(field, days) {
  const start = recentDays(days);
  const values = state.metrics
    .filter((entry) => new Date(entry.date) >= start && entry[field] > 0)
    .map((entry) => entry[field]);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function previewSeries(kind) {
  const base = new Date();
  const values = [];
  for (let index = 9; index >= 0; index -= 1) {
    const date = new Date(base);
    date.setDate(date.getDate() - index * 3);
    const bump = Math.sin(index / 1.8) * 8;
    values.push({
      label: date.toISOString().slice(5, 10),
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

  return `
    <div class="chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="area-${color.slice(1)}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.36"></stop>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <line x1="8" y1="16" x2="92" y2="16" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <line x1="8" y1="84" x2="92" y2="84" stroke="rgba(255,255,255,0.08)" stroke-width="0.4"></line>
        <polygon points="${area}" fill="url(#area-${color.slice(1)})"></polygon>
        <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.7" fill="${color}"></circle>`).join("")}
      </svg>
      <p class="muted small">${first.label} to ${last.label} - Latest ${fmt(last.value, 1)}${unit}</p>
    </div>
  `;
}

function recommendations() {
  const recs = [];
  const today = new Date(todayISO());
  const lastWorkout = state.workouts[0];
  const daysSinceWorkout = lastWorkout
    ? Math.round((today - new Date(lastWorkout.date)) / 86400000)
    : null;

  if (daysSinceWorkout === null) {
    recs.push({
      tone: "warn",
      title: "Start with a baseline session",
      body: "Log one normal lift day without chasing a max. The app needs a baseline before it can judge progress."
    });
  } else if (daysSinceWorkout >= 4) {
    recs.push({
      tone: "warn",
      title: "Ease back in",
      body: `It has been ${daysSinceWorkout} days since your last logged lift. Keep one or two reps in reserve today.`
    });
  } else {
    recs.push({
      tone: "",
      title: "Training rhythm looks alive",
      body: "Keep logging the main lifts. The recommendation engine gets more useful once it sees repeated exercises."
    });
  }

  const proteinAvg = getAverage("protein", 7);
  const bodyWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  if (bodyWeight && proteinAvg) {
    const target = bodyWeight * 0.75;
    if (proteinAvg < target) {
      recs.push({
        tone: "hot",
        title: "Protein is trailing your body weight",
        body: `Your 7-day protein average is ${fmt(proteinAvg)}g. A practical target is around ${fmt(target)}g or more.`
      });
    } else {
      recs.push({
        tone: "",
        title: "Protein floor is covered",
        body: `Your 7-day average is ${fmt(proteinAvg)}g, which supports strength progression for your current logged weight.`
      });
    }
  } else {
    recs.push({
      tone: "warn",
      title: "Add body weight and protein",
      body: "One week of body weight and protein logs unlocks better nutrition coaching."
    });
  }

  const exercises = [...new Set(state.workouts.map((entry) => entry.exercise))];
  const plateau = exercises.find((exercise) => {
    const entries = state.workouts.filter((entry) => entry.exercise === exercise).sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length < 4) return false;
    const recent = entries.slice(-2).reduce((sum, entry) => sum + workoutVolume(entry), 0);
    const prior = entries.slice(-4, -2).reduce((sum, entry) => sum + workoutVolume(entry), 0);
    return recent <= prior * 0.98;
  });
  if (plateau) {
    recs.push({
      tone: "hot",
      title: `${plateau} may be stalling`,
      body: "Recent volume is flat or down. Try one smaller load jump, add one set, or deload if recovery feels poor."
    });
  }

  return recs.slice(0, 4);
}

function renderDashboard() {
  const weeklyVolume = getWeeklyVolume();
  const bodyWeight = lastMetric("bodyWeight")?.bodyWeight || 0;
  const proteinAvg = getAverage("protein", 7);
  const caloriesAvg = getAverage("calories", 7);
  const recent = state.workouts.slice(0, 4);

  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Today is for useful reps.</h2>
        <p class="hero-copy">Log the lifts, track the fuel, and let the trends decide whether to push, hold, or recover.</p>
      </div>
      <div class="grid three">
        <div class="stat"><span class="label">7-day volume</span><span class="value accent-green">${fmt(weeklyVolume)}</span><span class="hint">lb total</span></div>
        <div class="stat"><span class="label">Body weight</span><span class="value accent-gold">${bodyWeight ? fmt(bodyWeight, 1) : "--"}</span><span class="hint">latest lb</span></div>
        <div class="stat"><span class="label">Protein avg</span><span class="value accent-coral">${proteinAvg ? fmt(proteinAvg) : "--"}</span><span class="hint">g per day</span></div>
      </div>
    </section>

    <section class="section grid two">
      <div class="chart-panel">
        <div class="chart-header"><h3>Body weight</h3><span class="muted small">${bodyWeight ? "logged" : "preview"}</span></div>
        ${lineChart(seriesFromMetrics("bodyWeight").length ? seriesFromMetrics("bodyWeight") : previewSeries("bodyWeight"), "#f2d06b", " lb")}
      </div>
      <div class="chart-panel">
        <div class="chart-header"><h3>Calories</h3><span class="muted small">${caloriesAvg ? `${fmt(caloriesAvg)} avg` : "preview"}</span></div>
        ${lineChart(seriesFromMetrics("calories").length ? seriesFromMetrics("calories") : previewSeries("calories"), "#ff6b5f", "")}
      </div>
    </section>

    <section class="section grid two">
      <div class="card">
        <h3>Next best action</h3>
        ${recommendations().slice(0, 1).map((rec) => `<div class="coach-card ${rec.tone}"><strong>${rec.title}</strong><p>${rec.body}</p></div>`).join("")}
      </div>
      <div class="card">
        <h3>Recent lifts</h3>
        <div class="list">
          ${recent.length ? recent.map((entry) => listWorkout(entry)).join("") : `<div class="empty">Your latest sets will show here.</div>`}
        </div>
      </div>
    </section>
  `;
}

function listWorkout(entry) {
  return `
    <div class="list-item">
      <div>
        <strong>${entry.exercise}</strong>
        <span class="muted small">${entry.date} - ${entry.sets}x${entry.reps} @ ${fmt(entry.weight)} lb - ${fmt(workoutVolume(entry))} lb volume</span>
      </div>
      <button class="delete-small" type="button" aria-label="Delete workout" data-action="delete-workout" data-id="${entry.id}">x</button>
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
        <strong>${entry.date}</strong>
        <span class="muted small">${parts.join(" - ") || "Metric entry"}</span>
      </div>
      <button class="delete-small" type="button" aria-label="Delete metric" data-action="delete-metric" data-id="${entry.id}">x</button>
    </div>
  `;
}

function renderLog() {
  const exerciseChips = defaultExercises.map((name) => `
    <button class="pill ${state.selectedExercise === name ? "is-active" : ""}" type="button" data-action="choose-exercise" data-exercise="${name}">${name}</button>
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
            <input id="exercise" name="exercise" required value="${state.selectedExercise}">
          </div>
          <div class="field">
            <label for="workout-date">Date</label>
            <input id="workout-date" name="date" type="date" required value="${todayISO()}">
          </div>
          <div class="field-row">
            <div class="field"><label for="sets">Sets</label><input id="sets" name="sets" type="number" inputmode="decimal" min="1" step="1" required value="3"></div>
            <div class="field"><label for="reps">Reps</label><input id="reps" name="reps" type="number" inputmode="decimal" min="1" step="1" required value="8"></div>
            <div class="field"><label for="weight">Weight</label><input id="weight" name="weight" type="number" inputmode="decimal" min="0" step="2.5" required placeholder="lb"></div>
          </div>
          <div class="field">
            <label for="rir">Reps in reserve</label>
            <input id="rir" name="rir" type="number" inputmode="decimal" min="0" max="5" step="1" placeholder="2">
          </div>
          <div class="field">
            <label for="workout-notes">Notes</label>
            <textarea id="workout-notes" name="notes" placeholder="Bar speed, soreness, setup, anything useful."></textarea>
          </div>
          <button class="primary-button" type="submit">Save lift</button>
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
            <textarea id="metric-notes" name="notes" placeholder="Sleep, hunger, sodium, stress, or anything that explains the trend."></textarea>
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
  const options = exercises.map((exercise) => `<option ${exercise === state.selectedExercise ? "selected" : ""}>${exercise}</option>`).join("");
  const volumeSeries = seriesFromWorkouts(state.selectedExercise, workoutVolume);
  const e1rmSeries = seriesFromWorkouts(state.selectedExercise, e1rm);

  return `
    <section class="settings-panel">
      <div class="field">
        <label for="trend-exercise">Exercise trend</label>
        <select id="trend-exercise" data-action="trend-exercise">${options}</select>
      </div>
    </section>
    <section class="section grid two">
      <div class="chart-panel">
        <div class="chart-header"><h3>${state.selectedExercise} volume</h3><span class="muted small">sets x reps x load</span></div>
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
    </section>
  `;
}

function renderCoach() {
  return `
    <section class="hero">
      <div>
        <h2 class="hero-title">Rules before hype.</h2>
        <p class="hero-copy">These recommendations come from your logged data: consistency, progressive overload, calories, protein, and recovery signals.</p>
      </div>
    </section>
    <section class="section grid">
      ${recommendations().map((rec) => `<div class="coach-card ${rec.tone}"><strong>${rec.title}</strong><p>${rec.body}</p></div>`).join("")}
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

async function renderSettings() {
  const estimate = await storageEstimateMarkup();
  return `
    <section class="settings-panel">
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
      <p class="muted small">Status: ${supabaseStatus()}</p>
      <div class="field">
        <label for="supabaseUrl">Project URL</label>
        <input id="supabaseUrl" value="${state.settings.supabaseUrl || ""}" placeholder="https://your-project.supabase.co">
      </div>
      <div class="field">
        <label for="supabaseAnonKey">Anon public key</label>
        <input id="supabaseAnonKey" value="${state.settings.supabaseAnonKey || ""}" placeholder="Paste your Supabase anon key">
      </div>
      <div class="field">
        <label for="supabaseEmail">Email</label>
        <input id="supabaseEmail" type="email" value="${state.settings.supabaseEmail || ""}" placeholder="you@example.com">
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
  const entry = {
    id: uid(),
    date: data.date,
    exercise: data.exercise.trim(),
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
  toast("Lift saved.");
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

function exportPayload() {
  return {
    app: "TrainWise",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    workouts: state.workouts,
    metrics: state.metrics
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
  els.app.innerHTML = `<div class="empty">TrainWise could not start: ${error.message}</div>`;
});
