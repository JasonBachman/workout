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
import { computeMusclePriority, countMuscleSessionDays, deriveIdealFrequency } from './priority.js';

// ── Defaults ──
const DEFAULT_TARGET_SETS = 20;
const MIN_TARGET_SETS = 18;
const MAX_TARGET_SETS = 22;
const SETS_PER_EXERCISE = 3;

// ── Muscle clusters for session coherence ──
// Exercises within a cluster work well together and don't compete
// with the next day's potential session.
const MUSCLE_CLUSTERS = {
  push:  ['chest', 'front-delts', 'side-delts', 'triceps'],
  pull:  ['lats', 'upper-back', 'rear-delts', 'biceps', 'traps', 'forearms'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves'],
};
// Abs are "floaters" — they go with any cluster
const FLOATER_MUSCLES = ['abs'];

// How many sets to allow from non-primary clusters (for critical deficits)
const OFF_CLUSTER_MAX_SETS = 3;

/**
 * Score each muscle using multi-factor priority system.
 *
 * @param {Array} volumeStatus - From evaluateVolume()
 * @param {Object} readinessData - From computeReadiness()
 * @param {Object} extra
 * @param {Object} extra.weeklyVolume - muscleId → sets
 * @param {Array} extra.weeklySets - sets in the 7-day window
 * @param {Array} extra.exercises - all exercises
 * @param {Object} extra.goalMap - muscleId → 'high'|'medium'|'low'
 * @param {Date} extra.asOf
 * @returns {Object.<string, {priority: number, reason: string}>}
 */
export function scoreMuscles(volumeStatus, readinessData, extra = {}) {
  const { weeklyVolume = {}, weeklySets = [], exercises = [], goalMap = {}, asOf = new Date() } = extra;
  const scores = {};

  // For frequency urgency: estimate training days remaining this week.
  // Count distinct training days so far in the 7-day window, assume similar pattern going forward.
  const allTrainingDates = new Set(weeklySets.map((s) => s.date));
  const daysPassed = Math.max(1, allTrainingDates.size);
  const asOfDay = asOf.getDay(); // 0=Sun
  const calendarDaysLeft = Math.max(1, 7 - asOfDay);
  // Use the smaller of calendar days left or a reasonable estimate
  const daysLeftInWindow = Math.min(calendarDaysLeft, 4);

  for (const vs of volumeStatus) {
    const mr = readinessData.perMuscle[vs.muscleId];
    if (!mr) continue;

    const sessionDays = countMuscleSessionDays(weeklySets, exercises, vs.muscleId);

    const result = computeMusclePriority({
      muscleId: vs.muscleId,
      sets: vs.sets,
      mev: vs.mev,
      mav: vs.mav,
      mrv: vs.mrv,
      readiness: mr.readiness,
      sessionDays,
      daysLeftInWindow,
      weeklyVolume,
      stalls: readinessData.stalls,
      exercises,
      goalLevel: goalMap[vs.muscleId] ?? 'medium',
    });

    scores[vs.muscleId] = result;
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
 * Determine which muscle cluster should be today's theme.
 * Picks the cluster with the highest total muscle priority.
 *
 * @param {Object.<string, {priority: number}>} muscleScores
 * @returns {{name: string, muscles: string[], score: number}}
 */
function pickCluster(muscleScores) {
  const clusterScores = Object.entries(MUSCLE_CLUSTERS).map(([name, muscles]) => {
    const score = muscles.reduce((sum, id) => sum + (muscleScores[id]?.priority ?? 0), 0);
    return { name, muscles, score };
  });

  clusterScores.sort((a, b) => b.score - a.score);
  return clusterScores[0];
}

/**
 * Check if an exercise primarily serves the given cluster.
 */
function exerciseMatchesCluster(exercise, clusterMuscles) {
  const clusterSet = new Set(clusterMuscles);
  const floaterSet = new Set(FLOATER_MUSCLES);

  // Find the exercise's top muscle by contribution
  let topMuscle = null;
  let topFraction = 0;
  for (const [muscleId, fraction] of Object.entries(exercise.muscles)) {
    if (fraction > topFraction) {
      topFraction = fraction;
      topMuscle = muscleId;
    }
  }

  return clusterSet.has(topMuscle) || floaterSet.has(topMuscle);
}

/**
 * Greedy exercise selection with cluster-based session coherence.
 *
 * Picks a winning cluster, fills most of the session from it,
 * then allows a few sets from other clusters only if muscles
 * are critically under MEV.
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

  // Pick today's cluster theme
  const cluster = pickCluster(muscleScores);
  const clusterMuscles = [...cluster.muscles, ...FLOATER_MUSCLES];

  const picks = [];
  const usedPatterns = new Set();
  let totalSets = 0;
  let offClusterSets = 0;

  const remainingPriority = {};
  for (const [id, ms] of Object.entries(muscleScores)) {
    remainingPriority[id] = ms.priority;
  }

  // Sort candidates: cluster-matching exercises first, then others
  const sorted = [...scoredExercises].sort((a, b) => {
    const aMatch = exerciseMatchesCluster(a.exercise, clusterMuscles) ? 1 : 0;
    const bMatch = exerciseMatchesCluster(b.exercise, clusterMuscles) ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch; // cluster first
    return b.score - a.score; // then by score
  });

  for (const candidate of sorted) {
    if (totalSets >= targetSets) break;

    const ex = candidate.exercise;
    const isCluster = exerciseMatchesCluster(ex, clusterMuscles);

    // Off-cluster exercises only allowed up to the cap
    if (!isCluster && offClusterSets >= OFF_CLUSTER_MAX_SETS) continue;

    const patternKey = `${ex.pattern}-${ex.equipment}`;
    if (usedPatterns.has(patternKey)) continue;

    if (candidate.topMuscle && (remainingPriority[candidate.topMuscle] ?? 0) <= 0) {
      continue;
    }

    let currentScore = 0;
    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      currentScore += fraction * (remainingPriority[muscleId] ?? 0);
    }

    if (currentScore <= 0) continue;

    const reason = buildReason(ex, muscleScores, remainingPriority);
    picks.push({ exercise: ex, sets: setsPerEx, reason });

    usedPatterns.add(patternKey);
    totalSets += setsPerEx;
    if (!isCluster) offClusterSets += setsPerEx;

    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      const covered = fraction * setsPerEx;
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
  const goalMap = options.goalMap ?? {};

  // 1. Weekly volume from rolling 7-day window
  const weeklySets = filterToWindow(allSets, 7, asOf);
  const volume = computeWeeklyVolume(weeklySets, exercises, allSets);
  const volumeStatus = evaluateVolume(volume, landmarks);

  // 2. Readiness (uses full history for stall detection, ACR)
  const readiness = computeReadiness(allSets, exercises, muscles, asOf);

  // 3. Score muscles with multi-factor priority
  const muscleScores = scoreMuscles(volumeStatus, readiness, {
    weeklyVolume: volume,
    weeklySets,
    exercises,
    goalMap,
    asOf,
  });

  // 4. Pick cluster theme and select exercises
  const cluster = pickCluster(muscleScores);
  const scoredExercises = scoreExercises(exercises, muscleScores, options.availableEquipment ?? null);
  const picks = pickExercises(scoredExercises, muscleScores, { targetSets });

  const totalSets = picks.reduce((sum, p) => sum + p.sets, 0);

  const clusterLabels = { push: 'Push', pull: 'Pull', lower: 'Lower Body' };
  const sessionFocus = clusterLabels[cluster.name] ?? cluster.name;

  return { picks, volumeStatus, readiness, totalSets, sessionFocus };
}
