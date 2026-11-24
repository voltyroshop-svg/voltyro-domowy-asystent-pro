const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const full=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const surface=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
const luma=(r,g,b)=>(r*77+g*150+b*29)>>8;

export function validCorners(points){
  if(points.length!==4||points.some(p=>p.x<0||p.x>1||p.y<0||p.y>1))return false;
  const crosses=points.map((p,i)=>{
    const q=points[(i+1)%4],r=points[(i+2)%4];
    return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);
  });
  return crosses.every(value=>value>.012);
}

async function photoCanvas(blob){
  const url=URL.createObjectURL(blob);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    const scale=Math.min(1,2600/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(3_000_000/(image.naturalWidth*image.naturalHeight)));
    if(!Number.isFinite(scale)||scale<=0)throw Error('Nie można otworzyć zdjęcia.');
    const canvas=surface(Math.max(2,Math.round(image.naturalWidth*scale)),Math.max(2,Math.round(image.naturalHeight*scale)));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  }finally{URL.revokeObjectURL(url);}
}

export function detectReceipt(canvas){
  const scale=256/Math.max(canvas.width,canvas.height);
  const w=Math.max(2,Math.round(canvas.width*scale)),h=Math.max(2,Math.round(canvas.height*scale));
  const temp=surface(w,h),ctx=temp.getContext('2d');
  ctx.drawImage(canvas,0,0,w,h);
  const {data}=ctx.getImageData(0,0,w,h);
  const gray=new Uint8Array(w*h),hist=new Uint32Array(256);
  let sum=0;
  for(let i=0;i<gray.length;i++){const j=i*4;gray[i]=luma(data[j],data[j+1],data[j+2]);hist[gray[i]]++;sum+=gray[i];}
  let weight=0,below=0,variance=0,threshold=140;
  for(let i=0;i<255;i++){
    weight+=hist[i];below+=hist[i]*i;
    const rest=gray.length-weight;
    if(!weight||!rest)continue;
    const score=weight*rest*(below/weight-(sum-below)/rest)**2;
    if(score>variance){variance=score;threshold=i;}
  }
  // A light contiguous region over a darker background is evidence of paper edges.
  // For a full-frame image or ambiguous background, keep the entire photo.
  const border=[];
  for(let x=0;x<w;x++){border.push(gray[x],gray[(h-1)*w+x]);}
  for(let y=0;y<h;y++){border.push(gray[y*w],gray[(y+1)*w-1]);}
  border.sort((a,b)=>a-b);
  const background=border[Math.floor(border.length/2)];
  const cutoff=Math.max(threshold,background+18,75);
  let best=[];
  const seen=new Uint8Array(gray.length),queue=new Int32Array(gray.length);
  for(let start=0;start<gray.length;start++){
    if(seen[start]||gray[start]<=cutoff)continue;
    let end=1;queue[0]=start;seen[start]=1;
    for(let head=0;head<end;head++){
      const id=queue[head],x=id%w,y=Math.floor(id/w);
      for(const k of [x?id-1:-1,x<w-1?id+1:-1,y?id-w:-1,y<h-1?id+w:-1]){
        if(k>=0&&!seen[k]&&gray[k]>cutoff){queue[end++]=k;seen[k]=1;}
      }
    }
    if(end>best.length)best=queue.slice(0,end);
  }
  if(best.length<gray.length*.19||best.length>gray.length*.91)return null;
  const score=[(x,y)=>x+y,(x,y)=>y-x,(x,y)=>-x-y,(x,y)=>x-y];
  const points=score.map(compare=>{
    let min=Infinity,p;
    for(const id of best){
      const x=id%w,y=Math.floor(id/w),key=compare(x,y);
      if(key<min){min=key;p={x:x/(w-1),y:y/(h-1)};}
    }
    return p;
  });
  if(!validCorners(points))return null;
  const area=points.reduce((total,p,i)=>{
    const n=points[(i+1)%4];return total+p.x*n.y-p.y*n.x;
  },0)/2;
  const touches=points.filter(p=>p.x<.012||p.x>.988||p.y<.012||p.y>.988).length;
  if(area<.22||touches>1||best.length/(area*gray.length)<.62||best.length/(area*gray.length)>1.08)return null;
  const cx=points.reduce((n,p)=>n+p.x,0)/4,cy=points.reduce((n,p)=>n+p.y,0)/4;
  return points.map(p=>({x:clamp(cx+(p.x-cx)*1.04,0,1),y:clamp(cy+(p.y-cy)*1.04,0,1)}));
}

export function projectCorners(points){
  const [a,b,c,d]=points;
  const x1=b.x-c.x,x2=d.x-c.x,x3=a.x-b.x+c.x-d.x;
  const y1=b.y-c.y,y2=d.y-c.y,y3=a.y-b.y+c.y-d.y;
  const det=x1*y2-x2*y1;
  const g=(x3*y2-x2*y3)/det,h=(x1*y3-x3*y1)/det;
  return (u,v)=>{
    const k=g*u+h*v+1;
    return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/k,
      y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/k};
  };
}
export function rectify(canvas,points=full){
  if(!validCorners(points))throw Error('Ustaw cztery narożniki paragonu w kolejności.');
  const w=canvas.width,h=canvas.height;
  const p=points.map(({x,y})=>({x:x*(w-1),y:y*(h-1)}));
  const width=Math.max(2,Math.round(Math.max(distance(p[0],p[1]),distance(p[3],p[2]))));
  const height=Math.max(2,Math.round(Math.max(distance(p[0],p[3]),distance(p[1],p[2]))));
  const scale=Math.min(1,2200/Math.max(width,height),Math.sqrt(2_400_000/(width*height)));
  const result=surface(Math.max(2,Math.round(width*scale)),Math.max(2,Math.round(height*scale))),ctx=result.getContext('2d');
  const input=canvas.getContext('2d').getImageData(0,0,w,h).data;
  const pixels=ctx.createImageData(result.width,result.height),map=projectCorners(p);
  for(let y=0,i=0;y<result.height;y++)for(let x=0;x<result.width;x++,i+=4){
    const f=map(x/Math.max(1,result.width-1),y/Math.max(1,result.height-1));
    const xx=clamp(f.x,0,w-1),yy=clamp(f.y,0,h-1);
    const x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1);
    const ax=xx-x0,ay=yy-y0;
    for(let k=0;k<3;k++)pixels.data[i+k]=(input[(y0*w+x0)*4+k]*(1-ax)+input[(y0*w+x1)*4+k]*ax)*(1-ay)+
      (input[(y1*w+x0)*4+k]*(1-ax)+input[(y1*w+x1)*4+k]*ax)*ay;
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  return result;
}
export function enhanceReceipt(canvas,{binary=false}={}){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
  const image=ctx.getImageData(0,0,w,h),gray=new Uint8Array(w*h);
  const stride=w+1,integral=new Uint32Array(stride*(h+1));
  for(let y=0,i=0;y<h;y++){
    let row=0;
    for(let x=0;x<w;x++,i++){
      const j=i*4;
      gray[i]=luma(image.data[j],image.data[j+1],image.data[j+2]);
      row+=gray[i];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const mean=(x,y,r)=>{
    const l=Math.max(0,x-r),t=Math.max(0,y-r),rgt=Math.min(w,x+r+1),btm=Math.min(h,y+r+1);
    return (integral[btm*stride+rgt]-integral[t*stride+rgt]-integral[btm*stride+l]+integral[t*stride+l])/((rgt-l)*(btm-t));
  };
  const radius=clamp(Math.round(w/19),13,72);
  for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
    const local=mean(x,y,radius),fine=mean(x,y,1),source=gray[i];
    const clean=.72*source+.28*fine;
    const delta=local-clean+.35*(fine-source);
    const value=binary?(delta>12?18:255):clamp(248-delta*2.5,0,255);
    image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=value;
  }
  const result=surface(w,h);
  result.getContext('2d').putImageData(image,0,0);
  return result;
}
export const imageBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Nie udało się przygotować zdjęcia.')),'image/png'));
export const loadReceiptPhoto=photoCanvas;
export const defaultCorners=()=>full.map(p=>({...p}));
export function rotateReceipt(canvas){
  const target=surface(canvas.height,canvas.width),ctx=target.getContext('2d');
  ctx.translate(target.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(canvas,0,0);
  return target;
}
