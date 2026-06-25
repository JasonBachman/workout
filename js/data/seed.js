/**
 * First-launch seeding. Populates muscles, landmarks, exercises,
 * and goals if stores are empty. Safe to call on every launch.
 */

import { seedMuscles } from './muscles.js';
import { seedLandmarks } from './landmarks.js';
import { seedExercises } from './exercises.js';
import { setAllGoals, getAllGoals } from './goals.js';

const DEFAULT_GOALS = {
  'chest':       'high',
  'lats':        'high',
  'upper-back':  'high',
  'side-delts':  'high',
  'biceps':      'high',
  'triceps':     'high',
  'front-delts': 'medium',
  'rear-delts':  'medium',
  'traps':       'medium',
  'quads':       'medium',
  'hamstrings':  'medium',
  'glutes':      'medium',
  'abs':         'medium',
  'calves':      'low',
  'forearms':    'low',
};

export async function seedAll(db) {
  await seedMuscles(db);
  await seedLandmarks(db);
  await seedExercises(db);

  // Seed goals if empty
  const existing = await getAllGoals(db);
  if (existing.length === 0) {
    await setAllGoals(db, DEFAULT_GOALS);
  }
}
