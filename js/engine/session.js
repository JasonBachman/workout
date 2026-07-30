/**
 * Per-session volume tracking — pure functions.
 *
 * Tracks effective sets per muscle within a single session and
 * warns when approaching diminishing returns.
 *
 * Per-session MRV (maximum productive volume in one session)
 * based on RP (Israetel) and Schoenfeld et al. 2017:
 *   Large muscles: ~10 sets/session
 *   Small muscles: ~8 sets/session
 *
 * Beyond these limits, additional sets produce minimal adaptation
 * and increase injury/recovery risk ("junk volume").
 */

// Per-session caps by muscle size — the junk-volume ceiling for one session
export const SESSION_CAP = {
  chest: 10, lats: 10, 'upper-back': 10, quads: 10, hamstrings: 10, glutes: 10,
  'front-delts': 8, 'side-delts': 8, 'rear-delts': 8,
  biceps: 8, triceps: 8, traps: 8, forearms: 8, calves: 8, abs: 8,
};

const MIN_CONTRIBUTION = 0.3; // same threshold as volume engine

// Typical times a given cluster (push/pull/lower) is trained per week on a
// split. The weekly MAV is spread across these sessions to size one day's
// balanced dose. Tunable — higher = lighter, more frequent days.
const SESSIONS_PER_WEEK_PER_CLUSTER = 2;
const MIN_SESSION_TARGET = 3;

/**
 * Balanced per-session target for a muscle — the "well-rounded dose"
 * we aim to hit in one session so a day covers its muscles evenly.
 *
 * Weekly MAV spread across the cluster's weekly frequency, floored so
 * every trained muscle gets a real dose and capped at the per-session
 * junk-volume ceiling.
 *
 * @param {string} muscleId
 * @param {number} mav - weekly Maximum Adaptive Volume for the muscle
 * @returns {number} target effective sets for this muscle this session
 */
export function sessionMuscleTarget(muscleId, mav) {
  const cap = SESSION_CAP[muscleId] ?? 8;
  const raw = Math.round((mav ?? 0) / SESSIONS_PER_WEEK_PER_CLUSTER);
  return Math.max(MIN_SESSION_TARGET, Math.min(raw, cap));
}

/**
 * Compute per-muscle effective sets for the current session.
 *
 * @param {Array} sessionSets - Sets logged today
 * @param {Array} exercises - All exercises (for muscle mapping)
 * @returns {Object.<string, {sets: number, cap: number, status: 'ok'|'warning'|'over'}>}
 */
export function computeSessionVolume(sessionSets, exercises) {
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const volume = {};

  for (const s of sessionSets) {
    const ex = exMap[s.exerciseId];
    if (!ex) continue;

    for (const [muscleId, fraction] of Object.entries(ex.muscles)) {
      if (fraction >= MIN_CONTRIBUTION) {
        volume[muscleId] = (volume[muscleId] ?? 0) + fraction;
      }
    }
  }

  const result = {};

  for (const [muscleId, sets] of Object.entries(volume)) {
    const cap = SESSION_CAP[muscleId] ?? 8;
    const rounded = Math.round(sets * 10) / 10;
    let status;

    if (rounded >= cap) {
      status = 'over';
    } else if (rounded >= cap * 0.8) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    result[muscleId] = { sets: rounded, cap, status };
  }

  return result;
}

/**
 * Get muscles that are at warning or over for the current session.
 * Suitable for displaying alerts.
 *
 * @param {Object} sessionVolume - From computeSessionVolume()
 * @param {Array} muscles - All muscle records (for names)
 * @returns {Array<{muscleId: string, name: string, sets: number, cap: number, status: string, message: string}>}
 */
export function getSessionAlerts(sessionVolume, muscles) {
  const muscleNames = Object.fromEntries(muscles.map((m) => [m.id, m.name]));
  const alerts = [];

  for (const [muscleId, data] of Object.entries(sessionVolume)) {
    if (data.status === 'ok') continue;

    const name = muscleNames[muscleId] ?? muscleId;

    let message;
    if (data.status === 'over') {
      message = `${name}: ${data.sets}/${data.cap} sets — diminishing returns`;
    } else {
      message = `${name}: ${data.sets}/${data.cap} sets — approaching limit`;
    }

    alerts.push({ muscleId, name, sets: data.sets, cap: data.cap, status: data.status, message });
  }

  // Sort: over first, then warning
  alerts.sort((a, b) => (a.status === 'over' ? 0 : 1) - (b.status === 'over' ? 0 : 1));

  return alerts;
}
