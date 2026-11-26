import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStorage,exportBackup,importArchive} from '../storage.js';
import {receiptSummary,receiptProducts} from '../model.js';
import {parseReceipt,validNip} from '../receipt-ocr.js';

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
  assert.deepEqual(await db.list(),[{...old,revision:'legacy'}]);
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
  await db.saveReceipt(r,selected,(await db.receipts())[0].revision);
  await db.saveReceipt(r,selected,(await db.receipts())[0].revision);
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
  assert.deepEqual(parseReceipt(sample),{store:'Sklep Żółć',date:'2026-11-23',total:13.99,nip:'',payment:'',quality:'review',items:[
    {name:'Chleb',price:8,quantity:2,unitPrice:4},{name:'Masło',price:5.99}]});
  assert.equal(parseReceipt(sample+'\nRAZEM 15,99').total,null);
});

test('old backup still imports and invalid links in a new backup are rejected',async()=>{
  const legacy=new Blob(['{"format":"voltyro-domowy","version":1,"products":[]}']);
  assert.deepEqual(await importArchive(legacy),{products:[],receipts:[],categories:[]});
  const p=receiptProducts(receipt({items:[{id:crypto.randomUUID(),name:'Test',price:null}]}),{has:()=>true});
  await assert.rejects(importArchive(await exportBackup(p,[])),/uszkodzona/);
});

test('recognition does not prefill a total that conflicts with a payment amount',()=>{
  const raw='Sklep\nPARAGON FISKALNY\nChleb 58,63 A\nSUMA PLN 50,63\nPłatność Karta 58,63';
  assert.equal(parseReceipt(raw).total,null);
});

test('custom product categories survive deletion of the last product and a backup restore',async()=>{
  const db=await openStorage(crypto.randomUUID());
  const r=receipt({docs:[],items:[{id:crypto.randomUUID(),name:'Krzesło',price:null}]});
  const [p]=receiptProducts(r,new Set([r.items[0].id]));
  p.category='Wyposażenie mieszkania';
  delete p.receiptId;
  await db.save(p,p.category);
  await db.remove(p.id);
  const snapshot=await db.snapshot();
  assert.deepEqual(snapshot.categories,[p.category]);
  const restored=await importArchive(await exportBackup(snapshot.products,snapshot.receipts,snapshot.categories));
  const target=await openStorage(crypto.randomUUID());
  await target.replace(restored.products,restored.receipts,restored.categories);
  assert.deepEqual((await target.snapshot()).categories,[p.category]);
});

test('v2 archives with receipt links and images remain valid in the category-aware version',async()=>{
  const r=receipt({items:[{id:crypto.randomUUID(),name:'Buty',price:12}]});
  const products=receiptProducts(r,new Set([r.items[0].id]));
  const old=JSON.parse(await (await exportBackup(products,[r])).text());
  old.version=2;
  delete old.categories;
  const restored=await importArchive(new Blob([JSON.stringify(old)]));
  assert.equal(restored.products[0].receiptId,r.id);
  assert.equal(await restored.receipts[0].docs[0].blob.text(),'%PDF-test');
  assert.deepEqual(restored.categories,[]);
});

test('product attachments and service documents survive saving in the new representation',async()=>{
  const db=await openStorage(crypto.randomUUID());
  const product={id:crypto.randomUUID(),docs:[file()],history:[{id:crypto.randomUUID(),docs:[file()]}]};
  await db.save(product);
  const [saved]=await db.list();
  const {revision,...stored}=saved;
  assert.ok(revision);
  assert.deepEqual(stored,product);
  assert.equal(await saved.docs[0].blob.text(),'%PDF-test');
  assert.equal(await saved.history[0].docs[0].blob.text(),'%PDF-test');
});


test('keeps unreliable reads empty even when the OCR engine returned text',()=>{
  const raw='IiiGza ZZ!!!\n5140 BVY\nALE 278 1.00';
  assert.deepEqual(parseReceipt(raw,{confidence:80}),{store:'',date:'',nip:'',total:null,payment:'',items:[],quality:'retake'});
  const fiscal='Sklep Żółć\nPARAGON FISKALNY\nSUMA PLN 18,00\n2026-11-23';
  assert.equal(parseReceipt(fiscal,{confidence:24}).quality,'retake');
});

test('recognizes checked NIP, payment and editable item details on a structured receipt',()=>{
  const raw='Sklep Łąka\nNIP 526-10-09-959\nPARAGON FISKALNY\nŻarówka\n2 szt x 4,00 8,00 A\nDO ZAPŁATY 8,00\nForma płatności: karta\n2026-11-23';
  const result=parseReceipt(raw,{confidence:86});
  assert.equal(result.nip,'5261009959');
  assert.equal(result.payment,'card');
  assert.deepEqual(result.items,[{name:'Żarówka',price:8,quantity:2,unitPrice:4}]);
  assert.equal(validNip('5261009951'),false);
  assert.equal(parseReceipt(raw,{confidence:86,lines:raw.split('\n').map(text=>({text,confidence:10}))}).quality,'retake');
});

test('a confirmed 300 PLN total survives a damaged header and missing date',()=>{
  const raw='PARAGON FISKALNY\nSUMA PLN300, 00\nDO ZAPŁATY 300,00';
  const lines=raw.split('\n').map(text=>({text,confidence:95}));
  const result=parseReceipt(raw,{lines,confidence:43,partial:true});
  assert.equal(result.quality,'partial');
  assert.equal(result.total,300);
  assert.equal(result.store,'');
  assert.equal(result.date,'');
});

test('does not copy a lone amount from a noisy OCR read, even if repeated across image passes',async()=>{
  const {reconcileReceiptReads}=await import('../receipt-ocr.js');
  const raw='PARAGON FISKALNY\nSUMA PLN 156,00';
  const result=parseReceipt(raw,{confidence:57,partial:true});
  assert.equal(reconcileReceiptReads([{...result,confidence:57},{...result,confidence:60}]).total,null);
});

test('posted rival amounts from two layouts suppress the amount without erasing the verified NIP',async()=>{
  const {reconcileReceiptReads}=await import('../receipt-ocr.js');
  const parse=total=>({...parseReceipt('NIP 526-10-09-959\nPARAGON FISKALNY\nSUMA PLN '+total+'\n2026-11-23',{confidence:89,partial:true}),confidence:89});
  const result=reconcileReceiptReads([parse('300,00'),parse('308,00')]);
  assert.equal(result.total,null);
  assert.equal(result.nip,'5261009959');
});
