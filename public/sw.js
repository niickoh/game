/* ==========================================================================
   Service worker: guarda la app y el arte de los mazos en el navegador para
   que abra al tiro y aguante cortes de red.

   Las versiones no se tocan a mano: server.js las reemplaza al servir este
   archivo con una huella de lo que hay en public/. Cambia un archivo, cambia
   la huella, el navegador ve un sw.js distinto e instala la versión nueva.
   Hay dos huellas separadas para que un cambio de código no obligue a bajar
   de nuevo los 10 MB de imágenes, ni al revés.
   ========================================================================== */
'use strict';

const V_APP = '__V_APP__';
const V_ARTE = '__V_ARTE__';

const APP = 'qcr-app-' + V_APP;        // página, scripts y estilos: siempre del mismo juego
const ARTE = 'qcr-arte-' + V_ARTE;     // cartas y tapetes, se guardan a medida que se ven
const FUENTES = 'qcr-fuentes-v1';      // Google Fonts: cambian poco, se refrescan por detrás
const PROPIAS = [APP, ARTE, FUENTES];

const NUCLEO = [
  '/',
  '/mazos.css',
  '/mazos.js',
  '/app.js',
  '/fx.js',
  '/fx-sound.js',
  '/vendor/tailwind.js'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(APP)
      // 'reload' salta la caché HTTP: lo guardado es lo que hay hoy en el servidor
      .then(c => c.addAll(NUCLEO.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks
        .filter(k => k.startsWith('qcr-') && !PROPIAS.includes(k))
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// primero lo guardado; si no está, la red, y se guarda para la próxima
async function primeroCache(req, nombre, clave) {
  const c = await caches.open(nombre);
  const hit = await c.match(clave || req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(clave || req, res.clone());
  return res;
}

// primero la red (dato fresco); sin red, lo último guardado
async function primeroRed(req, nombre) {
  const c = await caches.open(nombre);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw e;
  }
}

// lo guardado al tiro y, por detrás, se trae la versión nueva
async function guardadoYRefresca(ev, nombre) {
  const c = await caches.open(nombre);
  const hit = await c.match(ev.request);
  const red = fetch(ev.request).then(res => {
    if (res.ok || res.type === 'opaque') c.put(ev.request, res.clone());
    return res;
  });
  if (hit) { ev.waitUntil(red.catch(() => {})); return hit; }
  return red;
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const p = url.pathname;

    // el juego en vivo (eventos, jugadas, sesión) nunca pasa por la caché
    if (p === '/sw.js') return;
    if (p === '/api/assets') { ev.respondWith(primeroRed(req, APP)); return; }
    if (p.startsWith('/api/')) return;

    // la página: la de esta versión, venga con ?sala=... o sin nada
    if (req.mode === 'navigate') {
      ev.respondWith(primeroCache(req, APP, '/').catch(() => fetch(req)));
      return;
    }
    if (p.startsWith('/assets/')) { ev.respondWith(primeroCache(req, ARTE)); return; }
    ev.respondWith(primeroCache(req, APP));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(guardadoYRefresca(ev, FUENTES));
  }
});
