import {maxBackup,maxFile,productValid,receiptValid,sniff,categoryName,categoryKey,productCategories} from './model.js';

// Byte buffers retain compatibility with WebKit's IndexedDB implementation.
async function encodeDocument({blob,...doc}){
  return {...doc,bytes:await blob.arrayBuffer(),mime:blob.type};
}
async function encodeReceipt({docs,...row}){
  const files=[];
  for(const doc of docs)files.push(await encodeDocument(doc));
  return {...row,docs:files};
}
function decodeDocument({bytes,mime,...doc}){
  return bytes?{...doc,blob:new Blob([bytes],{type:mime})}:doc;
}
const decodeDocuments=row=>({...row,docs:row.docs.map(decodeDocument)});
const decodeReceipt=receipt=>({...decodeDocuments(receipt),revision:receipt.revision??'legacy'});
const decodeProduct=product=>({...decodeReceipt(product),history:product.history.map(decodeDocuments)});
const revised=row=>({...row,revision:crypto.randomUUID()});
const conflict=()=>Object.assign(Error('Ten rekord zmienił się w innej karcie. Treść formularza została zachowana. Skopiuj swoje zmiany, a następnie otwórz aktualny rekord i nanieś je ponownie.'),{name:'RevisionConflict'});
const recoveryFailure=error=>Object.assign(Error('Nie udało się zapisać punktu odzyskiwania. Bieżące dane pozostały bez zmian.'),{name:error?.name==='QuotaExceededError'?'QuotaExceededError':'RecoveryError',cause:error});

export async function openStorage(name='voltyro-domowy-v1') {
  const open=indexedDB.open(name,4);
  open.onupgradeneeded=()=>{
    for(const store of ['products','receipts','categories','recovery'])if(!open.result.objectStoreNames.contains(store))
      open.result.createObjectStore(store,{keyPath:['categories','recovery'].includes(store)?'key':'id'});
  };
  const db=await new Promise((resolve,reject)=>{
    let blocked=false;
    open.onblocked=()=>{
      blocked=true;
      reject(Object.assign(Error('Zamknij inne karty i okna z VOLTYRO, w tym aplikację otwartą z ekranu początkowego, a następnie odśwież tę stronę.'),{name:'MigrationBlocked'}));
    };
    open.onsuccess=()=>{if(blocked)open.result.close();else resolve(open.result);};
    open.onerror=()=>reject(open.error);
  });
  db.onversionchange=()=>db.close();
  const names=['products','receipts','categories'];
  function run(mode,callback) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([...names,'recovery'],mode);
      let result,reason;
      const abort=error=>{reason=error;tx.abort();};
      const when=(req,next)=>{req.onsuccess=()=>{
        try{next(req.result);}catch(error){abort(error);}
      };};
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(reason??tx.error??Error('Zapis przerwany.'));
      try{callback(...[...names,'recovery'].map(store=>tx.objectStore(store)),when,value=>{result=value;},abort);}
      catch(error){abort(error);}
    });
  }
  function readAll(s,r,c,when,complete) {
    const products=s.getAll(),receipts=r.getAll(),categories=c.getAll();
    when(categories,rows=>complete({products:products.result,receipts:receipts.result,categories:rows}));
  }
  function restoreRows(s,r,c,rows) {
    for(const store of [s,r,c])store.clear();
    for(const row of rows.products)s.add(revised(row));
    for(const row of rows.receipts)r.add(revised(row));
    for(const row of rows.categories)c.add(row);
  }
  function expectRevision(current,expected) {
    if((current?(current.revision??'legacy'):undefined)!==expected)throw conflict();
  }
  function saveRecovery(store,entry) {
    const {key,kind,at,label}=entry;
    store.put({key:'meta:'+key,recoveryKey:key,kind,at,label});
    return store.put(entry);
  }
  function remove(kind,id,revision) {
    return run('readwrite',(s,r,_c,h,when)=>{
      const store=kind==='product'?s:r;
      when(store.get(id),row=>{
        if(revision!==undefined)expectRevision(row,revision);
        if(!row)return;
        const key='deleted:'+crypto.randomUUID();
        const finish=links=>{
          saveRecovery(h,{key,kind,row,links,at:new Date().toISOString(),label:row.name??row.store});
          store.delete(id);
        };
        if(kind==='product')return finish([]);
        when(s.getAll(),products=>{
          const links=[];
          for(const product of products.filter(p=>p.receiptId===id)){
            const {receiptId,...withoutReceipt}=product;
            const updated=revised(withoutReceipt);
            links.push({id:product.id,revision:updated.revision});
            s.put(updated);
          }
          finish(links);
        });
      });
    });
  }
  return {
    close:()=>db.close(),
    list:async()=>(await run('readonly',(s,_r,_c,_h,when,done)=>when(s.getAll(),done))).map(decodeProduct),
    receipts:async()=>(await run('readonly',(_s,r,_c,_h,when,done)=>when(r.getAll(),done))).map(decodeReceipt),
    snapshot:()=>run('readonly',(s,r,c,_h,when,done)=>{
      const result={products:[],receipts:[],categories:[]};
      let remaining=3;
      for(const [key,store,decode] of [['products',s,decodeProduct],['receipts',r,decodeReceipt],['categories',c,row=>row.name]])
        when(store.openCursor(),cursor=>{
          if(!cursor){if(--remaining===0)done(result);return;}
          result[key].push(decode(cursor.value));
          cursor.continue();
        });
    }),
    save:async(product,customName,revision=product.revision)=>{
      const [encoded]=await transform([product],encodeDocument);
      return run('readwrite',(s,r,c,_h,when)=>{
        when(s.get(product.id),current=>{
          expectRevision(current,revision);
          const persist=()=>{
            if(customName)c.put({key:categoryKey(customName),name:customName});
            s.put(revised(encoded));
          };
          if(!product.receiptId)return persist();
          when(r.get(product.receiptId),receipt=>{
            if(!receipt)throw Error('Powiązany paragon został usunięty. Wybierz inny paragon lub usuń powiązanie.');
            persist();
          });
        });
      });
    },
    saveReceipt:async(receipt,products,revision=receipt.revision)=>{
      const encoded=await encodeReceipt(receipt);
      return run('readwrite',(s,r,_c,_h,when)=>{
        when(r.get(receipt.id),current=>{
          expectRevision(current,revision);
          r.put(revised(encoded));
          for(const product of products)when(s.get(product.id),existing=>{if(!existing)s.add(revised(product));});
        });
      });
    },
    remove:(id,revision)=>remove('product',id,revision),
    removeReceipt:(id,revision)=>remove('receipt',id,revision),
    removeCase:(id,caseId,revision)=>run('readwrite',(s,_r,_c,h,when)=>{
      when(s.get(id),product=>{
        expectRevision(product,revision);
        const row=product.history.find(entry=>entry.id===caseId);
        if(!row)throw conflict();
        saveRecovery(h,{key:'deleted:'+crypto.randomUUID(),kind:'case',productId:id,row,
          at:new Date().toISOString(),label:row.issue});
        s.put(revised({...product,history:product.history.filter(entry=>entry.id!==caseId)}));
      });
    }),
    replace:async(products,receipts=[],custom=[])=>{
      const encodedProducts=await transform(products,encodeDocument);
      const encodedReceipts=[];
      for(const receipt of receipts)encodedReceipts.push(await encodeReceipt(receipt));
      return run('readwrite',(s,r,c,h,when,_done,abort)=>{
        readAll(s,r,c,when,rows=>{
          const point=saveRecovery(h,{key:'before-import',kind:'snapshot',rows,at:new Date().toISOString()});
          point.onerror=()=>abort(recoveryFailure(point.error));
          when(point,()=>restoreRows(s,r,c,{products:encodedProducts,receipts:encodedReceipts,categories:custom.map(name=>({key:categoryKey(name),name}))}));
        });
      }).catch(error=>{throw error.name==='RecoveryError'?error:recoveryFailure(error);});
    },
    recovery:()=>run('readonly',(_s,_r,_c,h,when,done)=>
      when(h.getAll(IDBKeyRange.bound('meta:','meta;',false,true)),rows=>
        done(rows.map(({recoveryKey,kind,at,label})=>({key:recoveryKey,kind,at,label}))))),
    recover:key=>run('readwrite',(s,r,c,h,when)=>{
      when(h.get(key),entry=>{
        if(!entry)throw Error('Ten punkt odzyskiwania jest już niedostępny.');
        if(entry.kind==='snapshot')return readAll(s,r,c,when,rows=>{
          when(saveRecovery(h,{...entry,rows,at:new Date().toISOString()}),()=>restoreRows(s,r,c,entry.rows));
        });
        const discard=()=>{h.delete(key);h.delete('meta:'+key);};
        if(entry.kind==='case')return when(s.get(entry.productId),product=>{
          if(!product)throw Error('Najpierw odzyskaj produkt powiązany ze sprawą.');
          if(product.history.some(item=>item.id===entry.row.id))throw conflict();
          if(product.history.length>=200)throw Error('Osiągnięto limit spraw dla tego produktu.');
          s.put(revised({...product,history:[...product.history,entry.row]}));
          discard();
        });
        const store=entry.kind==='product'?s:r;
        when(store.get(entry.row.id),current=>{
          if(current)throw Error('Rekord o tym identyfikatorze już istnieje. Odzyskiwanie nie zastąpi jego danych.');
          if(entry.kind==='product'&&entry.row.receiptId)when(r.get(entry.row.receiptId),receipt=>{
            if(!receipt)throw Error('Najpierw odzyskaj powiązany paragon.');
          });
          store.add(revised(entry.row));
          for(const link of entry.links)when(s.get(link.id),product=>{
            if(product?.revision===link.revision)s.put(revised({...product,receiptId:entry.row.id}));
          });
          discard();
        });
      });
    }),
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
export async function exportBackup(products,receipts=[],categories=[]) {
  let size=0;
  const pack=async({blob,...doc})=>{
    size+=Math.ceil(blob.size/3)*4;
    if(size>maxBackup-5*1024*1024)throw Error('Kopia jest za duża. Zapisz osobno część dokumentów i zwolnij miejsce w aplikacji.');
    return {...doc,mime:blob.type,data:await encode(blob)};
  };
  const items=await transform(products,pack);
  const archive=await Promise.all(receipts.map(async r=>({...r,docs:await Promise.all(r.docs.map(pack))})));
  const blob=new Blob([JSON.stringify({format:'voltyro-domowy',version:3,products:items,receipts:archive,categories})],{type:'application/json'});
  if(blob.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  return blob;
}
export async function importArchive(file) {
  if(file.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  try {
    const backup=JSON.parse(await file.text());
    if(backup?.format!=='voltyro-domowy'||![1,2,3].includes(backup.version)||!Array.isArray(backup.products)||
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
    return validateArchive(products,receipts,backup.version===3?backup.categories:[]);
  } catch {throw Error('Nieprawidłowa lub uszkodzona kopia. Dane na urządzeniu pozostały bez zmian.');}
}

export async function importBackup(file){return (await importArchive(file)).products;}

export function validateArchive(products,receipts,custom){
  if(!Array.isArray(products)||products.length>1000||new Set(products.map(p=>p.id)).size!==products.length||
    !Array.isArray(receipts)||receipts.length>5000||new Set(receipts.map(r=>r.id)).size!==receipts.length)throw Error();
    const ids=new Set(receipts.map(r=>r.id));
    if(!receipts.every(receiptValid)||!products.every(p=>productValid(p)&&(p.receiptId===undefined||ids.has(p.receiptId))))throw Error();
    const builtin=new Set(productCategories().map(categoryKey));
    if(!Array.isArray(custom)||custom.length>1000||!custom.every(categoryName))throw Error();
    const departments=productCategories([...products.map(p=>p.category),...custom]).filter(name=>!builtin.has(categoryKey(name)));
    return {products,receipts,categories:departments};
}
