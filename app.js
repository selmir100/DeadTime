const storageKey = "deadtime-state-v2";
const legacyStorageKey = "deadtime-state-v1";
const saveIntervalMs = 1200;
const tickIntervalMs = 1000;

function makeId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `dt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const defaultState = {
  theme: "dark",
  compact: false,
  sounds: true,
  hints: true,
  hintsDismissed: false,
  settingsOpen: false,
  timer: {
    duration: 300,
    remaining: 300,
    running: false,
    lastStartedAt: null,
    completedAt: null
  },
  resumePoint: "",
  tasks: [
    { id: makeId(), text: "Clear downloads folder", done: false },
    { id: makeId(), text: "Write next command before the install ends", done: false },
    { id: makeId(), text: "Stand up and reset posture", done: true }
  ],
  notes: "",
  breakEnabled: false,
  breakProgress: 0,
  suggestionOffset: 0,
  waits: [
    createWait("Render export", 12, now() - 245000),
    createWait("Package install", 8, now() - 120000)
  ]
};

const suggestions = [
  { time: "30s", title: "Name the next step", detail: "Write the one action you will take when the wait ends." },
  { time: "1m", title: "Close one loop", detail: "Archive a tab, dismiss a stale notification, or mark a tiny task done." },
  { time: "2m", title: "Prep the handoff", detail: "Copy paths, gather credentials, or queue the next command." },
  { time: "3m", title: "Clean the bench", detail: "Tidy the desktop, downloads, or project scratch folder." },
  { time: "5m", title: "Recovery check", detail: "Hydrate, stretch, and let your eyes leave the screen." },
  { time: "8m", title: "Micro review", detail: "Scan notes or logs for the one thing worth remembering." }
];

let state = loadState();
let lastSavedAt = 0;
let tickHandle;
let toastTimer;
let audioContext;

const root = document.documentElement;
const body = document.body;
const timeDisplay = document.querySelector("#timeDisplay");
const timerRing = document.querySelector("#timerRing");
const startPause = document.querySelector("#startPause");
const minusMinute = document.querySelector("#minusMinute");
const plusMinute = document.querySelector("#plusMinute");
const resetTimer = document.querySelector("#resetTimer");
const suggestionList = document.querySelector("#suggestionList");
const shuffleSuggestion = document.querySelector("#shuffleSuggestion");
const monitorList = document.querySelector("#monitorList");
const addMonitor = document.querySelector("#addMonitor");
const waitForm = document.querySelector("#waitForm");
const waitLabel = document.querySelector("#waitLabel");
const waitMinutes = document.querySelector("#waitMinutes");
const taskForm = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const taskList = document.querySelector("#taskList");
const taskCounter = document.querySelector("#taskCounter");
const notes = document.querySelector("#notes");
const clearNotes = document.querySelector("#clearNotes");
const themeToggle = document.querySelector("#themeToggle");
const compactToggle = document.querySelector("#compactToggle");
const compactSetting = document.querySelector("#compactSetting");
const settingsToggle = document.querySelector("#settingsToggle");
const settingsPanel = document.querySelector("#settingsPanel");
const soundToggle = document.querySelector("#soundToggle");
const hintsToggle = document.querySelector("#hintsToggle");
const breakToggle = document.querySelector("#breakToggle");
const breakLabel = document.querySelector("#breakLabel");
const breakMeter = document.querySelector("#breakMeter");
const statusText = document.querySelector("#statusText");
const activeWindowTitle = document.querySelector("#activeWindowTitle");
const activeWindowCopy = document.querySelector("#activeWindowCopy");
const toast = document.querySelector("#toast");
const resumeInput = document.querySelector("#resumeInput");
const clearResume = document.querySelector("#clearResume");
const onboarding = document.querySelector("#onboarding");
const dismissHints = document.querySelector("#dismissHints");

function createWait(label, minutes, startedAt = now()) {
  const duration = clamp(Number(minutes) || 10, 1, 180) * 60000;
  return {
    id: makeId(),
    label: label || "Background wait",
    startedAt,
    duration,
    done: false,
    completedAt: null
  };
}

function migrateState(candidate) {
  if (!candidate) return structuredClone(defaultState);

  const migrated = structuredClone(defaultState);
  Object.assign(migrated, candidate);

  if (!candidate.timer) {
    migrated.timer = {
      duration: candidate.duration || 300,
      remaining: candidate.remaining || candidate.duration || 300,
      running: false,
      lastStartedAt: null,
      completedAt: null
    };
  }

  if (candidate.monitors && !candidate.waits) {
    migrated.waits = candidate.monitors.map((monitor) => createWait(monitor.label, 10));
  }

  migrated.tasks = Array.isArray(candidate.tasks) ? candidate.tasks : defaultState.tasks;
  migrated.waits = Array.isArray(migrated.waits) ? migrated.waits : [];
  migrated.resumePoint = candidate.resumePoint || "";
  return migrated;
}

function loadState() {
  const saved = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
  if (!saved) return structuredClone(defaultState);

  try {
    return migrateState(JSON.parse(saved));
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState(force = false) {
  const current = now();
  if (!force && current - lastSavedAt < saveIntervalMs) return;
  lastSavedAt = current;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const rest = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatRemaining(ms) {
  if (ms <= 0) return "done";
  const minutes = Math.ceil(ms / 60000);
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

function playTone(kind = "tick") {
  if (!state.sounds) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = kind === "done" ? 660 : 420;
  gain.gain.value = 0.025;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
  oscillator.stop(audioContext.currentTime + 0.15);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function flashComplete() {
  timerRing.classList.remove("just-completed");
  requestAnimationFrame(() => timerRing.classList.add("just-completed"));
}

function completeTimer() {
  state.timer.running = false;
  state.timer.remaining = 0;
  state.timer.completedAt = now();
  playTone("done");
  flashComplete();
  showToast(state.resumePoint ? `Resume: ${state.resumePoint}` : "Dead time window complete.");
  saveState(true);
}

function renderTimer() {
  const timer = state.timer;
  timeDisplay.textContent = formatTime(timer.remaining);
  const elapsed = timer.duration - timer.remaining;
  const progress = timer.duration ? clamp((elapsed / timer.duration) * 360, 0, 360) : 0;
  timerRing.style.setProperty("--progress", `${progress}deg`);
  startPause.textContent = timer.running ? "Pause" : timer.remaining === 0 ? "Restart" : "Start";
  resetTimer.disabled = timer.remaining === timer.duration && !timer.running;

  if (timer.running) {
    statusText.textContent = "Counting down a focused wait";
    activeWindowTitle.textContent = state.resumePoint || "Stay close to the task without staring at it.";
    activeWindowCopy.textContent = "DeadTime keeps one next action visible while background work finishes.";
  } else if (timer.remaining === 0) {
    statusText.textContent = "Window complete";
    activeWindowTitle.textContent = state.resumePoint || "The wait is done.";
    activeWindowCopy.textContent = "Use the resume point and return before the gap turns into drift.";
  } else {
    statusText.textContent = "Watching for a useful gap";
    activeWindowTitle.textContent = "Use the wait without losing the thread.";
    activeWindowCopy.textContent = "Set a resume point, start a countdown, and keep the app quiet in the background.";
  }
}

function renderSuggestions() {
  suggestionList.innerHTML = "";
  const visible = [...suggestions, ...suggestions].slice(state.suggestionOffset, state.suggestionOffset + 4);

  visible.forEach((suggestion) => {
    const item = document.createElement("button");
    item.className = "suggestion";
    item.type = "button";
    item.innerHTML = `
      <span class="pill">${suggestion.time}</span>
      <span><strong>${suggestion.title}</strong><small>${suggestion.detail}</small></span>
      <span aria-hidden="true">›</span>
    `;
    item.addEventListener("click", () => {
      if (!state.resumePoint) {
        state.resumePoint = suggestion.title;
        resumeInput.value = state.resumePoint;
        renderTimer();
        showToast("Set as resume point.");
      } else {
        state.notes = `${notes.value}${notes.value.trim() ? "\n" : ""}${suggestion.title}: ${suggestion.detail}`;
        notes.value = state.notes;
        showToast("Added to scratchpad.");
      }
      playTone();
      saveState(true);
    });
    suggestionList.append(item);
  });
}

function updateWaits() {
  let changed = false;
  state.waits.forEach((wait) => {
    const elapsed = now() - wait.startedAt;
    if (!wait.done && elapsed >= wait.duration) {
      wait.done = true;
      wait.completedAt = now();
      changed = true;
    }
  });
  if (changed) {
    playTone("done");
    showToast("A tracked wait finished.");
    saveState(true);
  }
}

function renderWaits() {
  monitorList.innerHTML = "";

  if (!state.waits.length) {
    monitorList.append(emptyState("No waits are being tracked. Add one when a render, install, scan, or upload starts."));
    return;
  }

  state.waits.forEach((wait) => {
    const elapsed = now() - wait.startedAt;
    const progress = wait.done ? 100 : clamp((elapsed / wait.duration) * 100, 0, 99);
    const remaining = wait.done ? "done" : formatRemaining(wait.duration - elapsed);
    const item = document.createElement("div");
    item.className = "monitor";
    item.innerHTML = `
      <span class="pill">${Math.round(progress)}%</span>
      <span class="monitor-body">
        <strong>${escapeHtml(wait.label)}</strong>
        <small>${remaining}</small>
        <span class="progress-line"><i style="width: ${progress}%"></i></span>
      </span>
      <button class="icon-button" type="button" aria-label="Remove wait" title="Remove wait"><span aria-hidden="true">×</span></button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      state.waits = state.waits.filter((entry) => entry.id !== wait.id);
      saveState(true);
      renderWaits();
    });
    monitorList.append(item);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function emptyState(text) {
  const item = document.createElement("div");
  item.className = "empty-state";
  item.textContent = text;
  return item;
}

function renderTasks() {
  taskList.innerHTML = "";
  const done = state.tasks.filter((task) => task.done).length;
  taskCounter.textContent = `${done}/${state.tasks.length}`;

  if (!state.tasks.length) {
    taskList.append(emptyState("No mini tasks yet. Add something tiny enough to finish before the main work returns."));
    return;
  }

  state.tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = `task-item${task.done ? " done" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", `Complete ${task.text}`);

    const label = document.createElement("span");
    label.textContent = task.text;

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", "Delete task");
    deleteButton.title = "Delete task";
    deleteButton.innerHTML = `<span aria-hidden="true">×</span>`;

    checkbox.addEventListener("change", (event) => {
      task.done = event.target.checked;
      playTone();
      saveState(true);
      renderTasks();
    });
    deleteButton.addEventListener("click", () => {
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      saveState(true);
      renderTasks();
    });

    item.append(checkbox, label, deleteButton);
    taskList.append(item);
  });
}

function renderBreaks() {
  breakToggle.checked = state.breakEnabled;
  breakMeter.style.width = `${state.breakProgress}%`;
  breakLabel.textContent = state.breakEnabled
    ? `Next quiet break signal in ${Math.max(1, Math.ceil((100 - state.breakProgress) / 10))} min`
    : "Reminders paused";
}

function renderSettings() {
  root.dataset.theme = state.theme;
  body.classList.toggle("is-compact", state.compact);
  settingsPanel.classList.toggle("hidden", !state.settingsOpen);
  onboarding.classList.toggle("hidden", !state.hints || state.hintsDismissed);
  themeToggle.checked = state.theme === "dark";
  compactSetting.checked = state.compact;
  soundToggle.checked = state.sounds;
  hintsToggle.checked = state.hints;
}

function renderResume() {
  resumeInput.value = state.resumePoint;
}

function render() {
  renderSettings();
  renderTimer();
  renderResume();
  renderSuggestions();
  updateWaits();
  renderWaits();
  renderTasks();
  renderBreaks();
  notes.value = state.notes;
}

function applyTimerElapsed() {
  const timer = state.timer;
  if (!timer.running || !timer.lastStartedAt) return;
  const elapsed = (now() - timer.lastStartedAt) / 1000;
  timer.remaining = Math.max(0, timer.remaining - elapsed);
  timer.lastStartedAt = now();
  if (timer.remaining <= 0) completeTimer();
}

function tick() {
  applyTimerElapsed();

  if (state.breakEnabled) {
    state.breakProgress = (state.breakProgress + 0.04) % 101;
    if (state.breakProgress < 0.05) {
      playTone("done");
      showToast("Take a quiet reset when you can.");
    }
  }

  updateWaits();
  renderTimer();
  renderWaits();
  renderBreaks();
  saveState();
}

function ensureTicker() {
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, tickIntervalMs);
}

startPause.addEventListener("click", () => {
  const timer = state.timer;
  if (timer.remaining === 0) {
    timer.remaining = timer.duration;
    timer.completedAt = null;
  }
  timer.running = !timer.running;
  timer.lastStartedAt = timer.running ? now() : null;
  playTone();
  saveState(true);
  renderTimer();
});

resetTimer.addEventListener("click", () => {
  state.timer.running = false;
  state.timer.remaining = state.timer.duration;
  state.timer.lastStartedAt = null;
  state.timer.completedAt = null;
  saveState(true);
  renderTimer();
});

minusMinute.addEventListener("click", () => {
  state.timer.duration = Math.max(60, state.timer.duration - 60);
  state.timer.remaining = Math.min(state.timer.remaining, state.timer.duration);
  saveState(true);
  renderTimer();
});

plusMinute.addEventListener("click", () => {
  state.timer.duration = Math.min(3600, state.timer.duration + 60);
  state.timer.remaining = Math.min(state.timer.duration, state.timer.remaining + 60);
  saveState(true);
  renderTimer();
});

shuffleSuggestion.addEventListener("click", () => {
  state.suggestionOffset = (state.suggestionOffset + 1) % suggestions.length;
  playTone();
  saveState(true);
  renderSuggestions();
});

addMonitor.addEventListener("click", () => {
  waitLabel.focus();
});

waitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = waitLabel.value.trim() || "Background wait";
  state.waits.unshift(createWait(label, waitMinutes.value));
  waitLabel.value = "";
  waitMinutes.value = "10";
  playTone();
  saveState(true);
  renderWaits();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  state.tasks.unshift({ id: makeId(), text, done: false });
  taskInput.value = "";
  playTone();
  saveState(true);
  renderTasks();
});

notes.addEventListener("input", () => {
  state.notes = notes.value;
  saveState();
});

clearNotes.addEventListener("click", () => {
  state.notes = "";
  notes.value = "";
  saveState(true);
  showToast("Scratchpad cleared.");
});

resumeInput.addEventListener("input", () => {
  state.resumePoint = resumeInput.value.trim();
  saveState();
  renderTimer();
});

clearResume.addEventListener("click", () => {
  state.resumePoint = "";
  saveState(true);
  renderResume();
  renderTimer();
});

settingsToggle.addEventListener("click", () => {
  state.settingsOpen = !state.settingsOpen;
  saveState(true);
  renderSettings();
});

compactToggle.addEventListener("click", () => {
  state.compact = !state.compact;
  saveState(true);
  renderSettings();
});

themeToggle.addEventListener("change", () => {
  state.theme = themeToggle.checked ? "dark" : "light";
  saveState(true);
  renderSettings();
});

compactSetting.addEventListener("change", () => {
  state.compact = compactSetting.checked;
  saveState(true);
  renderSettings();
});

soundToggle.addEventListener("change", () => {
  state.sounds = soundToggle.checked;
  saveState(true);
  renderSettings();
});

hintsToggle.addEventListener("change", () => {
  state.hints = hintsToggle.checked;
  state.hintsDismissed = false;
  saveState(true);
  renderSettings();
});

dismissHints.addEventListener("click", () => {
  state.hintsDismissed = true;
  saveState(true);
  renderSettings();
});

breakToggle.addEventListener("change", () => {
  state.breakEnabled = breakToggle.checked;
  saveState(true);
  renderBreaks();
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.tool;
    if (tool === "note") notes.focus();
    if (tool === "task") taskInput.focus();
    if (tool === "resume") resumeInput.focus();
    if (tool === "tidy") {
      state.tasks = state.tasks.filter((task) => !task.done);
      state.waits = state.waits.filter((wait) => !wait.done);
      renderTasks();
      renderWaits();
      showToast("Completed items cleared.");
    }
    playTone();
    saveState(true);
  });
});

window.addEventListener("beforeunload", () => saveState(true));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    tick();
  }
});

render();
ensureTicker();
