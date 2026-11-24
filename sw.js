const prefix='voltyro-domowy-shell-';
const version=prefix+'5';
const files=['./','./index.html','./style.css','./app.js','./storage.js','./model.js','./photo-viewer.js','./receipt-ocr.js','./receipt-image.js','./receipt-crop.js','./receipt-paddle.js','./receipt-paddle-worker.js','./ocr/tesseract.min.js','./ocr/worker.min.js','./ocr/tesseract-core-lstm.wasm.js','./ocr/pol.traineddata.gz','./manifest.webmanifest','./icon.svg',
  './pdf/pdf.min.js', './pdf/pdf.worker.min.js',
  './pdf/fonts/FoxitDingbats.pfb',
  './pdf/fonts/FoxitFixed.pfb',
  './pdf/fonts/FoxitFixedBold.pfb',
  './pdf/fonts/FoxitFixedBoldItalic.pfb',
  './pdf/fonts/FoxitFixedItalic.pfb',
  './pdf/fonts/FoxitSerif.pfb',
  './pdf/fonts/FoxitSerifBold.pfb',
  './pdf/fonts/FoxitSerifBoldItalic.pfb',
  './pdf/fonts/FoxitSerifItalic.pfb',
  './pdf/fonts/FoxitSymbol.pfb',
  './pdf/fonts/LiberationSans-Bold.ttf',
  './pdf/fonts/LiberationSans-BoldItalic.ttf',
  './pdf/fonts/LiberationSans-Italic.ttf',
  './pdf/fonts/LiberationSans-Regular.ttf',
  './icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable.png'];
const modelVersion='voltyro-domowy-ocr-model-1';
const modelFiles=new Set(['engine.js','det.onnx','latin.onnx','latin.txt','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']
  .map(path=>new URL('./ocr/paddle/'+path,self.registration.scope).href));
const resources=new Set(files.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(version);
  await cache.addAll(files.map(path=>new Request(path,{cache:'reload'})));
})()));
self.addEventListener('message',event=>{if(event.data==='activate')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==version)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const {request}=event;
  const url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin)return;
  const home=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html');
  if(modelFiles.has(url.href)){
    event.respondWith((async()=>{
      const cache=await caches.open(modelVersion).catch(()=>null);
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
