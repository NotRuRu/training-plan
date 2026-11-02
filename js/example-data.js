// The workouts and meals a brand-new install starts with.


import { createId } from './utils.js';
import { CURRENT_VERSION } from './migrate.js';
import { DEFAULT_REST_SECONDS } from './constants.js';

// Each exercise row is: [name, sets, repRange, startWeight, increment]
function createWorkout(name, exerciseRows) {
  return {
    id: createId(),
    name,
    exercises: exerciseRows.map(([exerciseName, sets, repRange, weight, increment]) => ({
      id: createId(),
      name: exerciseName,
      sets,
      repRange,
      weight,
      increment,
      restSeconds: DEFAULT_REST_SECONDS,
      hitStreak: 0,
      missStreak: 0,
      lastSets: null,
    })),
  };
}

export function createExampleData() {
  return {
    version: CURRENT_VERSION,
    currency: 'EUR',
    openFolderIndex: null,
    activeSession: null,
    history: [],
    bodyweight: [],
    shoppingList: [],
    folders: [
      {
        name: 'Upper',
        workouts: [
          createWorkout('Upper A', [
            ['Barbell Bench Press', 4, '6-8', 30, 2.5],
            ['Lat Pulldown', 4, '8-10', 40, 5],
            ['Seated Cable Row', 3, '10-12', 32, 5],
            ['Dumbbell Overhead Press', 3, '8-10', 9, 2],
            ['Dumbbell Lateral Raise', 3, '12-15', 6, 2],
            ['Triceps Pushdown', 3, '10-12', 32, 5],
            ['Hanging Leg Raise', 3, '10-15', 0, 0],
          ]),
          createWorkout('Upper B', [
            ['Incline Dumbbell Press', 4, '8-10', 10, 2],
            ['Pull-Up', 4, '6-10', 0, 0],
            ['Chest Dip', 3, '8-12', 0, 0],
            ['One-Arm Dumbbell Row', 3, '8-10', 16, 2],
            ['Machine Shoulder Press', 3, '10-12', 30, 5],
            ['Face Pull (Cable)', 3, '12-15', 20, 5],
            ['Preacher Curl', 3, '10-12', 20, 2.5],
            ['Plank (sec)', 3, '30-45', 0, 0],
          ]),
        ],
      },
      {
        name: 'Lower',
        workouts: [
          createWorkout('Lower A', [
            ['Barbell Back Squat', 4, '6-8', 40, 5],
            ['Romanian Deadlift', 3, '8-10', 60, 5],
            ['Leg Press', 3, '10-12', 80, 10],
            ['Seated Leg Curl', 3, '10-12', 20, 5],
            ['Standing Calf Raise', 3, '12-15', 30, 5],
            ['Cable Crunch', 3, '12-15', 20, 5],
          ]),
          createWorkout('Lower B', [
            ['Deadlift', 4, '5', 60, 5],
            ['Walking Lunge', 3, '10', 10, 2],
            ['Leg Extension', 3, '12-15', 25, 5],
            ['Seated Calf Raise', 3, '12-15', 20, 5],
            ['Weighted Plank (sec)', 3, '30-45', 0, 0],
          ]),
        ],
      },
      { name: 'Folder 3', workouts: [] },
      { name: 'Folder 4', workouts: [] },
    ],
    meals: [
      {
        id: createId(),
        name: 'Breakfast',
        description: 'Eggs, oats, milk and a banana',
        tag: 'Breakfast',
        calories: 555,
        protein: 29,
        details: '2 eggs\n220ml half-fat milk\n50g oats\n1 banana',
      },
      {
        id: createId(),
        name: 'Chicken, rice & veg',
        description: 'Packable lunch. Swap the carb for variety.',
        tag: 'Lunch',
        calories: 435,
        protein: 41,
        details: '150g chicken breast (raw weight), cooked\n150g rice or potato, cooked\nVegetables + 1 tsp olive oil',
      },
      {
        id: createId(),
        name: 'Oat & quark shake',
        description: 'Blended backup for rushed mornings or after training',
        tag: 'Snack',
        calories: 535,
        protein: 33,
        details: '40g oats\n250ml milk\n1 banana\n150g low-fat quark\n1 tbsp peanut butter (optional)\n\nBlend oats + milk first for a minute, then add the rest.',
      },
    ],
  };
}
