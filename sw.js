const V='zerochat-v3';
const SHELL=['./','./index.html','./admin.html','./css/style.css','./css/admin.css','./js/main.js','./js/firebase.js','./js/ui.js','./js/state.js','./js/admin.js','./js/gate.js','./js/admin-page.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
// 同一オリジンのみ: ネットワーク優先、オフライン時はキャッシュ
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));
});
