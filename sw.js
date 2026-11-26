const prefix='voltyro-domowy-shell-';
const version=prefix+'8';
const files=['./','./index.html','./style.css','./app.js','./storage.js','./backup.js','./model.js','./photo-viewer.js',
  './receipt-ocr.js','./receipt-image.js','./receipt-crop.js','./receipt-paddle.js','./receipt-paddle-worker.js','./offline-tools.js',
  './manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable.png'];
const toolsVersion='voltyro-domowy-tools-1';
const legacyModel='voltyro-domowy-ocr-model-1';
const scope=new URL(self.registration.scope);
const resources=new Set(files.map(path=>new URL(path,scope).href));
const toolPath=url=>url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)&&
  /^(pdf\/|ocr\/)/.test(url.pathname.slice(scope.pathname.length));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(version);
  await cache.addAll(files.map(path=>new Request(path,{cache:'reload'})));
})()));
self.addEventListener('message',event=>{if(event.data==='activate')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  const tools=await caches.open(toolsVersion);
  for(const key of keys.filter(key=>key===legacyModel||key.startsWith(prefix)&&key!==version)){
    const previous=await caches.open(key);
    for(const req of await previous.keys()){
      if(!toolPath(new URL(req.url))||await tools.match(req))continue;
      const saved=await previous.match(req);
      if(saved)await tools.put(req,saved).catch(()=>{});
    }
    if(key.startsWith(prefix)&&key!==prefix+'7')await caches.delete(key);
  }
  // Retain the immediately preceding shell through the transition.
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const {request}=event;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==scope.origin)return;
  const home=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html');
  if(toolPath(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(toolsVersion).catch(()=>null);
      const saved=await cache?.match(request).catch(()=>null);
      if(saved)return saved;
      const response=await fetch(request);
      if(response.ok)await cache?.put(request,response.clone()).catch(()=>{});
      return response;
    })());
    return;
  }
  if(home||resources.has(url.href))event.respondWith(caches.open(version)
    .then(cache=>cache.match(home?new URL('index.html',scope).href:request)).then(stored=>stored??fetch(request)));
});
