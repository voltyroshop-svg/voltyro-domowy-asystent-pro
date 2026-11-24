import {defaultCorners,detectReceipt,rectify,rotateReceipt,validCorners} from './receipt-image.js';

const element=(name,text)=>Object.assign(document.createElement(name),text===undefined?{}:{textContent:text});
const svg=(tag)=>document.createElementNS('http://www.w3.org/2000/svg',tag);

export function chooseReceiptCrop(original){
  let canvas=original,points=detectReceipt(original)??defaultCorners(),output;
  const dialog=element('dialog');dialog.className='receipt-crop';
  const heading=element('h2','Wykadruj paragon');heading.id='receipt-crop-title';
  dialog.setAttribute('aria-labelledby',heading.id);
  const help=element('p','Przesuń cztery narożniki na krawędzie paragonu. Narożniki można też przesuwać strzałkami.');
  const status=element('p');status.setAttribute('role','status');status.className='muted';
  const stage=element('div');stage.className='crop-stage';
  const overlay=svg('svg');overlay.setAttribute('viewBox','0 0 100 100');overlay.setAttribute('preserveAspectRatio','none');
  overlay.setAttribute('aria-hidden','true');
  const polygon=svg('polygon');overlay.append(polygon);
  const controls=element('div');controls.className='actions';
  function action(text,fn){
    const control=element('button',text);control.type='button';control.onclick=fn;return control;
  }
  const scan=action('Skanuj ten kadr',()=>{
    if(!validCorners(points)){status.textContent='Ustaw narożniki zgodnie z kolejnością, bez krzyżowania boków.';return;}
    scan.disabled=true;
    status.textContent='Prostowanie zdjęcia…';
    requestAnimationFrame(()=>setTimeout(()=>{
      if(!dialog.open)return;
      try{output=rectify(canvas,points);output.sourceSize=original.sourceSize;dialog.close();}
      catch(error){status.textContent=error.message;scan.disabled=false;}
    },0));
  });scan.className='primary';
  controls.append(scan,action('Obróć o 90°',()=>{
    canvas=rotateReceipt(canvas);points=detectReceipt(canvas)??defaultCorners();draw();
  }),action('Wykryj krawędzie',()=>{
    const detected=detectReceipt(canvas);
    status.textContent=detected?'Znaleziono krawędzie. Sprawdź oznaczone narożniki.':'Nie wykryto pewnych krawędzi. Ustaw narożniki ręcznie.';
    points=detected??defaultCorners();draw();
  }),action('Całe zdjęcie',()=>{points=defaultCorners();draw();}),action('Anuluj',()=>dialog.close()));
  const handles=['Górny lewy','Górny prawy','Dolny prawy','Dolny lewy'].map((name,i)=>{
    const handle=action(String(i+1),()=>{});
    handle.className='crop-handle';handle.setAttribute('aria-label',name+' narożnik');
    handle.onpointerdown=event=>{event.preventDefault();handle.focus();handle.setPointerCapture(event.pointerId);};
    handle.onpointermove=event=>{
      if(!handle.hasPointerCapture(event.pointerId))return;
      const rect=stage.getBoundingClientRect();
      change(i,(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);
    };
    handle.onkeydown=event=>{
      const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(!dir)return;
      event.preventDefault();
      const step=event.shiftKey?.05:.01;
      change(i,points[i].x+dir[0]*step,points[i].y+dir[1]*step);
    };
    return handle;
  });
  function change(i,x,y){
    points[i]={x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};draw();
  }
  function draw(){
    if(canvas.parentNode!==stage)stage.prepend(canvas);
    for(const old of stage.querySelectorAll('canvas'))if(old!==canvas)old.remove();
    polygon.setAttribute('points',points.map(p=>p.x*100+','+p.y*100).join(' '));
    for(const [i,handle] of handles.entries()){
      handle.style.left=points[i].x*100+'%';handle.style.top=points[i].y*100+'%';
    }
  }
  stage.append(overlay,...handles);draw();
  dialog.append(heading,help,stage,status,controls);
  document.body.append(dialog);dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>{dialog.remove();resolve(output);},{once:true}));
}
