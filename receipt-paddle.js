import {loadReceiptPhoto,detectReceipt,rectify} from './receipt-image.js';

export async function readWithPaddle(input,signal,{prepared=false}={}){
  const source=prepared?input:await loadReceiptPhoto(input);
  signal.throwIfAborted();
  const corners=prepared?null:detectReceipt(source);
  const image=corners?rectify(source,corners):source;
  const {width,height}=image;
  const {data}=image.getContext('2d').getImageData(0,0,width,height);
  const began=performance.now();
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./receipt-paddle-worker.js',import.meta.url),{type:'module'});
    const stop=(error,result)=>{
      clearTimeout(timer);
      signal.removeEventListener('abort',cancel);
      worker.terminate();
      if(error)reject(error);
      else resolve(result);
    };
    const cancel=()=>stop(signal.reason);
    const timer=setTimeout(()=>stop(Error('Model nie zakończył odczytu w wyznaczonym czasie.')),55_000);
    signal.addEventListener('abort',cancel,{once:true});
    worker.onerror=()=>stop(Error('Lokalny model jest niedostępny.'));
    worker.onmessage=event=>{
      if(event.data.error){stop(Error(event.data.error));return;}
      stop(null,{...event.data,diagnostics:{source:source.sourceSize??{width,height},
        processed:{width,height},autoCrop:Boolean(corners),manualCrop:prepared,
        engine:'PaddleOCR',passes:1,elapsedMs:Math.round(performance.now()-began)}});
    };
    worker.postMessage({width,height,buffer:data.buffer},[data.buffer]);
  });
}
