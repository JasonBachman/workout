/**
 * Home dashboard screen.
 *
 * - Body-map heatmap colored by readiness
 * - "Recommended session today" card from the recommender
 * - "This week" panel flagging neglected/overworked muscles
 */

import { getAllExercises } from '../data/exercises.js';
import { getAllMuscles } from '../data/muscles.js';
import { getAllLandmarks } from '../data/landmarks.js';
import { getAllSets } from '../data/sets.js';
import { recommend } from '../engine/recommend.js';
import { computeWeeklyVolume, evaluateVolume, filterToWindow, checkAntagonistBalance } from '../engine/volume.js';
import { computeReadiness } from '../engine/readiness.js';
import { analyzeProgression } from '../engine/progression.js';
import { getActiveProgram } from '../data/programs.js';
import { getGoalMap } from '../data/goals.js';
import { renderBodyMap } from './bodymap.js';

let container = null;

export const homePage = {
  async mount(el, ctx) {
    container = el;
    const db = ctx.db;

    // Load all data
    const [exercises, muscles, landmarks, allSets] = await Promise.all([
      getAllExercises(db),
      getAllMuscles(db),
      getAllLandmarks(db),
      getAllSets(db),
    ]);

    const now = new Date();

    // Compute readiness
    const readiness = computeReadiness(allSets, exercises, muscles, now);

    // Weekly volume
    const weeklySets = filterToWindow(allSets, 7, now);
    const volume = computeWeeklyVolume(weeklySets, exercises, allSets);
    const volumeStatus = evaluateVolume(volume, landmarks);

    // Antagonist balance
    const balanceWarnings = checkAntagonistBalance(volume);

    // Recommendation (with goal priorities)
    const goalMap = await getGoalMap(db);
    const rec = recommend({ sets: allSets, exercises, muscles, landmarks }, { asOf: now, goalMap });

    // Progression analysis
    const program = await getActiveProgram(db);
    const progressionData = analyzeProgression(program, allSets);
    const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

    // Muscle name lookup
    const muscleNames = Object.fromEntries(muscles.map((m) => [m.id, m.name]));

    render({ readiness, volumeStatus, balanceWarnings, rec, muscleNames, weeklySets, progressionData, exMap, ctx, exercises });
  },

  unmount() {
    container = null;
  },
};

function render({ readiness, volumeStatus, balanceWarnings, rec, muscleNames, weeklySets, progressionData, exMap, ctx, exercises }) {
  if (!container) return;

  const neglected = volumeStatus.filter((v) => v.status === 'under');
  const overworked = volumeStatus.filter((v) => v.status === 'over');

  container.innerHTML = `
    <div class="container flex flex-col gap-6" style="padding-top: var(--sp-4);">

      <!-- Header -->
      <div>
        <h1 style="font-size: var(--text-2xl); font-weight: 700;">Dashboard</h1>
        <p class="text-sm text-muted">${formatDate(new Date())}</p>
      </div>

      <!-- Systemic status -->
      ${readiness.systemic.fatigued ? `
        <div class="card" style="border-left: 3px solid var(--overworked);">
          <div style="font-weight:600;color:var(--overworked);">Systemic Fatigue Detected</div>
          <div class="text-sm text-muted mt-2">
            Acute:Chronic ratio ${readiness.systemic.ratio} (${readiness.systemic.level}).
            Consider a lighter session or rest day.
          </div>
        </div>
      ` : ''}

      <!-- Body Map -->
      <div class="card">
        <div class="card-header">Muscle Readiness</div>
        ${renderBodyMap(readiness)}
        <div class="flex gap-4 mt-4" style="justify-content:center;">
          <div class="flex items-center gap-2"><div style="width:12px;height:12px;border-radius:50%;background:var(--ready);"></div><span class="text-sm text-muted">Ready</span></div>
          <div class="flex items-center gap-2"><div style="width:12px;height:12px;border-radius:50%;background:var(--recovering);"></div><span class="text-sm text-muted">Recovering</span></div>
          <div class="flex items-center gap-2"><div style="width:12px;height:12px;border-radius:50%;background:var(--overworked);"></div><span class="text-sm text-muted">Fatigued</span></div>
        </div>
      </div>

      <!-- Recommended Session -->
      <div class="card">
        <div class="card-header">${rec.dayActive ? 'Finish Today' : 'Recommended Today'}${rec.sessionFocus ? ` — ${rec.sessionFocus}` : ''}</div>
        ${rec.picks.length > 0 ? `
          <div class="flex flex-col gap-2 mt-2">
            ${rec.picks.map((pick) => `
              <button class="rec-pick flex items-center justify-between" data-ex-id="${pick.exercise.id}"
                style="background:none;border:none;width:100%;text-align:left;cursor:pointer;padding:var(--sp-2) 0;-webkit-tap-highlight-color:transparent;">
                <div>
                  <div style="font-weight:600;color:var(--text-primary);">${pick.exercise.name}</div>
                  <div class="text-sm text-muted">${pick.reason}</div>
                </div>
                <span class="font-mono text-sm" style="color:var(--text-secondary);white-space:nowrap;">${pick.sets} sets &rsaquo;</span>
              </button>
            `).join('')}
            <div class="flex items-center justify-between mt-1" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:var(--sp-3);">
              <span class="text-sm text-muted">${rec.dayActive ? 'Remaining' : 'Total'}</span>
              <span class="font-mono" style="font-weight:600;">${rec.totalSets} sets</span>
            </div>
          </div>
          ${renderSessionLoad(rec.sessionLoad, muscleNames)}
          <button class="btn btn-primary w-full mt-4" id="start-workout-btn">${rec.dayActive ? 'Continue Workout' : 'Start Workout'}</button>
        ` : `
          <div class="text-sm text-muted mt-2">
            ${readiness.systemic.fatigued
              ? 'Consider a rest day — systemic fatigue is high.'
              : 'Log some workouts to get personalized recommendations.'}
          </div>
        `}
      </div>

      <!-- This Week -->
      <div class="card">
        <div class="card-header">This Week &mdash; ${weeklySets.length} sets logged</div>

        ${neglected.length > 0 ? `
          <div class="mt-2">
            <div class="text-sm" style="color:var(--recovering);font-weight:600;">Needs attention</div>
            <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
              ${neglected.map((v) => `
                <span class="pill pill-recovering">${muscleNames[v.muscleId] ?? v.muscleId}: ${v.sets}/${v.mev}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${overworked.length > 0 ? `
          <div class="mt-2">
            <div class="text-sm" style="color:var(--overworked);font-weight:600;">Over volume limit</div>
            <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
              ${overworked.map((v) => `
                <span class="pill pill-overworked">${muscleNames[v.muscleId] ?? v.muscleId}: ${v.sets}/${v.mrv}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${balanceWarnings.length > 0 ? `
          <div class="mt-2">
            <div class="text-sm" style="color:var(--text-secondary);font-weight:600;">Balance</div>
            <div class="flex flex-col gap-1 mt-2">
              ${balanceWarnings.map((w) => `
                <div class="text-sm text-muted">
                  ${muscleNames[w.pair[0]] ?? w.pair[0]} / ${muscleNames[w.pair[1]] ?? w.pair[1]}:
                  ${w.ratio === Infinity ? 'one side untrained' : `${w.ratio}:1 ratio`}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${neglected.length === 0 && overworked.length === 0 && balanceWarnings.length === 0 ? `
          <div class="text-sm text-muted mt-2">
            ${weeklySets.length === 0 ? 'No sets logged this week yet.' : 'Looking good — volume is balanced.'}
          </div>
        ` : ''}
      </div>

      <!-- Stalls -->
      ${readiness.stalls.length > 0 ? `
        <div class="card">
          <div class="card-header">Stalled Lifts</div>
          <div class="flex flex-col gap-2 mt-2">
            ${readiness.stalls.map((s) => `
              <div class="text-sm">
                <span style="font-weight:600;">${s.exerciseId.replace(/-/g, ' ')}</span>
                <span class="text-muted">&mdash; flat for ${s.sessions} sessions (e1RM ${s.lastE1RM} / peak ${s.peakE1RM})</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Progression Adjustments -->
      ${renderProgressionCard(progressionData, exMap)}

    </div>
  `;

  // Load the recommended session into the log context.
  const loadQueue = () => {
    ctx.sessionQueue = rec.picks.map((p) => ({
      exercise: p.exercise,
      sets: p.sets,
      reason: p.reason,
    }));
    ctx.allExercises = exercises;
  };

  // Start/Continue Workout — open the queue list.
  container.querySelector('#start-workout-btn')?.addEventListener('click', () => {
    loadQueue();
    ctx.sessionOpenExerciseId = null;
    location.hash = '#/log';
  });

  // Tap an individual rec — jump straight into logging that exercise.
  container.querySelectorAll('.rec-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadQueue();
      ctx.sessionOpenExerciseId = btn.dataset.exId;
      location.hash = '#/log';
    });
  });
}

/**
 * Per-muscle set load for the day's cluster: how the completed +
 * planned sets stack up against a balanced per-session target.
 */
function renderSessionLoad(sessionLoad, muscleNames) {
  if (!sessionLoad || sessionLoad.length === 0) return '';

  // Only show muscles this day actually touches (target or activity).
  const rows = sessionLoad.filter((r) => r.done > 0 || r.planned > 0);
  if (rows.length === 0) return '';

  return `
    <div class="flex flex-col gap-2 mt-4">
      <div class="text-sm text-muted" style="font-weight:600;">Set load this day</div>
      ${rows.map((r) => {
        const name = muscleNames[r.muscleId] ?? r.muscleId;
        const total = Math.round((r.done + r.planned) * 10) / 10;
        const pct = r.target > 0 ? Math.min(100, (total / r.target) * 100) : 0;
        const donePct = r.target > 0 ? Math.min(100, (r.done / r.target) * 100) : 0;
        return `
          <div>
            <div class="flex justify-between" style="font-size:var(--text-xs);color:var(--text-secondary);">
              <span>${name}</span>
              <span class="font-mono">${r.done > 0 ? `${r.done} done + ${r.planned} planned` : `${r.planned} planned`} / ${r.target}</span>
            </div>
            <div class="progress" style="height:4px;position:relative;">
              <div class="progress-fill" style="width:${pct}%;background:var(--recovering);"></div>
              <div class="progress-fill" style="width:${donePct}%;background:var(--ready);position:absolute;top:0;left:0;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderProgressionCard(progressionData, exMap) {
  // Only show exercises that need attention (not 'keep' or 'insufficient')
  const actionable = progressionData.filter((p) =>
    p.recommendation.action !== 'keep' && p.rate.trend !== 'insufficient'
  );

  if (actionable.length === 0) return '';

  return `
    <div class="card">
      <div class="card-header">Progression Updates</div>
      <div class="flex flex-col gap-3 mt-2">
        ${actionable.map((p) => {
          const name = exMap[p.exerciseId]?.name ?? p.exerciseId;
          const r = p.recommendation;
          const actionColor = r.action === 'deload' ? 'var(--overworked)'
            : r.action === 'reduce' ? 'var(--recovering)'
            : 'var(--text-secondary)';
          return `
            <div>
              <div style="font-weight:600;">${name}</div>
              <div class="text-sm" style="color:${actionColor};">${r.reason}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
