import {maxBackup,maxFile,productValid,receiptValid,sniff} from './model.js';

function request(req){return new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});}
async function encodeReceipt(receipt){
  const docs=await Promise.all(receipt.docs.map(async({blob,...doc})=>({
    ...doc,bytes:await blob.arrayBuffer(),mime:blob.type
  })));
  return {...receipt,docs};
}
function decodeReceipt(receipt){
  return {...receipt,docs:receipt.docs.map(({bytes,mime,...doc})=>
    bytes?{...doc,blob:new Blob([bytes],{type:mime})}:doc)};
}
export async function openStorage(name='voltyro-domowy-v1') {
  const open=indexedDB.open(name,2);
  open.onupgradeneeded=()=>{
    for(const store of ['products','receipts'])if(!open.result.objectStoreNames.contains(store))open.result.createObjectStore(store,{keyPath:'id'});
  };
  open.onblocked=()=>console.info('Zamknij starszą kartę aplikacji, aby dokończyć aktualizację.');
  const db=await request(open);
  db.onversionchange=()=>db.close();
  function run(mode,fn) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['products','receipts'],mode);
      let result;
      tx.oncomplete=()=>resolve(result?.result);
      tx.onabort=()=>reject(tx.error??Error('Zapis przerwany.'));
      try {result=fn(tx.objectStore('products'),tx.objectStore('receipts'));}
      catch(error){tx.abort();reject(error);}
    });
  }
  return {
    list:()=>run('readonly',s=>s.getAll()),
    receipts:async()=>(await run('readonly',(_s,r)=>r.getAll())).map(decodeReceipt),
    snapshot:()=>run('readonly',(s,r)=>{
      const items=s.getAll(),archive=r.getAll();
      return {get result(){return {products:items.result,receipts:archive.result.map(decodeReceipt)};}};
    }),
    save:p=>run('readwrite',(s,r)=>{
      if(!p.receiptId)return s.put(p);
      const lookup=r.get(p.receiptId);
      lookup.onsuccess=()=>{if(lookup.result)s.put(p);else r.transaction.abort();};
    }),
    saveReceipt:async(receipt,products)=>{
      const encoded=await encodeReceipt(receipt);
      return run('readwrite',(s,r)=>{
        r.put(encoded);
        for(const product of products) {
          const existing=s.get(product.id);
          existing.onsuccess=()=>{if(!existing.result)s.add(product);};
        }
      });
    },
    remove:id=>run('readwrite',s=>s.delete(id)),
    removeReceipt:id=>run('readwrite',(s,r)=>{
      r.delete(id);
      const cursor=s.openCursor();
      cursor.onsuccess=()=>{
        const row=cursor.result;
        if(!row)return;
        if(row.value.receiptId===id) {
          const {receiptId,...product}=row.value;
          row.update(product);
        }
        row.continue();
      };
    }),
    replace:async(items,receipts=[])=>{
      const encoded=await Promise.all(receipts.map(encodeReceipt));
      return run('readwrite',(s,r)=>{
        s.clear();r.clear();
        for(const p of items)s.add(p);
        for(const receipt of encoded)r.add(receipt);
      });
    }
  };
}
const encode=async blob=>{
  const bytes=new Uint8Array(await blob.arrayBuffer());
  let binary='';
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary);
};
async function transform(products,fileFn) {
  const output=[];
  for(const p of products) {
    const docs=[];for(const d of p.docs)docs.push(await fileFn(d));
    const history=[];
    for(const h of p.history) {
      const serviceDocs=[];for(const d of h.docs)serviceDocs.push(await fileFn(d));
      history.push({...h,docs:serviceDocs});
    }
    output.push({...p,docs,history});
  }
  return output;
}
export async function exportBackup(products,receipts=[]) {
  let size=0;
  const pack=async({blob,...doc})=>{
    size+=Math.ceil(blob.size/3)*4;
    if(size>maxBackup-5*1024*1024)throw Error('Kopia jest za duża. Zapisz osobno część dokumentów i zwolnij miejsce w aplikacji.');
    return {...doc,mime:blob.type,data:await encode(blob)};
  };
  const items=await transform(products,pack);
  const archive=await Promise.all(receipts.map(async r=>({...r,docs:await Promise.all(r.docs.map(pack))})));
  const blob=new Blob([JSON.stringify({format:'voltyro-domowy',version:2,products:items,receipts:archive})],{type:'application/json'});
  if(blob.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  return blob;
}
export async function importArchive(file) {
  if(file.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  try {
    const backup=JSON.parse(await file.text());
    if(backup?.format!=='voltyro-domowy'||![1,2].includes(backup.version)||!Array.isArray(backup.products)||
      backup.products.length>1000||new Set(backup.products.map(p=>p.id)).size!==backup.products.length)throw Error();
    const unpack=async({mime,data,...doc})=>{
      if(typeof data!=='string'||data.length>Math.ceil(maxFile/3)*4)throw Error();
      const blob=new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:mime});
      if(await sniff(blob)!==mime)throw Error();
      return {id:doc.id,name:doc.name,kind:doc.kind,blob};
    };
    const archive=backup.version===1?[]:backup.receipts;
    if(!Array.isArray(archive)||archive.length>5000||new Set(archive.map(r=>r.id)).size!==archive.length)throw Error();
    const receipts=await Promise.all(archive.map(async r=>({...r,docs:await Promise.all(r.docs.map(unpack))})));
    const products=await transform(backup.products,unpack);
    const ids=new Set(receipts.map(r=>r.id));
    if(!receipts.every(receiptValid)||!products.every(p=>productValid(p)&&(p.receiptId===undefined||ids.has(p.receiptId))))throw Error();
    return {products,receipts};
  } catch {throw Error('Nieprawidłowa lub uszkodzona kopia. Dane na urządzeniu pozostały bez zmian.');}
}

export async function importBackup(file){return (await importArchive(file)).products;}
