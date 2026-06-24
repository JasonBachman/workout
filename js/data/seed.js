/**
 * First-launch seeding. Populates muscles, landmarks, and exercises
 * if stores are empty. Safe to call on every launch.
 */

import { seedMuscles } from './muscles.js';
import { seedLandmarks } from './landmarks.js';
import { seedExercises } from './exercises.js';

export async function seedAll(db) {
  await seedMuscles(db);
  await seedLandmarks(db);
  await seedExercises(db);
}
