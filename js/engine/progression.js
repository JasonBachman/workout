/**
 * Adaptive progression engine — pure functions.
 *
 * Tracks actual e1RM progression rate per exercise from logged data.
 * When a stall is detected, auto-adjusts the progression strategy:
 *   1. Halve the weight increment
 *   2. If already at minimum increment, switch to rep progression
 *   3. If rep progression also stalls, flag for deload
 *
 * Evidence-based starting rates (per week):
 *   Upper compounds: +5 lbs    Lower compounds: +10 lbs
 *   Isolation:       +5 lbs    Minimum useful:  +2.5 lbs
 */

import { estimateE1RM } from '../data/sets.js';

const MIN_INCREMENT_LBS = 2.5;
const MIN_SESSIONS_FOR_RATE = 4; // need at least 4 sessions to compute a rate

/**
 * Compute actual e1RM progression rate for an exercise (lbs per week).
 *
 * @param {Array} sets - All sets for one exercise, sorted by date
 * @returns {{ratePerWeek: number, sessions: number, trend: 'progressing'|'flat'|'declining'|'insufficient'}}
 */
export function computeProgressionRate(sets) {
  // Group by date, find best e1RM per session
  const byDate = {};
  for (const s of sets) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }

  const sessions = Object.entries(byDate)
    .map(([date, dateSets]) => ({
      date,
      e1rm: Math.max(...dateSets.map((s) => estimateE1RM(s.weight, s.reps))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sessions.length < MIN_SESSIONS_FOR_RATE) {
    return { ratePerWeek: 0, sessions: sessions.length, trend: 'insufficient' };
  }

  // Simple linear regression on e1RM over time
  const firstDate = new Date(sessions[0].date + 'T00:00:00');
  const points = sessions.map((s) => {
    const weeks = (new Date(s.date + 'T00:00:00') - firstDate) / (7 * 24 * 3600000);
    return { x: weeks, y: s.e1rm };
  });

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;

  // Determine trend from last 3 sessions
  const recent = sessions.slice(-3);
  let trend;
  if (recent.length < 2) {
    trend = 'insufficient';
  } else {
    const recentSlope = (recent[recent.length - 1].e1rm - recent[0].e1rm) / Math.max(recent.length - 1, 1);
    if (recentSlope > 0.5) trend = 'progressing';
    else if (recentSlope < -0.5) trend = 'declining';
    else trend = 'flat';
  }

  return {
    ratePerWeek: Math.round(slope * 10) / 10,
    sessions: sessions.length,
    trend,
  };
}

/**
 * Recommend an adjusted progression for a program slot based on actual data.
 *
 * @param {Object} currentProgression - { type, incrementLbs, frequency }
 * @param {{ratePerWeek: number, trend: string}} actualRate - From computeProgressionRate
 * @returns {{progression: Object, reason: string, action: 'keep'|'reduce'|'rep-progress'|'deload'}}
 */
export function adjustProgression(currentProgression, actualRate) {
  const current = { ...currentProgression };

  if (actualRate.trend === 'insufficient') {
    return { progression: current, reason: 'Not enough data yet', action: 'keep' };
  }

  if (actualRate.trend === 'progressing') {
    // Working — keep current or bump up if actual rate is much faster
    if (actualRate.ratePerWeek > current.incrementLbs * 1.5) {
      return {
        progression: { ...current, incrementLbs: Math.min(current.incrementLbs + 2.5, 10) },
        reason: `Progressing fast (${actualRate.ratePerWeek} lbs/wk) — increasing increment`,
        action: 'keep',
      };
    }
    return { progression: current, reason: `On track (${actualRate.ratePerWeek} lbs/wk)`, action: 'keep' };
  }

  // Flat or declining — need adjustment
  if (current.type === 'linear' && current.incrementLbs > MIN_INCREMENT_LBS) {
    // Step 1: Halve the increment
    const newIncrement = Math.max(MIN_INCREMENT_LBS, Math.round(current.incrementLbs / 2 * 2) / 2);
    return {
      progression: { ...current, incrementLbs: newIncrement },
      reason: `Stalled — reducing increment from ${current.incrementLbs} to ${newIncrement} lbs`,
      action: 'reduce',
    };
  }

  if (current.type === 'linear') {
    // Step 2: Switch to rep progression (add reps before adding weight)
    return {
      progression: { type: 'rep-first', incrementLbs: current.incrementLbs, frequency: current.frequency, targetRepsBeforeIncrease: 12 },
      reason: 'Stalled at minimum increment — switching to rep progression (hit 12 reps before adding weight)',
      action: 'rep-progress',
    };
  }

  if (current.type === 'rep-first' && actualRate.trend === 'declining') {
    // Step 3: Recommend deload
    return {
      progression: current,
      reason: 'Declining even with rep progression — time for a deload week',
      action: 'deload',
    };
  }

  return { progression: current, reason: `Flat (${actualRate.ratePerWeek} lbs/wk) — keep pushing reps`, action: 'keep' };
}

/**
 * Compute today's target weight and reps for an exercise.
 * Uses the last session's best working set and the progression strategy.
 *
 * @param {Array} sets - All sets for this exercise
 * @param {Object} progression - { type, incrementLbs, frequency, targetRepsBeforeIncrease }
 * @returns {{
 *   targetWeight: number, targetReps: number,
 *   lastWeight: number, lastReps: number, lastDate: string,
 *   note: string
 * } | null}
 */
export function computeTarget(sets, progression) {
  if (sets.length === 0) return null;

  // Find the most recent session
  const byDate = {};
  for (const s of sets) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }

  const dates = Object.keys(byDate).sort();
  const lastDate = dates[dates.length - 1];
  const lastSets = byDate[lastDate];

  // Find the best working set from last session (highest e1RM, skip warm-ups)
  let bestSet = null;
  let bestE1RM = 0;
  for (const s of lastSets) {
    if (s.reps < 5 || s.reps > 30) continue;
    const e = estimateE1RM(s.weight, s.reps);
    if (e > bestE1RM) {
      bestE1RM = e;
      bestSet = s;
    }
  }

  if (!bestSet) return null;

  const lastWeight = bestSet.weight;
  const lastReps = bestSet.reps;
  const prog = progression ?? { type: 'linear', incrementLbs: 5, frequency: 'week' };

  let targetWeight = lastWeight;
  let targetReps = lastReps;
  let note = '';

  if (prog.type === 'rep-first') {
    // Add reps first, then weight
    const repTarget = prog.targetRepsBeforeIncrease ?? 12;
    if (lastReps < repTarget) {
      targetWeight = lastWeight;
      targetReps = Math.min(lastReps + 1, repTarget);
      note = `Push for ${targetReps} reps before adding weight`;
    } else {
      // Hit rep target — increase weight, reset reps
      targetWeight = lastWeight + prog.incrementLbs;
      targetReps = Math.max(lastReps - 3, 5); // drop reps when adding weight
      note = `Hit ${repTarget} reps — adding ${prog.incrementLbs} lbs`;
    }
  } else {
    // Linear progression — add weight
    targetWeight = lastWeight + prog.incrementLbs;
    targetReps = lastReps;

    // If RPE was very high last time, don't increase weight
    if (bestSet.rpe !== null && bestSet.rpe >= 9.5) {
      targetWeight = lastWeight;
      targetReps = lastReps;
      note = 'Last set was near max effort — repeat before adding weight';
    } else {
      note = `+${prog.incrementLbs} lbs from last session`;
    }
  }

  // Safety: never suggest more than 10% increase in one jump
  const maxSafeIncrease = lastWeight * 0.1;
  if (targetWeight - lastWeight > maxSafeIncrease && maxSafeIncrease > 0) {
    targetWeight = lastWeight + Math.round(maxSafeIncrease / 2.5) * 2.5; // round to nearest 2.5
    note = `Capped at +${Math.round(maxSafeIncrease)} lbs (10% safety limit)`;
  }

  return {
    targetWeight: Math.round(targetWeight * 10) / 10,
    targetReps,
    lastWeight,
    lastReps,
    lastDate,
    note,
  };
}

/**
 * Analyze progression for all exercises in a program and return recommendations.
 *
 * @param {Object} program - Active program
 * @param {Array} allSets - All logged sets
 * @returns {Array<{exerciseId: string, dayName: string, rate: Object, recommendation: Object}>}
 */
export function analyzeProgression(program, allSets) {
  if (!program) return [];

  const results = [];

  // Group all sets by exercise
  const setsByExercise = {};
  for (const s of allSets) {
    if (!setsByExercise[s.exerciseId]) setsByExercise[s.exerciseId] = [];
    setsByExercise[s.exerciseId].push(s);
  }

  for (const day of program.days) {
    for (const slot of day.slots) {
      const exSets = setsByExercise[slot.exerciseId] ?? [];
      const rate = computeProgressionRate(exSets);
      const recommendation = adjustProgression(slot.progression, rate);

      results.push({
        exerciseId: slot.exerciseId,
        dayName: day.name,
        rate,
        recommendation,
      });
    }
  }

  return results;
}
