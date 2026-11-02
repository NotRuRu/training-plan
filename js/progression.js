// The rule that decides your next weight. Kept apart from the screen code
// so it can be tested on its own.
//
//   Hit the TOP of the rep range on every set, two workouts in a row  -> weight goes up
//   Miss the BOTTOM of the rep range, two workouts in a row           -> weight drops 10%

import { repRangeTop, repRangeBottom, roundToHalf } from './utils.js';

/**
 * Updates one exercise after a finished workout.
 * `doneSets` are the sets that were ticked: { kg, reps, warmup }.
 */
export function updateExerciseAfterWorkout(exercise, doneSets) {
  const workingSets = doneSets.filter(set => !set.warmup);
  if (!workingSets.length) return;

  exercise.lastSets = doneSets.map(set => ({ kg: set.kg || 0, reps: set.reps || 0 }));

  const lastWorkingSet = workingSets[workingSets.length - 1];
  if (lastWorkingSet.kg) exercise.weight = lastWorkingSet.kg;   // follow what you actually lifted

  const hitTheTop = workingSets.length >= exercise.sets
    && workingSets.every(set => set.reps >= repRangeTop(exercise.repRange));
  const missedTheBottom = workingSets.some(set => set.reps < repRangeBottom(exercise.repRange));

  exercise.hitStreak = hitTheTop ? (exercise.hitStreak || 0) + 1 : 0;
  exercise.missStreak = missedTheBottom ? (exercise.missStreak || 0) + 1 : 0;

  if (exercise.hitStreak >= 2) {
    exercise.weight = roundToHalf(exercise.weight + exercise.increment);
    exercise.hitStreak = 0;
  } else if (exercise.missStreak >= 2 && exercise.weight > 0) {
    exercise.weight = roundToHalf(exercise.weight * 0.9);
    exercise.missStreak = 0;
  }
}
