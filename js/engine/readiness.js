/**
 * Fatigue / readiness engine — pure functions.
 *
 * Computes:
 *   - Per-muscle local recovery (recent volume vs recovery window)
 *   - Systemic acute:chronic load ratio (7d vs 28d)
 *   - Per-lift stall detection from e1RM trend
 *   - 0–100 readiness score per muscle
 *   - Systemic fatigue flag
 *
 * A day with no logged sets is just recovery — no penalty.
 */

import { estimateE1RM } from '../data/sets.js';

// ── Base recovery windows (hours) by muscle size — scaled by volume + intensity ──
const BASE_RECOVERY_HOURS = {
  chest: 48, lats: 48, 'upper-back': 48, quads: 48, hamstrings: 48, glutes: 48,
  'front-delts': 36, 'side-delts': 36, 'rear-delts': 36,
  biceps: 36, triceps: 36, traps: 36, forearms: 36, calves: 36, abs: 36,
};

// Recovery scales: base + (volume_factor * sets) + (intensity_factor * avg_rpe_above_7)
const RECOVERY_PER_SET = 4;       // +4 hours per effective set
const RECOVERY_PER_RPE_POINT = 3; // +3 hours per avg RPE point above 7
const MAX_RECOVERY_HOURS = 96;    // cap at 4 days

// ── Acute:chronic ratio thresholds ──
const ACR_FINE = 1.2;
const ACR_CAUTION = 1.5;

// ── Stall detection ──
const STALL_SESSION_COUNT = 3;

/**
 * Compute per-muscle local recovery status.
 * Returns how recovered each muscle is (0–100) based on time since last trained
 * and volume in the recovery window.
 *
 * @param {Array} sets - All logged sets (need timestamps)
 * @param {Array} exercises - All exercises (for muscle mapping)
 * @param {Array} muscles - All muscle records
 * @param {Date} asOf - Current time
 * @returns {Object.<string, {score: number, hoursSinceTrained: number|null, recoveryHours: number}>}
 */
export function computeLocalRecovery(sets, exercises, muscles, asOf = new Date()) {
  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const nowMs = asOf.getTime();

  // For each muscle, find the most recent training session and compute
  // volume + intensity from that session to determine recovery needs.
  // A "session" = all sets for that muscle on the same date.
  const muscleSessionData = {}; // muscleId → { lastTimestamp, lastDate, sets: [] }

  // First pass: find the most recent date for each muscle
  const lastDateForMuscle = {}; // muscleId → most recent date string

  for (const s of sets) {
    const exercise = exerciseMap[s.exerciseId];
    if (!exercise) continue;

    for (const [muscleId, fraction] of Object.entries(exercise.muscles)) {
      if (fraction < 0.3) continue;
      if (!lastDateForMuscle[muscleId] || s.date > lastDateForMuscle[muscleId]) {
        lastDateForMuscle[muscleId] = s.date;
      }
    }
  }

  // Second pass: collect ALL sets from the most recent date for each muscle
  for (const s of sets) {
    const exercise = exerciseMap[s.exerciseId];
    if (!exercise) continue;

    // Skip warm-ups: only count sets in effective rep range with meaningful weight
    if (s.reps < 5 || s.reps > 30) continue;
    if (s.rpe !== null && s.rpe !== undefined && s.rpe < 6) continue;

    for (const [muscleId, fraction] of Object.entries(exercise.muscles)) {
      if (fraction < 0.3) continue;
      if (s.date !== lastDateForMuscle[muscleId]) continue;

      if (!muscleSessionData[muscleId]) {
        muscleSessionData[muscleId] = { lastTimestamp: 0, lastDate: s.date, sets: [] };
      }

      const md = muscleSessionData[muscleId];
      md.sets.push({ fraction, rpe: s.rpe, weight: s.weight, reps: s.reps });
      if (s.timestamp > md.lastTimestamp) {
        md.lastTimestamp = s.timestamp;
      }
    }
  }

  const result = {};

  for (const muscle of muscles) {
    const { id } = muscle;
    const baseHrs = BASE_RECOVERY_HOURS[id] ?? 36;
    const md = muscleSessionData[id];

    if (!md || md.lastTimestamp === 0) {
      result[id] = { score: 100, hoursSinceTrained: null, recoveryHours: baseHrs };
      continue;
    }

    // Compute effective volume for this session
    const effectiveSets = md.sets.reduce((sum, s) => sum + s.fraction, 0);

    // Compute average RPE (only from sets that have RPE)
    const rpeValues = md.sets.filter((s) => s.rpe != null).map((s) => s.rpe);
    const avgRpe = rpeValues.length > 0
      ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
      : 7.5; // assume moderate if no RPE logged

    // Scale recovery window: base + volume factor + intensity factor
    const volumeAddon = effectiveSets * RECOVERY_PER_SET;
    const intensityAddon = Math.max(0, avgRpe - 7) * RECOVERY_PER_RPE_POINT;
    const recoveryHrs = Math.min(MAX_RECOVERY_HOURS, baseHrs + volumeAddon + intensityAddon);

    const hoursSince = (nowMs - md.lastTimestamp) / 3600000;
    const recoveryFraction = Math.min(hoursSince / recoveryHrs, 1);
    const score = Math.max(0, Math.min(100, Math.round(recoveryFraction * 100)));

    result[id] = { score, hoursSinceTrained: Math.round(hoursSince), recoveryHours: Math.round(recoveryHrs) };
  }

  return result;
}

/**
 * Compute systemic acute:chronic workload ratio.
 * Uses total sets in 7d vs average weekly sets over 28d.
 *
 * @param {Array} sets - All logged sets
 * @param {Date} asOf - Current time
 * @returns {{acute: number, chronic: number, ratio: number, level: 'fine'|'caution'|'overreaching'}}
 */
export function computeAcuteChronicRatio(sets, asOf = new Date()) {
  const asOfStr = asOf.toISOString().slice(0, 10);

  const daysAgo = (n) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const acute7 = sets.filter((s) => s.date > daysAgo(7) && s.date <= asOfStr).length;
  const chronic28 = sets.filter((s) => s.date > daysAgo(28) && s.date <= asOfStr).length;

  const chronicWeekly = chronic28 / 4; // average sets per week over 28 days

  let ratio;
  if (chronicWeekly === 0) {
    ratio = acute7 === 0 ? 1.0 : 2.0; // New lifter ramping up
  } else {
    ratio = Math.round((acute7 / chronicWeekly) * 100) / 100;
  }

  let level;
  if (ratio <= ACR_FINE) level = 'fine';
  else if (ratio <= ACR_CAUTION) level = 'caution';
  else level = 'overreaching';

  return { acute: acute7, chronic: Math.round(chronicWeekly * 10) / 10, ratio, level };
}

/**
 * Detect stalls per exercise from e1RM trend.
 * A stall = 3+ consecutive sessions where e1RM is flat or declining.
 *
 * @param {Array} sets - All logged sets
 * @returns {Array} [{exerciseId, sessions: number, lastE1RM: number, peakE1RM: number}]
 */
export function detectStalls(sets) {
  // Group sets by exercise, then by date to find per-session best e1RM
  const byExercise = {};
  for (const s of sets) {
    if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
    byExercise[s.exerciseId].push(s);
  }

  const stalls = [];

  for (const [exerciseId, exSets] of Object.entries(byExercise)) {
    // Group by date, find best e1RM per session
    const byDate = {};
    for (const s of exSets) {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    }

    const sessions = Object.entries(byDate)
      .map(([date, dateSets]) => {
        const bestE1RM = Math.max(...dateSets.map((s) => estimateE1RM(s.weight, s.reps)));
        return { date, e1rm: bestE1RM };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sessions.length < STALL_SESSION_COUNT) continue;

    // Check last N sessions for flat/declining trend
    const recent = sessions.slice(-STALL_SESSION_COUNT);
    let isStalled = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].e1rm > recent[i - 1].e1rm) {
        isStalled = false;
        break;
      }
    }

    if (isStalled) {
      const peakE1RM = Math.max(...sessions.map((s) => s.e1rm));
      stalls.push({
        exerciseId,
        sessions: recent.length,
        lastE1RM: recent[recent.length - 1].e1rm,
        peakE1RM,
      });
    }
  }

  return stalls;
}

/**
 * Compute overall readiness score per muscle (0–100).
 * Combines local recovery, systemic fatigue, and stall status.
 *
 * @param {Array} sets - All logged sets
 * @param {Array} exercises - All exercises
 * @param {Array} muscles - All muscles
 * @param {Date} asOf - Current time
 * @returns {{
 *   perMuscle: Object.<string, {readiness: number, recovery: number, status: string}>,
 *   systemic: {ratio: number, level: string, fatigued: boolean},
 *   stalls: Array
 * }}
 */
export function computeReadiness(sets, exercises, muscles, asOf = new Date()) {
  const localRecovery = computeLocalRecovery(sets, exercises, muscles, asOf);
  const acr = computeAcuteChronicRatio(sets, asOf);
  const stalls = detectStalls(sets);

  // Systemic fatigue modifier
  const systemicPenalty =
    acr.level === 'overreaching' ? 25 :
    acr.level === 'caution' ? 10 : 0;

  // Build stall set for quick lookup of affected muscles
  const stalledExercises = new Set(stalls.map((s) => s.exerciseId));
  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const stalledMuscles = new Set();
  for (const exId of stalledExercises) {
    const ex = exerciseMap[exId];
    if (ex) {
      for (const muscleId of Object.keys(ex.muscles)) {
        stalledMuscles.add(muscleId);
      }
    }
  }

  const perMuscle = {};

  for (const muscle of muscles) {
    const { id } = muscle;
    const recovery = localRecovery[id];
    const stallPenalty = stalledMuscles.has(id) ? 10 : 0;

    const raw = recovery.score - systemicPenalty - stallPenalty;
    const readiness = Math.max(0, Math.min(100, raw));

    let status;
    if (readiness >= 70) status = 'ready';
    else if (readiness >= 40) status = 'recovering';
    else status = 'fatigued';

    perMuscle[id] = {
      readiness,
      recovery: recovery.score,
      hoursSinceTrained: recovery.hoursSinceTrained,
      status,
    };
  }

  return {
    perMuscle,
    systemic: {
      acute: acr.acute,
      chronic: acr.chronic,
      ratio: acr.ratio,
      level: acr.level,
      fatigued: acr.level === 'overreaching',
    },
    stalls,
  };
}
