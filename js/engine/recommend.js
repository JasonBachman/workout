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

import { computeWeeklyVolume, evaluateVolume, filterToWindow, filterEffectiveSets } from './volume.js';
import { computeReadiness } from './readiness.js';
import { computeMusclePriority, countMuscleSessionDays } from './priority.js';
import { computeSessionVolume, sessionMuscleTarget } from './session.js';

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

// On a soft start (1 working set today), how much better a different cluster's
// average priority must be before we suggest switching off the started day.
const SOFT_OVERRIDE_MARGIN = 10;

// Below this readiness a muscle is "fatigued" (matches the body map's red and
// the readiness gate cutoff): don't target or recommend more work on it today.
const MIN_TRAIN_READINESS = 40;

// Neglect boost: a whole region that is deeply under MEV *and* recovered is
// the strongest training opportunity and should outrank an imbalance
// correction (e.g. untrained legs beat a recovering-but-lagging pull day).
// Added to a cluster's average priority, scaled by how neglected+ready it is.
const NEGLECT_BONUS = 25;
const NEGLECT_READY_MIN = 60; // only boost regions recovered enough to train

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
 * Score every cluster by AVERAGE muscle priority (not sum).
 *
 * Averaging is essential: clusters have different muscle counts
 * (pull has 6, push/lower have 4), so summing lets the bigger
 * cluster win on headcount even when its muscles are individually
 * lower priority. Average compares them fairly.
 *
 * A cluster that is deeply under MEV and recovered gets a neglect boost so
 * a completely untrained region outranks an imbalance correction elsewhere.
 *
 * @param {Object.<string, {priority: number}>} muscleScores
 * @param {Object.<string, {sets, mev}>} [volMap] - per-muscle weekly volume status
 * @param {Object.<string, {readiness}>} [readyMap] - per-muscle readiness
 * @returns {Array<{name, muscles, sum, avg, neglect, score}>} sorted best-first
 */
function scoreClusters(muscleScores, volMap = null, readyMap = null) {
  const scored = Object.entries(MUSCLE_CLUSTERS).map(([name, muscles]) => {
    const sum = muscles.reduce((s, id) => s + (muscleScores[id]?.priority ?? 0), 0);
    const avg = muscles.length > 0 ? sum / muscles.length : 0;

    // Neglect = mean per-muscle MEV deficit fraction, counting only muscles
    // recovered enough to train. 1.0 = whole region at zero volume and ready.
    let neglect = 0;
    if (volMap && readyMap && muscles.length > 0) {
      let acc = 0;
      for (const id of muscles) {
        const v = volMap[id];
        const rdy = readyMap[id]?.readiness ?? 0;
        if (v && rdy >= NEGLECT_READY_MIN && v.sets < v.mev && v.mev > 0) {
          acc += Math.min(1, (v.mev - v.sets) / v.mev);
        }
      }
      neglect = acc / muscles.length;
    }

    const score = avg + NEGLECT_BONUS * neglect;
    return {
      name, muscles,
      sum: Math.round(sum * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      neglect: Math.round(neglect * 100) / 100,
      score: Math.round(score * 10) / 10,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Determine which muscle cluster should be today's theme.
 * Picks the cluster with the highest AVERAGE muscle priority.
 *
 * @param {Object.<string, {priority: number}>} muscleScores
 * @returns {{name: string, muscles: string[], avg: number, sum: number}}
 */
function pickCluster(muscleScores) {
  return scoreClusters(muscleScores)[0];
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
 * Fills the day's cluster toward a balanced per-muscle set target,
 * stopping once every cluster muscle's remaining need is met (a
 * well-rounded day) or the session budget is spent. A few off-cluster
 * sets are allowed only for muscles with a live priority (critical gaps).
 *
 * @param {Array} scoredExercises - From scoreExercises()
 * @param {Object.<string, {priority: number}>} muscleScores - From scoreMuscles()
 * @param {{name: string, muscles: string[]}} cluster - Resolved day theme (sticky)
 * @param {Object} options
 * @param {number} options.targetSets - Upper bound of NEW sets to add (default 20)
 * @param {number} options.setsPerExercise - Assumed sets per pick (default 3)
 * @param {Object.<string, number>} options.sessionNeed - muscleId → sets still
 *        needed this session (per-muscle target minus what's done today).
 *        Cluster muscles absent/≤0 are treated as satisfied.
 * @returns {Array} [{exercise, sets, reason}]
 */
export function pickExercises(scoredExercises, muscleScores, cluster, options = {}) {
  const targetSets = options.targetSets ?? DEFAULT_TARGET_SETS;
  const setsPerEx = options.setsPerExercise ?? SETS_PER_EXERCISE;
  const sessionNeed = options.sessionNeed ?? {};

  const clusterMuscles = [...cluster.muscles, ...FLOATER_MUSCLES];
  const clusterSet = new Set(clusterMuscles);

  const picks = [];
  const usedPatterns = new Set();
  let totalSets = 0;
  let offClusterSets = 0;

  // Remaining unmet need per cluster muscle this session (mutated as we pick).
  const need = {};
  for (const m of clusterMuscles) need[m] = Math.max(0, sessionNeed[m] ?? 0);
  const clusterNeedLeft = () => Object.values(need).some((n) => n > 0);

  // Off-cluster interest is priority-driven (for critical sub-MEV gaps).
  const remainingPriority = {};
  for (const [id, ms] of Object.entries(muscleScores)) remainingPriority[id] = ms.priority;

  // Sort candidates: cluster-matching exercises first, then by score.
  const sorted = [...scoredExercises].sort((a, b) => {
    const aMatch = exerciseMatchesCluster(a.exercise, clusterMuscles) ? 1 : 0;
    const bMatch = exerciseMatchesCluster(b.exercise, clusterMuscles) ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch; // cluster first
    return b.score - a.score; // then by score
  });

  for (const candidate of sorted) {
    if (totalSets >= targetSets) break;
    // Stop once the day is well-rounded (all cluster muscles satisfied),
    // unless off-cluster critical work is still allowed within its cap.
    if (!clusterNeedLeft() && offClusterSets >= OFF_CLUSTER_MAX_SETS) break;

    const ex = candidate.exercise;
    const isCluster = exerciseMatchesCluster(ex, clusterMuscles);

    if (!isCluster && offClusterSets >= OFF_CLUSTER_MAX_SETS) continue;

    const patternKey = `${ex.pattern}-${ex.equipment}`;
    if (usedPatterns.has(patternKey)) continue;

    let accept = false;
    if (isCluster) {
      // Accept only if this exercise's PRIMARY cluster muscle still has
      // unmet need — stops us piling compound lifts onto an already-full
      // mover just because they incidentally touch other muscles.
      let topClusterMuscle = null;
      let topFraction = 0;
      for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
        if (clusterSet.has(muscleId) && fraction > topFraction) {
          topFraction = fraction;
          topClusterMuscle = muscleId;
        }
      }
      accept = topClusterMuscle !== null && (need[topClusterMuscle] ?? 0) > 0;
    } else {
      // Off-cluster: only for a muscle with live priority (critical gap).
      accept = (candidate.topMuscle && (remainingPriority[candidate.topMuscle] ?? 0) > 0);
    }

    if (!accept) continue;

    const reason = buildReason(ex, muscleScores, remainingPriority);
    picks.push({ exercise: ex, sets: setsPerEx, reason });

    usedPatterns.add(patternKey);
    totalSets += setsPerEx;
    if (!isCluster) offClusterSets += setsPerEx;

    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      const covered = fraction * setsPerEx;
      if (muscleId in need) need[muscleId] = Math.max(0, need[muscleId] - covered);
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

  // 4. Pick cluster theme.
  //    - firm lock (>=2 working sets today): stay in that cluster, no flip.
  //    - soft start (1 working set): keep it unless scoring points to a
  //      clearly better, badly-neglected cluster by a real margin.
  //    - nothing today: highest AVERAGE-priority cluster wins.
  const todayStr = asOf.toISOString().slice(0, 10);
  const todaySets = allSets.filter((s) => s.date === todayStr);
  const detected = detectActiveCluster(todaySets, exercises, allSets);

  const volMap = Object.fromEntries(volumeStatus.map((v) => [v.muscleId, v]));
  const clusterRanking = scoreClusters(muscleScores, volMap, readiness.perMuscle);
  const scoredWinner = clusterRanking[0];

  let cluster;
  let lock; // 'firm' | 'soft-lock' | 'score-override' | 'score'
  if (detected?.firm) {
    cluster = detected;
    lock = 'firm';
  } else if (detected) {
    const detectedScore = clusterRanking.find((c) => c.name === detected.name)?.score ?? 0;
    const override = scoredWinner.name !== detected.name
      && scoredWinner.score >= detectedScore + SOFT_OVERRIDE_MARGIN;
    cluster = override ? scoredWinner : detected;
    lock = override ? 'score-override' : 'soft-lock';
  } else {
    cluster = scoredWinner;
    lock = 'score';
  }

  // 5. Session-awareness: assume the user finishes this day. Compute a
  // balanced per-muscle target, subtract what's already done today, and
  // recommend only what's left to round out the session.
  const landmarkMap = Object.fromEntries(landmarks.map((lm) => [lm.muscleId, lm]));
  const doneVolume = computeSessionVolume(todaySets, exercises);
  const dayMuscles = [...cluster.muscles, ...FLOATER_MUSCLES];

  const sessionNeed = {};
  const sessionLoad = [];
  for (const muscleId of dayMuscles) {
    const lm = landmarkMap[muscleId];
    if (!lm) continue;
    const done = doneVolume[muscleId]?.sets ?? 0;
    const rdy = readiness.perMuscle[muscleId]?.readiness ?? 100;
    // Skip fatigued muscles (consistent with the body map) unless already
    // worked today — don't recommend more load on something that needs rest.
    if (rdy < MIN_TRAIN_READINESS && done === 0) continue;
    const target = sessionMuscleTarget(muscleId, lm.mav);
    sessionNeed[muscleId] = Math.max(0, target - done);
    sessionLoad.push({ muscleId, done: Math.round(done * 10) / 10, planned: 0, target });
  }

  // Remaining session budget shrinks as sets are logged today, but never
  // collapses below one exercise so there's always a useful pick to offer.
  const remainingBudget = Math.max(SETS_PER_EXERCISE, targetSets - todaySets.length);

  const scoredExercises = scoreExercises(exercises, muscleScores, options.availableEquipment ?? null);
  const picks = pickExercises(scoredExercises, muscleScores, cluster, {
    targetSets: remainingBudget,
    sessionNeed,
  });

  const totalSets = picks.reduce((sum, p) => sum + p.sets, 0);

  // Fold planned sets from the picks into the per-muscle load display.
  const loadIndex = Object.fromEntries(sessionLoad.map((r) => [r.muscleId, r]));
  for (const p of picks) {
    for (const [muscleId, fraction] of Object.entries(p.exercise.muscles)) {
      const row = loadIndex[muscleId];
      if (row) row.planned = Math.round((row.planned + fraction * p.sets) * 10) / 10;
    }
  }

  const clusterLabels = { push: 'Push', pull: 'Pull', lower: 'Lower Body' };
  const sessionFocus = clusterLabels[cluster.name] ?? cluster.name;
  // A day is "active" only when we're honoring what was started today.
  const dayActive = detected != null && cluster.name === detected.name;

  // Debug breakdown — why THIS day was chosen.
  const debug = {
    chosen: cluster.name,
    lock,
    startedToday: detected ? { name: detected.name, workingSets: detected.count } : null,
    clusters: clusterRanking.map((c) => ({
      name: c.name,
      avg: c.avg,
      sum: c.sum,
      neglect: c.neglect,
      score: c.score,
      chosen: c.name === cluster.name,
      muscles: c.muscles.map((id) => ({
        id,
        priority: Math.round((muscleScores[id]?.priority ?? 0) * 10) / 10,
        readiness: readiness.perMuscle[id]?.readiness ?? null,
        sets: volMap[id]?.sets ?? 0,
        mev: volMap[id]?.mev ?? null,
      })),
    })),
  };

  return { picks, volumeStatus, readiness, totalSets, sessionFocus, sessionLoad, dayActive, debug };
}

// A day is "firmly" underway (hard-locked, no flipping) once this many
// working sets match a cluster. A single working set is a soft start:
// it counts today's sets but still lets scoring steer you to a badly
// neglected day, so one stray set can't trap you on the wrong split.
const FIRM_LOCK_SETS = 2;

/**
 * Detect which cluster the user has already started training today,
 * ignoring warm-ups (only working sets count).
 *
 * @returns {{name, muscles, count, firm}|null}
 *   firm=true  → hard-locked, recommendations stay in this cluster.
 *   firm=false → soft start (1 working set); caller may still override
 *                toward a higher-scoring, badly-neglected cluster.
 */
function detectActiveCluster(todaySets, exercises, allSets) {
  const working = filterEffectiveSets(todaySets, allSets ?? todaySets);
  if (working.length === 0) return null;

  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const clusterCounts = {};
  for (const name of Object.keys(MUSCLE_CLUSTERS)) clusterCounts[name] = 0;

  for (const s of working) {
    const ex = exMap[s.exerciseId];
    if (!ex) continue;

    // Which cluster does this exercise's top muscle belong to?
    let topMuscle = null;
    let topFraction = 0;
    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      if (fraction > topFraction) {
        topFraction = fraction;
        topMuscle = muscleId;
      }
    }

    for (const [name, muscles] of Object.entries(MUSCLE_CLUSTERS)) {
      if (muscles.includes(topMuscle)) {
        clusterCounts[name]++;
        break;
      }
    }
  }

  const sorted = Object.entries(clusterCounts).sort(([, a], [, b]) => b - a);
  const [name, count] = sorted[0];
  if (count < 1) return null;

  return { name, muscles: MUSCLE_CLUSTERS[name], count, firm: count >= FIRM_LOCK_SETS };
}
