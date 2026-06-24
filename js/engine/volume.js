/**
 * Volume engine — pure functions.
 *
 * Computes fractional weekly sets per muscle from logged sets,
 * compares against MEV/MAV/MRV landmarks, returns per-muscle
 * status and deficit, plus antagonist/pattern balance checks.
 *
 * All functions are pure: (data in) → (result out), no DB access.
 */

// ── Antagonist pairs for balance checks ──
const ANTAGONIST_PAIRS = [
  ['chest', 'upper-back'],
  ['front-delts', 'rear-delts'],
  ['biceps', 'triceps'],
  ['quads', 'hamstrings'],
];

// ── Minimum contribution to count toward a muscle's set total ──
const MIN_CONTRIBUTION = 0.3;

// ── Effective set criteria ──
const MIN_REPS = 5;
const MAX_REPS = 30;
const MIN_RPE = 7;
const WARMUP_WEIGHT_THRESHOLD = 0.6; // below 60% of recent best = warm-up

// ── Push/pull pattern groups ──
const PUSH_PATTERNS = ['horizontal-push', 'vertical-push'];
const PULL_PATTERNS = ['horizontal-pull', 'vertical-pull'];

/**
 * Filter sets to only "effective" sets that count toward hypertrophy volume.
 * A set is effective if:
 *   - Reps are in 5–30 range
 *   - RPE >= 7 (if RPE was logged), OR weight >= 60% of recent best (if no RPE)
 *
 * @param {Array} sets - Set records to filter
 * @param {Array} allSets - All historical sets (for computing recent best per exercise)
 * @returns {Array} Only the effective sets
 */
export function filterEffectiveSets(sets, allSets) {
  // Compute recent best weight per exercise (from all history)
  const bestWeight = {};
  for (const s of allSets) {
    if (s.reps >= MIN_REPS && s.reps <= MAX_REPS) {
      if (!bestWeight[s.exerciseId] || s.weight > bestWeight[s.exerciseId]) {
        bestWeight[s.exerciseId] = s.weight;
      }
    }
  }

  return sets.filter((s) => {
    // Rep range check
    if (s.reps < MIN_REPS || s.reps > MAX_REPS) return false;

    // Effort check: RPE if available, otherwise weight threshold
    if (s.rpe !== null && s.rpe !== undefined) {
      return s.rpe >= MIN_RPE;
    }

    // No RPE logged — use weight relative to recent best
    const best = bestWeight[s.exerciseId];
    if (!best || best === 0) return true; // no history, count it
    return s.weight >= best * WARMUP_WEIGHT_THRESHOLD;
  });
}

/**
 * Compute fractional weekly sets per muscle from logged sets.
 * Automatically filters to effective sets only.
 *
 * @param {Array} sets - Logged set records within the window
 * @param {Array} exercises - All exercise records (for muscle contribution lookup)
 * @param {Array} allSets - All historical sets (for warm-up detection). If omitted, no filtering.
 * @returns {Object.<string, number>} muscleId → fractional set count
 */
export function computeWeeklyVolume(sets, exercises, allSets = null) {
  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const effective = allSets ? filterEffectiveSets(sets, allSets) : sets;
  const volume = {};

  for (const s of effective) {
    const exercise = exerciseMap[s.exerciseId];
    if (!exercise) continue;

    for (const [muscleId, fraction] of Object.entries(exercise.muscles)) {
      if (fraction >= MIN_CONTRIBUTION) {
        volume[muscleId] = (volume[muscleId] ?? 0) + fraction;
      }
    }
  }

  return volume;
}

/**
 * Compare weekly volume against landmarks for each muscle.
 *
 * @param {Object.<string, number>} volume - muscleId → fractional sets
 * @param {Array} landmarks - Landmark records [{muscleId, mev, mav, mrv}]
 * @returns {Array} Per-muscle status objects sorted by priority (largest deficit first)
 */
export function evaluateVolume(volume, landmarks) {
  const results = landmarks.map((lm) => {
    const sets = volume[lm.muscleId] ?? 0;
    const roundedSets = Math.round(sets * 10) / 10;

    let status;
    let deficit = 0;

    if (roundedSets < lm.mev) {
      status = 'under';
      deficit = lm.mev - roundedSets;
    } else if (roundedSets > lm.mrv) {
      status = 'over';
      deficit = roundedSets - lm.mrv; // positive = how much over
    } else if (roundedSets <= lm.mav) {
      status = 'in-zone';
      deficit = 0;
    } else {
      // Between MAV and MRV — approaching limit
      status = 'in-zone';
      deficit = 0;
    }

    return {
      muscleId: lm.muscleId,
      sets: roundedSets,
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
      status,
      deficit,
    };
  });

  // Sort: 'under' first (by deficit descending), then 'in-zone', then 'over'
  const statusOrder = { under: 0, 'in-zone': 1, over: 2 };
  results.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    if (a.status === 'under') return b.deficit - a.deficit;
    return 0;
  });

  return results;
}

/**
 * Check antagonist muscle balance.
 * Flags pairs where the ratio exceeds 1.5:1.
 *
 * @param {Object.<string, number>} volume - muscleId → fractional sets
 * @returns {Array} Imbalance warnings [{pair: [string,string], ratio: number, dominant: string}]
 */
export function checkAntagonistBalance(volume) {
  const warnings = [];

  for (const [a, b] of ANTAGONIST_PAIRS) {
    const va = volume[a] ?? 0;
    const vb = volume[b] ?? 0;

    if (va === 0 && vb === 0) continue;

    const max = Math.max(va, vb);
    const min = Math.max(va, vb) === va ? vb : va;

    if (min === 0 && max > 0) {
      warnings.push({
        pair: [a, b],
        ratio: Infinity,
        dominant: max === va ? a : b,
      });
    } else if (max / min > 1.5) {
      warnings.push({
        pair: [a, b],
        ratio: Math.round((max / min) * 10) / 10,
        dominant: max === va ? a : b,
      });
    }
  }

  return warnings;
}

/**
 * Check push/pull pattern balance.
 *
 * @param {Array} sets - Logged set records
 * @param {Array} exercises - All exercise records
 * @returns {{pushSets: number, pullSets: number, ratio: number, balanced: boolean}}
 */
export function checkPushPullBalance(sets, exercises) {
  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  let pushSets = 0;
  let pullSets = 0;

  for (const s of sets) {
    const exercise = exerciseMap[s.exerciseId];
    if (!exercise) continue;

    if (PUSH_PATTERNS.includes(exercise.pattern)) pushSets++;
    if (PULL_PATTERNS.includes(exercise.pattern)) pullSets++;
  }

  const min = Math.min(pushSets, pullSets);
  const max = Math.max(pushSets, pullSets);
  const ratio = min === 0 ? (max === 0 ? 1 : Infinity) : Math.round((max / min) * 10) / 10;

  return {
    pushSets,
    pullSets,
    ratio,
    balanced: ratio <= 1.5,
  };
}

/**
 * Filter sets to a rolling window ending at a given date.
 *
 * @param {Array} sets - All set records
 * @param {number} windowDays - Window length in days (default 7)
 * @param {Date} asOf - End date of window (default now)
 * @returns {Array} Sets within the window
 */
export function filterToWindow(sets, windowDays = 7, asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const asOfStr = asOf.toISOString().slice(0, 10);

  return sets.filter((s) => s.date >= cutoffStr && s.date <= asOfStr);
}
