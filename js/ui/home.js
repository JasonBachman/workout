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

    render({ readiness, volumeStatus, balanceWarnings, rec, muscleNames, weeklySets, progressionData, exMap });
  },

  unmount() {
    container = null;
  },
};

function render({ readiness, volumeStatus, balanceWarnings, rec, muscleNames, weeklySets, progressionData, exMap }) {
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
        <div class="card-header">Recommended Today</div>
        ${rec.picks.length > 0 ? `
          <div class="flex flex-col gap-3 mt-2">
            ${rec.picks.map((pick) => `
              <div class="flex items-center justify-between">
                <div>
                  <div style="font-weight:600;">${pick.exercise.name}</div>
                  <div class="text-sm text-muted">${pick.reason}</div>
                </div>
                <span class="font-mono text-sm" style="color:var(--text-secondary);">${pick.sets} sets</span>
              </div>
            `).join('')}
            <div class="flex items-center justify-between mt-2" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:var(--sp-3);">
              <span class="text-sm text-muted">Total</span>
              <span class="font-mono" style="font-weight:600;">${rec.totalSets} sets</span>
            </div>
          </div>
          <a href="#/log" class="btn btn-primary w-full mt-4">Start Workout</a>
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
