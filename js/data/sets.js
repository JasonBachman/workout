/**
 * Logged sets data access.
 *
 * Record shape:
 *   {
 *     id: string,
 *     exerciseId: string,
 *     programId: string|null,
 *     date: string,          // 'YYYY-MM-DD'
 *     timestamp: number,     // Date.now()
 *     weight: number,        // lbs
 *     reps: number,
 *     rpe: number|null,      // 1–10 rating of perceived exertion
 *     notes: string
 *   }
 */

const STORE = 'sets';

function makeId() {
  return crypto.randomUUID();
}

/** Estimated one-rep max (Epley formula). */
export function estimateE1RM(weight, reps) {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** @param {import('../db.js').DB} db */
export async function logSet(db, { exerciseId, programId = null, weight, reps, rpe = null, notes = '' }) {
  const now = new Date();
  const record = {
    id: makeId(),
    exerciseId,
    programId,
    date: now.toISOString().slice(0, 10),
    timestamp: now.getTime(),
    weight,
    reps,
    rpe,
    notes,
  };
  await db.put(STORE, record);
  return record;
}

/** @param {import('../db.js').DB} db */
export async function getSetsByDate(db, date) {
  return db.getAllByIndex(STORE, 'byDate', date);
}

/** @param {import('../db.js').DB} db */
export async function getSetsByDateRange(db, startDate, endDate) {
  return db.getAllByRange(STORE, 'byDate', startDate, endDate);
}

/** @param {import('../db.js').DB} db */
export async function getSetsByExercise(db, exerciseId) {
  return db.getAllByIndex(STORE, 'byExercise', exerciseId);
}

/** @param {import('../db.js').DB} db */
export async function getAllSets(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function deleteSet(db, id) {
  return db.delete(STORE, id);
}

/** @param {import('../db.js').DB} db */
export async function updateSet(db, id, updates) {
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, { ...existing, ...updates, id });
}
