/**
 * MEV / MAV / MRV landmark data access and seed data.
 * Based on RP (Dr. Mike Israetel) published volume landmarks.
 * Values are weekly sets per muscle group.
 *
 * Record shape:
 *   { muscleId: string, mev: number, mav: number, mrv: number }
 *
 * MEV = Minimum Effective Volume (below this, no meaningful growth)
 * MAV = Maximum Adaptive Volume (sweet spot for most growth)
 * MRV = Maximum Recoverable Volume (above this, recovery fails)
 */

const STORE = 'landmarks';

export const SEED_LANDMARKS = [
  { muscleId: 'chest',       mev: 8,  mav: 16, mrv: 22 },
  { muscleId: 'lats',        mev: 8,  mav: 16, mrv: 22 },
  { muscleId: 'upper-back',  mev: 8,  mav: 16, mrv: 25 },
  { muscleId: 'front-delts', mev: 6,  mav: 12, mrv: 18 },
  { muscleId: 'side-delts',  mev: 8,  mav: 18, mrv: 26 },
  { muscleId: 'rear-delts',  mev: 8,  mav: 16, mrv: 22 },
  { muscleId: 'biceps',      mev: 6,  mav: 14, mrv: 20 },
  { muscleId: 'triceps',     mev: 6,  mav: 12, mrv: 18 },
  { muscleId: 'traps',       mev: 6,  mav: 14, mrv: 20 },
  { muscleId: 'forearms',    mev: 4,  mav: 10, mrv: 16 },
  { muscleId: 'quads',       mev: 8,  mav: 16, mrv: 22 },
  { muscleId: 'hamstrings',  mev: 6,  mav: 14, mrv: 20 },
  { muscleId: 'glutes',      mev: 6,  mav: 14, mrv: 20 },
  { muscleId: 'calves',      mev: 8,  mav: 14, mrv: 20 },
  { muscleId: 'abs',         mev: 6,  mav: 14, mrv: 20 },
];

/** @param {import('../db.js').DB} db */
export async function getAllLandmarks(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function getLandmark(db, muscleId) {
  return db.get(STORE, muscleId);
}

/** @param {import('../db.js').DB} db */
export async function updateLandmark(db, muscleId, updates) {
  const existing = await db.get(STORE, muscleId);
  if (!existing) return;
  await db.put(STORE, { ...existing, ...updates, muscleId });
}

/** @param {import('../db.js').DB} db */
export async function seedLandmarks(db) {
  const existing = await db.getAll(STORE);
  if (existing.length === 0) {
    await db.putAll(STORE, SEED_LANDMARKS);
  }
}
