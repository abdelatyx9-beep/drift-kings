// يخلي اللعبة تشتغل بدون إنترنت بعد أول فتح
// لما تعدّل اللعبة، غيّر رقم النسخة هنا عشان الجوالات تاخذ التحديث
const VERSION = "dk-v8";
const BASE = self.registration.scope;               // يشتغل على Vercel و GitHub Pages
const u = (p) => new URL(p, BASE).href;
const CORE = ["", "index.html", "game.js", "manifest.webmanifest", "vendor/three.module.min.js", "vendor/jsm/utils/BufferGeometryUtils.js", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"].map(u);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // لوحة الصدارة والإعلانات دايماً من النت؛ نحفظ بس ملفات اللعبة والخطوط
  if (url.origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(u("index.html"), cp)); return r; }).catch(() => caches.match(u("index.html"))));
    return;
  }
  // ملفات اللعبة: من النت أول (عشان أي تحديث يوصل على طول)، والكاش بس لما ما فيه نت
  if (url.origin === self.location.origin && /\.(js|html|webmanifest)$|\/$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: "no-cache" }).then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  // الصور والخطوط: من الكاش على طول، ونحدّثها من النت بالخلفية
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
