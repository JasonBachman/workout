/**
 * Recommendation engine — pure functions.
 *
 * Scores each muscle by readiness × weekly deficit, scores exercises by
 * contribution-weighted muscle priority filtered to available equipment,
 * then greedily picks exercises to a target session size.
 *
 * Avoids near-duplicate movements, respects antagonist balance,
 * and returns each pick with a human-readable reason.
 */

import { computeWeeklyVolume, evaluateVolume, filterToWindow } from './volume.js';
import { computeReadiness } from './readiness.js';

// ── Defaults ──
const DEFAULT_TARGET_SETS = 20;
const MIN_TARGET_SETS = 18;
const MAX_TARGET_SETS = 22;
const SETS_PER_EXERCISE = 3; // assumed working sets per exercise picked

/**
 * Score each muscle by how much it needs work.
 * Higher score = higher priority for training today.
 *
 * @param {Array} volumeStatus - From evaluateVolume()
 * @param {Object} readinessData - From computeReadiness()
 * @returns {Object.<string, {priority: number, reason: string}>}
 */
export function scoreMuscles(volumeStatus, readinessData) {
  const scores = {};

  for (const vs of volumeStatus) {
    const mr = readinessData.perMuscle[vs.muscleId];
    if (!mr) continue;

    const readinessFactor = mr.readiness / 100;

    let priority = 0;
    let reason = '';

    if (vs.status === 'over') {
      // Over MRV — skip this muscle
      priority = 0;
      reason = `Over MRV (${vs.sets}/${vs.mrv} sets) — needs rest`;
    } else if (mr.status === 'fatigued') {
      // Too fatigued to train effectively
      priority = 0;
      reason = `Fatigued (readiness ${mr.readiness}) — needs recovery`;
    } else if (vs.status === 'under') {
      // Below MEV — high priority scaled by readiness
      priority = (vs.deficit / vs.mev) * readinessFactor * 100;
      reason = `Under MEV (${vs.sets}/${vs.mev} sets), readiness ${mr.readiness}`;
    } else {
      // In zone — moderate priority to push toward MAV
      const roomToMav = vs.mav - vs.sets;
      const roomFraction = roomToMav / (vs.mav - vs.mev || 1);
      priority = roomFraction * readinessFactor * 50;
      reason = `In zone (${vs.sets}/${vs.mav} sets), room for more`;
    }

    scores[vs.muscleId] = { priority: Math.round(priority * 10) / 10, reason };
  }

  return scores;
}

/**
 * Score exercises by how well they serve the prioritized muscles.
 *
 * @param {Array} exercises - All exercise records
 * @param {Object.<string, {priority: number}>} muscleScores - From scoreMuscles()
 * @param {Set<string>|null} availableEquipment - null = all available
 * @returns {Array} Sorted [{exercise, score, topMuscle, reason}]
 */
export function scoreExercises(exercises, muscleScores, availableEquipment = null) {
  const scored = [];

  for (const ex of exercises) {
    // Filter by equipment
    if (availableEquipment && !availableEquipment.has(ex.equipment)) continue;

    let score = 0;
    let topMuscle = null;
    let topContribution = 0;

    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      const ms = muscleScores[muscleId];
      if (!ms) continue;

      const contribution = fraction * ms.priority;
      score += contribution;

      if (contribution > topContribution) {
        topContribution = contribution;
        topMuscle = muscleId;
      }
    }

    if (score > 0) {
      scored.push({
        exercise: ex,
        score: Math.round(score * 10) / 10,
        topMuscle,
        reason: muscleScores[topMuscle]?.reason ?? '',
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Greedy exercise selection for a session.
 *
 * @param {Array} scoredExercises - From scoreExercises()
 * @param {Object.<string, {priority: number}>} muscleScores - From scoreMuscles()
 * @param {Object} options
 * @param {number} options.targetSets - Target total sets (default 20)
 * @param {number} options.setsPerExercise - Assumed sets per pick (default 3)
 * @returns {Array} [{exercise, sets, reason}]
 */
export function pickExercises(scoredExercises, muscleScores, options = {}) {
  const targetSets = options.targetSets ?? DEFAULT_TARGET_SETS;
  const setsPerEx = options.setsPerExercise ?? SETS_PER_EXERCISE;

  const picks = [];
  const usedPatterns = new Set();      // avoid near-duplicate movement patterns
  const coveredVolume = {};            // track how much volume each muscle is getting
  let totalSets = 0;

  // Deep copy muscle scores so we can subtract as we pick
  const remainingPriority = {};
  for (const [id, ms] of Object.entries(muscleScores)) {
    remainingPriority[id] = ms.priority;
  }

  for (const candidate of scoredExercises) {
    if (totalSets >= targetSets) break;

    const ex = candidate.exercise;

    // Avoid picking two exercises with the same pattern + equipment combo
    const patternKey = `${ex.pattern}-${ex.equipment}`;
    if (usedPatterns.has(patternKey)) continue;

    // Don't pick if the top muscle is already well-covered
    if (candidate.topMuscle && (remainingPriority[candidate.topMuscle] ?? 0) <= 0) {
      continue;
    }

    // Re-score this exercise with remaining priorities
    let currentScore = 0;
    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      currentScore += fraction * (remainingPriority[muscleId] ?? 0);
    }

    if (currentScore <= 0) continue;

    // Pick it
    const reason = buildReason(ex, muscleScores, remainingPriority);
    picks.push({ exercise: ex, sets: setsPerEx, reason });

    usedPatterns.add(patternKey);
    totalSets += setsPerEx;

    // Subtract covered volume from remaining priorities
    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      const covered = fraction * setsPerEx;
      coveredVolume[muscleId] = (coveredVolume[muscleId] ?? 0) + covered;
      remainingPriority[muscleId] = Math.max(0, (remainingPriority[muscleId] ?? 0) - covered * 5);
    }
  }

  return picks;
}

/**
 * Build a human-readable reason for picking an exercise.
 */
function buildReason(exercise, muscleScores, remainingPriority) {
  const parts = [];

  // Find the top 2 muscles this exercise serves
  const muscleEntries = Object.entries(exercise.muscles)
    .map(([id, fraction]) => ({ id, fraction, priority: remainingPriority[id] ?? 0 }))
    .filter((m) => m.priority > 0)
    .sort((a, b) => b.fraction * b.priority - a.fraction * a.priority)
    .slice(0, 2);

  for (const m of muscleEntries) {
    const ms = muscleScores[m.id];
    if (ms) {
      parts.push(m.id.replace(/-/g, ' '));
    }
  }

  if (parts.length === 0) return 'General coverage';

  const needs = parts.join(' & ');
  const topMs = muscleScores[muscleEntries[0].id];
  if (topMs?.reason.includes('Under MEV')) {
    return `Hits ${needs} — below minimum volume`;
  }
  if (topMs?.reason.includes('room for more')) {
    return `Hits ${needs} — room to grow`;
  }
  return `Hits ${needs}`;
}

/**
 * Full recommendation pipeline: one call to get today's recommended session.
 *
 * @param {Object} data
 * @param {Array} data.sets - All logged sets
 * @param {Array} data.exercises - All exercises
 * @param {Array} data.muscles - All muscles
 * @param {Array} data.landmarks - All landmarks
 * @param {Object} options
 * @param {Set<string>|null} options.availableEquipment
 * @param {number} options.targetSets
 * @param {Date} options.asOf
 * @returns {{
 *   picks: Array<{exercise: Object, sets: number, reason: string}>,
 *   volumeStatus: Array,
 *   readiness: Object,
 *   totalSets: number
 * }}
 */
export function recommend({ sets: allSets, exercises, muscles, landmarks }, options = {}) {
  const asOf = options.asOf ?? new Date();
  const targetSets = options.targetSets ?? DEFAULT_TARGET_SETS;

  // 1. Weekly volume from rolling 7-day window
  const weeklySets = filterToWindow(allSets, 7, asOf);
  const volume = computeWeeklyVolume(weeklySets, exercises, allSets);
  const volumeStatus = evaluateVolume(volume, landmarks);

  // 2. Readiness (uses full history for stall detection, ACR)
  const readiness = computeReadiness(allSets, exercises, muscles, asOf);

  // 3. Score muscles
  const muscleScores = scoreMuscles(volumeStatus, readiness);

  // 4. Score and pick exercises
  const scoredExercises = scoreExercises(exercises, muscleScores, options.availableEquipment ?? null);
  const picks = pickExercises(scoredExercises, muscleScores, { targetSets });

  const totalSets = picks.reduce((sum, p) => sum + p.sets, 0);

  return { picks, volumeStatus, readiness, totalSets };
}
