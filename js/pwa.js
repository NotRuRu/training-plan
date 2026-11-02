// Installing the app on the phone: registers the service worker (which makes the
// app work offline) and shows a "New version available" button when an update is ready.

function showUpdateBanner(waitingWorker, onTapped) {
  if (document.querySelector('.update-banner')) return;

  const banner = document.createElement('button');
  banner.className = 'update-banner';
  banner.textContent = 'New version available. Tap to update';
  banner.onclick = () => {
    onTapped();
    waitingWorker.postMessage('SKIP_WAITING');   // sw.js listens for this and takes over
  };
  document.body.appendChild(banner);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let userTappedUpdate = false;
  const rememberTap = () => { userTappedUpdate = true; };

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      // An update that finished downloading while the app was closed
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting, rememberTap);
      }
      // An update that downloads while the app is open
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(installing, rememberTap);
          }
        });
      });
    }).catch(() => { /* the app still works without it */ });
  });

  // After the person taps the banner, reload once into the new version
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userTappedUpdate) location.reload();
  });
}
