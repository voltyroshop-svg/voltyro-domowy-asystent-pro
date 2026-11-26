import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStorage,exportBackup} from '../storage.js';
import {prepareBackup,restoreBackup,documentCount} from '../backup.js';
import {receiptProducts} from '../model.js';

const document=(size=0,index=0)=>({id:crypto.randomUUID(),name:'Test.pdf',kind:'Paragon lub faktura',
  blob:new Blob(['%PDF-'+index,new Uint8Array(size?size-6:0)],{type:'application/pdf'})});
const parts=async snapshot=>(await prepareBackup(snapshot)).map(({name,blob})=>new File([blob],name,{type:blob.type}));
function example(docs=[]){
  const receipt={id:crypto.randomUUID(),store:'Sklep',date:'2026-11-23',total:17.23,
    currency:'EUR',category:'Odzież',notes:'Próbka',docs:docs.slice(0,3),items:[{id:crypto.randomUUID(),name:'Buty',price:12}]};
  const [product]=receiptProducts(receipt,new Set(receipt.items.map(row=>row.id)));
  product.category='Kategoria użytkownika';product.docs=docs.slice(3,5);
  product.history=[{id:crypto.randomUUID(),docs:docs.slice(5),kind:'Reklamacja',state:'Otwarta',
    date:'2026-11-24',sent:'2026-11-24',closed:'',cost:2,currency:'EUR',issue:'Usterka',service:'Serwis',notes:'Sprawa'}];
  return {products:[product],receipts:[receipt],categories:[product.category]};
}
const write=(db,snapshot)=>db.replace(snapshot.products,snapshot.receipts,snapshot.categories);
const allDocs=s=>[...s.receipts[0].docs,...s.products[0].docs,...s.products[0].history[0].docs];

test('exports and restores all 126 MiB as seven bounded binary parts with linked records',async()=>{
  const size=18*1024*1024;
  const source=await openStorage(crypto.randomUUID());
  const data=example(Array.from({length:7},(_,index)=>document(size,index)));
  await write(source,data);
  const files=await parts(await source.snapshot());
  assert.equal(files.length,8);
  assert.ok(files.slice(1).every(file=>file.size>size&&file.size<size+64));
  const validated=await restoreBackup(files.reverse());
  assert.equal(documentCount(validated),7);
  const destination=await openStorage(crypto.randomUUID());
  await write(destination,validated);
  const stored=await destination.snapshot();
  assert.equal(stored.products[0].receiptId,data.receipts[0].id);
  assert.equal(stored.products[0].id,data.products[0].id);
  assert.equal(stored.products[0].history[0].sent,'2026-11-24');
  assert.equal(stored.receipts[0].currency,'EUR');
  assert.deepEqual(stored.categories,data.categories);
  for(const [index,doc] of allDocs(stored).entries()){
    assert.equal(doc.blob.size,size);
    assert.equal(await doc.blob.slice(0,6).text(),'%PDF-'+index);
    assert.equal(doc.id,allDocs(data)[index].id);
  }
  source.close();destination.close();
});

test('invalid or missing parts and manifest changes are rejected before any write',async()=>{
  const db=await openStorage(crypto.randomUUID());
  const data=example([document()]);await write(db,data);
  const originals=await parts(await db.snapshot());
  const [manifest,binary]=originals;
  const corrupted=new File([binary.slice(0,-1),'9'],binary.name);
  const wrongBundle=(await parts(data))[1];
  const badManifest=new File([(await manifest.text()).replace('Sklep','Inny')],manifest.name);
  for(const selection of [[manifest],[manifest,corrupted],[manifest,wrongBundle],[badManifest,binary]]){
    await assert.rejects(restoreBackup(selection),/uszkodzona lub niekompletna/);
    assert.equal((await db.receipts())[0].store,'Sklep');
  }
  db.close();
});

test('legacy JSON v1, v2 and v3 are accepted by the new picker path',async()=>{
  const data=example([document()]);
  const original=JSON.parse(await (await exportBackup(data.products,data.receipts,data.categories)).text());
  for(const version of [1,2,3]){
    const json=structuredClone(original);json.version=version;
    if(version===1){delete json.products[0].receiptId;delete json.receipts;}
    if(version!==3)delete json.categories;
    const restored=await restoreBackup([new File([JSON.stringify(json)],'legacy.json')]);
    assert.equal(restored.products[0].id,data.products[0].id);
    assert.equal(restored.receipts.length,version===1?0:1);
  }
});

test('quota error building the recovery point aborts replacement atomically',async t=>{
  const db=await openStorage(crypto.randomUUID());
  const data=example([document()]);await write(db,data);
  const put=IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype,'put',function(value,...args){
    if(this.name==='recovery'&&value.key==='before-import')throw new DOMException('Quota','QuotaExceededError');
    return put.call(this,value,...args);
  });
  await assert.rejects(db.replace([],[],[]),{name:'QuotaExceededError'});
  const stored=await db.snapshot();
  assert.equal(stored.products[0].id,data.products[0].id);
  assert.equal(documentCount(stored),1);
  db.close();
});

test('a blocked schema migration reports instructions and preserves the old record',async()=>{
  const name=crypto.randomUUID();
  const old=await new Promise(resolve=>{
    const req=indexedDB.open(name,3);
    req.onupgradeneeded=()=>req.result.createObjectStore('products',{keyPath:'id'}).add(example().products[0]);
    req.onsuccess=()=>resolve(req.result);
  });
  await assert.rejects(openStorage(name),{name:'MigrationBlocked'});
  old.close();
  const db=await openStorage(name);
  assert.equal((await db.list()).length,1);
  db.close();
});

test('concurrent tabs reject stale product and receipt writes in the transaction',async()=>{
  const name=crypto.randomUUID(),first=await openStorage(name),second=await openStorage(name);
  await write(first,example([document()]));
  for(const [list,save,key] of [['list','save','name'],['receipts','saveReceipt','store']]){
    const [a]=await first[list](),[b]=await second[list]();
    const results=await Promise.allSettled([first[save]({...a,[key]:'Pierwsza'},save==='save'?undefined:[]),second[save]({...b,[key]:'Druga'},save==='save'?undefined:[])]);
    assert.equal(results[0].status,'fulfilled');
    assert.equal(results[1].reason.name,'RevisionConflict');
    assert.equal((await first[list]())[0][key],'Pierwsza');
  }
  first.close();second.close();
});

test('recovers a deleted receipt with its documents and links, a case, and an earlier import snapshot',async()=>{
  const db=await openStorage(crypto.randomUUID());
  const data=example(Array.from({length:7},()=>document()));
  await write(db,data);
  const [receipt]=await db.receipts();
  await db.removeReceipt(receipt.id,receipt.revision);
  assert.equal((await db.list())[0].receiptId,undefined);
  await db.recover((await db.recovery()).find(row=>row.kind==='receipt').key);
  let [product]=await db.list();
  assert.equal(product.receiptId,receipt.id);
  assert.equal((await db.receipts())[0].docs.length,3);
  await db.removeCase(product.id,product.history[0].id,product.revision);
  await db.recover((await db.recovery()).find(row=>row.kind==='case').key);
  [product]=await db.list();
  assert.equal(product.history[0].docs.length,2);
  await db.remove(product.id,product.revision);
  await db.recover((await db.recovery()).find(row=>row.kind==='product').key);
  await db.replace([],[],[]);
  assert.equal((await db.list()).length,0);
  await db.recover('before-import');
  assert.equal((await db.list())[0].id,product.id);
  assert.equal(documentCount(await db.snapshot()),7);
  db.close();
});

test('migrates v4 overview without attachments and maintains summaries with every record change',async()=>{
  const name=crypto.randomUUID(),data=example([document()]);
  const old=await new Promise(resolve=>{
    const req=indexedDB.open(name,4);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('products',{keyPath:'id'}).add(data.products[0]);
      req.result.createObjectStore('receipts',{keyPath:'id'}).add(data.receipts[0]);
    };
    req.onsuccess=()=>resolve(req.result);
  });
  old.close();
  const db=await openStorage(name);
  const [p]=await db.list(),[r]=await db.receipts();
  const first=await db.overview();
  assert.equal(first.products[0].id,p.id);
  assert.equal(first.products[0].docs,undefined);
  assert.equal(first.products[0].history,undefined);
  assert.deepEqual(first.receipts[0].items,[{name:'Buty'}]);
  assert.equal(first.receipts[0].docs,undefined);
  assert.equal(await (await db.receipt(r.id)).docs[0].blob.text(),'%PDF-0');
  await db.save({...p,name:'Nowszy'});
  assert.equal((await db.overview()).products[0].name,'Nowszy');
  await db.removeReceipt(r.id,r.revision);
  const removed=await db.overview();
  assert.equal(removed.receipts.length,0);
  assert.equal(removed.products[0].receiptId,undefined);
  await db.recover((await db.recovery()).find(entry=>entry.kind==='receipt').key);
  assert.equal((await db.overview()).products[0].receiptId,r.id);
  await db.replace([],[],[]);
  assert.deepEqual(await db.overview(),{products:[],receipts:[],categories:[]});
  await db.recover('before-import');
  assert.equal((await db.overview()).products[0].name,'Nowszy');
  db.close();
});
