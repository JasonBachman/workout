/**
 * Program / mesocycle data access.
 *
 * Record shape:
 *   {
 *     id: string,
 *     name: string,
 *     active: boolean,
 *     createdAt: number,
 *     weeks: number,              // mesocycle length
 *     deloadWeek: number|null,    // which week is deload (e.g. 5 = week 5)
 *     days: [                     // one entry per training day in the week
 *       {
 *         name: string,           // e.g. 'Push', 'Upper A'
 *         slots: [
 *           {
 *             exerciseId: string,
 *             targetSets: number,
 *             targetReps: string,  // e.g. '8-12'
 *             progression: {
 *               type: 'linear',         // add weight each session/week
 *               incrementLbs: number,   // e.g. 5
 *               frequency: 'session'|'week',
 *             }
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Progression defaults (evidence-based starting points, recalculated from logged data):
 *   Upper body compounds: +5 lbs/week
 *   Lower body compounds: +10 lbs/week
 *   Isolation:            +5 lbs every 2 weeks (or +reps first)
 */

const STORE = 'programs';

function makeId() {
  return crypto.randomUUID();
}

/** Default progression rates by movement pattern (lbs per week). */
export const DEFAULT_PROGRESSION = {
  'horizontal-push': { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'vertical-push':   { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'horizontal-pull': { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'vertical-pull':   { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'squat':           { type: 'linear', incrementLbs: 10, frequency: 'week' },
  'hip-hinge':       { type: 'linear', incrementLbs: 10, frequency: 'week' },
  'lunge':           { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'isolation':       { type: 'linear', incrementLbs: 5,  frequency: 'week' },
  'carry':           { type: 'linear', incrementLbs: 10, frequency: 'week' },
};

/** @param {import('../db.js').DB} db */
export async function createProgram(db, { name, weeks = 4, deloadWeek = null, days = [] }) {
  const program = {
    id: makeId(),
    name,
    active: true,
    createdAt: Date.now(),
    weeks,
    deloadWeek,
    days,
  };
  await db.put(STORE, program);
  return program;
}

/** @param {import('../db.js').DB} db */
export async function getActiveProgram(db) {
  const all = await db.getAll(STORE);
  return all.find((p) => p.active) ?? null;
}

/** @param {import('../db.js').DB} db */
export async function getAllPrograms(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function getProgram(db, id) {
  return db.get(STORE, id);
}

/** @param {import('../db.js').DB} db */
export async function updateProgram(db, id, updates) {
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, { ...existing, ...updates, id });
}

/** Deactivate all programs, then activate the given one. */
export async function setActiveProgram(db, id) {
  const all = await db.getAll(STORE);
  for (const p of all) {
    if (p.active) {
      await db.put(STORE, { ...p, active: false });
    }
  }
  const target = await db.get(STORE, id);
  if (target) {
    await db.put(STORE, { ...target, active: true });
  }
}
