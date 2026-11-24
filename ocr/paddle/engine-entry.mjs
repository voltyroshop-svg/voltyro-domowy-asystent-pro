import * as ort from 'onnxruntime-web/wasm';
import {PaddleOcrService,parseRecognitionDictionary} from 'paddleocr';
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('.',import.meta.url).href;
const load=async(name,type)=>{
 const response=await fetch(new URL(name,import.meta.url));
 if(!response.ok)throw Error('Missing OCR asset '+name);
 return response[type]();
};
let service;
export function prepare(){
  service??=(async()=>{
   const [det,rec,dict]=await Promise.all([load('det.onnx','arrayBuffer'),load('latin.onnx','arrayBuffer'),load('latin.txt','text')]);
   return PaddleOcrService.createInstance({
    ort,modelPreset:'PP-OCRv5_mobile',
    detection:{modelBuffer:det},
    recognition:{modelBuffer:rec,charactersDictionary:parseRecognitionDictionary(dict)}
   });
  })();
  return service;
}
export async function recognize(pixels) {
 const engine=await prepare();
 const result=await engine.recognize(pixels);
 return engine.processRecognition(result);
}
