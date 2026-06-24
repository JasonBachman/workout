/**
 * Analytics / stats screen.
 *
 * - PRs (estimated 1RM, rep PRs, volume PRs)
 * - Estimated 1RM trend per lift
 * - Weekly volume per muscle over time
 * - Training frequency calendar heatmap
 */

import { getAllSets, estimateE1RM } from '../data/sets.js';
import { getAllExercises } from '../data/exercises.js';
import { getAllMuscles } from '../data/muscles.js';
import { getAllLandmarks } from '../data/landmarks.js';
import { lineChart, barChart, calendarHeatmap, chartColor } from './charts.js';

let container = null;

export const statsPage = {
  async mount(el, ctx) {
    container = el;
    const db = ctx.db;

    const [allSets, exercises, muscles, landmarks] = await Promise.all([
      getAllSets(db),
      getAllExercises(db),
      getAllMuscles(db),
      getAllLandmarks(db),
    ]);

    const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
    const muscleNames = Object.fromEntries(muscles.map((m) => [m.id, m.name]));

    render({ allSets, exercises, exMap, muscles, muscleNames, landmarks });
  },

  unmount() {
    container = null;
  },
};

function render({ allSets, exercises, exMap, muscles, muscleNames, landmarks }) {
  if (!container) return;

  if (allSets.length === 0) {
    container.innerHTML = `
      <div class="container flex flex-col gap-4 items-center" style="padding-top: var(--sp-10);">
        <div style="font-size: var(--text-4xl);">&#128200;</div>
        <h2 style="font-size: var(--text-xl); font-weight: 700;">Analytics</h2>
        <p class="text-sm text-muted text-center">Log some workouts to see your stats here.</p>
        <a href="#/log" class="btn btn-primary">Start Logging</a>
      </div>
    `;
    return;
  }

  // ── PRs ──
  const prs = computePRs(allSets, exMap);

  // ── e1RM trends (top 5 exercises by set count) ──
  const exerciseSetCounts = {};
  for (const s of allSets) {
    exerciseSetCounts[s.exerciseId] = (exerciseSetCounts[s.exerciseId] ?? 0) + 1;
  }
  const topExercises = Object.entries(exerciseSetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const e1rmTrends = topExercises.map((exId) => ({
    exercise: exMap[exId],
    data: computeE1RMTrend(allSets.filter((s) => s.exerciseId === exId)),
  }));

  // ── Weekly volume per muscle (last 8 weeks) ──
  const weeklyMuscleVolume = computeWeeklyMuscleVolume(allSets, exMap, muscleNames, 8);

  // ── Calendar heatmap ──
  const dateCounts = {};
  for (const s of allSets) {
    dateCounts[s.date] = (dateCounts[s.date] ?? 0) + 1;
  }

  container.innerHTML = `
    <div class="container flex flex-col gap-6" style="padding-top: var(--sp-4);">
      <h2 style="font-size: var(--text-xl); font-weight: 700;">Analytics</h2>

      <!-- Training Calendar -->
      <div class="card">
        <div class="card-header">Training Frequency (12 weeks)</div>
        <div class="mt-2">${calendarHeatmap(dateCounts)}</div>
        <div class="text-sm text-muted mt-2">
          ${Object.keys(dateCounts).length} days trained &middot; ${allSets.length} total sets
        </div>
      </div>

      <!-- Personal Records -->
      <div class="card">
        <div class="card-header">Personal Records</div>
        <div class="flex flex-col gap-3 mt-2">
          ${prs.slice(0, 10).map((pr) => `
            <div class="flex items-center justify-between">
              <div>
                <div style="font-weight:600;">${pr.name}</div>
                <div class="text-sm text-muted">${pr.date}</div>
              </div>
              <div class="text-right">
                <div class="font-mono" style="font-weight:700;color:var(--accent);">${pr.e1rm} lbs</div>
                <div class="text-sm text-muted">${pr.weight}&times;${pr.reps}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- e1RM Trends -->
      ${e1rmTrends.map((trend, i) => `
        <div class="card">
          <div class="card-header">${trend.exercise?.name ?? 'Unknown'} — e1RM Trend</div>
          <div class="mt-2">
            ${lineChart(trend.data, { color: chartColor(i), unit: '' })}
          </div>
          ${trend.data.length >= 2 ? `
            <div class="text-sm mt-2">
              ${trendDelta(trend.data)}
            </div>
          ` : ''}
        </div>
      `).join('')}

      <!-- Weekly Volume by Muscle -->
      <div class="card">
        <div class="card-header">Weekly Volume Trend (8 weeks)</div>
        ${weeklyMuscleVolume.length > 0 ? `
          <div class="flex flex-col gap-4 mt-2">
            ${weeklyMuscleVolume.map((mv, i) => `
              <div>
                <div class="text-sm" style="font-weight:600;margin-bottom:4px;">${mv.muscle}</div>
                ${lineChart(mv.data, { color: chartColor(i), height: 100, unit: '' })}
              </div>
            `).join('')}
          </div>
        ` : '<div class="text-sm text-muted mt-2">Need more data across weeks.</div>'}
      </div>
    </div>
  `;
}

function computePRs(sets, exMap) {
  const best = {}; // exerciseId → { e1rm, weight, reps, date }

  for (const s of sets) {
    const e1rm = estimateE1RM(s.weight, s.reps);
    if (!best[s.exerciseId] || e1rm > best[s.exerciseId].e1rm) {
      best[s.exerciseId] = {
        e1rm,
        weight: s.weight,
        reps: s.reps,
        date: s.date,
        name: exMap[s.exerciseId]?.name ?? s.exerciseId,
      };
    }
  }

  return Object.values(best).sort((a, b) => b.e1rm - a.e1rm);
}

function computeE1RMTrend(sets) {
  // Group by date, take best e1RM per session
  const byDate = {};
  for (const s of sets) {
    const e1rm = estimateE1RM(s.weight, s.reps);
    if (!byDate[s.date] || e1rm > byDate[s.date]) {
      byDate[s.date] = e1rm;
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: date.slice(5), // MM-DD
      value,
    }));
}

function computeWeeklyMuscleVolume(sets, exMap, muscleNames, numWeeks) {
  const now = new Date();
  const weeks = [];

  for (let w = numWeeks - 1; w >= 0; w--) {
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const label = endStr.slice(5);

    const weekSets = sets.filter((s) => s.date > startStr && s.date <= endStr);

    const muscleVol = {};
    for (const s of weekSets) {
      const ex = exMap[s.exerciseId];
      if (!ex) continue;
      for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
        muscleVol[muscleId] = (muscleVol[muscleId] ?? 0) + fraction;
      }
    }

    weeks.push({ label, muscleVol });
  }

  // Only show muscles that have some volume
  const allMuscleIds = new Set();
  for (const w of weeks) {
    for (const id of Object.keys(w.muscleVol)) allMuscleIds.add(id);
  }

  // Pick top 6 muscles by total volume for readability
  const totalByMuscle = {};
  for (const id of allMuscleIds) {
    totalByMuscle[id] = weeks.reduce((sum, w) => sum + (w.muscleVol[id] ?? 0), 0);
  }

  const topMuscles = Object.entries(totalByMuscle)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

  return topMuscles.map((muscleId) => ({
    muscle: muscleNames[muscleId] ?? muscleId,
    data: weeks.map((w) => ({
      label: w.label,
      value: Math.round((w.muscleVol[muscleId] ?? 0) * 10) / 10,
    })),
  }));
}

function trendDelta(data) {
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const diff = last - first;
  const pct = first > 0 ? Math.round((diff / first) * 100) : 0;

  if (diff > 0) {
    return `<span style="color:var(--ready);">&#9650; +${diff} lbs (${pct}%)</span> since first session`;
  } else if (diff < 0) {
    return `<span style="color:var(--overworked);">&#9660; ${diff} lbs (${pct}%)</span> since first session`;
  }
  return '<span class="text-muted">No change since first session</span>';
}
