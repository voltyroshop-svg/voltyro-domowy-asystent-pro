const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function photoTransform(frame,photo,prior,{from,to=from,scale=prior.scale}){
  scale=clamp(scale,1,6);
  if(scale===1)return {scale,x:0,y:0};
  const ratio=scale/prior.scale;
  const limits={
    x:Math.max(0,(photo.width*scale-frame.width)/2),
    y:Math.max(0,(photo.height*scale-frame.height)/2)
  };
  return {scale,
    x:clamp(to.x-(from.x-prior.x)*ratio,-limits.x,limits.x),
    y:clamp(to.y-(from.y-prior.y)*ratio,-limits.y,limits.y)};
}

export function showPhoto({url,title,download}){
  const dialog=document.createElement('dialog');
  dialog.className='photo-viewer';
  dialog.setAttribute('aria-label','Podgląd zdjęcia: '+title);
  const header=document.createElement('header');
  const heading=document.createElement('h2');
  heading.textContent=title;
  const controls=document.createElement('div');
  controls.className='photo-controls';
  function button(label,name,action){
    const button=document.createElement('button');
    button.type='button';button.textContent=label;button.setAttribute('aria-label',name);
    button.onclick=action;
    controls.append(button);
    return button;
  }
  const frame=document.createElement('div');
  frame.className='photo-frame';frame.tabIndex=0;
  frame.setAttribute('aria-label','Zdjęcie. Użyj plusa i minusa, aby zmienić powiększenie, lub strzałek, aby przesunąć zdjęcie.');
  const image=document.createElement('img');
  image.alt=title;image.draggable=false;frame.append(image);
  const message=document.createElement('p');
  message.className='photo-message';message.hidden=true;
  message.textContent='Przeglądarka nie wyświetla tego zdjęcia. Możesz pobrać oryginał.';
  frame.append(message);
  const label=document.createElement('output');
  const center={x:0,y:0};
  let transform={scale:1,...center};
  const pointers=new Map();
  let gesture,lastTap,moved;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const point=event=>{
    const rect=frame.getBoundingClientRect();
    return {x:event.clientX-rect.left-frame.clientWidth/2,y:event.clientY-rect.top-frame.clientHeight/2};
  };
  function update(from,to,scale){
    transform=photoTransform({width:frame.clientWidth,height:frame.clientHeight},
      {width:image.clientWidth,height:image.clientHeight},transform,{from,to,scale});
    image.style.transform='translate('+transform.x+'px, '+transform.y+'px) scale('+transform.scale+')';
    label.value=Math.round(transform.scale*100)+'%';
    frame.classList.toggle('zoomed',transform.scale>1);
  }
  function zoom(factor,at=center){update(at,at,transform.scale*factor);}
  button('−','Zmniejsz zdjęcie',()=>zoom(1/1.25));
  controls.append(label);
  button('+','Powiększ zdjęcie',()=>zoom(1.25));
  button('Pobierz','Pobierz zdjęcie',download);
  button('✕','Zamknij podgląd zdjęcia',()=>dialog.close()).autofocus=true;
  header.append(heading,controls);
  dialog.append(header,frame);
  document.body.append(dialog);
  dialog.showModal();
  const resize=new ResizeObserver(()=>update(center,center,transform.scale));
  resize.observe(frame);resize.observe(image);
  frame.addEventListener('wheel',event=>{
    event.preventDefault();
    zoom(Math.exp(clamp(-event.deltaY*.002,-.3,.3)),point(event));
  },{passive:false});
  frame.addEventListener('keydown',event=>{
    const directions={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};
    if(event.key==='+'||event.key==='=')zoom(1.25);
    else if(event.key==='-')zoom(1/1.25);
    else if(event.key==='0')update(center,center,1);
    else if(Object.hasOwn(directions,event.key)){
      const [x,y]=directions[event.key];
      update(center,{x,y},transform.scale);
    }else return;
    event.preventDefault();
  });
  function readGesture(){
    const [a,b]=pointers.values();
    return b?{at:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},span:distance(a,b)}:a?{at:a,span:0}:null;
  }
  frame.addEventListener('pointerdown',event=>{
    if(event.button!==0||pointers.size>=2)return;
    if(!pointers.size)moved=false;
    else{moved=true;lastTap=null;}
    pointers.set(event.pointerId,point(event));
    frame.setPointerCapture(event.pointerId);
    gesture=readGesture();
  });
  frame.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    const current=point(event);
    pointers.set(event.pointerId,current);
    const next=readGesture();
    if(gesture.span||distance(gesture.at,next.at)>4)moved=true;
    if(moved)update(gesture.at,next.at,gesture.span>0?transform.scale*next.span/gesture.span:transform.scale);
    if(moved)gesture=next;
  });
  function end(event){
    if(!pointers.delete(event.pointerId))return;
    gesture=readGesture();
    if(event.type!=='pointerup'||moved||pointers.size){lastTap=null;return;}
    const at=point(event),time=performance.now();
    if(lastTap&&time-lastTap.time<325&&distance(lastTap.at,at)<30){
      update(at,at,transform.scale>1?1:2.5);
      lastTap=null;
    }else lastTap={at,time};
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(type,end);
  image.onerror=()=>{image.hidden=true;message.hidden=false;};
  image.src=url;
  dialog.addEventListener('close',()=>{resize.disconnect();dialog.remove();URL.revokeObjectURL(url);},{once:true});
}
