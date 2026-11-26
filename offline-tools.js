const cacheName='voltyro-domowy-tools-1';
const groups={
  pdf:['pdf/pdf.min.js','pdf/pdf.worker.min.js'],
  paddle:['ocr/paddle/engine.js','ocr/paddle/det.onnx','ocr/paddle/latin.onnx','ocr/paddle/latin.txt',
    'ocr/paddle/ort-wasm-simd-threaded.mjs','ocr/paddle/ort-wasm-simd-threaded.wasm'],
  tesseract:['ocr/tesseract.min.js','ocr/worker.min.js','ocr/tesseract-core-lstm.wasm.js','ocr/pol.traineddata.gz'],
};
export async function warmTool(group,onProgress,signal){
  const files=groups[group];
  const cache=await globalThis.caches?.open(cacheName).catch(()=>null);
  for(const [index,path] of files.entries()){
    signal?.throwIfAborted();
    const url=new URL(path,import.meta.url).href;
    if(!await cache?.match(url).catch(()=>null)){
      onProgress(index,files.length,0);
      const response=await fetch(url,{signal});
      if(!response.ok)throw Error('Nie udało się pobrać narzędzia. Sprawdź połączenie i spróbuj ponownie.');
      // The service worker persists a clone before forwarding the response. On
      // a freshly opened, uncontrolled page keep a copy here for the next use.
      const copy=cache&&!await cache.match(url).catch(()=>null)?response.clone():null;
      const stored=copy?cache.put(url,copy).catch(()=>{}):null;
      const stream=response.body?.getReader();
      if(stream){
        const total=Number(response.headers.get('Content-Length'));
        let bytes=0;
        try{
          for(;;){
            const {done,value}=await stream.read();
            if(done)break;
            bytes+=value.byteLength;
            if(total>0)onProgress(index,files.length,Math.min(1,bytes/total));
          }
        }finally{stream.releaseLock();}
      }
      await stored;
    }
    onProgress(index+1,files.length,0);
  }
}
