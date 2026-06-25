/**
 * Multi-factor muscle priority scoring — pure functions.
 *
 * Replaces the old "readiness × deficit" formula with a weighted
 * composite that answers: "Given this muscle is ready, how much
 * does it BENEFIT from training today?"
 *
 * Factors:
 *   1. Volume position (room to grow toward MAV)
 *   2. Frequency urgency (needs another session this week)
 *   3. Antagonist balance (lagging behind its pair)
 *   4. Stall bonus (encourage exercise variation)
 *   5. Readiness gate (can you train it — not a ranking signal)
 *
 * Plus a goal multiplier (high/medium/low user preference).
 */

import { ANTAGONIST_PAIRS } from './volume.js';

// ── Factor weights (tuning knobs) ──
const W_VOLUME = 40;
const W_FREQUENCY = 25;
const W_ANTAGONIST = 15;
const W_STALL = 5;

// ── Goal multipliers ──
const GOAL_MULTIPLIER = { high: 1.5, medium: 1.0, low: 0.6 };

// ── Frequency defaults ──
const SETS_PER_SESSION = 4; // assumed effective sets per muscle per session
const MAX_FREQUENCY = 4;    // cap ideal frequency

/**
 * Volume position score (0–1).
 * How much room this muscle has to grow toward MAV.
 * Under MEV gets a bonus.
 */
export function volumePositionScore(sets, mev, mav, mrv) {
  if (sets >= mrv) return 0;         // over MRV — don't train
  if (sets >= mav) return 0.1;       // at MAV — minimal benefit

  if (sets < mev) {
    // Under MEV — critical deficit. Score 0.7–1.0 based on how far under.
    const underFraction = Math.min((mev - sets) / mev, 1);
    return 0.7 + underFraction * 0.3;
  }

  // Between MEV and MAV — score 0.1–0.7 based on room remaining.
  const room = (mav - sets) / (mav - mev);
  return 0.1 + room * 0.6;
}

/**
 * Frequency urgency score (0–1).
 * How urgently this muscle needs another session this week.
 *
 * @param {number} sessionDaysThisWeek - distinct days trained in rolling 7d window
 * @param {number} idealFrequency - target sessions per week
 * @param {number} daysLeftInWindow - days remaining in the 7-day window
 */
export function frequencyUrgencyScore(sessionDaysThisWeek, idealFrequency, daysLeftInWindow) {
  const sessionsNeeded = idealFrequency - sessionDaysThisWeek;

  if (sessionsNeeded <= 0) return 0;  // already hit target
  if (daysLeftInWindow <= 0) return 0; // week is over

  // Urgency = sessions still needed / days left to do them
  // If you need 2 more sessions and have 2 days left, urgency is max
  const urgency = sessionsNeeded / daysLeftInWindow;
  return Math.min(urgency, 1);
}

/**
 * Antagonist balance bonus (0–1).
 * Boosts a muscle if its antagonist pair has significantly more volume.
 *
 * @param {string} muscleId
 * @param {Object.<string, number>} weeklyVolume - muscleId → sets
 */
export function antagonistBalanceBonus(muscleId, weeklyVolume) {
  for (const [a, b] of ANTAGONIST_PAIRS) {
    let partner = null;
    if (a === muscleId) partner = b;
    else if (b === muscleId) partner = a;
    else continue;

    const myVol = weeklyVolume[muscleId] ?? 0;
    const partnerVol = weeklyVolume[partner] ?? 0;

    if (partnerVol <= myVol) return 0; // not lagging

    const ratio = myVol > 0 ? partnerVol / myVol : (partnerVol > 0 ? 3 : 0);
    if (ratio <= 1.3) return 0;

    // Scale 0–1: ratio 1.3 = 0, ratio 2.0+ = 1.0
    return Math.min((ratio - 1.3) / 0.7, 1);
  }

  return 0; // no antagonist pair
}

/**
 * Stall bonus (0–1).
 * Small nudge toward muscles where exercises have stalled,
 * encouraging the recommender to pick alternative exercises.
 *
 * @param {string} muscleId
 * @param {Array} stalls - from detectStalls()
 * @param {Array} exercises - all exercises
 */
export function stallBonus(muscleId, stalls, exercises) {
  if (stalls.length === 0) return 0;

  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const stalledForMuscle = stalls.some((s) => {
    const ex = exMap[s.exerciseId];
    return ex && muscleId in ex.muscles;
  });

  return stalledForMuscle ? 1.0 : 0;
}

/**
 * Readiness gate (0–1).
 * Sigmoid-like curve: determines WHETHER you can train, not ranking.
 * < 40 = blocked, 40-70 = ramp, 70-100 = near-flat.
 */
export function readinessGate(readiness) {
  if (readiness < 40) return 0;
  if (readiness < 70) return 0.3 + (readiness - 40) / 30 * 0.6;
  return 0.9 + (readiness - 70) / 30 * 0.1;
}

/**
 * Derive ideal training frequency for a muscle from its MAV.
 */
export function deriveIdealFrequency(mav) {
  const raw = Math.ceil(mav / SETS_PER_SESSION);
  return Math.min(Math.max(raw, 2), MAX_FREQUENCY);
}

/**
 * Count distinct session-days a muscle was trained in a rolling window.
 *
 * @param {Array} sets - all sets in the window
 * @param {Array} exercises - all exercises
 * @param {string} muscleId
 * @returns {number}
 */
export function countMuscleSessionDays(sets, exercises, muscleId) {
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const dates = new Set();

  for (const s of sets) {
    const ex = exMap[s.exerciseId];
    if (ex && muscleId in ex.muscles && ex.muscles[muscleId] >= 0.3) {
      dates.add(s.date);
    }
  }

  return dates.size;
}

/**
 * Compute composite priority for a single muscle.
 *
 * @param {Object} params
 * @param {string} params.muscleId
 * @param {number} params.sets - current weekly volume
 * @param {number} params.mev
 * @param {number} params.mav
 * @param {number} params.mrv
 * @param {number} params.readiness - 0–100
 * @param {number} params.sessionDays - distinct days trained this week
 * @param {number} params.daysLeftInWindow
 * @param {Object} params.weeklyVolume - all muscles' weekly volume
 * @param {Array} params.stalls
 * @param {Array} params.exercises
 * @param {string} params.goalLevel - 'high'|'medium'|'low'
 * @returns {{priority: number, reason: string}}
 */
export function computeMusclePriority({
  muscleId, sets, mev, mav, mrv, readiness,
  sessionDays, daysLeftInWindow, weeklyVolume,
  stalls, exercises, goalLevel = 'medium',
}) {
  // Over MRV or fatigued — blocked
  if (sets >= mrv) {
    return { priority: 0, reason: `Over MRV (${sets}/${mrv} sets) — needs rest` };
  }

  const gate = readinessGate(readiness);
  if (gate === 0) {
    return { priority: 0, reason: `Fatigued (readiness ${readiness}) — needs recovery` };
  }

  // Compute each factor
  const vScore = volumePositionScore(sets, mev, mav, mrv);
  const idealFreq = deriveIdealFrequency(mav);
  const fScore = frequencyUrgencyScore(sessionDays, idealFreq, daysLeftInWindow);
  const aScore = antagonistBalanceBonus(muscleId, weeklyVolume);
  const sScore = stallBonus(muscleId, stalls, exercises);

  // Weighted composite
  const raw = vScore * W_VOLUME + fScore * W_FREQUENCY + aScore * W_ANTAGONIST + sScore * W_STALL;

  // Apply readiness gate and goal multiplier
  const goalMult = GOAL_MULTIPLIER[goalLevel] ?? 1.0;
  const priority = Math.round(raw * gate * goalMult * 10) / 10;

  // Build reason from top contributing factor
  const reason = buildPriorityReason(muscleId, sets, mev, mav, vScore, fScore, aScore, sScore, sessionDays, idealFreq, goalLevel);

  return { priority, reason };
}

function buildPriorityReason(muscleId, sets, mev, mav, vScore, fScore, aScore, sScore, sessionDays, idealFreq, goalLevel) {
  const factors = [
    { score: vScore * W_VOLUME, label: 'volume' },
    { score: fScore * W_FREQUENCY, label: 'frequency' },
    { score: aScore * W_ANTAGONIST, label: 'balance' },
    { score: sScore * W_STALL, label: 'stall' },
  ].sort((a, b) => b.score - a.score);

  const top = factors[0];
  const goalTag = goalLevel === 'high' ? ' (priority goal)' : goalLevel === 'low' ? ' (low priority)' : '';

  if (top.label === 'volume') {
    if (sets < mev) return `Under MEV (${sets}/${mev} sets) — critical deficit${goalTag}`;
    return `Room to grow (${sets}/${mav} MAV)${goalTag}`;
  }
  if (top.label === 'frequency') {
    const needed = idealFreq - sessionDays;
    return `Needs ${needed} more session${needed > 1 ? 's' : ''} this week${goalTag}`;
  }
  if (top.label === 'balance') {
    return `Lagging behind antagonist${goalTag}`;
  }
  if (top.label === 'stall') {
    return `Stalled — try a different exercise${goalTag}`;
  }

  return `General coverage${goalTag}`;
}
