/**
 * Program / template builder screen.
 *
 * Light "template" approach: name your days, app recommends exercises.
 * Shows live per-muscle volume totals against landmarks.
 */

import { getAllExercises } from '../data/exercises.js';
import { getAllLandmarks } from '../data/landmarks.js';
import { getAllMuscles } from '../data/muscles.js';
import { getActiveProgram, createProgram, updateProgram, setActiveProgram, getAllPrograms, DEFAULT_PROGRESSION } from '../data/programs.js';

let state = {
  program: null,
  allPrograms: [],
  exercises: [],
  landmarks: [],
  muscles: [],
  editingDay: null,
  newDayName: '',
  addingExercise: false,
  exerciseSearch: '',
};

let container = null;
let db = null;

export const programPage = {
  async mount(el, ctx) {
    container = el;
    db = ctx.db;

    state.exercises = await getAllExercises(db);
    state.landmarks = await getAllLandmarks(db);
    state.muscles = await getAllMuscles(db);
    state.allPrograms = await getAllPrograms(db);
    state.program = state.allPrograms.find((p) => p.active) ?? null;
    state.editingDay = null;
    state.addingExercise = false;

    render();
  },

  unmount() {
    container = null;
  },
};

function render() {
  if (!container) return;

  if (!state.program) {
    renderNewProgram();
  } else if (state.editingDay !== null) {
    renderDayEditor();
  } else {
    renderProgramOverview();
  }
}

function renderNewProgram() {
  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <h2 style="font-size: var(--text-xl); font-weight: 700;">Create Program</h2>
      <p class="text-sm text-muted">Set up your training split. Name your days and the app will help fill them with exercises.</p>

      <input class="input" type="text" id="program-name" placeholder="Program name (e.g. Push/Pull/Legs)">

      <div class="flex gap-3">
        <div class="flex flex-col gap-1" style="flex:1;">
          <label class="text-sm text-muted">Weeks</label>
          <input class="input" type="number" id="program-weeks" value="4" min="1" max="12">
        </div>
        <div class="flex flex-col gap-1" style="flex:1;">
          <label class="text-sm text-muted">Deload week</label>
          <input class="input" type="number" id="program-deload" placeholder="e.g. 5" min="1" max="12">
        </div>
      </div>

      <button class="btn btn-primary w-full" id="create-program-btn">Create</button>

      ${state.allPrograms.length > 0 ? `
        <div class="flex flex-col gap-2 mt-4">
          <span class="card-header">Existing Programs</span>
          ${state.allPrograms.map((p) => `
            <div class="card flex items-center justify-between" style="cursor:pointer;" data-program-id="${p.id}">
              <div>
                <div style="font-weight:600;">${p.name}</div>
                <div class="text-sm text-muted">${p.days.length} days &middot; ${p.weeks} weeks${p.active ? ' &middot; active' : ''}</div>
              </div>
              ${!p.active ? '<button class="btn btn-sm btn-secondary activate-btn">Activate</button>' : '<span class="pill pill-ready">Active</span>'}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  container.querySelector('#create-program-btn')?.addEventListener('click', async () => {
    const name = container.querySelector('#program-name')?.value?.trim();
    if (!name) return;

    const weeks = parseInt(container.querySelector('#program-weeks')?.value, 10) || 4;
    const deloadVal = container.querySelector('#program-deload')?.value;
    const deloadWeek = deloadVal ? parseInt(deloadVal, 10) : null;

    state.program = await createProgram(db, { name, weeks, deloadWeek, days: [] });
    state.allPrograms = await getAllPrograms(db);
    render();
  });

  container.querySelectorAll('.activate-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('[data-program-id]');
      const id = card.dataset.programId;
      await setActiveProgram(db, id);
      state.allPrograms = await getAllPrograms(db);
      state.program = state.allPrograms.find((p) => p.active) ?? null;
      render();
    });
  });
}

function renderProgramOverview() {
  const p = state.program;
  const volumeByMuscle = computeProgramVolume(p);

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center justify-between">
        <h2 style="font-size: var(--text-xl); font-weight: 700;">${p.name}</h2>
        <button class="btn btn-ghost btn-sm" id="new-program-btn">New</button>
      </div>

      <div class="text-sm text-muted">${p.weeks} weeks${p.deloadWeek ? `, deload week ${p.deloadWeek}` : ''}</div>

      <!-- Days -->
      <div class="flex flex-col gap-3">
        ${p.days.map((day, i) => `
          <div class="card" style="cursor:pointer;" data-day="${i}">
            <div class="flex items-center justify-between">
              <div style="font-weight:600;">${day.name}</div>
              <span class="text-sm text-muted">${day.slots.length} exercises</span>
            </div>
            ${day.slots.length > 0 ? `
              <div class="flex flex-col gap-1 mt-2">
                ${day.slots.map((slot) => {
                  const ex = state.exercises.find((e) => e.id === slot.exerciseId);
                  return `<div class="text-sm text-muted">${ex?.name ?? slot.exerciseId} &middot; ${slot.targetSets}&times;${slot.targetReps}</div>`;
                }).join('')}
              </div>
            ` : '<div class="text-sm text-muted mt-2">Tap to add exercises</div>'}
          </div>
        `).join('')}

        <!-- Add day -->
        <div class="flex gap-2">
          <input class="input" type="text" id="new-day-name" placeholder="Day name (e.g. Push)" style="flex:1;">
          <button class="btn btn-secondary" id="add-day-btn">Add Day</button>
        </div>
      </div>

      <!-- Volume checker -->
      <div class="card flex flex-col gap-3">
        <div class="card-header">Weekly Volume Check</div>
        ${renderVolumeCheck(volumeByMuscle)}
      </div>
    </div>
  `;

  // Events
  container.querySelector('#new-program-btn')?.addEventListener('click', () => {
    state.program = null;
    render();
  });

  container.querySelector('#add-day-btn')?.addEventListener('click', async () => {
    const name = container.querySelector('#new-day-name')?.value?.trim();
    if (!name) return;

    const days = [...p.days, { name, slots: [] }];
    await updateProgram(db, p.id, { days });
    state.program = { ...p, days };
    render();
  });

  container.querySelectorAll('[data-day]').forEach((el) => {
    el.addEventListener('click', () => {
      state.editingDay = parseInt(el.dataset.day, 10);
      state.addingExercise = false;
      state.exerciseSearch = '';
      render();
    });
  });
}

function renderDayEditor() {
  const p = state.program;
  const dayIdx = state.editingDay;
  const day = p.days[dayIdx];

  if (state.addingExercise) {
    renderAddExercise(day, dayIdx);
    return;
  }

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">&#8592;</button>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">${day.name}</h2>
      </div>

      <div class="flex flex-col gap-2">
        ${day.slots.map((slot, i) => {
          const ex = state.exercises.find((e) => e.id === slot.exerciseId);
          return `
            <div class="card flex items-center justify-between">
              <div>
                <div style="font-weight:600;">${ex?.name ?? slot.exerciseId}</div>
                <div class="text-sm text-muted">${slot.targetSets} sets &times; ${slot.targetReps} reps</div>
              </div>
              <button class="btn btn-ghost btn-sm remove-slot" data-slot="${i}">&times;</button>
            </div>
          `;
        }).join('')}
      </div>

      <button class="btn btn-secondary w-full" id="add-exercise-btn">+ Add Exercise</button>
    </div>
  `;

  container.querySelector('#back-btn')?.addEventListener('click', () => {
    state.editingDay = null;
    render();
  });

  container.querySelector('#add-exercise-btn')?.addEventListener('click', () => {
    state.addingExercise = true;
    render();
  });

  container.querySelectorAll('.remove-slot').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const slotIdx = parseInt(btn.dataset.slot, 10);
      const newSlots = day.slots.filter((_, i) => i !== slotIdx);
      const newDays = [...p.days];
      newDays[dayIdx] = { ...day, slots: newSlots };
      await updateProgram(db, p.id, { days: newDays });
      state.program = { ...p, days: newDays };
      render();
    });
  });
}

function renderAddExercise(day, dayIdx) {
  const p = state.program;
  const usedIds = new Set(day.slots.map((s) => s.exerciseId));
  const available = state.exercises.filter((e) => !usedIds.has(e.id));
  const filtered = state.exerciseSearch
    ? available.filter((e) => e.name.toLowerCase().includes(state.exerciseSearch.toLowerCase()))
    : available;

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">&#8592;</button>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">Add to ${day.name}</h2>
      </div>

      <input class="input" type="text" id="ex-search" placeholder="Search..." value="${state.exerciseSearch}">

      <div class="flex flex-col gap-2">
        ${filtered.map((ex) => `
          <button class="card pick-exercise" data-id="${ex.id}" style="cursor:pointer;text-align:left;">
            <div style="font-weight:600;">${ex.name}</div>
            <div class="text-sm text-muted">${ex.equipment} &middot; ${ex.pattern.replace(/-/g, ' ')}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#back-btn')?.addEventListener('click', () => {
    state.addingExercise = false;
    render();
  });

  container.querySelector('#ex-search')?.addEventListener('input', (e) => {
    state.exerciseSearch = e.target.value;
    render();
  });

  container.querySelectorAll('.pick-exercise').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const exId = btn.dataset.id;
      const ex = state.exercises.find((e) => e.id === exId);
      const progression = DEFAULT_PROGRESSION[ex?.pattern] ?? DEFAULT_PROGRESSION['isolation'];

      const newSlot = {
        exerciseId: exId,
        targetSets: 3,
        targetReps: '8-12',
        progression,
      };

      const newDays = [...p.days];
      newDays[dayIdx] = { ...day, slots: [...day.slots, newSlot] };
      await updateProgram(db, p.id, { days: newDays });
      state.program = { ...p, days: newDays };
      state.addingExercise = false;
      render();
    });
  });
}

function computeProgramVolume(program) {
  const volume = {};
  const exMap = Object.fromEntries(state.exercises.map((e) => [e.id, e]));

  for (const day of program.days) {
    for (const slot of day.slots) {
      const ex = exMap[slot.exerciseId];
      if (!ex) continue;
      for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
        volume[muscleId] = (volume[muscleId] ?? 0) + fraction * slot.targetSets;
      }
    }
  }

  return volume;
}

function renderVolumeCheck(volumeByMuscle) {
  return state.landmarks.map((lm) => {
    const sets = Math.round((volumeByMuscle[lm.muscleId] ?? 0) * 10) / 10;
    const muscle = state.muscles.find((m) => m.id === lm.muscleId);
    const name = muscle?.name ?? lm.muscleId;

    let status, fillClass;
    if (sets < lm.mev) {
      status = 'under';
      fillClass = 'progress-fill-overworked';
    } else if (sets > lm.mrv) {
      status = 'over';
      fillClass = 'progress-fill-overworked';
    } else {
      status = 'good';
      fillClass = sets <= lm.mav ? 'progress-fill-ready' : 'progress-fill-recovering';
    }

    const pct = Math.min(100, (sets / lm.mrv) * 100);

    // MEV and MAV markers as percentage of MRV
    const mevPct = (lm.mev / lm.mrv) * 100;
    const mavPct = (lm.mav / lm.mrv) * 100;

    return `
      <div class="progress-labeled">
        <div class="progress-label">
          <span>${name} ${status === 'under' ? '<span style="color:var(--overworked);">&#9660; under</span>' : status === 'over' ? '<span style="color:var(--overworked);">&#9650; over</span>' : ''}</span>
          <span class="font-mono">${sets} / ${lm.mev}-${lm.mrv}</span>
        </div>
        <div class="progress" style="position:relative;">
          <div class="${fillClass} progress-fill" style="width:${pct}%"></div>
          <div style="position:absolute;left:${mevPct}%;top:0;bottom:0;width:1px;background:var(--text-muted);opacity:0.4;"></div>
          <div style="position:absolute;left:${mavPct}%;top:0;bottom:0;width:1px;background:var(--ready);opacity:0.4;"></div>
        </div>
      </div>
    `;
  }).join('');
}
