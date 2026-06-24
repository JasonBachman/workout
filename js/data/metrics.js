/**
 * Body metrics data access.
 *
 * Record shape:
 *   {
 *     id: string,
 *     type: 'bodyweight'|'measurement',
 *     date: string,         // 'YYYY-MM-DD'
 *     timestamp: number,
 *     value: number,        // lbs for bodyweight, inches for measurements
 *     label: string|null,   // e.g. 'waist', 'chest', 'arm' (for measurements)
 *   }
 */

const STORE = 'metrics';

function makeId() {
  return crypto.randomUUID();
}

/** @param {import('../db.js').DB} db */
export async function logMetric(db, { type, value, label = null }) {
  const now = new Date();
  const record = {
    id: makeId(),
    type,
    date: now.toISOString().slice(0, 10),
    timestamp: now.getTime(),
    value,
    label,
  };
  await db.put(STORE, record);
  return record;
}

/** @param {import('../db.js').DB} db */
export async function getMetricsByType(db, type) {
  return db.getAllByIndex(STORE, 'byType', type);
}

/** @param {import('../db.js').DB} db */
export async function getMetricsByDateRange(db, startDate, endDate) {
  return db.getAllByRange(STORE, 'byDate', startDate, endDate);
}

/** @param {import('../db.js').DB} db */
export async function getAllMetrics(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function deleteMetric(db, id) {
  return db.delete(STORE, id);
}
