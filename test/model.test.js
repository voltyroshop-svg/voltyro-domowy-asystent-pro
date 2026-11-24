import {test} from 'node:test';
import assert from 'node:assert/strict';
import {warrantyDate,warranty,selectProducts,portfolio,calendarFile,productValid,sniff} from '../model.js';
import {importBackup} from '../storage.js';

const product=(input={})=>({id:'12345678-1234-1234-1234-123456789abc',name:'Łódź OLED',brand:'Żar',model:'V1',
  serial:'A1',category:'RTV',purchase:'2024-01-31',until:'',months:1,price:10.25,currency:'PLN',
  store:'Sklep',state:'W użyciu',notes:'',created:'2024-02-01T00:00:00Z',docs:[],history:[],...input});

test('calendar arithmetic clamps month ends and preserves leap days',()=>{
  assert.equal(warrantyDate('2024-01-31',1),'2024-02-29');
  assert.equal(warrantyDate('2023-01-31',1),'2023-02-28');
  assert.equal(warrantyDate('2024-02-29',12),'2025-02-28');
  assert.equal(warrantyDate('2024-02-31',1),'');
  assert.equal(warrantyDate('2024-01-15',0),'');
});
test('status uses civil dates across DST, inclusive expiry and manual override',()=>{
  assert.equal(warranty(product({until:'2026-10-25'}),'2026-10-24').days,1);
  assert.equal(warranty(product({until:'2026-10-25'}),'2026-10-25').days,0);
  assert.equal(warranty(product({until:'2026-10-25'}),'2026-10-26').kind,'expired');
  assert.equal(warranty(product({until:'2026-11-24'}),'2026-10-25').kind,'soon');
  assert.equal(warranty(product({until:'2026-11-25'}),'2026-10-25').kind,'active');
});
test('filters, sorts and searches Polish text, and preserves currency boundaries',()=>{
  const a=product({until:'2026-11-05'}),b=product({id:crypto.randomUUID(),currency:'EUR',price:20.50,
    until:'2026-12-12',state:'Sprzedany',created:'2026-10-26T10:00:00Z'});
  assert.deepEqual(selectProducts([b,a],{query:'lodz',filter:'soon',today:'2026-10-25'}),[a]);
  assert.deepEqual(selectProducts([a,b],{query:'zar',filter:'archived'}),[b]);
  assert.deepEqual(selectProducts([a,b],{sort:'recent'}),[b,a]);
  assert.deepEqual(portfolio([a,b,product({currency:'EUR',price:1.2})]),{PLN:10.25,EUR:1.2});
});
test('ICS exports all-day event with escaped, byte-folded summary and separate alarm',()=>{
  const output=calendarFile(product({name:'Ł'.repeat(65)+',a;\\b',until:'2026-11-07'}));
  assert.match(output,/DTSTART;VALUE=DATE:20261107\r\nDTEND;VALUE=DATE:20261108/);
  assert.match(output,/TRIGGER:-P7D/);
  assert.match(output,/\\,a\\;\\\\b/);
  for(const line of output.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('rejects broken, incompatible and forged attachments before import',async()=>{
  const copy=products=>new Blob([JSON.stringify({format:'voltyro-domowy',version:1,products})]);
  await assert.rejects(importBackup(new Blob(['{broken'])),/uszkodzona/);
  await assert.rejects(importBackup(copy([product(),product()])),/uszkodzona/);
  await assert.rejects(importBackup(copy([product({until:'2001-01-01'})])),/uszkodzona/);
  await assert.rejects(importBackup(copy([product({docs:[{id:crypto.randomUUID(),kind:'Paragon lub faktura',
    name:'fake.pdf',mime:'application/pdf',data:btoa('<svg>bad</svg>')}]})])),/uszkodzona/);
  assert.equal(productValid(product({price:3.14159})),false);
  await assert.rejects(sniff(new Blob(['<svg>'])),/zdjęcie/);
  assert.deepEqual(await importBackup(copy([product()])),[product()]);
});

test('filter combines custom category with search and matches case variants',()=>{
  const a=product({category:'Pamiątki rodzinne'}),b=product({category:'Obuwie'});
  assert.equal(productValid(a),true);
  assert.deepEqual(selectProducts([a,b],{category:'pamiątki rodzinne',query:'lodz'}),[a]);
});
