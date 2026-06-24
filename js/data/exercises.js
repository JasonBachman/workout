/**
 * Exercise data access and seed data.
 *
 * Record shape:
 *   {
 *     id: string,
 *     name: string,
 *     equipment: 'barbell'|'dumbbell'|'machine'|'cable'|'bodyweight',
 *     pattern: 'horizontal-push'|'vertical-push'|'horizontal-pull'|'vertical-pull'|
 *              'squat'|'hip-hinge'|'lunge'|'isolation'|'carry',
 *     muscles: { [muscleId]: number }  // contribution fraction 0–1
 *   }
 */

const STORE = 'exercises';

export const SEED_EXERCISES = [
  // ── Horizontal Push ──
  { id: 'barbell-bench',       name: 'Barbell Bench Press',     equipment: 'barbell',    pattern: 'horizontal-push', muscles: { chest: 1.0, 'front-delts': 0.5, triceps: 0.5 } },
  { id: 'incline-bench',       name: 'Incline Bench Press',     equipment: 'barbell',    pattern: 'horizontal-push', muscles: { chest: 0.8, 'front-delts': 0.7, triceps: 0.4 } },
  { id: 'db-bench',            name: 'Dumbbell Bench Press',    equipment: 'dumbbell',   pattern: 'horizontal-push', muscles: { chest: 1.0, 'front-delts': 0.5, triceps: 0.4 } },
  { id: 'db-incline-bench',    name: 'DB Incline Bench',        equipment: 'dumbbell',   pattern: 'horizontal-push', muscles: { chest: 0.8, 'front-delts': 0.7, triceps: 0.3 } },
  { id: 'machine-chest-press', name: 'Machine Chest Press',     equipment: 'machine',    pattern: 'horizontal-push', muscles: { chest: 1.0, 'front-delts': 0.4, triceps: 0.4 } },
  { id: 'push-up',             name: 'Push-Up',                 equipment: 'bodyweight', pattern: 'horizontal-push', muscles: { chest: 0.8, 'front-delts': 0.5, triceps: 0.5 } },

  // ── Vertical Push ──
  { id: 'ohp',                 name: 'Overhead Press',          equipment: 'barbell',    pattern: 'vertical-push',   muscles: { 'front-delts': 1.0, 'side-delts': 0.4, triceps: 0.6 } },
  { id: 'db-ohp',              name: 'DB Overhead Press',       equipment: 'dumbbell',   pattern: 'vertical-push',   muscles: { 'front-delts': 1.0, 'side-delts': 0.5, triceps: 0.5 } },
  { id: 'lateral-raise',       name: 'Lateral Raise',           equipment: 'dumbbell',   pattern: 'isolation',        muscles: { 'side-delts': 1.0 } },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise',     equipment: 'cable',      pattern: 'isolation',        muscles: { 'side-delts': 1.0 } },

  // ── Horizontal Pull ──
  { id: 'barbell-row',         name: 'Barbell Row',             equipment: 'barbell',    pattern: 'horizontal-pull', muscles: { 'upper-back': 0.8, lats: 0.7, 'rear-delts': 0.5, biceps: 0.5, forearms: 0.3 } },
  { id: 'db-row',              name: 'Dumbbell Row',            equipment: 'dumbbell',   pattern: 'horizontal-pull', muscles: { 'upper-back': 0.7, lats: 0.8, 'rear-delts': 0.5, biceps: 0.5, forearms: 0.3 } },
  { id: 'cable-row',           name: 'Cable Row',               equipment: 'cable',      pattern: 'horizontal-pull', muscles: { 'upper-back': 0.8, lats: 0.7, 'rear-delts': 0.4, biceps: 0.4 } },
  { id: 'machine-row',         name: 'Machine Row',             equipment: 'machine',    pattern: 'horizontal-pull', muscles: { 'upper-back': 0.8, lats: 0.7, 'rear-delts': 0.4, biceps: 0.3 } },
  { id: 'face-pull',           name: 'Face Pull',               equipment: 'cable',      pattern: 'horizontal-pull', muscles: { 'rear-delts': 1.0, 'upper-back': 0.5, 'side-delts': 0.3 } },

  // ── Vertical Pull ──
  { id: 'pull-up',             name: 'Pull-Up',                 equipment: 'bodyweight', pattern: 'vertical-pull',   muscles: { lats: 1.0, biceps: 0.6, 'upper-back': 0.4, forearms: 0.3 } },
  { id: 'chin-up',             name: 'Chin-Up',                 equipment: 'bodyweight', pattern: 'vertical-pull',   muscles: { lats: 0.9, biceps: 0.8, 'upper-back': 0.4, forearms: 0.3 } },
  { id: 'lat-pulldown',        name: 'Lat Pulldown',            equipment: 'cable',      pattern: 'vertical-pull',   muscles: { lats: 1.0, biceps: 0.5, 'upper-back': 0.3 } },

  // ── Squat Pattern ──
  { id: 'barbell-squat',       name: 'Barbell Squat',           equipment: 'barbell',    pattern: 'squat',           muscles: { quads: 1.0, glutes: 0.7, hamstrings: 0.3, abs: 0.3 } },
  { id: 'front-squat',         name: 'Front Squat',             equipment: 'barbell',    pattern: 'squat',           muscles: { quads: 1.0, glutes: 0.5, abs: 0.5 } },
  { id: 'goblet-squat',        name: 'Goblet Squat',            equipment: 'dumbbell',   pattern: 'squat',           muscles: { quads: 0.9, glutes: 0.6, abs: 0.3 } },
  { id: 'leg-press',           name: 'Leg Press',               equipment: 'machine',    pattern: 'squat',           muscles: { quads: 1.0, glutes: 0.5 } },
  { id: 'hack-squat',          name: 'Hack Squat',              equipment: 'machine',    pattern: 'squat',           muscles: { quads: 1.0, glutes: 0.4 } },

  // ── Hip Hinge ──
  { id: 'deadlift',            name: 'Deadlift',                equipment: 'barbell',    pattern: 'hip-hinge',       muscles: { hamstrings: 0.8, glutes: 1.0, 'upper-back': 0.5, traps: 0.4, forearms: 0.4, abs: 0.3 } },
  { id: 'rdl',                 name: 'Romanian Deadlift',       equipment: 'barbell',    pattern: 'hip-hinge',       muscles: { hamstrings: 1.0, glutes: 0.8, 'upper-back': 0.3 } },
  { id: 'db-rdl',              name: 'DB Romanian Deadlift',    equipment: 'dumbbell',   pattern: 'hip-hinge',       muscles: { hamstrings: 1.0, glutes: 0.8 } },
  { id: 'hip-thrust',          name: 'Hip Thrust',              equipment: 'barbell',    pattern: 'hip-hinge',       muscles: { glutes: 1.0, hamstrings: 0.4 } },
  { id: 'cable-pull-through',  name: 'Cable Pull-Through',      equipment: 'cable',      pattern: 'hip-hinge',       muscles: { glutes: 0.9, hamstrings: 0.6 } },

  // ── Lunge ──
  { id: 'walking-lunge',       name: 'Walking Lunge',           equipment: 'dumbbell',   pattern: 'lunge',           muscles: { quads: 0.8, glutes: 0.7, hamstrings: 0.3 } },
  { id: 'bulgarian-split',     name: 'Bulgarian Split Squat',   equipment: 'dumbbell',   pattern: 'lunge',           muscles: { quads: 0.9, glutes: 0.7, hamstrings: 0.3 } },
  { id: 'step-up',             name: 'Step-Up',                 equipment: 'dumbbell',   pattern: 'lunge',           muscles: { quads: 0.8, glutes: 0.6 } },

  // ── Isolation: Arms ──
  { id: 'barbell-curl',        name: 'Barbell Curl',            equipment: 'barbell',    pattern: 'isolation',        muscles: { biceps: 1.0, forearms: 0.3 } },
  { id: 'db-curl',             name: 'Dumbbell Curl',           equipment: 'dumbbell',   pattern: 'isolation',        muscles: { biceps: 1.0, forearms: 0.3 } },
  { id: 'hammer-curl',         name: 'Hammer Curl',             equipment: 'dumbbell',   pattern: 'isolation',        muscles: { biceps: 0.8, forearms: 0.6 } },
  { id: 'cable-curl',          name: 'Cable Curl',              equipment: 'cable',       pattern: 'isolation',        muscles: { biceps: 1.0 } },
  { id: 'tricep-pushdown',     name: 'Tricep Pushdown',         equipment: 'cable',       pattern: 'isolation',        muscles: { triceps: 1.0 } },
  { id: 'overhead-extension',  name: 'Overhead Tricep Extension', equipment: 'cable',     pattern: 'isolation',        muscles: { triceps: 1.0 } },
  { id: 'skullcrusher',        name: 'Skullcrusher',            equipment: 'barbell',    pattern: 'isolation',        muscles: { triceps: 1.0 } },

  // ── Isolation: Legs ──
  { id: 'leg-extension',       name: 'Leg Extension',           equipment: 'machine',    pattern: 'isolation',        muscles: { quads: 1.0 } },
  { id: 'leg-curl',            name: 'Leg Curl',                equipment: 'machine',    pattern: 'isolation',        muscles: { hamstrings: 1.0 } },
  { id: 'calf-raise',          name: 'Calf Raise',              equipment: 'machine',    pattern: 'isolation',        muscles: { calves: 1.0 } },

  // ── Isolation: Other ──
  { id: 'cable-fly',           name: 'Cable Fly',               equipment: 'cable',      pattern: 'isolation',        muscles: { chest: 1.0 } },
  { id: 'pec-deck',            name: 'Pec Deck',                equipment: 'machine',    pattern: 'isolation',        muscles: { chest: 1.0 } },
  { id: 'reverse-fly',         name: 'Reverse Fly',             equipment: 'dumbbell',   pattern: 'isolation',        muscles: { 'rear-delts': 1.0, 'upper-back': 0.3 } },
  { id: 'shrug',               name: 'Barbell Shrug',           equipment: 'barbell',    pattern: 'isolation',        muscles: { traps: 1.0 } },
  { id: 'wrist-curl',          name: 'Wrist Curl',              equipment: 'dumbbell',   pattern: 'isolation',        muscles: { forearms: 1.0 } },
  { id: 'hanging-leg-raise',   name: 'Hanging Leg Raise',       equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'cable-crunch',        name: 'Cable Crunch',            equipment: 'cable',      pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'plank',               name: 'Plank',                   equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'russian-twist',       name: 'Russian Twist',           equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'ab-wheel',            name: 'Ab Wheel Rollout',        equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'bicycle-crunch',      name: 'Bicycle Crunch',          equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'dead-bug',            name: 'Dead Bug',                equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 1.0 } },
  { id: 'mountain-climber',    name: 'Mountain Climber',        equipment: 'bodyweight', pattern: 'isolation',        muscles: { abs: 0.8, quads: 0.3 } },

  // ── Extra: Chest ──
  { id: 'dip',                 name: 'Dip',                     equipment: 'bodyweight', pattern: 'horizontal-push', muscles: { chest: 0.7, triceps: 0.8, 'front-delts': 0.4 } },
  { id: 'decline-bench',       name: 'Decline Bench Press',     equipment: 'barbell',    pattern: 'horizontal-push', muscles: { chest: 1.0, triceps: 0.5, 'front-delts': 0.3 } },

  // ── Extra: Back ──
  { id: 'chest-supported-row', name: 'Chest Supported Row',     equipment: 'dumbbell',   pattern: 'horizontal-pull', muscles: { 'upper-back': 0.9, lats: 0.6, 'rear-delts': 0.5, biceps: 0.4 } },
  { id: 'meadows-row',         name: 'Meadows Row',             equipment: 'barbell',    pattern: 'horizontal-pull', muscles: { lats: 0.9, 'upper-back': 0.5, 'rear-delts': 0.4, biceps: 0.4 } },
  { id: 'straight-arm-pulldown', name: 'Straight Arm Pulldown', equipment: 'cable',      pattern: 'vertical-pull',   muscles: { lats: 1.0, abs: 0.3 } },

  // ── Extra: Shoulders ──
  { id: 'machine-lateral-raise', name: 'Machine Lateral Raise', equipment: 'machine',    pattern: 'isolation',        muscles: { 'side-delts': 1.0 } },
  { id: 'front-raise',         name: 'Front Raise',             equipment: 'dumbbell',   pattern: 'isolation',        muscles: { 'front-delts': 1.0 } },
  { id: 'cable-reverse-fly',   name: 'Cable Reverse Fly',       equipment: 'cable',      pattern: 'isolation',        muscles: { 'rear-delts': 1.0, 'upper-back': 0.3 } },

  // ── Extra: Arms ──
  { id: 'preacher-curl',       name: 'Preacher Curl',           equipment: 'barbell',    pattern: 'isolation',        muscles: { biceps: 1.0 } },
  { id: 'incline-db-curl',     name: 'Incline DB Curl',         equipment: 'dumbbell',   pattern: 'isolation',        muscles: { biceps: 1.0 } },
  { id: 'dip-tricep',          name: 'Tricep Dip (Bench)',      equipment: 'bodyweight', pattern: 'isolation',        muscles: { triceps: 1.0 } },

  // ── Extra: Legs ──
  { id: 'sumo-deadlift',       name: 'Sumo Deadlift',           equipment: 'barbell',    pattern: 'hip-hinge',       muscles: { glutes: 1.0, hamstrings: 0.7, quads: 0.4, 'upper-back': 0.3 } },
  { id: 'reverse-lunge',       name: 'Reverse Lunge',           equipment: 'dumbbell',   pattern: 'lunge',           muscles: { quads: 0.8, glutes: 0.7, hamstrings: 0.3 } },
  { id: 'seated-calf-raise',   name: 'Seated Calf Raise',       equipment: 'machine',    pattern: 'isolation',        muscles: { calves: 1.0 } },
  { id: 'hip-adductor',        name: 'Hip Adductor',            equipment: 'machine',    pattern: 'isolation',        muscles: { glutes: 0.7, hamstrings: 0.3 } },
  { id: 'hip-abductor',        name: 'Hip Abductor',            equipment: 'machine',    pattern: 'isolation',        muscles: { glutes: 0.8 } },

  // ── Extra: Traps / Upper Back ──
  { id: 'db-shrug',            name: 'Dumbbell Shrug',          equipment: 'dumbbell',   pattern: 'isolation',        muscles: { traps: 1.0 } },
];

/** @param {import('../db.js').DB} db */
export async function getAllExercises(db) {
  return db.getAll(STORE);
}

/** @param {import('../db.js').DB} db */
export async function getExercise(db, id) {
  return db.get(STORE, id);
}

/** @param {import('../db.js').DB} db */
export async function getExercisesByEquipment(db, equipment) {
  return db.getAllByIndex(STORE, 'byEquipment', equipment);
}

/** @param {import('../db.js').DB} db */
export async function getExercisesByPattern(db, pattern) {
  return db.getAllByIndex(STORE, 'byPattern', pattern);
}

/** @param {import('../db.js').DB} db */
export async function updateExercise(db, id, updates) {
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, { ...existing, ...updates, id });
}

/** @param {import('../db.js').DB} db */
export async function seedExercises(db) {
  const existing = await db.getAll(STORE);
  if (existing.length === 0) {
    await db.putAll(STORE, SEED_EXERCISES);
  } else {
    // Add any new exercises that don't exist yet
    const existingIds = new Set(existing.map((e) => e.id));
    const newExercises = SEED_EXERCISES.filter((e) => !existingIds.has(e.id));
    if (newExercises.length > 0) {
      await db.putAll(STORE, newExercises);
    }
  }
}
