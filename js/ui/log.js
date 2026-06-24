/**
 * Live logging screen.
 *
 * Flow: pick exercise → log sets one at a time (weight/reps/RPE/done).
 * Shows last session's numbers for reference. Prefills from active program.
 */

import { logSet, getSetsByDate, getSetsByExercise, estimateE1RM } from '../data/sets.js';
import { getAllExercises } from '../data/exercises.js';
import { getActiveProgram } from '../data/programs.js';
import { showToast } from './toast.js';

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

let state = {
  exercises: [],
  selectedExercise: null,
  todaySets: [],
  lastSessionSets: [],
  weight: '',
  reps: '',
  rpe: null,
  searchQuery: '',
  program: null,
  date: new Date().toISOString().slice(0, 10),
};

let container = null;
let db = null;

export const logPage = {
  async mount(el, ctx) {
    container = el;
    db = ctx.db;

    state.exercises = await getAllExercises(db);
    state.date = new Date().toISOString().slice(0, 10);
    state.todaySets = await getSetsByDate(db, state.date);
    state.program = await getActiveProgram(db);
    state.selectedExercise = null;
    state.searchQuery = '';

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
  } else {
    renderExercisePicker();
  }
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

  // Load last session for reference
  const allSets = await getSetsByExercise(db, exerciseId);
  const dates = [...new Set(allSets.map((s) => s.date))].sort().reverse();
  const lastDate = dates.find((d) => d < new Date().toISOString().slice(0, 10)) ?? dates[0];
  state.lastSessionSets = lastDate ? allSets.filter((s) => s.date === lastDate) : [];

  // Prefill weight from last session's last set
  if (state.lastSessionSets.length > 0) {
    const last = state.lastSessionSets[state.lastSessionSets.length - 1];
    state.weight = String(last.weight);
    state.reps = String(last.reps);
  }

  render();
}

function renderSetEntry() {
  const ex = state.selectedExercise;
  const todayForEx = state.todaySets.filter((s) => s.exerciseId === ex.id);

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">&#8592;</button>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">${ex.name}</h2>
      </div>

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
          <div class="card-header">Today &mdash; ${todayForEx.length} sets</div>
          <div class="flex flex-col gap-1">
            ${todayForEx.map((s, i) => `
              <div class="text-sm">
                Set ${i + 1}: <span class="font-mono">${s.weight} lbs × ${s.reps}</span>${s.rpe ? ` @ RPE ${s.rpe}` : ''}
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
    </div>
  `;

  // Events
  container.querySelector('#back-btn')?.addEventListener('click', () => {
    state.selectedExercise = null;
    render();
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

    if (!weight || weight <= 0 || !reps || reps <= 0) return;

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

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
