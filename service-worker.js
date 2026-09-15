const CACHE = 'furkinans-pwa-v11';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './status.css',
  './pro-ui.css',
  './app.js',
  './status.js',
  './pro-ui.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

function enhanceHtml(html) {
  let out = html;
  if (!out.includes('pro-ui.css')) {
    out = out.replace('</head>', '  <link rel="stylesheet" href="pro-ui.css" />\n</head>');
  }
  if (!out.includes('pro-ui.js')) {
    out = out.replace('</body>', '  <script src="pro-ui.js"></script>\n</body>');
  }
  return out;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    const html = enhanceHtml(await response.text());
    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    const enhanced = new Response(html, { status: response.status, statusText: response.statusText, headers });
    const cache = await caches.open(CACHE);
    cache.put(request, enhanced.clone()).catch(() => {});
    return enhanced;
  } catch (_) {
    const cached = await caches.match(request) || await caches.match('./index.html');
    if (!cached) throw _;
    const html = enhanceHtml(await cached.text());
    const headers = new Headers(cached.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(html, { status: 200, headers });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
