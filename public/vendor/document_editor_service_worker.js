/*
 * Offline build: intentionally inert service worker.
 *
 * The editor index.html always registers "../../../../document_editor_service_worker.js".
 * The upstream worker (sdkjs/common/serviceworker) implements cache-first fetching
 * that intercepts the editor's own index.html navigation and fails offline with a
 * synthetic 504. Shipping a worker with NO fetch listener means the browser never
 * routes requests through it, while still replacing any previously installed
 * worker at this scope and clearing its caches.
 */
self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
            .then(function () { return self.clients.claim(); })
    );
});
