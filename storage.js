import {maxBackup,maxFile,productValid,sniff} from './model.js';

function request(req){return new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});}
export async function openStorage(name='voltyro-domowy-v1') {
  const open=indexedDB.open(name,1);
  open.onupgradeneeded=()=>open.result.createObjectStore('products',{keyPath:'id'});
  const db=await request(open);
  db.onversionchange=()=>db.close();
  function run(mode,fn) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('products',mode);
      let result;
      tx.oncomplete=()=>resolve(result?.result);
      tx.onabort=()=>reject(tx.error??Error('Zapis przerwany.'));
      try {result=fn(tx.objectStore('products'));} catch(error){tx.abort();reject(error);}
    });
  }
  return {list:()=>run('readonly',s=>s.getAll()),save:p=>run('readwrite',s=>s.put(p)),
    remove:id=>run('readwrite',s=>s.delete(id)),
    replace:items=>run('readwrite',s=>{s.clear();for(const p of items)s.add(p);})};
}
const encode=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error);
  reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.readAsDataURL(blob);
});
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
export async function exportBackup(products) {
  let size=0;
  const items=await transform(products,async({blob,...doc})=>{
    size+=Math.ceil(blob.size/3)*4;
    if(size>maxBackup-5*1024*1024)throw Error('Kopia jest za duża. Zapisz osobno część dokumentów i zwolnij miejsce w aplikacji.');
    return {...doc,mime:blob.type,data:await encode(blob)};
  });
  const blob=new Blob([JSON.stringify({format:'voltyro-domowy',version:1,products:items})],{type:'application/json'});
  if(blob.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  return blob;
}
export async function importBackup(file) {
  if(file.size>maxBackup)throw Error('Kopia przekracza limit 160 MB.');
  try {
    const backup=JSON.parse(await file.text());
    if(backup?.format!=='voltyro-domowy'||backup.version!==1||!Array.isArray(backup.products)||
      backup.products.length>1000||new Set(backup.products.map(p=>p.id)).size!==backup.products.length)throw Error();
    const products=await transform(backup.products,async({mime,data,...doc})=>{
      if(typeof data!=='string'||data.length>Math.ceil(maxFile/3)*4)throw Error();
      const blob=new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:mime});
      if(await sniff(blob)!==mime)throw Error();
      return {id:doc.id,name:doc.name,kind:doc.kind,blob};
    });
    if(!products.every(productValid))throw Error();
    return products;
  } catch {throw Error('Nieprawidłowa lub uszkodzona kopia. Dane na urządzeniu pozostały bez zmian.');}
}
