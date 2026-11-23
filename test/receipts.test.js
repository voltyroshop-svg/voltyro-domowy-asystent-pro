import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStorage,exportBackup,importArchive} from '../storage.js';
import {receiptSummary,receiptProducts} from '../model.js';
import {parseReceipt} from '../receipt-ocr.js';

const file=()=>({id:crypto.randomUUID(),name:'Document.pdf',kind:'Paragon lub faktura',
  blob:new Blob(['%PDF-test'],{type:'application/pdf'})});
const receipt=(values={})=>({id:crypto.randomUUID(),store:'Sklep',date:'2026-11-23',total:17.23,
  currency:'PLN',category:'Spożywcze',notes:'',docs:[file()],items:[],...values});

test('upgrades the version 1 database without replacing old IDs, files or repair history',async()=>{
  const name=crypto.randomUUID();
  const old={id:crypto.randomUUID(),name:'Produkt',docs:[file()],history:[{id:crypto.randomUUID(),docs:[file()]}]};
  await new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('products',{keyPath:'id'}).add(old);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{request.result.close();resolve();};
  });
  const db=await openStorage(name);
  assert.deepEqual(await db.list(),[old]);
  assert.equal(await (await db.list())[0].history[0].docs[0].blob.text(),'%PDF-test');
  assert.deepEqual(await db.receipts(),[]);
});

test('saves receipts on their own, adds only selected products once and unlinks when deleted',async()=>{
  const items=['Pralka','Odkurzacz','Inna rzecz'].map(name=>({id:crypto.randomUUID(),name,price:25}));
  const r=receipt({items});
  const db=await openStorage(crypto.randomUUID());
  await db.saveReceipt(r,[]);
  assert.deepEqual(await db.list(),[]);
  const selected=receiptProducts(r,new Set(items.slice(0,2).map(i=>i.id)));
  assert.ok(selected.every(p=>p.months===0&&p.receiptId===r.id));
  await db.saveReceipt(r,selected);
  await db.saveReceipt(r,selected);
  assert.equal((await db.list()).length,2);
  const backup=await exportBackup(await db.list(),await db.receipts());
  const restored=await importArchive(backup);
  const target=await openStorage(crypto.randomUUID());
  await target.replace(restored.products,restored.receipts);
  assert.equal(await (await target.receipts())[0].docs[0].blob.text(),'%PDF-test');
  await target.removeReceipt(r.id);
  assert.ok((await target.list()).every(p=>!p.receiptId));
  assert.equal((await target.list()).length,2);
  assert.deepEqual(await target.receipts(),[]);
});

test('reports monthly receipt totals once and separates currencies',()=>{
  const rows=[receipt(),receipt({currency:'EUR'}),receipt({total:null}),receipt({date:'2026-10-31'})];
  assert.deepEqual(receiptSummary(rows,'2026-11'),{count:3,totals:{PLN:1723,EUR:1723},categories:{Spożywcze:{PLN:1723,EUR:1723}}});
});

test('Polish receipt parsing leaves ambiguous values empty and ignores tax lines',()=>{
  const sample='Sklep Żółć\nPARAGON FISKALNY\nChleb 2SZT x 4,00 8,00 B\nMasło 5,99 B\nSprzed. opod. PTU A 13,99\nKwota PTU A 0,40\nSUMA: PLN 13,99\nDO ZAPŁATY: 13,99\n23.11.2026';
  assert.deepEqual(parseReceipt(sample),{store:'Sklep Żółć',date:'2026-11-23',total:13.99,items:[
    {name:'Chleb',price:8},{name:'Masło',price:5.99}]});
  assert.equal(parseReceipt(sample+'\nRAZEM 15,99').total,null);
});

test('old backup still imports and invalid links in a new backup are rejected',async()=>{
  const legacy=new Blob(['{"format":"voltyro-domowy","version":1,"products":[]}']);
  assert.deepEqual(await importArchive(legacy),{products:[],receipts:[]});
  const p=receiptProducts(receipt({items:[{id:crypto.randomUUID(),name:'Test',price:null}]}),{has:()=>true});
  await assert.rejects(importArchive(await exportBackup(p,[])),/uszkodzona/);
});

test('recognition does not prefill a total that conflicts with a payment amount',()=>{
  const raw='Sklep\nPARAGON FISKALNY\nChleb 58,63 A\nSUMA PLN 50,63\nPłatność Karta 58,63';
  assert.equal(parseReceipt(raw).total,null);
});
