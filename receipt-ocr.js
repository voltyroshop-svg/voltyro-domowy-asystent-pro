import {dateValid,normalize} from './model.js';

const amountPattern='(?:\\d{1,3}(?: \\d{3})+|\\d+)[,.]\\d{2}';
const amount=value=>Number(value.replaceAll(' ','').replace(',','.'));
const header=/^(?:paragon|faktura|nip\b|\d|ul\.|www\.|https?\b)/i;
const totalLabel=/^(?:suma|razem|do zaplaty|naleznosc)(?:[\s:=]+(?:pln|brutto|ogolem|zl|do zaplaty))*[\s:=]*$/;

export function parseReceipt(text) {
  const lines=text.split(/\r?\n/).map(line=>line.trim().replace(/\s+/g,' ')).filter(Boolean);
  const dates=new Set();
  for(const match of text.matchAll(/\b(\d{4})[-./](\d\d?)[-./](\d\d?)\b|\b(\d\d?)[-./](\d\d?)[-./](\d{4})\b/g)){
    const date=[match[1]??match[6],(match[2]??match[5]).padStart(2,'0'),(match[3]??match[4]).padStart(2,'0')].join('-');
    if(dateValid(date))dates.add(date);
  }
  const fiscal=lines.findIndex(line=>/paragon\s+fiskalny|faktura/i.test(line));
  const store=fiscal>0?lines.slice(0,fiscal).find(line=>/[\p{L}]{2}/u.test(line)&&!header.test(normalize(line)))??'':'';
  const totals=new Set(),payments=new Set(),items=[];
  let itemSection=fiscal>=0;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const match=line.match(new RegExp('^(.+?)\\s+('+amountPattern+')(?:\\s*(?:PLN|zł|[A-G]))?$','i'));
    const prefix=normalize(match?.[1]??line);
    if(match&&/^(?:u?placono razem|zaplacono razem|platnosc karta)$/.test(prefix))payments.add(amount(match[2]));
    if(totalLabel.test(prefix)){
      itemSection=false;
      const next=lines[i+1]?.match(new RegExp('^('+amountPattern+')(?:\\s*(?:PLN|zł))?$','i'));
      const found=match?.[2]??next?.[1];
      if(found)totals.add(amount(found));
      continue;
    }
    if(/^(?:sprzed(?:az|\.)|kwota ptu|stawka|podatek|platnosc|gotowka|karta|opust|rabat|vat|ptu|reszta|suma|razem|nr\b)/.test(prefix)) {
      if(!/^(?:opust|rabat|nr\b)/.test(prefix))itemSection=false;
      continue;
    }
    if(i>fiscal&&itemSection&&match){
      const name=match[1].replace(/\s+\d+(?:[,.]\d+)?\s*[\p{L}.]{0,5}\s*[x×*]\s*[\d.,]+\s*=?\s*$/iu,'').replace(/\s+[A-G]$/,'').trim();
      if(/[\p{L}]{2}/u.test(name)&&!header.test(name)&&name.length<=120)items.push({name,price:amount(match[2])});
    }
  }
  return {store,date:dates.size===1?[...dates][0]:'',total:totals.size===1&&(payments.size===0||(payments.size===1&&totals.has([...payments][0])))?[...totals][0]:null,items};
}

const asset=path=>new URL('ocr/'+path,import.meta.url).href;
let library;
async function loadLibrary(){
  if(globalThis.Tesseract)return globalThis.Tesseract;
  library??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=asset('tesseract.min.js');
    script.onload=()=>resolve(globalThis.Tesseract);
    script.onerror=()=>{library=undefined;script.remove();reject(Error('Moduł OCR jest niedostępny.'));};
    document.head.append(script);
  });
  return library;
}

export async function scanReceipt(image,onProgress,signal){
  signal.throwIfAborted();
  let timeout,worker,finished=false,failEngine;
  const engineFailed=new Promise((_,reject)=>{failEngine=reject;});
  const cancel=()=>failEngine(Error('Skanowanie anulowane.'));
  signal.addEventListener('abort',cancel,{once:true});
  timeout=setTimeout(()=>failEngine(Error('Przekroczono czas skanowania.')),90000);
  async function recognize(){
    const engine=await loadLibrary();
    if(finished)return;
    worker=await engine.createWorker('pol',1,{
      workerPath:asset('worker.min.js'),corePath:asset('tesseract-core-lstm.wasm.js'),
      langPath:asset(''),workerBlobURL:false,cacheMethod:'none',logger:onProgress,
      errorHandler:()=>failEngine(Error('Silnik OCR nie mógł odczytać zdjęcia.'))
    });
    if(finished){await worker.terminate();return;}
    const result=await worker.recognize(image);
    return {...parseReceipt(result.data.text),raw:result.data.text};
  }
  try{return await Promise.race([recognize(),engineFailed]);}
  finally{
    finished=true;clearTimeout(timeout);signal.removeEventListener('abort',cancel);
    if(worker)await worker.terminate();
  }
}
