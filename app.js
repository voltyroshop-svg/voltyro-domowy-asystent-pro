import {paymentOptions,scanReceipt} from './receipt-ocr.js';
import {chooseReceiptCrop} from './receipt-crop.js';
import {loadReceiptPhoto} from './receipt-image.js';
import {categoryName,categoryKey,productCategories,currencies,states,caseStates,documentKinds,maxFile,maxBackup,localDay,warrantyDate,warranty,selectProducts,portfolio,calendarFile,productValid,sniff,normalize,receiptCategories,receiptValid,receiptSummary,receiptProducts} from './model.js';
import {showPhoto} from './photo-viewer.js';
import {openStorage,exportBackup,importArchive} from './storage.js';

const $=id=>document.getElementById(id);
const elem=(name,text,cls)=>{const node=document.createElement(name);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const append=(parent,...nodes)=>{parent.append(...nodes);return parent;};
const paths={dashboard:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',box:'M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9',calendar:'M3 5h18v16H3zm4-2v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2',settings:'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4',shield:'M12 22c5-2.5 8-5.5 8-10V5l-8-3-8 3v7c0 4.5 3 7.5 8 10zM8.5 12l2.5 2.5 4.5-5',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',archive:'M3 4h18v4H3zm1 4v12h16V8m-11 4h6',plus:'M12 4v16M4 12h16',arrow:'M4 12h15m-6-6 6 6-6 6',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2'};
const svg=(tag,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
const icon=name=>append(svg('svg',{class:'ico',viewBox:'0 0 24 24','aria-hidden':'true'}),svg('path',{d:paths[name]}));
const ui={dashboard:'Pulpit',products:'Produkty',receipts:'Paragony',calendar:'Terminy',settings:'Ustawienia'};
const filterLabels={all:'Wszystkie',valid:'Aktywne gwarancje',soon:'Kończą się do 30 dni',expired:'Gwarancje zakończone',none:'Bez gwarancji',archived:'Sprzedane i wycofane'};
const sortLabels={recent:'Ostatnio dodane',purchase:'Data zakupu',warranty:'Koniec gwarancji'};
const dateFormat=new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeZone:'UTC'});
const monthFmt=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric',timeZone:'UTC'});
const formatDate=value=>value?dateFormat.format(new Date(value+'T00:00:00Z')):'—';
const price=(n,unit)=>n===null?'—':new Intl.NumberFormat('pl-PL',{style:'currency',currency:unit}).format(n);
const readSetting=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const writeSetting=(key,value)=>{try{localStorage.setItem(key,value);}catch{notice('Nie udało się zapisać ustawienia na tym urządzeniu.');}};
const activeProducts=()=>products.filter(p=>p.state==='W użyciu');
const editor=$('editor'),editorBody=$('editorBody'),view=$('view');
let storage,products=[],receipts=[],customCategories=[],updateNotice,uploadImport=false,opener,selectedDay=localDay(),month=selectedDay.slice(0,7)+'-01';
let query='',productCategory='',filter='all',sort='recent',theme=readSetting('domowy-theme','dark'),large=readSetting('domowy-large','false');
let pending=false,disposePreview;
const previews=new Set();
const homeIcons={dashboard:'dashboard',products:'box',receipts:'archive',calendar:'calendar',settings:'settings'};

function notice(text=''){const status=$('status');status.hidden=!text;status.textContent=text;}
function errorText(e){return e?.name==='QuotaExceededError'?'Brak miejsca na urządzeniu. Usuń zbędne pliki lub zwolnij pamięć.':e?.message||'Operacja nie powiodła się.';}
function button(label,fn,{cls='',glyph}={}){
  const b=elem('button',undefined,cls||undefined);b.type='button';
  if(glyph)b.append(icon(glyph));
  if(label)b.append(document.createTextNode(label));
  if(fn)b.onclick=fn;return b;
}
const addButton=()=>button('Dodaj produkt',()=>productForm(),{cls:'primary',glyph:'plus'});
const panel=title=>append(elem('section',undefined,'panel'),elem('h2',title));
const actions=(...items)=>append(elem('div',undefined,'actions'),...items);
function empty(glyph,title,body){
  return append(elem('div',undefined,'empty'),icon(glyph),elem('strong',title),elem('p',body));
}
function heroArt(){
  const draw=svg('svg',{viewBox:'0 0 340 210',fill:'none','aria-hidden':'true'});
  for(const r of [67,88,105])draw.append(svg('circle',{cx:173,cy:105,r,stroke:'currentColor','stroke-opacity':'.21','stroke-dasharray':'4 6'}));
  draw.append(svg('path',{d:'M93 119l72-61 72 61m-129-14v62h47m66-62v28',stroke:'currentColor','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
  draw.append(svg('path',{d:'M212 121l40 13v26c0 21-40 36-40 36s-40-15-40-36v-26z',fill:'#113743',stroke:'currentColor','stroke-width':3}));
  draw.append(svg('path',{d:'M197 157l11 11 20-22',stroke:'currentColor','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round'}));
  return append(elem('div',undefined,'hero-art'),draw);
}
function setTheme(){
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.large=large;
  document.querySelector('meta[name=theme-color]').content=theme==='light'?'#edf4f7':'#0d1727';
}
function navigate(to){if(location.hash==='#'+to)render();else location.hash=to;}
function openList(option='all',nextQuery=''){filter=option;query=nextQuery;productCategory='';navigate('products');}
function metric(title,num,glyph,option,cls=''){
  return append(button('',()=>openList(option),{cls:'metric '+cls}),icon(glyph),elem('strong',num),elem('small',title));
}
function tag(product){
  const w=warranty(product);
  const text=product.state!=='W użyciu'?product.state:w.kind==='none'?'Bez gwarancji':
    w.days<0?'Zakończona':w.days===0?'Kończy się dziś':w.days+' dni';
  return elem('span',text,'tag '+w.kind);
}
function row(p,label){
  const b=button('',()=>detail(p.id),{cls:'item'});
  return append(b,append(elem('span'),elem('strong',p.name),elem('small',label??[p.category,p.brand,p.model].filter(Boolean).join(' · '))),tag(p));
}
function shortcutSearch(){
  const input=elem('input');input.type='search';input.placeholder='Nazwa, marka lub kategoria';input.setAttribute('aria-label','Szukaj produktów');
  const form=append(elem('form',undefined,'actions dashboard-search'),input);
  const submit=button('Szukaj');submit.type='submit';form.append(submit);
  form.onsubmit=e=>{e.preventDefault();openList('all',input.value);};return form;
}
function dashboard(){
  const hero=elem('section',undefined,'hero');
  hero.append(append(elem('div',undefined,'hero-content'),elem('h1','Domowy asystent'),elem('p','Sprzęty, dokumenty i gwarancje w jednym miejscu.'),actions(addButton())),heroArt());
  const active=activeProducts();
  const count=kind=>active.filter(p=>warranty(p).kind===kind).length;
  const metrics=append(elem('div',undefined,'metrics'),metric('Zapisane urządzenia',products.length,'box','all'),
    metric('Aktywne gwarancje',count('active')+count('soon'),'shield','valid'),
    metric('Kończą się do 30 dni',count('soon'),'clock','soon','soon'),
    metric('Zakończone gwarancje',count('expired'),'archive','expired','expired'));
  const recent=selectProducts(products).slice(0,5);
  const next=selectProducts(active,{filter:'valid',sort:'warranty'}).slice(0,5);
  const recentCard=panel('Ostatnio dodane'),nextCard=panel('Najbliższe terminy');
  recentCard.append(recent.length?append(elem('div',undefined,'rows stack'),...recent.map(p=>row(p))):empty('box','Brak produktów','Dodaj pierwszy sprzęt i dokument zakupu.'));
  nextCard.append(next.length?append(elem('div',undefined,'rows stack'),...next.map(p=>row(p,formatDate(warranty(p).until)))):empty('calendar','Brak nadchodzących terminów','Terminy pojawią się po zapisaniu gwarancji.'));
  const values=panel('Wartość sprzętów w użyciu');
  const totals=Object.entries(portfolio(products));
  values.append(totals.length?actions(...totals.map(([unit,n])=>elem('strong',price(n,unit),'amount'))):elem('p','Dodaj ceny, aby zobaczyć sumę w każdej walucie.','muted'));
  view.append(hero,shortcutSearch(),metrics,append(elem('div',undefined,'columns'),recentCard,nextCard),append(elem('div',undefined,'stack'),values));
}
function control(label,name,{value='',type='text',choices,required=false,maxLength,min,max,step,count}={}){
  let input;
  if(choices){
    input=elem('select');
    for(const [key,title] of Array.isArray(choices)?choices.map(x=>[x,x]):Object.entries(choices)){const option=elem('option',title);option.value=key;input.append(option);}
  } else if(type==='textarea'){input=elem('textarea');input.rows=count??3;}
  else {input=elem('input');input.type=type;}
  input.name=name;
  if(!choices||[...input.options].some(option=>option.value===value))input.value=value??'';
  input.required=required;
  if(maxLength)input.maxLength=maxLength;
  if(min!==undefined)input.min=min;
  if(max!==undefined)input.max=max;
  if(step!==undefined)input.step=step;
  return append(elem('label',undefined,'field'),elem('span',label),input);
}
const categoryOptions=()=>productCategories([...customCategories,...products.map(product=>product.category)]);
const optionMap=names=>Object.fromEntries(names.map(name=>[name,name]));
function productList(){
  view.append(append(elem('div',undefined,'section-head'),elem('h1','Produkty'),addButton()));
  const search=control('Szukaj','query',{value:query,type:'search'});
  search.lastChild.placeholder='Nazwa, marka, kategoria…';
  const choice=control('Filtr','filter',{value:filter,choices:filterLabels});
  const category=control('Kategoria produktu','productCategory',{value:productCategory,choices:{'':'Wszystkie kategorie',...optionMap(categoryOptions())}});
  const order=control('Sortuj','sort',{value:sort,choices:sortLabels});
  const result=elem('div',undefined,'rows');
  const count=elem('p',undefined,'muted');
  count.setAttribute('aria-live','polite');
  function refreshList(){
    const rows=selectProducts(products,{query,category:productCategory,filter,sort});
    count.textContent='Liczba produktów: '+rows.length;
    result.replaceChildren(...(rows.length?rows.map(p=>row(p)):[empty('box','Brak wyników','Zmień filtr lub dodaj produkt.')]));
  }
  search.lastChild.oninput=e=>{query=e.target.value;refreshList();};
  choice.lastChild.onchange=e=>{filter=e.target.value;refreshList();};
  category.lastChild.onchange=e=>{productCategory=e.target.value;refreshList();};
  order.lastChild.onchange=e=>{sort=e.target.value;refreshList();};
  view.append(append(elem('div',undefined,'filters product-filters'),search,choice,category,order),append(elem('section',undefined,'panel'),count,result));refreshList();
}
function calendar(){
  const year=+month.slice(0,4),m=+month.slice(5,7)-1;
  const first=new Date(Date.UTC(year,m,1));
  const heading=elem('h2',monthFmt.format(first));
  const move=offset=>{month=new Date(Date.UTC(year,m+offset,1)).toISOString().slice(0,10);selectedDay=month;render();};
  const back=button('‹',()=>move(-1));back.setAttribute('aria-label','Poprzedni miesiąc');
  const next=button('›',()=>move(1));next.setAttribute('aria-label','Następny miesiąc');
  const grid=elem('div',undefined,'calendar');
  const byDate=new Map();
  for(const p of activeProducts()){
    const w=warranty(p);
    if(w.until){if(!byDate.has(w.until))byDate.set(w.until,[]);byDate.get(w.until).push(p);}
  }
  for(const day of ['Pn','Wt','Śr','Cz','Pt','So','Nd'])grid.append(elem('strong',day));
  for(let i=0;i<(first.getUTCDay()+6)%7;i++)grid.append(elem('span'));
  for(let day=1;day<=new Date(Date.UTC(year,m+1,0)).getUTCDate();day++){
    const date=month.slice(0,8)+String(day).padStart(2,'0');
    const count=byDate.get(date)?.length??0;
    const b=button('',()=>{selectedDay=date;render();$('date-'+date)?.focus();});
    b.id='date-'+date;b.append(elem('span',day));
    b.setAttribute('aria-pressed',String(date===selectedDay));
    b.setAttribute('aria-label',formatDate(date)+(count?' · Terminy: '+count:''));
    if(count)b.append(elem('small',count));
    if(date===localDay())b.setAttribute('aria-current','date');
    grid.append(b);
  }
  const events=byDate.get(selectedDay)??[];
  view.append(append(elem('div',undefined,'section-head'),elem('h1','Terminy gwarancji'),
    button('Dzisiaj',()=>{selectedDay=localDay();month=selectedDay.slice(0,7)+'-01';render();})),
    append(elem('section',undefined,'panel'),append(elem('div',undefined,'section-head'),heading,actions(back,next)),grid,
      append(elem('div',undefined,'stack'),elem('h3',formatDate(selectedDay)),...(events.length?events.map(p=>row(p)):[elem('p','Brak terminów gwarancji tego dnia.','muted')]))));
}
function download(blob,name){
  const url=URL.createObjectURL(blob);
  const a=elem('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
function ask(title,text){
  const box=$('confirm');box.returnValue='cancel';$('confirmTitle').textContent=title;$('confirmText').textContent=text;
  return new Promise(resolve=>{box.addEventListener('close',()=>resolve(box.returnValue==='yes'),{once:true});box.showModal();});
}
function settings(){
  const appearance=panel('Wygląd i czytelność');
  const fonts=elem('input');fonts.type='checkbox';fonts.checked=large==='true';
  const checkbox=append(elem('label',undefined,'check'),fonts,elem('span','Większe czcionki'));
  fonts.onchange=()=>{large=String(fonts.checked);setTheme();writeSetting('domowy-large',large);};
  const themed=button(theme==='dark'?'Włącz jasny motyw':'Włącz ciemny motyw',()=>{
    switchTheme();themed.textContent=theme==='dark'?'Włącz jasny motyw':'Włącz ciemny motyw';
  },{glyph:'sun'});
  appearance.append(checkbox,themed);
  const backup=panel('Kopia zapasowa');
  const exportBtn=button('Eksportuj kopię',async()=>{
    exportBtn.disabled=true;
    try{const snapshot=await storage.snapshot();download(await exportBackup(snapshot.products,snapshot.receipts,snapshot.categories),'VOLTYRO-kopia-'+localDay()+'.json');notice('Kopia zapasowa została przygotowana. Zachowaj plik w prywatnym miejscu.');}
    catch(e){notice(errorText(e));}finally{exportBtn.disabled=false;}
  },{cls:'primary'});
  const input=elem('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  const importBtn=button('Importuj kopię',()=>input.click());
  input.onchange=async()=>{
    const file=input.files[0];input.value='';
    if(!file||uploadImport)return;
    uploadImport=true;importBtn.disabled=true;
    try{
      const imported=await importArchive(file);
      if(await ask('Przywrócić kopię?','Poprawna kopia zawiera '+imported.products.length+' produktów i '+imported.receipts.length+' paragonów. Import zastąpi bieżące dane na tym urządzeniu.')){
        await storage.replace(imported.products,imported.receipts,imported.categories);productCategory='';await refresh();notice('Przywrócono kopię zapasową.');
      }
    }catch(e){notice(errorText(e));}finally{uploadImport=false;importBtn.disabled=false;}
  };
  backup.append(elem('p','Kopia zawiera produkty, paragony, pozycje zakupowe, dokumenty i historię spraw. Maksymalny rozmiar kopii to 160 MB.','muted'),
    actions(exportBtn,importBtn,input),elem('p','Uwaga: usunięcie danych przeglądarki lub aplikacji może spowodować utratę lokalnych dokumentów. Zapisuj kopię poza aplikacją.','notice'));
  const install=panel('Instalacja i terminy');
  install.append(elem('p','iPhone: otwórz w Safari i wybierz Udostępnij → Dodaj do ekranu początkowego.'),
    elem('p','Android: otwórz w Chrome i wybierz w menu Zainstaluj aplikację lub Dodaj do ekranu głównego.'),
    elem('p','Terminy można dodać do kalendarza plikiem ICS. Powiadomienia zależą od ustawień kalendarza.','muted'));
  if(updateNotice)install.append(actions(button('Zaktualizuj aplikację',updateNotice,{cls:'primary'})));
  view.append(elem('h1','Ustawienia'),append(elem('div',undefined,'stack'),appearance,backup,install));
}
function switchTheme(){theme=theme==='dark'?'light':'dark';setTheme();writeSetting('domowy-theme',theme);}
function render(){
  const page=Object.hasOwn(ui,location.hash.slice(1))?location.hash.slice(1):'dashboard';
  $('sectionName').textContent=ui[page];
  $('nav').replaceChildren(...Object.entries(ui).map(([key,name])=>{
    const a=elem('a');a.href='#'+key;
    if(key===page)a.setAttribute('aria-current','page');
    return append(a,icon(homeIcons[key]),document.createTextNode(name));
  }));
  view.replaceChildren();({dashboard,products:productList,receipts:receiptList,calendar,settings})[page]();
}
async function refresh(){({products,receipts,categories:customCategories}=await storage.snapshot());render();}
function open(title,body){
  if(!editor.open){opener=document.activeElement;editor.showModal();}
  disposePreview?.();disposePreview=undefined;
  for(const url of previews)URL.revokeObjectURL(url);
  previews.clear();
  $('editorTitle').textContent=title;editorBody.replaceChildren(body);editor.scrollTop=0;
}
const visual=window.visualViewport;
if(visual){
  const fitDialog=()=>{
    document.documentElement.style.setProperty('--keyboard-inset',Math.max(0,innerHeight-visual.height-visual.offsetTop)+'px');
  };
  visual.addEventListener('resize',fitDialog);
  visual.addEventListener('scroll',fitDialog);
}
editor.addEventListener('focusin',event=>{
  if(window.matchMedia('(max-width: 690px)').matches&&event.target.matches('input,textarea'))
    event.target.scrollIntoView({block:'nearest'});
});
editor.addEventListener('close',()=>{disposePreview?.();disposePreview=undefined;for(const url of previews)URL.revokeObjectURL(url);previews.clear();if(opener?.isConnected)opener.focus();});
$('closeEditor').onclick=()=>{if(!pending)editor.close();};
editor.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
function objectURL(blob){const url=URL.createObjectURL(blob);previews.add(url);return url;}
async function compress(blob,kind){
  if(!['image/jpeg','image/png','image/webp'].includes(kind)||blob.size<700_000)return blob;
  const url=URL.createObjectURL(blob);
  try{
    const photo=new Image();photo.src=url;await photo.decode();
    const scale=Math.min(1,2600/Math.max(photo.naturalWidth,photo.naturalHeight));
    const target=elem('canvas');target.width=Math.max(1,Math.round(photo.naturalWidth*scale));target.height=Math.max(1,Math.round(photo.naturalHeight*scale));
    const ctx=target.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,target.width,target.height);ctx.drawImage(photo,0,0,target.width,target.height);
    const compressed=await new Promise(resolve=>target.toBlob(resolve,'image/jpeg',.89));
    return compressed?.size<blob.size?compressed:blob;
  }catch {return blob;}finally{URL.revokeObjectURL(url);}
}
function attachmentPicker(initial=[],service=false,preserveOriginal=false){
  let docs=[...initial],additions=Promise.resolve();
  const wrap=elem('div',undefined,'wide stack');
  const kind=control('Rodzaj dokumentu','docKind',{choices:service?['Dokument serwisowy']:documentKinds.slice(0,3)});
  const choose=control('Pliki z urządzenia','attachment',{type:'file'});
  choose.lastChild.accept='image/*,.pdf,application/pdf';choose.lastChild.multiple=true;
  const camera=control('Zrób zdjęcie aparatem','camera',{type:'file'});
  camera.lastChild.accept='image/*';camera.lastChild.setAttribute('capture','environment');
  choose.hidden=camera.hidden=true;
  const gallery=button('Wybierz z galerii',()=>choose.lastChild.click());
  const capture=button('Zrób zdjęcie',()=>camera.lastChild.click());
  const status=elem('p',undefined,'muted');status.setAttribute('role','status');
  const listing=elem('div');
  function renderFiles(){
    listing.replaceChildren(...docs.map(doc=>append(elem('div',undefined,'docs'),elem('strong',doc.name),
      elem('p',doc.kind,'muted'),actions(button('Usuń plik',()=>{docs=docs.filter(x=>x.id!==doc.id);renderFiles();},{cls:'danger'})))));
  }
  const addFiles=event=>{
    const input=event.target,files=[...input.files],picked=kind.lastChild.value;
    input.disabled=true;
    additions=additions.then(async()=>{
      try{
        if(docs.length+files.length>100)throw Error('Limit to 100 plików w jednym zestawie.');
        const fresh=[];
        for(const file of files){
          if(file.size===0||file.size>maxFile)throw Error('Każdy plik musi mieć od 1 bajtu do 20 MB.');
          let bytes;
          try {bytes=await file.arrayBuffer();}
          catch {throw Error('Nie można odczytać pliku. Wybierz lokalną kopię z galerii lub zrób nowe zdjęcie.');}
          const format=await sniff(new Blob([bytes]));
          const original=new Blob([bytes],{type:format});
          const blob=preserveOriginal?original:await compress(original,format);
          fresh.push({id:crypto.randomUUID(),name:file.name.slice(0,255),kind:picked,blob});
        }
        docs.push(...fresh);renderFiles();
        status.textContent=files.length?'Dodano pliki do formularza.':'';
      }catch(e){status.textContent=errorText(e);}
      finally{input.value='';input.disabled=false;}
    });
  };
  choose.lastChild.onchange=camera.lastChild.onchange=addFiles;
  wrap.append(elem('h3',service?'Dokumenty serwisowe':'Zdjęcia i dokumenty'),kind,actions(capture,gallery),choose,camera,status,listing);renderFiles();
  return {wrap,list:async()=>{await additions;return docs;}};
}
function dialogForm(fields,attach,onSave,back){
  const form=elem('form');
  const message=elem('p',undefined,'error');message.hidden=true;message.setAttribute('role','alert');
  const save=button('Zapisz',null,{cls:'primary'});save.type='submit';
  form.append(fields,attach.wrap,message,actions(save,button('Anuluj',back)));
  form.onsubmit=async event=>{
    event.preventDefault();
    if(pending)return;
    pending=true;save.disabled=true;message.hidden=true;
    try{await onSave(Object.fromEntries(new FormData(form)),await attach.list());}
    catch(e){message.textContent=errorText(e);message.hidden=false;}
    finally{pending=false;save.disabled=false;}
  };
  return form;
}
const valueNumber=value=>value===''?null:Number(value);
const clean=(value='')=>value.trim();
async function saveProduct(product,customName){
  if(!productValid(product))throw Error('Sprawdź daty, kwoty i wymagane pola formularza.');
  const current=await storage.list();
  if(current.length>=1000&&!current.some(p=>p.id===product.id))throw Error('Osiągnięto limit 1000 produktów.');
  await storage.save(product,customName);await refresh();
}
function productForm(previous){
  const p=previous??{};
  const field=(label,name,options)=>control(label,name,{value:p[name],...options});
  const purchase=field('Data zakupu','purchase',{type:'date'});
  const months=field('Gwarancja w miesiącach','months',{type:'number',value:p.months||'',min:1,max:600,step:1});
  const until=field('Koniec gwarancji','until',{type:'date',value:p.until||warrantyDate(p.purchase,p.months)});
  const override=elem('input');override.type='checkbox';override.name='manual';override.checked=Boolean(p.until);
  function calc(){until.lastChild.readOnly=!override.checked;if(!override.checked)until.lastChild.value=warrantyDate(purchase.lastChild.value,Number(months.lastChild.value));}
  purchase.lastChild.oninput=months.lastChild.oninput=override.onchange=calc;
  calc();
  const name=field('Nazwa produktu','name',{required:true,maxLength:120});name.classList.add('wide');
  const notes=field('Notatki','notes',{type:'textarea',maxLength:5000});notes.classList.add('wide');
  const options=categoryOptions();
  const current=options.find(name=>categoryKey(name)===categoryKey(p.category??'Inne'));
  const category=field('Kategoria','category',{choices:options,value:current??'Inne'});
  const custom=control('Nazwa własnej kategorii','customCategory',{maxLength:60});
  custom.id='custom-category-field';custom.hidden=true;custom.lastChild.disabled=true;
  const addCategory=button('Dodaj własną kategorię',()=>{
    custom.hidden=!custom.hidden;
    custom.lastChild.disabled=custom.hidden;custom.lastChild.required=!custom.hidden;
    addCategory.setAttribute('aria-expanded',String(!custom.hidden));
    addCategory.textContent=custom.hidden?'Dodaj własną kategorię':'Anuluj własną kategorię';
    if(!custom.hidden)custom.lastChild.focus();
  });
  addCategory.setAttribute('aria-expanded','false');
  addCategory.setAttribute('aria-controls',custom.id);
  const categoryGroup=append(elem('div',undefined,'category-group'),category,addCategory,custom);
  const fields=append(elem('div',undefined,'fields'),name,field('Producent','brand',{maxLength:250}),field('Model','model',{maxLength:250}),
    field('Numer seryjny','serial',{maxLength:250}),categoryGroup,
    purchase,field('Sklep','store',{maxLength:250}),field('Cena','price',{type:'number',min:0,max:1e9,step:.01}),
    field('Waluta','currency',{choices:currencies,value:p.currency??'PLN'}),months,until,
    append(elem('label',undefined,'check wide'),override,elem('span','Ustaw datę końca ręcznie')),
    field('Status produktu','state',{choices:states,value:p.state??states[0]}),notes);
  const linked=receiptChoice(p.receiptId??'');
  fields.append(linked);
  const attach=attachmentPicker(p.docs);
  const form=dialogForm(fields,attach,async(d,docs)=>{
    const customName=d.customCategory?.trim().replace(/\s+/g,' ');
    if(d.customCategory!==undefined&&!categoryName(customName))throw Error('Wpisz nazwę własnej kategorii.');
    const existing=customName&&categoryOptions().find(name=>categoryKey(name)===categoryKey(customName));
    if(customName&&!existing&&customCategories.length>=1000)throw Error('Osiągnięto limit własnych kategorii.');
    const record={id:p.id??crypto.randomUUID(),created:p.created??new Date().toISOString(),history:p.history??[],docs,
      name:clean(d.name),brand:clean(d.brand),model:clean(d.model),serial:clean(d.serial),category:existing||customName||d.category,purchase:d.purchase,
      store:clean(d.store),price:valueNumber(d.price),currency:d.currency,months:Number(d.months||0),until:d.manual?d.until:'',state:d.state,notes:clean(d.notes)};
    if(d.receiptId)record.receiptId=d.receiptId;
    await saveProduct(record,customName&&!existing?customName:undefined);editor.close();notice(previous?'Zapisano zmiany produktu.':'Dodano produkt.');
  },()=>{if(!pending){if(previous)detail(previous.id);else editor.close();}});
  open(previous?'Edytuj produkt':'Dodaj produkt',form);
  name.lastChild.focus();
}
function documentRow(doc,goBack){
  return append(elem('div',undefined,'docs'),elem('strong',doc.name),elem('p',doc.kind+' · '+Math.ceil(doc.blob.size/1024)+' kB','muted'),
    actions(button('Otwórz dokument',()=>preview(doc,goBack)),button('Pobierz',()=>download(doc.blob,doc.name))));
}
function preview(doc,goBack){
  if(doc.blob.type!=='application/pdf'){
    showPhoto({url:URL.createObjectURL(doc.blob),title:doc.name,download:()=>download(doc.blob,doc.name)});
    return;
  }
  const body=elem('section');
  const go=button('Wróć do szczegółów',goBack,{cls:'link-button'});
  body.append(go);
  open(doc.name,body);
  const url=objectURL(doc.blob);
  const link=elem('a','Otwórz PDF w nowej karcie','button');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  const target=elem('div');
  body.append(target,actions(link,button('Pobierz PDF',()=>download(doc.blob,doc.name))));
  disposePreview=renderPdf(doc.blob,target);
}
function renderPdf(blob,target){
  let closed=false,task,picture,generation=0,documentPdf;
  const status=elem('p','Otwieranie PDF…','muted');status.setAttribute('role','status');
  const canvas=elem('canvas');canvas.hidden=true;canvas.setAttribute('aria-label','Podgląd strony PDF');
  const surface=append(elem('div',undefined,'pdf-surface'),canvas);
  let page=1,zoom=1;
  const previous=button('‹ Poprzednia',()=>{page--;void draw();});
  const next=button('Następna ›',()=>{page++;void draw();});
  const larger=button('+ Powiększ',()=>{zoom=Math.min(2,zoom+.25);void draw();});
  const smaller=button('− Zmniejsz',()=>{zoom=Math.max(1,zoom-.25);void draw();});
  const controls=actions(previous,next,smaller,larger);controls.hidden=true;
  target.append(status,controls,surface);
  async function draw(){
    const ticket=++generation;
    const active=picture;
    if(active){active.cancel();await active.promise.catch(()=>{});}
    try {
      const sheet=await documentPdf.getPage(page);
      if(closed||ticket!==generation)return;
      const natural=sheet.getViewport({scale:1});
      const fit=Math.min(1.6,Math.max(200,surface.clientWidth-2)/natural.width)*zoom;
      const display=sheet.getViewport({scale:fit});
      const pixels=Math.min(devicePixelRatio||1,2,3000/Math.max(display.width,display.height));
      canvas.width=Math.max(1,Math.round(display.width*pixels));
      canvas.height=Math.max(1,Math.round(display.height*pixels));
      canvas.style.width=Math.round(display.width)+'px';
      canvas.hidden=false;
      previous.disabled=page===1;next.disabled=page===documentPdf.numPages;
      larger.disabled=zoom>=2;smaller.disabled=zoom<=1;
      status.textContent='Strona '+page+' z '+documentPdf.numPages;
      picture=sheet.render({canvasContext:canvas.getContext('2d'),viewport:display,transform:[pixels,0,0,pixels,0,0]});
      await picture.promise;
    } catch(e) {
      if(!closed&&ticket===generation&&e.name!=='RenderingCancelledException')status.textContent='Nie można wyświetlić tej strony. Otwórz lub pobierz PDF.';
    }
  }
  void (async()=>{
    try{
      const pdf=await import('./pdf/pdf.min.js');
      pdf.GlobalWorkerOptions.workerSrc=new URL('./pdf/pdf.worker.min.js',import.meta.url).href;
      const data=await blob.arrayBuffer();
      if(closed)return;
      task=pdf.getDocument({data,standardFontDataUrl:new URL('./pdf/fonts/',import.meta.url).href,isEvalSupported:false});
      documentPdf=await task.promise;
      if(closed)return;
      controls.hidden=false;await draw();
    }catch {if(!closed)status.textContent='Nie można wyświetlić PDF. Otwórz lub pobierz dokument.';}
  })();
  return ()=>{closed=true;picture?.cancel();void task?.destroy().catch(()=>{});};
}
function detail(id){
  const p=products.find(product=>product.id===id);
  if(!p)return;
  const back=()=>detail(id);
  const w=warranty(p);
  const body=elem('div');
  const data=[['Producent i model',[p.brand,p.model].filter(Boolean).join(' ')],['Numer seryjny',p.serial],['Kategoria',p.category],
    ['Sklep',p.store],['Data zakupu',formatDate(p.purchase)],['Cena',price(p.price,p.currency)],['Koniec gwarancji producenta',formatDate(w.until)],['Status',p.state]];
  const overview=elem('dl');
  for(const [k,v] of data)overview.append(append(elem('div'),elem('dt',k),elem('dd',v||'—')));
  body.append(tag(p),overview);
  if(p.notes)body.append(elem('p',p.notes,'notice'));
  const controls=actions(button('Edytuj produkt',()=>productForm(p),{cls:'primary'}));
  if(w.until)controls.append(button('Dodaj termin do kalendarza (ICS)',()=>download(new Blob([calendarFile(p)],{type:'text/calendar;charset=utf-8'}),'gwarancja-'+w.until+'.ics')));
  controls.append(button('Usuń produkt',async()=>{
    if(!await ask('Usunąć ten produkt?',p.name+' i jego dokumenty oraz historia zostaną usunięte z tego urządzenia.'))return;
    try{await storage.remove(p.id);await refresh();editor.close();notice('Usunięto produkt.');}
    catch(e){notice(errorText(e));}
  },{cls:'danger'}));
  body.append(controls);
  const docs=append(elem('section',undefined,'stack'),elem('h2','Dokumenty'),...(p.docs.length?p.docs.map(d=>documentRow(d,back)):[elem('p','Brak dokumentów. Dodaj je podczas edycji produktu.','muted')]));
  const history=append(elem('section',undefined,'stack'),elem('h2','Naprawy i reklamacje'),
    actions(button('Dodaj naprawę lub reklamację',()=>historyForm(p),{glyph:'plus'})));
  for(const entry of [...p.history].sort((a,b)=>b.date.localeCompare(a.date))){
    const item=append(elem('article',undefined,'history'),elem('h3',entry.kind+' · '+entry.state),
      elem('p',formatDate(entry.date)+' · '+entry.issue),elem('p',[entry.service,entry.cost!==null?price(entry.cost,entry.currency):''].filter(Boolean).join(' · '),'muted'));
    if(entry.sent||entry.closed)item.append(elem('p',(entry.sent?'Wysłano '+formatDate(entry.sent)+' ':'')+(entry.closed?'Zakończono '+formatDate(entry.closed):'')));
    if(entry.notes)item.append(elem('p',entry.notes));
    for(const doc of entry.docs)item.append(documentRow(doc,back));
    item.append(actions(button('Edytuj wpis',()=>historyForm(p,entry)),button('Usuń wpis',async()=>{
      if(!await ask('Usunąć wpis?',entry.kind+' i jej dokumenty zostaną usunięte.'))return;
      try{await saveProduct({...p,history:p.history.filter(h=>h.id!==entry.id)});back();notice('Usunięto wpis.');}
      catch(e){notice(errorText(e));}
    },{cls:'danger'})));
    history.append(item);
  }
  if(!p.history.length)history.append(elem('p','Brak zapisanych spraw.','muted'));
  const linked=receipts.find(r=>r.id===p.receiptId);
  if(linked)body.append(append(panel('Powiązany paragon'),button(linked.store+' · '+formatDate(linked.date),()=>receiptDetail(linked.id))));
  body.append(docs,history);open(p.name,body);
  const cover=p.docs.find(d=>d.kind===documentKinds[0]&&d.blob.type.startsWith('image/'));
  if(cover){const img=elem('img',undefined,'details-photo');img.src=objectURL(cover.blob);img.alt='Zdjęcie urządzenia';const coverButton=button('',()=>preview(cover,back),{cls:'photo-cover'});coverButton.setAttribute('aria-label','Otwórz zdjęcie produktu');img.onerror=()=>coverButton.remove();body.insertBefore(append(coverButton,img),overview);}
}
function historyForm(p,h){
  const previous=h??{};
  const field=(label,name,options)=>control(label,name,{value:previous[name],...options});
  const issue=field('Opis usterki lub sprawy','issue',{type:'textarea',required:true,maxLength:1000});issue.classList.add('wide');
  const notes=field('Notatki sprawy','notes',{type:'textarea',maxLength:5000});notes.classList.add('wide');
  const fields=append(elem('div',undefined,'fields'),field('Rodzaj sprawy','kind',{choices:['Naprawa','Reklamacja'],value:previous.kind??'Naprawa'}),
    field('Status sprawy','state',{choices:caseStates,value:previous.state??caseStates[0]}),
    field('Data naprawy lub zgłoszenia','date',{type:'date',required:true,value:previous.date??localDay()}),field('Nazwa serwisu','service',{maxLength:250}),
    field('Koszt','cost',{type:'number',min:0,max:1e9,step:.01}),field('Waluta','currency',{choices:currencies,value:previous.currency??p.currency}),
    field('Data wysłania','sent',{type:'date'}),field('Data zakończenia','closed',{type:'date'}),issue,notes);
  const attach=attachmentPicker(previous.docs,true);
  open(h?'Edytuj sprawę':'Dodaj naprawę lub reklamację',dialogForm(fields,attach,async(d,docs)=>{
    const entry={id:previous.id??crypto.randomUUID(),kind:d.kind,state:d.state,date:d.date,service:clean(d.service),
      cost:valueNumber(d.cost),currency:d.currency,sent:d.sent,closed:d.closed,issue:clean(d.issue),notes:clean(d.notes),docs};
    await saveProduct({...p,history:[...p.history.filter(item=>item.id!==entry.id),entry]});
    detail(p.id);notice('Zapisano sprawę.');
  },()=>{if(!pending)detail(p.id);}));
}
function receiptChoice(value){
  const choices={'':'Bez powiązania'};
  for(const r of sortedReceipts())choices[r.id]=[r.store,formatDate(r.date),price(r.total,r.currency)].join(' · ');
  return control('Powiązany paragon','receiptId',{choices,value});
}

function sortedReceipts(){
  return [...receipts].sort((a,b)=>b.date.localeCompare(a.date));
}

let expenseMonth=localDay().slice(0,7), receiptSearch='', receiptFilter='';
function receiptList(){
  const list=elem('div',undefined,'rows');
  const totals=panel('Wydatki w miesiącu');
  const monthField=control('Miesiąc','expenses',{value:expenseMonth,type:'month'});
  const summary=elem('div',undefined,'stack');
  function drawSummary(){
    const data=receiptSummary(receipts,expenseMonth);
    summary.replaceChildren(elem('p','Liczba paragonów: '+data.count),
      elem('strong',Object.entries(data.totals).map(([c,n])=>price(n/100,c)).join(' · ')||'Brak zapisanych kwot'));
    for(const [category,group] of Object.entries(data.categories))
      summary.append(elem('p',category+' · '+Object.entries(group).map(([c,n])=>price(n/100,c)).join(' · '),'muted'));
  }
  monthField.lastChild.oninput=()=>{expenseMonth=monthField.lastChild.value;drawSummary();};
  totals.append(monthField,summary);drawSummary();
  const search=control('Szukaj w paragonach','receiptQuery',{type:'search',value:receiptSearch});
  const filter=control('Kategoria zakupów','receiptFilter',{value:receiptFilter,choices:{'':'Wszystkie',...Object.fromEntries(receiptCategories.map(c=>[c,c]))}});
  function drawList(){
    const needle=normalize(receiptSearch.trim());
    const filtered=sortedReceipts().filter(r=>(!receiptFilter||r.category===receiptFilter)&&
      normalize([r.store,r.notes,r.category,...r.items.map(i=>i.name)].join(' ')).includes(needle));
    list.replaceChildren(...filtered.map(r=>append(button('',()=>receiptDetail(r.id),{cls:'item'}),
      append(elem('span'),elem('strong',r.store),elem('small',r.category+' · '+formatDate(r.date))),
      elem('span',price(r.total,r.currency),'amount'))));
    if(!filtered.length)list.append(empty('archive','Brak paragonów',receipts.length?'Zmień warunki wyszukiwania.':'Dodaj paragon lub fakturę za dowolne zakupy.'));
  }
  search.lastChild.oninput=()=>{receiptSearch=search.lastChild.value;drawList();};
  filter.lastChild.onchange=()=>{receiptFilter=filter.lastChild.value;drawList();};
  view.append(append(elem('div',undefined,'section-head'),elem('h1','Paragony'),
    actions(button('Dodaj paragon',()=>receiptForm(),{cls:'primary',glyph:'plus'}),button('Skanuj paragon',()=>receiptForm(undefined,true)))),
    totals,append(elem('div',undefined,'fields stack'),search,filter),append(elem('div',undefined,'stack'),list));
  drawList();
}

function receiptDetail(id){
  const r=receipts.find(receipt=>receipt.id===id);
  if(!r)return;
  const back=()=>receiptDetail(id);
  const body=elem('div',undefined,'stack');
  body.append(elem('p',[formatDate(r.date),r.category,price(r.total,r.currency)].join(' · ')));
  if(r.nip)body.append(elem('p','NIP: '+r.nip));
  if(r.payment)body.append(elem('p','Płatność: '+paymentOptions[r.payment]));
  if(r.notes)body.append(elem('p',r.notes,'notice'));
  body.append(actions(button('Edytuj paragon',()=>receiptForm(r),{cls:'primary'}),button('Usuń paragon',async()=>{
    if(!await ask('Usunąć paragon?','Powiązane produkty pozostaną zapisane. Dokument i pozycje znikną z archiwum.'))return;
    try{await storage.removeReceipt(r.id);await refresh();editor.close();notice('Usunięto paragon.');}
    catch(error){notice(errorText(error));}
  },{cls:'danger'})));
  if(r.docs.length)body.append(append(panel('Zdjęcia i dokumenty'),...r.docs.map(doc=>documentRow(doc,back))));
  if(r.items.length)body.append(append(panel('Pozycje zakupowe'),...r.items.map(item=>elem('p',[item.name,item.quantity!=null?item.quantity+' × '+price(item.unitPrice??null,r.currency):'',price(item.price,r.currency)].filter(Boolean).join(' · ')))));
  const linked=products.filter(p=>p.receiptId===id);
  if(linked.length)body.append(append(panel('Powiązane produkty'),...linked.map(p=>rowToProduct(p))));
  open(r.store,body);
}
const rowToProduct=p=>button(p.name,()=>detail(p.id));

function receiptForm(previous,scanFirst=false){
  const r=previous??{id:crypto.randomUUID(),store:'',date:'',total:null,currency:'PLN',category:'Inne',notes:'',docs:[],items:[]};
  const store=control('Sklep','store',{value:r.store,required:true,maxLength:250});
  const date=control('Data zakupu','date',{value:r.date,type:'date'});
  const total=control('Kwota całkowita','total',{value:r.total,type:'number',min:0,max:1e9,step:.01});
  const nip=control('NIP sprzedawcy','nip',{value:r.nip,maxLength:16});
  nip.lastChild.inputMode='numeric';
  const payment=control('Forma płatności','payment',{choices:paymentOptions,value:r.payment??''});
  const fields=append(elem('div',undefined,'fields'),store,date,total,nip,payment,
    control('Waluta','currency',{choices:currencies,value:r.currency}),
    control('Kategoria zakupów','category',{choices:receiptCategories,value:r.category}),
    control('Notatki','notes',{type:'textarea',value:r.notes,maxLength:5000}));
  const attachment=attachmentPicker(r.docs,false,true);
  attachment.wrap.querySelector('[name=docKind]').value='Paragon lub faktura';
  attachment.wrap.querySelector('[name=docKind]').closest('label').hidden=true;
  const positionPanel=panel('Pozycje zakupowe');
  const review=elem('p',undefined,'notice');review.hidden=true;review.id='ocr-review';
  const results=elem('div');
  const raw=elem('details');raw.hidden=true;
  const rawText=elem('p',undefined,'ocr-text');
  raw.append(elem('summary','Tekst odczytany ze zdjęcia'),rawText);
  const scanStatus=elem('p',undefined,'muted');scanStatus.setAttribute('role','status');
  async function startScan(manual=false){
    scan.disabled=crop.disabled=true;
    const controller=new AbortController();
    disposePreview=()=>controller.abort();
    try{
      const photo=(await attachment.list()).findLast(doc=>doc.blob.type.startsWith('image/'));
      if(!photo)throw Error('Najpierw zrób zdjęcie lub wybierz je z galerii.');
      scanStatus.textContent='Skanowanie paragonu na urządzeniu…';
      let input=photo.blob;
      if(manual){
        const canvas=await loadReceiptPhoto(photo.blob);
        if(controller.signal.aborted)return;
        input=await chooseReceiptCrop(canvas);
        if(!input){scanStatus.textContent='Kadrowanie anulowane.';return;}
      }
      const result=await scanReceipt(input,progress=>{
        if(progress.status==='recognizing text')scanStatus.textContent='Skanowanie… '+Math.round(progress.progress*100)+'%';
      },controller.signal,{prepared:manual});
      if(controller.signal.aborted)return;
      raw.open=false;raw.hidden=!result.raw.trim();rawText.textContent=result.raw;
      if(result.quality!=='review'){
        review.hidden=true;
        scanStatus.textContent='Zrób zdjęcie ponownie. Ułóż paragon płasko, doświetl go równomiernie i obejmij cały wydruk. Możesz też wykadrować zdjęcie lub wpisać dane ręcznie.';
        return;
      }
      if(!nip.lastChild.value&&result.nip)nip.lastChild.value=result.nip;
      if(!payment.lastChild.value&&result.payment)payment.lastChild.value=result.payment;
      if(!store.lastChild.value&&result.store)store.lastChild.value=result.store.slice(0,250);
      if(!date.lastChild.value)date.lastChild.value=result.date;
      if(!total.lastChild.value&&result.total!==null)total.lastChild.value=result.total;
      const keyFor=item=>normalize(item.name)+'|'+item.price;
      const counts=new Map();
      for(const item of readItems()){const key=keyFor(item);counts.set(key,(counts.get(key)??0)+1);}
      for(const item of result.items.slice(0,200)){
        const key=keyFor(item);
        if(counts.get(key)>0)counts.set(key,counts.get(key)-1);
        else if(results.childElementCount<200)addItem(item);
      }
      review.hidden=false;
      for(const field of [store,date,total,nip,payment])field.lastChild.setAttribute('aria-describedby',review.id);
      review.textContent='Sprawdź sklep, datę, kwotę, walutę i wszystkie pozycje. Pola bez wiarygodnego odczytu pozostawiono puste.';
      scanStatus.textContent='Sprawdź propozycje w formularzu przed zapisaniem.';
    }catch(error){
      if(!controller.signal.aborted)scanStatus.textContent=errorText(error)+' Możesz uzupełnić dane ręcznie.';
    }finally{scan.disabled=crop.disabled=false;}
  }
  const scan=button('Odczytaj dane ze zdjęcia',()=>startScan());
  const crop=button('Wykadruj lub obróć',()=>startScan(true));
  function readItems(){
    return [...results.children].map(line=>({
      id:line.dataset.itemId,
      name:line.querySelector('[name=itemName]').value.trim(),
      price:valueNumber(line.querySelector('[name=itemPrice]').value),
      quantity:valueNumber(line.querySelector('[name=itemQuantity]').value),
      unitPrice:valueNumber(line.querySelector('[name=itemUnitPrice]').value)
    }));
  }
  function addItem(item={}){
    if(results.childElementCount>=200)return;
    const name=control('Nazwa pozycji','itemName',{value:item.name,required:true,maxLength:120});
    const cost=control('Cena pozycji','itemPrice',{value:item.price,type:'number',min:0,max:1e9,step:.01});
    const quantity=control('Ilość','itemQuantity',{value:item.quantity,type:'number',min:.001,max:1e6,step:.001});
    const unit=control('Cena jednostkowa','itemUnitPrice',{value:item.unitPrice,type:'number',min:0,max:1e9,step:.01});
    const select=elem('input');select.type='checkbox';select.name='createProduct';
    const linked=item.id&&products.some(p=>p.id===item.id);
    select.disabled=Boolean(linked);
    const line=append(elem('div',undefined,'fields docs'),name,cost,quantity,unit,
      append(elem('label',undefined,'check'),select,elem('span',linked?'Produkt już zapisany':'Dodaj jako produkt')),
      button('Usuń pozycję',()=>line.remove()));
    line.dataset.itemId=item.id??crypto.randomUUID();results.append(line);
  }
  r.items.forEach(addItem);
  positionPanel.append(results,actions(button('Dodaj pozycję',()=>addItem())));
  const scanning=append(panel('Skanuj paragon'),elem('p','Zdjęcie zostaje na urządzeniu. Odczytane dane możesz poprawić przed zapisaniem.','muted'),actions(scan,crop),scanStatus,review,raw);
  const body=scanFirst?append(elem('div'),attachment.wrap,scanning,fields,positionPanel):append(elem('div'),fields,attachment.wrap,scanning,positionPanel);
  const form=dialogForm(body,{wrap:elem('span'),list:attachment.list},async(data,docs)=>{
    if(!scan.disabled){
      const saved={...r,store:data.store.trim(),date:data.date,total:valueNumber(data.total),currency:data.currency,
        category:data.category,nip:data.nip.replace(/[\s-]/g,''),payment:data.payment,notes:data.notes.trim(),docs,items:readItems()};
      if(!receiptValid(saved))throw Error('Sprawdź nazwę sklepu, datę, kwotę i pozycje.');
      if(!previous&&receipts.length>=5000)throw Error('Osiągnięto limit 5000 paragonów.');
      const selected=new Set([...results.children].filter(line=>line.querySelector('[name=createProduct]').checked).map(line=>line.dataset.itemId));
      const created=receiptProducts(saved,selected);
      if(products.length+created.length>1000)throw Error('Osiągnięto limit 1000 produktów.');
      await storage.saveReceipt(saved,created);
      await refresh();receiptDetail(saved.id);notice('Zapisano paragon.');
    }else throw Error('Poczekaj na zakończenie skanowania.');
  },()=>{if(previous)receiptDetail(previous.id);else editor.close();});
  open(previous?'Edytuj paragon':scanFirst?'Skanuj paragon':'Dodaj paragon',form);
}

async function prepareWorker(){
  if(!('serviceWorker' in navigator))return;
  const worker=navigator.serviceWorker;
  const registration=await worker.register('./sw.js',{updateViaCache:'none'});
  const show=()=>{
    if(!registration.waiting||!worker.controller)return;
    updateNotice=()=>{worker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting?.postMessage('activate');};
    notice('Dostępna jest aktualizacja. Zapisz rozpoczętą edycję przed jej zastosowaniem.');
    $('status').append(document.createTextNode(' '),button('Zaktualizuj aplikację',updateNotice));
  };
  show();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',show));
}
try{
  setTheme();$('theme').append(icon('sun'));$('theme').onclick=switchTheme;
  storage=await openStorage();await refresh();
  window.addEventListener('hashchange',()=>{if(!pending){render();$('content').focus({preventScroll:true});}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&!editor.open)void refresh().catch(e=>notice(errorText(e)));});
  window.addEventListener('focus',()=>{if(!editor.open)void refresh().catch(e=>notice(errorText(e)));});
  void prepareWorker().catch(()=>notice('Nie udało się przygotować trybu offline. Sprawdź połączenie i odśwież stronę.'));
}catch(e){view.replaceChildren(empty('box','Nie można otworzyć zapisu',errorText(e)));}

