/* =========================================================
   Service Worker
   - App 外殼快取：離線也開得起來
   - 資產採 stale-while-revalidate：先給快取、背景更新
   - Supabase 等跨來源請求一律直接放行，絕不快取（資料要即時，
     而且回應帶有使用者 token，快取下來等於把資料留在裝置上）
   - 推播：顯示通知並在點擊時聚焦既有分頁
   ========================================================= */

const VERSION = 'v1';
const SHELL_CACHE = 'shell-' + VERSION;
const ASSET_CACHE = 'asset-' + VERSION;

// scope 之下的相對路徑，同時適用開發（/）與部署（/home-inventory/）
const SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL('./', SCOPE).pathname;

const PRECACHE = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 個別加入，任何一個失敗都不該讓整個安裝失敗
    await Promise.all(PRECACHE.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { /* 略過 */ }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** 前端要求立即套用新版本 */
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨來源（Supabase API / Storage）直接放行
  if (url.origin !== self.location.origin) return;
  // 不在本 App 的路徑範圍內就不管
  if (!url.pathname.startsWith(SHELL_URL)) return;

  // 導覽請求：網路優先，失敗時回快取的外殼
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 其他同源資源：先回快取，背景更新
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});

/* ---------- 推播 ---------- */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '家庭用品管理';
  const options = {
    body: payload.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: payload.tag || 'home-inventory',
    renotify: false,
    data: { url: payload.url || './' },
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', SCOPE).href;

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.startsWith(SCOPE.href)) {
        await client.focus();
        client.postMessage({ type: 'notification-click', url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
