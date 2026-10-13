/* ============================================================
   Service Worker — Конвертер в азбуку Морзе
   Стратегия: cache-first для статики, network для остального.
   ============================================================ */

const CACHE_VERSION = 'morse-v1';
const CACHE_NAME = `${CACHE_VERSION}-static`;

// Файлы, которые кэшируются при установке.
// icon.png — обязательный, поэтому при отсутствии SW просто не установится.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.png'
];

/* ---------- Install ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Кэшируем каждый ресурс отдельно, чтобы ошибка одного
      // не ломала установку целиком.
      await Promise.all(
        PRECACHE_URLS.map(async url => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            console.warn('[SW] Не удалось закэшировать:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Только GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Только свой origin
  if (url.origin !== self.location.origin) return;

  // Навигационные запросы (HTML) — network-first с фолбэком в кэш.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          return new Response('Офлайн — нет кэшированной страницы.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // Остальное (иконки, манифест) — cache-first с фоновым обновлением.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Обновляем кэш в фоне
        fetch(req)
          .then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }

      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })()
  );
});

/* ---------- Сообщения от страницы ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});