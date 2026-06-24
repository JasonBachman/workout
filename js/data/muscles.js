/**
 * Muscle data access and seed data.
 *
 * Record shape:
 *   { id: string, name: string, group: 'upper'|'lower'|'core' }
 */

const STORE = 'muscles';

export const SEED_MUSCLES = [
  { id: 'chest',       name: 'Chest',        group: 'upper' },
  { id: 'lats',        name: 'Lats',         group: 'upper' },
  { id: 'upper-back',  name: 'Upper Back',   group: 'upper' },
  { id: 'front-delts', name: 'Front Delts',  group: 'upper' },
  { id: 'side-delts',  name: 'Side Delts',   group: 'upper' },
  { id: 'rear-delts',  name: 'Rear Delts',   group: 'upper' },
  { id: 'biceps',      name: 'Biceps',       group: 'upper' },
  { id: 'triceps',     name: 'Triceps',      group: 'upper' },
  { id: 'traps',       name: 'Traps',        group: 'upper' },
  { id: 'forearms',    name: 'Forearms',     group: 'upper' },
  { id: 'quads',       name: 'Quads',        group: 'lower' },
  { id: 'hamstrings',  name: 'Hamstrings',   group: 'lower' },
  { id: 'glutes',      name: 'Glutes',       group: 'lower' },
  { id: 'calves',      name: 'Calves',       group: 'lower' },
  { id: 'abs',         name: 'Abs',          group: 'core' },
];

/** @param {import('../db.js').DB} db */
export async function getAllMuscles(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function getMuscle(db, id) {
  return db.get(STORE, id);
}

/** @param {import('../db.js').DB} db */
export async function seedMuscles(db) {
  const existing = await db.getAll(STORE);
  if (existing.length === 0) {
    await db.putAll(STORE, SEED_MUSCLES);
  }
}
