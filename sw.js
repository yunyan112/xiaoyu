/* 余小渔 · 离线缓存：只缓存外壳，不缓存聊天（聊天在 localStorage） */
const CACHE = 'yuxiaoyu-v8';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './core.js',
  './stickers.js',
  './manifest.webmanifest',
  './assets/avatar-192.png',
  './assets/avatar-512.png',
  './assets/me.jpg',
  './stickers/01_happy.png',
  './stickers/02_shy.png',
  './stickers/03_angry.png',
  './stickers/04_sad.png',
  './stickers/05_sleepy.png',
  './stickers/06_proud.png',
  './stickers/07_question.png',
  './stickers/08_night.png',
  './stickers/10_turnback.png',
  './stickers/11_roll.png',
  './stickers/12_love.png',
  './stickers/13_side.png',
  './stickers/14_peek.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
