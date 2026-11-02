// Back to Fit — service worker
// Saves every app file on the phone so the app opens with no signal at the gym.
//
// HOW UPDATES WORK
//   All files are saved together under one version name (CACHE_NAME below), so the
//   app never mixes an old file with a new one. When change gets published,
//    CACHE_NAME, and NEW file to APP_SHELL.
//   The phone then downloads the whole new set and shows "New version available".

const CACHE_NAME = 'back-to-fit-v0.5.0';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/theme.css',
  './css/base.css',
  './css/train.css',
  './css/eat.css',
  './css/progress.css',
  './js/main.js',
  './js/state.js',
  './js/migrate.js',
  './js/example-data.js',
  './js/constants.js',
  './js/utils.js',
  './js/navigation.js',
  './js/ui.js',
  './js/train.js',
  './js/workout.js',
  './js/progression.js',
  './js/history.js',
  './js/eat.js',
  './js/progress.js',
  './js/backup.js',
  './js/csv-import.js',
  './js/pwa.js',
];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's own cache so we never store an outdated copy.
  // If one file fails to download, the whole install fails and the phone keeps the old version.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
  );
});

// The "New version available" button sends this message.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Serve from the saved copy first; only go to the network for files we did not save.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((saved) => saved || fetch(event.request))
  );
});
