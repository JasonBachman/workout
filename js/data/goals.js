/**
 * Goal priority data access.
 *
 * Record shape:
 *   { muscleId: string, level: 'high'|'medium'|'low' }
 *
 * Defaults to 'medium' for all muscles if not set.
 */

const STORE = 'goals';

/** @param {import('../db.js').DB} db */
export async function getAllGoals(db) {
  return db.getAll(STORE);
}

/**
 * Get goals as a map: muscleId → level.
 * Returns 'medium' for any muscle not explicitly set.
 */
export async function getGoalMap(db) {
  const goals = await db.getAll(STORE);
  const map = {};
  for (const g of goals) {
    map[g.muscleId] = g.level;
  }
  return map;
}

/** @param {import('../db.js').DB} db */
export async function setGoal(db, muscleId, level) {
  await db.put(STORE, { muscleId, level });
}

/** @param {import('../db.js').DB} db */
export async function setAllGoals(db, goalMap) {
  const records = Object.entries(goalMap).map(([muscleId, level]) => ({ muscleId, level }));
  await db.putAll(STORE, records);
}
