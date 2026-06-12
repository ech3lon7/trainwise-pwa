"use strict";

const CACHE_NAME = "trainwise-cache-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=1.4.5",
  "./app.js?v=1.4.5",
  "./manifest.webmanifest?v=1.4.5",
  "./icon.svg?v=1.4.5",
  "./icon-512.png?v=1.4.5",
  "./apple-touch-icon.png?v=1.4.5",
  "./assets/muscles/abs.png?v=1.4.5",
  "./assets/muscles/back.png?v=1.4.5",
  "./assets/muscles/bicep.png?v=1.4.5",
  "./assets/muscles/calves.png?v=1.4.5",
  "./assets/muscles/chest.png?v=1.4.5",
  "./assets/muscles/glutes.png?v=1.4.5",
  "./assets/muscles/hamstrings.png?v=1.4.5",
  "./assets/muscles/quads.png?v=1.4.5",
  "./assets/muscles/shoulders.png?v=1.4.5",
  "./assets/muscles/triceps.png?v=1.4.5",
  "./assets/dumbbell.png?v=1.4.5",
  "./assets/dumbbell.svg?v=1.4.5"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(networkFirst(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CLEAR_APP_SHELL") {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("trainwise-cache")).map((key) => caches.delete(key))))
    );
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response?.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || caches.match("./index.html") || new Response("TrainWise is offline and no cached shell is available.", {
      status: 503,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
