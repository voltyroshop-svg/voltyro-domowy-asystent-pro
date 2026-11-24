import {recognize} from './ocr/paddle/engine.js';

self.onmessage=async({data})=>{
  try{
    const result=await recognize({width:data.width,height:data.height,data:new Uint8Array(data.buffer)});
    const lines=result.lines.map(line=>{
      const ordered=[...line].sort((a,b)=>a.box.x-b.box.x);
      return {text:ordered.map(part=>part.text).join(' '),
        confidence:Math.min(...ordered.map(part=>part.confidence))*100};
    });
    self.postMessage({lines,confidence:result.confidence*100});
  }catch{
    self.postMessage({error:'Nie udało się uruchomić lokalnego modelu PaddleOCR.'});
  }
};
