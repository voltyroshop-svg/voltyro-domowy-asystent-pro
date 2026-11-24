import {dateValid,normalize} from './model.js';
import {loadReceiptPhoto,detectReceipt,rectify,enhanceReceipt,imageBlob,rotateReceipt} from './receipt-image.js';

const amountPattern='(?:\\d{1,3}(?: \\d{3})+|\\d+)[,.]\\d{2}';
const amount=value=>Number(value.replaceAll(' ','').replace(',','.'));
const moneyAtEnd=new RegExp('^(.+?)\\s+('+amountPattern+')(?:\\s*(?:PLN|zł|[A-G]))?$','i');
const moneyAlone=new RegExp('^('+amountPattern+')(?:\\s*(?:PLN|zł))?$','i');
const quantityPattern=new RegExp('\\s+(\\d+(?:[,.]\\d{1,3})?)\\s*(?:szt\\.?|kg|g|l|m|usł\\.?)?\\s*[x×*]\\s*('+amountPattern+')\\s*=?\\s*$','iu');
const header=/^(?:paragon|faktura|nip\b|bd[o0]\b|\d|ul\.|al\.|www\.|https?\b|nr\b|kasa\b)/i;
const totalLabel=/^(?:suma|razem|do zaplaty|naleznosc)(?:[\s:=]+(?:pln|brutto|ogolem|zl|do zaplaty))*[\s:=|]*$/;
const terminal=/^(?:sprzed(?:az|\.)|kwota ptu|stawka|podatek|platnosc|gotowka|karta|vat|ptu|reszta|suma|razem|rozliczenie)/;
const fiscalPattern=/\bparagon\s+f[il1]sk[aln]{1,5}[dy]\b|\bfaktura\b/;
export const paymentOptions={'':'Nie określono',card:'Karta',cash:'Gotówka',blik:'BLIK',transfer:'Przelew',voucher:'Bon / karta podarunkowa',mixed:'Kilka form płatności'};

export function validNip(value){
  if(!/^\d{10}$/.test(value)||/^(\d)\1{9}$/.test(value))return false;
  const weights=[6,5,7,2,3,4,5,6,7];
  return weights.reduce((sum,w,i)=>sum+w*Number(value[i]),0)%11===Number(value[9]);
}
function plausibleName(value){
  const words=value.match(/[\p{L}]{2,}/gu)??[];
  return words.join('').length>=3&&words.some(word=>/[aąeęioóuy]/i.test(word));
}
const cleanLine=text=>text.trim().replace(/\s+/g,' ');
const sanitizedSeller=store=>/^[kn]ip\b|[<>={}|]|niskie ceny/i.test(normalize(store))?'':store;

export function parseReceipt(text,{lines:recognized,confidence}={}) {
  const lines=(recognized?.length?recognized:text.split(/\r?\n/).map(text=>({text})))
    .map(line=>({...line,text:cleanLine(line.text)})).filter(line=>line.text);
  const strong=(line,min)=>line?.confidence===undefined||line.confidence>=min;
  const dates=new Set(),nips=new Set(),totals=new Set(),payments=new Set(),methods=new Set(),items=[];
  let fiscal=lines.findIndex(line=>strong(line,48)&&fiscalPattern.test(normalize(line.text)));
  const fiscalPrinted=fiscal>=0;
  if(!fiscalPrinted)fiscal=lines.findIndex(line=>strong(line,49)&&/\bparagon\s+f\S{4,}/.test(normalize(line.text)));
  const taxLayout=lines.some(line=>strong(line,55)&&/^(?:suma ptu|sprzedaz opodatkowana|sprzed\. opod\.)/.test(normalize(line.text)));
  const fiscalHeader=fiscal>=0;
  if(fiscal<0&&taxLayout)fiscal=lines.findIndex(line=>/^nip\b/.test(normalize(line.text)));
  let store='';
  if(fiscal>0){
    for(const line of lines.slice(0,Math.min(fiscal,8))){
      if(!strong(line,72)||header.test(normalize(line.text))||!plausibleName(line.text))continue;
      store=line.text.split(/,\s*(?:ul\.|al\.)/i)[0].slice(0,250);
      break;
    }
  }
  let itemSection=fiscal>=0,previousName='';
  for(const [i,record] of lines.entries()){
    const line=record.text,normalized=normalize(line);
    if(strong(record,56)&&!/zwrot|wymian|wazn[ayoe] do/.test(normalized)){
      for(const match of line.matchAll(/\b(\d{4})[-./](\d\d?)[-./](\d\d?)\b|\b(\d\d?)[-./](\d\d?)[-./](\d{4})\b/g)){
        const date=[match[1]??match[6],(match[2]??match[5]).padStart(2,'0'),(match[3]??match[4]).padStart(2,'0')].join('-');
        if(dateValid(date)&&date>='1995-01-01'&&date<=new Date(Date.now()+86_400_000).toISOString().slice(0,10))dates.add(date);
      }
      const nip=normalized.match(/\bnip\s*[:=]?\s*(?:pl\s*)?((?:\d[\s-]*){9}\d)(?!\d)/)?.[1].replace(/[\s-]/g,'');
      if(validNip(nip??''))nips.add(nip);
    }
    const found=line.match(moneyAtEnd);
    const prefix=normalize(found?.[1]??line);
    if(strong(record,62)&&found&&/^(?:w?u?placono razem|zaplacono razem|platnosc karta)$/.test(prefix))payments.add(amount(found[2]));
    if(fiscal>=0&&i>fiscal&&strong(record,65)){
      const paymentLabel=normalized.replace(/^(?:forma platnosci|platnosc|zaplacono)\s*[:=]?\s*/,'');
      for(const [method,regex] of [['card',/^kart(?:a|ą|y)\b/],['cash',/^gotowk(?:a|i)\b/],['blik',/^blik\b/],['transfer',/^przelew\b/],['voucher',/^(?:bon|voucher)\b/]]){
        if(regex.test(paymentLabel))methods.add(method);
      }
    }
    if(totalLabel.test(prefix)){
      itemSection=false;
      const next=lines[i+1];
      const value=found?.[2]??(strong(next,67)?next?.text.match(moneyAlone)?.[1]:undefined);
      if(value&&strong(record,65))totals.add(amount(value));
      continue;
    }
    if(terminal.test(prefix)||/^sp\.\s*op\./.test(prefix)){itemSection=false;continue;}
    if(i<=fiscal||!itemSection||!strong(record,69)||/^(?:opust|rabat)\b/.test(prefix)){previousName='';continue;}
    if(!found){
      previousName=plausibleName(line)&&!header.test(line)&&line.length<=120?line:'';
      continue;
    }
    const details=(' '+found[1]).match(quantityPattern);
    const stripped=(' '+found[1]).replace(quantityPattern,'').replace(/\s+[A-G]$/,'').trim();
    const name=stripped||previousName;
    previousName='';
    if(!plausibleName(name)||header.test(name)||name.length>120)continue;
    const price=amount(found[2]);
    const quantity=details?amount(details[1]):null,unitPrice=details?amount(details[2]):null;
    const verified=quantity>0&&Math.abs(quantity*unitPrice-price)<.025;
    items.push({name,price,...(verified?{quantity,unitPrice}:{})});
  }
  const date=dates.size===1?[...dates][0]:'';
  const nip=nips.size===1?[...nips][0]:'';
  const total=totals.size===1&&(methods.has('cash')||payments.size===0||(payments.size===1&&totals.has([...payments][0])))?[...totals][0]:null;
  const payment=methods.size>1?'mixed':[...methods][0]??'';
  const good=confidence===undefined||confidence>=49&&(fiscalPrinted||fiscalHeader&&Boolean(nip||payment)||taxLayout&&Boolean(nip||payment)&&Boolean(date)&&total!==null)&&((date&&total!==null)||(nip&&(date||total!==null))||
    (items.length>=2&&(date||total!==null))||(total!==null&&payment&&items.length>0));
  return {store:good?sanitizedSeller(store):'',date:good?date:'',nip:good?nip:'',total:good?total:null,payment:good?payment:'',
    items:good?items:[],quality:good?'review':'retake'};
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

export async function scanReceipt(image,onProgress,signal,{prepared=false}={}){
  signal.throwIfAborted();
  let timeout,worker,finished=false,failEngine;
  const engineFailed=new Promise((_,reject)=>{failEngine=reject;});
  const cancel=()=>failEngine(Error('Skanowanie anulowane.'));
  signal.addEventListener('abort',cancel,{once:true});
  timeout=setTimeout(()=>failEngine(Error('Przekroczono czas skanowania.')),105000);
  async function recognize(){
    const engine=await loadLibrary();
    if(finished)return;
    worker=await engine.createWorker('pol',1,{
      workerPath:asset('worker.min.js'),corePath:asset('tesseract-core-lstm.wasm.js'),
      langPath:asset(''),workerBlobURL:false,cacheMethod:'none',logger:onProgress,
      errorHandler:()=>failEngine(Error('Silnik OCR nie mógł odczytać zdjęcia.'))
    });
    if(finished){await worker.terminate();return;}
    const canvas=prepared?image:await loadReceiptPhoto(image);
    const cropped=prepared?canvas:rectify(canvas,detectReceipt(canvas)??undefined);
    const read=async(input,psm)=>{
      signal.throwIfAborted();
      await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});
      const {data}=await worker.recognize(await imageBlob(input),{}, {text:true,blocks:true});
      const lines=data.blocks?.flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines));
      return {...parseReceipt(data.text,{lines,confidence:data.confidence}),raw:data.text,confidence:data.confidence};
    };
    const first=await read(enhanceReceipt(cropped),'6');
    if(first.quality==='review'&&first.total!==null&&first.date&&first.confidence>=72)return first;
    const second=await read(cropped,'4');
    if(first.quality!=='review'&&second.quality!=='review'){
      const highContrast=await read(enhanceReceipt(cropped,{binary:true}),'6');
      if(highContrast.quality==='review')return highContrast;
    }
    if(!prepared&&first.quality!=='review'&&second.quality!=='review'&&cropped.width>cropped.height*1.15){
      const rotated=rotateReceipt(cropped);
      const turn=await read(enhanceReceipt(rotated),'6');
      if(turn.quality==='review')return turn;
      const inverse=await read(enhanceReceipt(rotateReceipt(rotateReceipt(rotated))),'6');
      if(inverse.quality==='review')return inverse;
    }
    const score=result=>(result.quality==='review'?1000:0)+(result.total!==null?12:0)+(result.date?8:0)+(result.nip?8:0)+
      Math.min(10,result.items.length)+result.confidence/10;
    const preferred=score(second)>score(first)?second:first;
    const other=preferred===first?second:first;
    if(other.quality==='review'&&preferred.quality==='review'){
      for(const key of ['store','nip','date','payment','total']){
        if(preferred[key]&&other[key]&&normalize(preferred[key])!==normalize(other[key]))preferred[key]=key==='total'?null:'';
      }
    }
    if(preferred.confidence<67&&preferred.date&&other.date!==preferred.date)preferred.date='';
    return preferred;
  }
  try{return await Promise.race([recognize(),engineFailed]);}
  finally{
    finished=true;clearTimeout(timeout);signal.removeEventListener('abort',cancel);
    if(worker)await worker.terminate();
  }
}
