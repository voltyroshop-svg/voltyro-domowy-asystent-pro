export const categories=['RTV','AGD','Telefony','Komputery','Elektronarzędzia','Meble','Sprzęt sportowy','Obuwie','Odzież','Biżuteria i zegarki','Kosmetyki i perfumy','Zabawki i artykuły dziecięce','Dom i ogród','Motoryzacja','Akcesoria dla zwierząt','Narzędzia ręczne','Akcesoria i galanteria','Inne'];
export const currencies=['PLN','EUR','USD','GBP','CHF','CZK'];
export const states=['W użyciu','Sprzedany','Wycofany'];
export const caseStates=['Otwarta','W toku','Uznana','Odrzucona','Zakończona'];
export const documentKinds=['Zdjęcie urządzenia','Paragon lub faktura','Dokument dodatkowy','Dokument serwisowy'];
export const fileTypes=['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'];
export const maxFile=20*1024*1024;
export const maxBackup=160*1024*1024;

const two=n=>String(n).padStart(2,'0');
export const localDay=(d=new Date())=>d.getFullYear()+'-'+two(d.getMonth()+1)+'-'+two(d.getDate());
export function dateValid(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value)||value<'1900-01-01'||value>'9999-12-31')return false;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function warrantyDate(purchase,months) {
  if(!dateValid(purchase)||!Number.isInteger(months)||months<1||months>600)return '';
  const end=new Date(purchase+'T00:00:00Z');
  const day=end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth()+months);
  const last=new Date(end);last.setUTCMonth(last.getUTCMonth()+1,0);
  end.setUTCDate(Math.min(day,last.getUTCDate()));
  const result=end.toISOString().slice(0,10);
  return dateValid(result)?result:'';
}
export function warranty(product,today=localDay()) {
  const until=product.until||warrantyDate(product.purchase,product.months);
  if(!until)return {kind:'none',until:'',days:null};
  const days=Math.round((Date.parse(until)-Date.parse(today))/86400000);
  return {until,days,kind:days<0?'expired':days<=30?'soon':'active'};
}
export function normalize(value) {
  return String(value).toLocaleLowerCase('pl').normalize('NFD').replace(/\p{Diacritic}/gu,'').replaceAll('ł','l');
}
export const categoryName=value=>typeof value==='string'&&value.length<=60&&value.trim()===value&&
  /[\p{L}\p{N}]/u.test(value)&&!/[\p{Cc}\p{Cf}]/u.test(value);
export const categoryKey=value=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('pl').normalize('NFC');
export function productCategories(custom=[]){
  return [...new Map([...custom,...categories].filter(categoryName).map(name=>[categoryKey(name),name])).values()]
    .sort((a,b)=>a.localeCompare(b,'pl'));
}
export function selectProducts(products,{query='',category='',filter='all',sort='recent',today=localDay()}={}) {
  return products.filter(p=>{
    const kind=warranty(p,today).kind;
    return (!category||categoryKey(p.category)===categoryKey(category))&&normalize([p.name,p.brand,p.model,p.category,p.serial,p.store].join(' ')).includes(normalize(query.trim()))&&
      (filter==='all'||filter==='archived'&&p.state!=='W użyciu'||
        p.state==='W użyciu'&&(filter===kind||filter==='valid'&&['active','soon'].includes(kind)));
  }).sort((a,b)=>{
    if(sort==='purchase')return b.purchase.localeCompare(a.purchase)||b.created.localeCompare(a.created);
    if(sort==='warranty')return (warranty(a).until||'9999-12-31').localeCompare(warranty(b).until||'9999-12-31');
    return b.created.localeCompare(a.created);
  });
}
export function portfolio(products) {
  const values={};for(const p of products)if(p.state==='W użyciu'&&p.price!==null)
    values[p.currency]=(values[p.currency]??0)+Math.round(p.price*100);
  return Object.fromEntries(Object.entries(values).map(([unit,cents])=>[unit,cents/100]));
}
const escICS=s=>s.replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const fold=line=>{
  let parts=[],part='',size=0;
  for(const char of line){
    const bytes=new TextEncoder().encode(char).length;
    if(size+bytes>75){parts.push(part);part=' ';size=1;}
    part+=char;size+=bytes;
  }
  return [...parts,part].join('\r\n');
};
export function calendarFile(product,now=new Date()) {
  const until=warranty(product).until;
  if(!until)throw Error('Brak terminu gwarancji.');
  const next=new Date(until+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VOLTYRO//Domowy Asystent PRO//PL','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT','UID:'+product.id+'@voltyro-domowy-asystent','DTSTAMP:'+now.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),
    'DTSTART;VALUE=DATE:'+until.replaceAll('-',''),'DTEND;VALUE=DATE:'+next.toISOString().slice(0,10).replaceAll('-',''),
    'SUMMARY:'+escICS('Koniec gwarancji · '+product.name),'BEGIN:VALARM','TRIGGER:-P7D','ACTION:DISPLAY',
    'DESCRIPTION:Sprawdź termin gwarancji','END:VALARM','END:VEVENT','END:VCALENDAR',''].map(fold).join('\r\n');
}

const text=(value,max=250)=>typeof value==='string'&&value.length<=max;
const id=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const optionalDate=value=>value===''||dateValid(value);
const optionalMoney=value=>value===null||Number.isFinite(value)&&value>=0&&value<=1e9&&Math.abs(value*100-Math.round(value*100))<0.001;
const allUnique=items=>new Set(items.map(x=>x.id)).size===items.length;
const okDoc=d=>d&&id(d.id)&&text(d.name,255)&&documentKinds.includes(d.kind)&&d.blob instanceof Blob&&
  fileTypes.includes(d.blob.type)&&d.blob.size>0&&d.blob.size<=maxFile;
export function productValid(p) {
  if(!p||!id(p.id)||!text(p.name,120)||!p.name.trim()||
    !['brand','model','serial','store'].every(k=>text(p[k]))||!text(p.notes,5000)||
    !categoryName(p.category)||!states.includes(p.state)||!currencies.includes(p.currency)||
    !optionalDate(p.purchase)||!optionalDate(p.until)||p.until&&p.purchase&&p.until<p.purchase||
    !Number.isInteger(p.months)||p.months<0||p.months>600||!optionalMoney(p.price)||
    !text(p.created,30)||!Number.isFinite(Date.parse(p.created))||
    !Array.isArray(p.docs)||p.docs.length>100||!p.docs.every(okDoc)||!allUnique(p.docs)||
    !Array.isArray(p.history)||p.history.length>200||!allUnique(p.history.filter(Boolean)))return false;
  return p.history.every(h=>h&&id(h.id)&&['Naprawa','Reklamacja'].includes(h.kind)&&caseStates.includes(h.state)&&
    dateValid(h.date)&&optionalDate(h.sent)&&optionalDate(h.closed)&&(!h.closed||h.closed>=(h.sent||h.date))&&
    text(h.issue,1000)&&h.issue.trim()&&text(h.service)&&text(h.notes,5000)&&
    optionalMoney(h.cost)&&currencies.includes(h.currency)&&Array.isArray(h.docs)&&h.docs.length<=100&&h.docs.every(okDoc)&&allUnique(h.docs));
}
export async function sniff(blob) {
  const bytes=new Uint8Array(await blob.slice(0,40).arrayBuffer());
  const s=Array.from(bytes,n=>String.fromCharCode(n)).join('');
  if(s.startsWith('%PDF-'))return 'application/pdf';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(s.startsWith('\x89PNG\r\n\x1a\n'))return 'image/png';
  if(/^GIF8[79]a/.test(s))return 'image/gif';
  if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')return 'image/webp';
  if(s.slice(4,8)==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(s.slice(8,12)))return 'image/heic';
  throw Error('Wybierz prawidłowe zdjęcie (JPG, PNG, WebP, GIF lub HEIC) albo PDF.');
}

export const receiptCategories=['Spożywcze','Odzież','Kosmetyki','Elektronika','Dom i ogród','Usługi','Inne'];
export function receiptValid(r) {
  return Boolean(r && id(r.id) && text(r.store) && r.store.trim() &&
    optionalDate(r.date) && optionalMoney(r.total) && currencies.includes(r.currency) &&
    receiptCategories.includes(r.category) && text(r.notes,5000) &&
    Array.isArray(r.docs) && r.docs.length<=100 && r.docs.every(okDoc) && allUnique(r.docs) &&
    Array.isArray(r.items) && r.items.length<=200 && r.items.every(item=>
      item && id(item.id) && text(item.name,120) && item.name.trim() && optionalMoney(item.price)) && allUnique(r.items));
}

export function receiptSummary(receipts, month) {
  const list=receipts.filter(r=>r.date.slice(0,7)===month);
  const totals={}, categories={};
  for(const r of list) {
    if(r.total===null)continue;
    const cents=Math.round(r.total*100);
    totals[r.currency]=(totals[r.currency]??0)+cents;
    const group=categories[r.category]??={};
    group[r.currency]=(group[r.currency]??0)+cents;
  }
  return { count:list.length, totals, categories };
}

export function receiptProducts(receipt, selected) {
  return receipt.items.filter(item=>selected.has(item.id)).map(item=>({
    id:item.id, receiptId:receipt.id, name:item.name, brand:'', model:'', serial:'',
    category:'Inne', purchase:receipt.date, until:'', months:0, price:item.price,
    currency:receipt.currency, store:receipt.store, state:'W użyciu', notes:'',
    created:new Date().toISOString(), docs:[], history:[]
  }));
}
