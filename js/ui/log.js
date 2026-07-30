/**
 * Live logging screen.
 *
 * Flow: pick exercise → log sets one at a time (weight/reps/RPE/done).
 * Shows last session's numbers for reference. Prefills from active program.
 */

import { logSet, getSetsByDate, getSetsByExercise, deleteSet, estimateE1RM } from '../data/sets.js';
import { getAllExercises } from '../data/exercises.js';
import { getActiveProgram, DEFAULT_PROGRESSION } from '../data/programs.js';
import { computeTarget, computeProgressionRate, adjustProgression } from '../engine/progression.js';
import { computeSessionVolume, getSessionAlerts } from '../engine/session.js';
import { getAllMuscles } from '../data/muscles.js';
import { showToast } from './toast.js';

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

let state = {
  exercises: [],
  muscles: [],
  selectedExercise: null,
  todaySets: [],
  lastSessionSets: [],
  weight: '',
  reps: '',
  rpe: null,
  searchQuery: '',
  program: null,
  date: new Date().toISOString().slice(0, 10),
  target: null,
  queue: null,
  queueIndex: 0,
};

let container = null;
let db = null;

export const logPage = {
  async mount(el, ctx) {
    container = el;
    db = ctx.db;

    state.exercises = await getAllExercises(db);
    state.muscles = await getAllMuscles(db);
    state.date = new Date().toISOString().slice(0, 10);
    state.todaySets = await getSetsByDate(db, state.date);
    state.program = await getActiveProgram(db);
    state.selectedExercise = null;
    state.searchQuery = '';

    // Check for session queue from dashboard
    if (ctx.sessionQueue && ctx.sessionQueue.length > 0) {
      state.queue = ctx.sessionQueue;
      ctx.sessionQueue = null;
    } else {
      state.queue = null;
    }

    // Dashboard tapped a specific rec — open its set-entry screen directly.
    const openId = ctx.sessionOpenExerciseId;
    ctx.sessionOpenExerciseId = null;
    if (openId && state.exercises.some((e) => e.id === openId)) {
      state.queueIndex = state.queue
        ? Math.max(0, state.queue.findIndex((q) => q.exercise.id === openId))
        : 0;
      await selectExercise(openId); // renders the set-entry screen
      return;
    }

    render();
  },

  unmount() {
    container = null;
  },
};

function render() {
  if (!container) return;

  if (state.selectedExercise) {
    renderSetEntry();
  } else if (state.queue) {
    renderQueueList();
  } else {
    renderExercisePicker();
  }
}

function renderQueueList() {
  const isToday = state.date === new Date().toISOString().slice(0, 10);
  const dateLabel = isToday ? 'Today' : formatDateShort(state.date);

  // Track which queue exercises have logged sets today
  const loggedByEx = {};
  for (const s of state.todaySets) {
    loggedByEx[s.exerciseId] = (loggedByEx[s.exerciseId] ?? 0) + 1;
  }

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center justify-between">
        <h2 style="font-size: var(--text-xl); font-weight: 700;">Today's Workout</h2>
        <button class="btn btn-ghost btn-sm" id="exit-queue-btn">Browse All</button>
      </div>

      ${state.todaySets.length > 0 ? `
        <div class="text-sm text-muted">${state.todaySets.length} sets logged ${dateLabel.toLowerCase()}</div>
      ` : ''}

      <div class="flex flex-col gap-3">
        ${state.queue.map((item, i) => {
          const setsLogged = loggedByEx[item.exercise.id] ?? 0;
          const done = setsLogged >= item.sets;
          return `
            <div class="card flex flex-col gap-2" style="${done ? 'opacity:0.5;' : ''}">
              <div class="flex items-center justify-between">
                <button class="queue-exercise-btn" data-index="${i}" style="background:none;border:none;cursor:pointer;text-align:left;flex:1;-webkit-tap-highlight-color:transparent;">
                  <div style="font-weight:600;color:var(--text-primary);font-size:var(--text-base);">${item.exercise.name}</div>
                  <div class="text-sm text-muted">${item.reason}</div>
                </button>
                <div class="flex items-center gap-2">
                  ${setsLogged > 0 ? `<span class="pill pill-ready">${setsLogged}/${item.sets}</span>` : `<span class="text-sm text-muted">${item.sets} sets</span>`}
                  <button class="btn btn-ghost btn-sm queue-swap-btn" data-index="${i}" style="min-height:32px;padding:4px 8px;">Swap</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button class="btn btn-secondary w-full" id="add-exercise-btn">+ Add Exercise</button>
    </div>
  `;

  // Tap exercise to log sets
  container.querySelectorAll('.queue-exercise-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.queueIndex = parseInt(btn.dataset.index, 10);
      await selectExercise(state.queue[state.queueIndex].exercise.id);
    });
  });

  // Swap
  container.querySelectorAll('.queue-swap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.queueIndex = parseInt(btn.dataset.index, 10);
      state.selectedExercise = state.queue[state.queueIndex].exercise;
      renderSwapPicker();
    });
  });

  // Exit queue to browse all
  container.querySelector('#exit-queue-btn')?.addEventListener('click', () => {
    state.queue = null;
    render();
  });

  // Add exercise from full library
  container.querySelector('#add-exercise-btn')?.addEventListener('click', () => {
    state.queue = null;
    render();
  });
}

function renderExercisePicker() {
  const filtered = state.searchQuery
    ? state.exercises.filter((e) =>
        e.name.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : state.exercises;

  // Group by pattern
  const groups = {};
  for (const ex of filtered) {
    const key = ex.pattern.replace(/-/g, ' ');
    if (!groups[key]) groups[key] = [];
    groups[key].push(ex);
  }

  // Today's logged exercises for quick access
  const todayExIds = [...new Set(state.todaySets.map((s) => s.exerciseId))];
  const todayExercises = todayExIds
    .map((id) => state.exercises.find((e) => e.id === id))
    .filter(Boolean);

  const isToday = state.date === new Date().toISOString().slice(0, 10);
  const dateLabel = isToday ? 'Today' : formatDateShort(state.date);

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center justify-between">
        <h2 style="font-size: var(--text-xl); font-weight: 700;">Log Workout</h2>
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted">${dateLabel}</span>
          <input type="date" id="log-date" class="input" value="${state.date}"
            max="${new Date().toISOString().slice(0, 10)}"
            style="min-height:36px;width:auto;padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
        </div>
      </div>

      <input class="input" type="text" id="exercise-search"
        placeholder="Search exercises..." value="${state.searchQuery}">

      ${todayExercises.length > 0 ? `
        <div class="flex flex-col gap-2">
          <span class="card-header">Continue ${dateLabel}</span>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            ${todayExercises.map((ex) => `
              <button class="btn btn-secondary btn-sm exercise-quick" data-id="${ex.id}">
                ${ex.name}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${state.todaySets.length > 0 ? `
        <div class="card">
          <div class="card-header">${dateLabel} &mdash; ${state.todaySets.length} sets</div>
          ${renderTodaySummary()}
        </div>
      ` : ''}

      <div id="exercise-list" class="flex flex-col gap-3"></div>
    </div>
  `;

  updateExerciseList(filtered);

  // Event listeners
  container.querySelector('#log-date')?.addEventListener('change', async (e) => {
    state.date = e.target.value;
    state.todaySets = await getSetsByDate(db, state.date);
    state.selectedExercise = null;
    render();
  });

  container.querySelector('#exercise-search')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    const f = state.searchQuery
      ? state.exercises.filter((ex) => ex.name.toLowerCase().includes(state.searchQuery.toLowerCase()))
      : state.exercises;
    updateExerciseList(f);
  });

  container.querySelectorAll('.exercise-quick').forEach((btn) => {
    btn.addEventListener('click', () => selectExercise(btn.dataset.id));
  });
}

function updateExerciseList(filtered) {
  const listEl = container?.querySelector('#exercise-list');
  if (!listEl) return;

  const groups = {};
  for (const ex of filtered) {
    const key = ex.pattern.replace(/-/g, ' ');
    if (!groups[key]) groups[key] = [];
    groups[key].push(ex);
  }

  listEl.innerHTML = Object.entries(groups).map(([pattern, exs]) => `
    <div>
      <span class="card-header">${pattern}</span>
      <div class="flex flex-col gap-2 mt-2">
        ${exs.map((ex) => `
          <button class="card exercise-pick" data-id="${ex.id}" style="cursor:pointer;text-align:left;">
            <div style="font-weight:600;">${ex.name}</div>
            <div class="text-sm text-muted">${ex.equipment} &middot; ${Object.keys(ex.muscles).map((m) => m.replace(/-/g, ' ')).join(', ')}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.exercise-pick').forEach((btn) => {
    btn.addEventListener('click', () => selectExercise(btn.dataset.id));
  });
}

async function selectExercise(exerciseId) {
  state.selectedExercise = state.exercises.find((e) => e.id === exerciseId);
  state.weight = '';
  state.reps = '';
  state.rpe = null;
  state.target = null;

  // Load all sets for this exercise
  const allSets = await getSetsByExercise(db, exerciseId);
  const dates = [...new Set(allSets.map((s) => s.date))].sort().reverse();
  const lastDate = dates.find((d) => d < new Date().toISOString().slice(0, 10)) ?? dates[0];
  state.lastSessionSets = lastDate ? allSets.filter((s) => s.date === lastDate) : [];

  // Compute progressive overload target
  const ex = state.selectedExercise;
  const defaultProg = DEFAULT_PROGRESSION[ex?.pattern] ?? DEFAULT_PROGRESSION['isolation'];

  // Check if this exercise is in the active program with a custom progression
  let progression = defaultProg;
  if (state.program) {
    for (const day of state.program.days) {
      const slot = day.slots.find((s) => s.exerciseId === exerciseId);
      if (slot?.progression) {
        progression = slot.progression;
        break;
      }
    }
  }

  // Auto-adjust progression based on actual rate
  const rate = computeProgressionRate(allSets);
  if (rate.trend !== 'insufficient') {
    const adjusted = adjustProgression(progression, rate);
    progression = adjusted.progression;
  }

  state.target = computeTarget(allSets, progression);

  // Prefill with target if available, otherwise last session
  if (state.target) {
    state.weight = String(state.target.targetWeight);
    state.reps = String(state.target.targetReps);
  } else if (state.lastSessionSets.length > 0) {
    const last = state.lastSessionSets[state.lastSessionSets.length - 1];
    state.weight = String(last.weight);
    state.reps = String(last.reps);
  }

  render();
}

function renderSetEntry() {
  const ex = state.selectedExercise;
  const todayForEx = state.todaySets.filter((s) => s.exerciseId === ex.id);
  const isToday = state.date === new Date().toISOString().slice(0, 10);

  const inQueue = state.queue !== null;
  const queueItem = inQueue ? state.queue[state.queueIndex] : null;
  const queueTotal = inQueue ? state.queue.length : 0;

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">&#8592;</button>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">${ex.name}</h2>
        ${inQueue ? '<button class="btn btn-ghost btn-sm" id="swap-btn" style="margin-left:auto;">Swap</button>' : ''}
      </div>

      ${inQueue && queueItem ? `
        <div class="text-sm text-muted">${queueItem.reason}</div>
      ` : ''}

      ${state.target ? `
        <div class="card" style="border-left: 3px solid var(--accent);">
          <div class="card-header">Target today</div>
          <div class="card-value" style="font-size:var(--text-2xl);">${state.target.targetWeight} <span style="font-size:var(--text-lg);color:var(--text-secondary);">lbs</span> × ${state.target.targetReps}</div>
          <div class="text-sm text-muted mt-2">${state.target.note}</div>
        </div>
      ` : ''}

      ${state.lastSessionSets.length > 0 ? `
        <div class="card">
          <div class="card-header">Last session</div>
          <div class="flex flex-col gap-1">
            ${state.lastSessionSets.map((s, i) => `
              <div class="text-sm" style="color:var(--text-secondary);">
                Set ${i + 1}: <span class="font-mono" style="color:var(--text-primary);">${s.weight} lbs × ${s.reps}</span>${s.rpe ? ` @ RPE ${s.rpe}` : ''} <span class="text-muted">(e1RM ${estimateE1RM(s.weight, s.reps)})</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${todayForEx.length > 0 ? `
        <div class="card">
          <div class="card-header">${isToday ? 'Today' : formatDateShort(state.date)} &mdash; ${todayForEx.length} sets</div>
          <div class="flex flex-col gap-1">
            ${todayForEx.map((s, i) => `
              <div class="flex items-center justify-between">
                <div class="text-sm">
                  Set ${i + 1}: <span class="font-mono">${s.weight} lbs × ${s.reps}</span>${s.rpe ? ` @ RPE ${s.rpe}` : ''}
                </div>
                <button class="btn btn-ghost btn-sm delete-set" data-set-id="${s.id}" style="min-height:28px;padding:2px 8px;color:var(--text-muted);">&times;</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="card flex flex-col gap-4">
        <div class="card-header">Set ${todayForEx.length + 1}</div>

        <div class="flex gap-3">
          <div class="flex flex-col gap-1" style="flex:1;">
            <label class="text-sm text-muted">Weight (lbs)</label>
            <input class="input font-mono" type="number" inputmode="decimal" id="input-weight"
              value="${state.weight}" style="font-size:var(--text-2xl);text-align:center;">
          </div>
          <div class="flex flex-col gap-1" style="flex:1;">
            <label class="text-sm text-muted">Reps</label>
            <input class="input font-mono" type="number" inputmode="numeric" id="input-reps"
              value="${state.reps}" style="font-size:var(--text-2xl);text-align:center;">
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-muted">RPE</label>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            ${RPE_OPTIONS.map((r) => `
              <button class="btn btn-sm rpe-btn ${state.rpe === r ? 'btn-primary' : 'btn-secondary'}" data-rpe="${r}">${r}</button>
            `).join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-lg w-full" id="log-set-btn">
          Log Set
        </button>
      </div>

      ${renderSessionTracker()}

    </div>
  `;

  // Events
  container.querySelector('#back-btn')?.addEventListener('click', () => {
    state.selectedExercise = null;
    render();
  });

  // Swap exercise
  container.querySelector('#swap-btn')?.addEventListener('click', () => {
    renderSwapPicker();
  });

  container.querySelectorAll('.delete-set').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const setId = btn.dataset.setId;
      try {
        await deleteSet(db, setId);
        state.todaySets = state.todaySets.filter((s) => s.id !== setId);
        showToast('Set deleted');
        render();
      } catch (err) {
        showToast('Delete failed');
      }
    });
  });

  container.querySelector('#input-weight')?.addEventListener('input', (e) => {
    state.weight = e.target.value;
  });

  container.querySelector('#input-reps')?.addEventListener('input', (e) => {
    state.reps = e.target.value;
  });

  container.querySelectorAll('.rpe-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rpe = parseFloat(btn.dataset.rpe);
      // Update active state
      container.querySelectorAll('.rpe-btn').forEach((b) => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
    });
  });

  container.querySelector('#log-set-btn')?.addEventListener('click', async () => {
    const weight = parseFloat(state.weight);
    const reps = parseInt(state.reps, 10);

    if (!weight || weight <= 0 || weight > 1500 || !reps || reps <= 0 || reps > 100) return;

    const isToday = state.date === new Date().toISOString().slice(0, 10);
    const record = await logSet(db, {
      exerciseId: ex.id,
      programId: state.program?.id ?? null,
      date: isToday ? null : state.date,
      weight,
      reps,
      rpe: state.rpe,
    });

    state.todaySets.push(record);
    showToast(`${weight} lbs × ${reps} logged`);

    // Keep weight, clear reps for next set
    state.rpe = null;
    render();
  });
}

function renderSessionTracker() {
  if (state.todaySets.length === 0) return '';

  const sessionVol = computeSessionVolume(state.todaySets, state.exercises);
  const alerts = getSessionAlerts(sessionVol, state.muscles);

  // Show the current exercise's muscles first, then any alerts
  const ex = state.selectedExercise;
  const relevantMuscles = ex
    ? Object.entries(ex.muscles)
        .filter(([, f]) => f >= 0.3)
        .map(([id]) => id)
    : [];

  // Build display: relevant muscles for current exercise + any alerts
  const displayed = new Set();
  const rows = [];

  for (const muscleId of relevantMuscles) {
    const sv = sessionVol[muscleId];
    if (!sv) continue;
    displayed.add(muscleId);
    rows.push({ muscleId, ...sv });
  }

  for (const alert of alerts) {
    if (!displayed.has(alert.muscleId)) {
      rows.push({ muscleId: alert.muscleId, sets: alert.sets, cap: alert.cap, status: alert.status });
    }
  }

  if (rows.length === 0) return '';

  const muscleNames = Object.fromEntries(state.muscles.map((m) => [m.id, m.name]));

  return `
    <div class="flex flex-col gap-2" style="margin-top:var(--sp-2);">
      <div class="text-sm text-muted" style="font-weight:600;">Session Volume</div>
      ${rows.map((r) => {
        const name = muscleNames[r.muscleId] ?? r.muscleId;
        const pct = Math.min(100, (r.sets / r.cap) * 100);
        const barColor = r.status === 'over' ? 'var(--overworked)'
          : r.status === 'warning' ? 'var(--recovering)'
          : 'var(--ready)';
        const label = r.status === 'over' ? ' — diminishing returns'
          : r.status === 'warning' ? ' — approaching limit'
          : '';
        return `
          <div>
            <div class="flex justify-between" style="font-size:var(--text-xs);color:var(--text-secondary);">
              <span>${name}${label}</span>
              <span class="font-mono">${r.sets}/${r.cap}</span>
            </div>
            <div class="progress" style="height:4px;">
              <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTodaySummary() {
  // Group today's sets by exercise
  const byEx = {};
  for (const s of state.todaySets) {
    if (!byEx[s.exerciseId]) byEx[s.exerciseId] = [];
    byEx[s.exerciseId].push(s);
  }

  return Object.entries(byEx).map(([exId, sets]) => {
    const ex = state.exercises.find((e) => e.id === exId);
    const name = ex?.name ?? exId;
    return `<div class="text-sm">${name}: <span class="font-mono">${sets.length} sets</span></div>`;
  }).join('');
}

function renderSwapPicker() {
  if (!container || !state.selectedExercise) return;

  const current = state.selectedExercise;
  // Find exercises covering the same primary muscles
  const currentMuscles = Object.entries(current.muscles)
    .filter(([, f]) => f >= 0.5)
    .map(([id]) => id);

  // Exercises already in the queue
  const queueIds = new Set((state.queue ?? []).map((q) => q.exercise.id));

  // Score alternatives by muscle overlap
  const alternatives = state.exercises
    .filter((ex) => ex.id !== current.id && !queueIds.has(ex.id))
    .map((ex) => {
      let overlap = 0;
      for (const muscleId of currentMuscles) {
        if (ex.muscles[muscleId] && ex.muscles[muscleId] >= 0.3) {
          overlap += ex.muscles[muscleId];
        }
      }
      return { exercise: ex, overlap };
    })
    .filter((a) => a.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 8);

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" id="swap-back-btn">&#8592;</button>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">Swap ${current.name}</h2>
      </div>
      <p class="text-sm text-muted">Alternatives covering ${currentMuscles.map((m) => m.replace(/-/g, ' ')).join(', ')}:</p>
      <div class="flex flex-col gap-2">
        ${alternatives.map((a) => `
          <button class="card swap-pick" data-id="${a.exercise.id}" style="cursor:pointer;text-align:left;">
            <div style="font-weight:600;">${a.exercise.name}</div>
            <div class="text-sm text-muted">${a.exercise.equipment} &middot; ${a.exercise.pattern.replace(/-/g, ' ')}</div>
          </button>
        `).join('')}
        ${alternatives.length === 0 ? '<div class="text-sm text-muted">No alternatives found.</div>' : ''}
      </div>
    </div>
  `;

  container.querySelector('#swap-back-btn')?.addEventListener('click', () => {
    render(); // go back to set entry
  });

  container.querySelectorAll('.swap-pick').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newEx = state.exercises.find((e) => e.id === btn.dataset.id);
      if (!newEx) return;

      // Update queue if in queue mode
      if (state.queue && state.queue[state.queueIndex]) {
        state.queue[state.queueIndex] = {
          ...state.queue[state.queueIndex],
          exercise: newEx,
          reason: state.queue[state.queueIndex].reason + ' (swapped)',
        };
      }

      await selectExercise(newEx.id);
    });
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
