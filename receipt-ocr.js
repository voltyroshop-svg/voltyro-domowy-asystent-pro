import {dateValid,normalize} from './model.js';
import {loadReceiptPhoto,detectReceipt,rectify,enhanceReceipt,imageBlob,rotateReceipt,receiptTotalRegion} from './receipt-image.js';

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
const cleanLine=text=>text.trim().replace(/\s+/g,' ')
  .replace(/\b(PLN)(?=\d)/gi,'$1 ').replace(/(\d), (\d{2})(?!\d)/g,'$1,$2');
const sanitizedSeller=store=>/^[kn]ip\b|[<>={}|]|niskie ceny/i.test(normalize(store))?'':store;

export function parseReceipt(text,{lines:recognized,confidence,partial=false}={}) {
  const lines=(recognized?.length?recognized:text.split(/\r?\n/).map(text=>({text})))
    .map(line=>({...line,text:cleanLine(line.text)})).filter(line=>line.text);
  const strong=(line,min)=>line?.confidence===undefined||line.confidence>=min;
  const dates=new Set(),nips=new Set(),totals=new Set(),strongTotals=new Set(),totalLabels=new Map(),payments=new Set(),methods=new Set(),items=[];
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
      if(value&&strong(record,65)){
        totals.add(amount(value));
        if(strong(record,87)&&(found||strong(next,87))&&/^(?:suma\W+pln|do zaplaty|razem\W+pln)\b/.test(prefix)){
          const numeric=amount(value);
          strongTotals.add(numeric);
          if(!totalLabels.has(numeric))totalLabels.set(numeric,new Set());
          totalLabels.get(numeric).add(prefix.match(/^(?:do zaplaty|suma|razem)/)[0]);
        }
      }
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
  const structure=fiscalPrinted||taxLayout;
  // Keep independent, receipt-specific evidence even when the entire page is noisy.
  const corroboratedTotal=total!==null&&(totalLabels.get(total)?.size>=2||payments.has(total));
  const partialTotal=partial&&corroboratedTotal&&strongTotals.has(total)&&(structure||payments.has(total));
  const partialNip=partial&&structure&&Boolean(nip);
  return {store:good?sanitizedSeller(store):'',date:good?date:'',nip:good||partialNip?nip:'',
    total:good||partialTotal?total:null,payment:good?payment:'',items:good?items:[],
    quality:good?'review':partialTotal||partialNip?'partial':'retake',
    ...(partial?{evidence:{structure,total:totals.size===1?[...totals][0]:null,
      moneyConflict:total===null&&totals.size>0,corroboratedTotal,anchoredTotal:strongTotals.size===1?[...strongTotals][0]:null}}:{})};
}

const receiptFields=['store','date','nip','total','payment'];
export function reconcileReceiptReads(reads){
  const rank=result=>(result.quality==='review'?1000:result.quality==='partial'?100:0)+
    (result.total!==null?12:0)+(result.date?8:0)+(result.nip?8:0)+Math.min(10,result.items.length)+result.confidence/10;
  const ordered=[...reads].sort((a,b)=>rank(b)-rank(a));
  const result={...ordered[0]};
  for(const key of receiptFields){
    const empty=key==='total'?null:'';
    const candidates=ordered.filter(read=>read[key]!==empty&&read[key]!==undefined);
    const values=new Set(candidates.map(read=>normalize(read[key])));
    result[key]=values.size===1?candidates[0][key]:empty;
    if(key==='date'&&candidates.length===1&&candidates[0].confidence<67)result.date='';
  }
  if(result.total!==null&&ordered.some(read=>read.evidence?.structure&&
    (read.evidence.moneyConflict||read.evidence.total!==null&&read.evidence.total!==result.total)))result.total=null;
  if(result.total===null){
    // A repeated OCR mistake is possible. Require a separate label or payment
    // as corroboration in addition to agreement between image passes.
    const amounts=ordered.map(read=>read.evidence?.anchoredTotal??null).filter(value=>value!==null);
    if(amounts.length>=2&&new Set(amounts).size===1&&ordered.some(read=>read.evidence?.structure&&read.evidence.corroboratedTotal)&&
      !ordered.some(read=>read.evidence?.moneyConflict||read.evidence?.total!=null&&read.evidence.total!==amounts[0]))
      result.total=amounts[0];
  }
  const fields=receiptFields.filter(field=>result[field]!==null&&result[field]!=='');
  result.quality=fields.length||result.items.length?(result.quality==='review'?'review':'partial'):'retake';
  return result;
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

async function scanWithTesseract(image,onProgress,signal,{prepared=false}={}){
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
    const corners=prepared?null:detectReceipt(canvas);
    const cropped=corners?rectify(canvas,corners):canvas;
    const reads=[];
    const started=performance.now();
    const finish=()=>({...reconcileReceiptReads(reads),diagnostics:{
      source:canvas.sourceSize??{width:canvas.width,height:canvas.height},
      processed:{width:cropped.width,height:cropped.height},autoCrop:Boolean(corners),manualCrop:prepared,
      engine:'Tesseract',passes:reads.length,elapsedMs:Math.round(performance.now()-started)
    }});
    const read=async(input,psm)=>{
      signal.throwIfAborted();
      await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});
      const {data}=await worker.recognize(await imageBlob(input),{}, {text:true,blocks:true});
      const lines=data.blocks?.flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines));
      return {...parseReceipt(data.text,{lines,confidence:data.confidence,partial:true}),raw:data.text,confidence:data.confidence};
    };
    reads.push(await read(enhanceReceipt(cropped),'6'));
    if(reads[0].quality==='review'&&reads[0].total!==null&&reads[0].date&&reads[0].confidence>=80)return finish();
    reads.push(await read(corners?canvas:cropped,'4'));
    if(finish().total===null)reads.push(await read(enhanceReceipt(receiptTotalRegion(cropped)),'11'));
    if(finish().quality==='retake')reads.push(await read(enhanceReceipt(cropped,{binary:true}),'6'));
    if(!prepared&&finish().quality==='retake'&&cropped.width>cropped.height*1.15){
      const turned=rotateReceipt(cropped);
      reads.push(await read(enhanceReceipt(turned),'6'));
      if(finish().quality==='retake')reads.push(await read(enhanceReceipt(rotateReceipt(rotateReceipt(turned))),'6'));
    }
    return finish();
  }
  try{return await Promise.race([recognize(),engineFailed]);}
  finally{
    finished=true;clearTimeout(timeout);signal.removeEventListener('abort',cancel);
    if(worker)await worker.terminate();
  }
}


export async function scanReceipt(image,onProgress,signal,options={}){
  let primary;
  onProgress({status:'loading local model'});
  try{
    const {readWithPaddle}=await import('./receipt-paddle.js');
    const photo=await readWithPaddle(image,signal,options);
    const raw=photo.lines.map(line=>line.text).join('\n');
    primary={...parseReceipt(raw,{lines:photo.lines,confidence:photo.confidence,partial:true}),
      raw,confidence:photo.confidence,diagnostics:photo.diagnostics};
    if(primary.quality!=='retake'&&primary.total!==null)return primary;
  }catch{
    signal.throwIfAborted();
  }
  onProgress({status:'fallback'});
  try{
    const fallback=await scanWithTesseract(image,onProgress,signal,options);
    // An incomplete reading from the more accurate engine can still contribute
    // validated fields, while the fallback fills only unambiguous gaps.
    if(!primary)return fallback;
    const result=reconcileReceiptReads([primary,fallback]);
    return {...result,diagnostics:{
      ...fallback.diagnostics,engine:'PaddleOCR + Tesseract',
      passes:primary.diagnostics.passes+fallback.diagnostics.passes,
      elapsedMs:primary.diagnostics.elapsedMs+fallback.diagnostics.elapsedMs
    }};
  }catch(error){
    signal.throwIfAborted();
    if(primary&&primary.quality!=='retake')return primary;
    throw error;
  }
}
